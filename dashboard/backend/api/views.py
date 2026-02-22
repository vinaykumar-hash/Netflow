from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import requests
import json
import subprocess
import os
import re
from pathlib import Path

class NetworkInterfacesView(APIView):
    """Returns available network interfaces from the OS."""
    def get(self, request):
        try:
            result = subprocess.run(
                ["ip", "-j", "link", "show"],
                capture_output=True, text=True, timeout=5
            )
            raw = json.loads(result.stdout or "[]")
            ifaces = []
            for iface in raw:
                name = iface.get("ifname", "")
                if not name or name == "lo":
                    continue
                link_type = iface.get("link_type", "ether")
                flags = iface.get("flags", [])
                state = iface.get("operstate", "UNKNOWN")
                ifaces.append({
                    "name": name,
                    "type": link_type,
                    "state": state,
                    "up": "UP" in flags,
                })
            ifaces.insert(0, {"name": "lo", "type": "loopback", "state": "UNKNOWN", "up": True})
            return Response(ifaces, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class PacketUpdateView(APIView):
    def post(self, request):
        channel_layer = get_channel_layer()
        data = request.data
        
        updates = data if isinstance(data, list) else [data]
        
        for update in updates:
            async_to_sync(channel_layer.group_send)(
                "packets",
                {
                    "type": "send_packet_update",
                    "data": update
                }
            )
        return Response({"status": f"broadcasted {len(updates)} updates"}, status=status.HTTP_200_OK)

class ChatProxyView(APIView):
    def post(self, request):
        query = request.data.get("messages")
        model = request.data.get("model")
        
        if not query:
            return Response({"error": "No query provided"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            response = requests.post(
                "http://localhost:8011",
                json={
                    "messages": query, 
                    "model": model,
                    "selected_row": request.data.get("selected_row")
                },
                timeout=30
            )
            return Response(response.json(), status=response.status_code)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

SPOOF_PROCESSES = []

class NetworkDevicesView(APIView):
    def get(self, request):
        try:
            # Get host IP first
            host_ip = None
            try:
                ip_res = subprocess.run(['ip', '-4', 'addr', 'show'], capture_output=True, text=True, timeout=2)
                match = re.search(r'inet (192\.168\.[\d\.]+)', ip_res.stdout)
                if match: host_ip = match.group(1)
            except Exception: pass

            result = subprocess.run(['arp', '-a'], capture_output=True, text=True, timeout=5)
            output = result.stdout
            devices = []
            
            if host_ip:
                devices.append({'ip': host_ip, 'mac': '(This Device)'})

            for line in output.split('\n'):
                if not line.strip(): continue
                match = re.search(r'\(([\d\.]+)\) at ([\w:]+)', line)
                if match:
                    ip = match.group(1)
                    if ip != host_ip: 
                        devices.append({'ip': ip, 'mac': match.group(2)})
            
            unique_devices = []
            seen = set()
            for d in devices:
                if d['ip'] not in seen:
                    unique_devices.append(d)
                    seen.add(d['ip'])
            
            return Response(unique_devices, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class SpoofStartView(APIView):
    def post(self, request):
        targets = request.data.get('targets', [])
        gateway = request.data.get('gateway', '192.168.1.1')
        interface = request.data.get('interface', 'wlo1')
        
        if not targets:
            return Response({"error": "No targets provided"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Write active targets
            targets_file = Path(__file__).resolve().parent.parent.parent.parent / "active_targets.json"
            with open(targets_file, 'w') as f:
                json.dump(targets, f)

            # Get host IP to skip spoofing itself
            host_ip = None
            try:
                ip_res = subprocess.run(['ip', '-4', 'addr', 'show'], capture_output=True, text=True, timeout=2)
                match = re.search(r'inet (192\.168\.[\d\.]+)', ip_res.stdout)
                if match: host_ip = match.group(1)
            except Exception: pass

            # Enable IP forwarding
            subprocess.run(['sudo', '-n', 'sysctl', '-w', 'net.ipv4.ip_forward=1'], check=True)
            
            global SPOOF_PROCESSES
            
            for target in targets:
                if target == host_ip: continue
                p1 = subprocess.Popen(['sudo', '-n', 'arpspoof', '-i', interface, '-t', target, gateway])
                p2 = subprocess.Popen(['sudo', '-n', 'arpspoof', '-i', interface, '-t', gateway, target])
                SPOOF_PROCESSES.extend([p1, p2])
                
            return Response({"status": f"ARP spoofing started for {len(targets)} targets"}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class SpoofStopView(APIView):
    def post(self, request):
        try:
            # Clear active targets
            targets_file = Path(__file__).resolve().parent.parent.parent.parent / "active_targets.json"
            with open(targets_file, 'w') as f:
                json.dump([], f)

            # Disable IP forwarding
            subprocess.run(['sudo', '-n', 'sysctl', '-w', 'net.ipv4.ip_forward=0'], check=False)
            # Kill arpspoof
            subprocess.run(['sudo', '-n', 'pkill', '-f', 'arpspoof'], check=False)
            
            global SPOOF_PROCESSES
            SPOOF_PROCESSES = []
            
            return Response({"status": "ARP spoofing stopped"}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class WhitelistSettingsView(APIView):
    def get_whitelist_path(self):
        return Path(__file__).resolve().parent.parent.parent.parent / "whitelist.json"

    def get(self, request):
        path = self.get_whitelist_path()
        if path.exists():
            with open(path, 'r') as f:
                return Response(json.load(f))
        return Response({"error": "whitelist.json not found"}, status=status.HTTP_404_NOT_FOUND)
        
    def post(self, request):
        path = self.get_whitelist_path()
        try:
            with open(path, 'w') as f:
                json.dump(request.data, f)
            return Response({"status": "Whitelist updated successfully"})
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
