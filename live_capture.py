import subprocess
import json
import os
import sys

# Field mapping consistent with PacketSchema in main.py
# We use -T fields for lightweight streaming
FIELDS = [
    "frame.time_epoch",
    "frame.protocols",
    "ip.src",
    "ip.dst",
    "ipv6.src",
    "ipv6.dst",
    "tcp.srcport",
    "tcp.dstport",
    "udp.srcport",
    "udp.dstport",
    "tcp.seq",
    "tcp.flags.syn",
    "tcp.flags.ack",
    "tcp.flags.fin",
    "tcp.flags.reset",
    "tcp.flags.push",
    "tcp.flags.urg",
    "tcp.analysis.retransmission",
    "tcp.window_size_value",
    "ip.ttl",
    "ipv6.hlim",
    "ip.flags.mf",
    "ipv6.fragment",
    "frame.len",
    "tcp.len",
    "udp.length",
    "_ws.col.info"
]

# Map tshark field indexes to schema keys
FIELD_MAP = [
    "timestamp", "protocols", "src_ip_v4", "dst_ip_v4", "src_ip_v6", "dst_ip_v6",
    "src_port_tcp", "dst_port_tcp", "src_port_udp", "dst_port_udp",
    "tcp_seq", "tcp_flags_syn", "tcp_flags_ack", "tcp_flags_fin",
    "tcp_flags_rst", "tcp_flags_psh", "tcp_flags_urg", "tcp_retransmission",
    "tcp_window_size", "ttl_hop_limit_v4", "ttl_hop_limit_v6",
    "ip_flags_mf", "ipv6_fragment", "packet_size", "payload_len_tcp", "payload_len_udp", "info"
]

def main():
    output_file = "docs/live_packets.json"
    os.makedirs("docs", exist_ok=True)
    
    # Command: Capture from all interfaces, unbuffered, output custom fields
    cmd = ["tshark", "-i", "any", "-l", "-T", "fields"]
    for f in FIELDS:
        cmd.extend(["-e", f])

    print(f"Starting Sentinel Live Capture...")
    print(f"Interface: any | Output: {output_file}")
    
    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1 # Line buffered
        )

        with open(output_file, "a") as f_out:
            for line in process.stdout:
                line = line.strip()
                if not line:
                    continue
                
                # tshark -T fields outputs tabs by default
                vals = line.split("\t")
                if len(vals) < len(FIELD_MAP):
                    # Pad if some trailing fields are missing
                    vals += [""] * (len(FIELD_MAP) - len(vals))
                
                row = dict(zip(FIELD_MAP, vals))
                
                # Consolidate IPs and Ports for Pathway Schema compatibility
                processed = {
                    "timestamp": row["timestamp"],
                    "protocols": row["protocols"],
                    "src_ip": row["src_ip_v4"] or row["src_ip_v6"],
                    "dst_ip": row["dst_ip_v4"] or row["dst_ip_v6"],
                    "src_port": row["src_port_tcp"] or row["src_port_udp"],
                    "dst_port": row["dst_port_tcp"] or row["dst_port_udp"],
                    "packet_size": row["packet_size"],
                    "payload_len": row["payload_len_tcp"] or row["payload_len_udp"] or "0",
                    "info": row["info"],
                    "tcp_seq": row["tcp_seq"] or "0",
                    "tcp_flags_syn": row["tcp_flags_syn"],
                    "tcp_flags_ack": row["tcp_flags_ack"],
                    "tcp_flags_fin": row["tcp_flags_fin"],
                    "tcp_flags_rst": row["tcp_flags_rst"],
                    "tcp_flags_psh": row["tcp_flags_psh"],
                    "tcp_flags_urg": row["tcp_flags_urg"],
                    "tcp_retransmission": row["tcp_retransmission"],
                    "tcp_window_size": row["tcp_window_size"] or "0",
                    "ttl_hop_limit": row["ttl_hop_limit_v4"] or row["ttl_hop_limit_v6"],
                    "fragmentation": "Yes" if (row["ip_flags_mf"] == "1" or row["ipv6_fragment"]) else "No"
                }

                f_out.write(json.dumps(processed) + "\n")
                f_out.flush()

    except KeyboardInterrupt:
        print("\nStopping Live Capture.")
        process.terminate()
    except Exception as e:
        print(f"Capture error: {e}")
        if 'process' in locals():
            process.terminate()

if __name__ == "__main__":
    main()
