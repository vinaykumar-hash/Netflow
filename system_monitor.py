import time
import requests
import json
import sys

# Configuration
API_URL = "http://localhost:8000/api/update/"

def get_cpu_usage():
    """Calculates CPU usage percentage from /proc/stat."""
    try:
        with open("/proc/stat", "r") as f:
            line = f.readline()
            parts = line.split()
            # user, nice, system, idle, iowait, irq, softirq, steal
            # Linux kernel > 2.6.33
            total_time = sum(map(int, parts[1:8]))
            idle_time = int(parts[4])
            return total_time, idle_time
    except Exception as e:
        print(f"Error reading CPU: {e}", file=sys.stderr)
        return 0, 0

def get_ram_usage():
    """Calculates RAM usage percentage from /proc/meminfo."""
    try:
        mem_total = 0
        mem_available = 0
        with open("/proc/meminfo", "r") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    mem_total = int(line.split()[1])
                elif line.startswith("MemAvailable:"):
                    mem_available = int(line.split()[1])
                
                if mem_total > 0 and mem_available > 0:
                    break
        
        if mem_total == 0: return 0
        used_percent = ((mem_total - mem_available) / mem_total) * 100
        return round(used_percent, 1)
    except Exception as e:
        print(f"Error reading RAM: {e}", file=sys.stderr)
        return 0

def main():
    print("Starting System Monitor...")
    
    # CPU calculation requires previous state
    prev_total, prev_idle = get_cpu_usage()
    
    while True:
        time.sleep(2)
        
        # Calculate CPU delta
        curr_total, curr_idle = get_cpu_usage()
        delta_total = curr_total - prev_total
        delta_idle = curr_idle - prev_idle
        
        cpu_percent = 0
        if delta_total > 0:
            cpu_percent = round(((delta_total - delta_idle) / delta_total) * 100, 1)
            
        prev_total, prev_idle = curr_total, curr_idle
        
        # Get RAM
        ram_percent = get_ram_usage()
        
        # Payload
        payload = {
            "type": "system_stats",
            "cpu": cpu_percent,
            "ram": ram_percent,
            "timestamp": time.time()
        }
        
        # Send to Backend
        try:
            requests.post(API_URL, json=payload, timeout=1)
            # print(f"Sent Stats: CPU {cpu_percent}% | RAM {ram_percent}%")
        except Exception as e:
            print(f"Failed to send stats: {e}", file=sys.stderr)

if __name__ == "__main__":
    main()
