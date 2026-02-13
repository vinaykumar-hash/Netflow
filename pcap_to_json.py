import subprocess
import json
import sys
from pathlib import Path

def convert_pcapng_to_json(input_file: str, output_file: str):
    input_path = Path(input_file)
    output_path = Path(output_file)

    if not input_path.exists():
        print(f"Error: Input file not found: {input_file}")
        sys.exit(1)

    # Comprehensive fields requested by the user
    fields = [
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

    command = [
        "tshark",
        "-r", str(input_path),
        "-T", "json",
    ]
    for field in fields:
        command.extend(["-e", field])

    try:
        print(f"Running tshark to extract fields from {input_file}...")
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True
        )

        print("Processing output...")
        raw_packets = json.loads(result.stdout.decode("utf-8"))
        
        processed_packets = []
        for packet in raw_packets:
            layers = packet.get("_source", {}).get("layers", {})
            
            def get_val(f):
                val = layers.get(f)
                return val[0] if isinstance(val, list) and len(val) > 0 else val

            # Generic field mapping with fallbacks and logic
            flat_packet = {
                "timestamp": get_val("frame.time_epoch"),
                "protocols": get_val("frame.protocols"),
                "src_ip": get_val("ip.src") or get_val("ipv6.src"),
                "dst_ip": get_val("ip.dst") or get_val("ipv6.dst"),
                "src_port": get_val("tcp.srcport") or get_val("udp.srcport"),
                "dst_port": get_val("tcp.dstport") or get_val("udp.dstport"),
                "packet_size": get_val("frame.len"),
                "payload_len": get_val("tcp.len") or get_val("udp.length"),
                "info": get_val("_ws.col.info"),
                "tcp_seq": get_val("tcp.seq"),
                "tcp_flags_syn": get_val("tcp.flags.syn"),
                "tcp_flags_ack": get_val("tcp.flags.ack"),
                "tcp_flags_fin": get_val("tcp.flags.fin"),
                "tcp_flags_rst": get_val("tcp.flags.reset"),
                "tcp_flags_psh": get_val("tcp.flags.push"),
                "tcp_flags_urg": get_val("tcp.flags.urg"),
                "tcp_retransmission": get_val("tcp.analysis.retransmission"),
                "tcp_window_size": get_val("tcp.window_size_value"),
                "ttl_hop_limit": get_val("ip.ttl") or get_val("ipv6.hlim"),
                "fragmentation": "Yes" if (get_val("ip.flags.mf") == "1" or get_val("ipv6.fragment")) else "No"
            }
            # Flatten context for Pathway
            processed_packets.append(flat_packet)

        temp_output_path = output_path.with_suffix(".tmp")
        with open(temp_output_path, "w") as f:
            for packet in processed_packets:
                f.write(json.dumps(packet) + "\n")
        
        import os
        os.replace(temp_output_path, output_path)

        print(f"Successfully converted to {output_file}")

    except subprocess.CalledProcessError as e:
        print("Error running tshark:")
        print(e.stderr.decode())
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        input_file = "testDumpWifi.pcapng"
        output_file = "docs/packets.json"
    else:
        input_file = sys.argv[1]
        output_file = sys.argv[2]
        
    convert_pcapng_to_json(input_file, output_file)
