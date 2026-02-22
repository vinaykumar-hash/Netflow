import json
import collections
import statistics
import numpy as np

# Mocking the feature functions based on current logic

def analyze_ttl(ttl_list, threshold=5.0) -> str | None:
    try:
        numeric_ttls = [float(t) for t in ttl_list if t is not None and str(t).strip()]
    except (ValueError, TypeError):
        return None

    if not numeric_ttls:
        return None
        
    try:
        std_dev = np.std(numeric_ttls)
        if std_dev > threshold:
            return f"High TTL variance: {std_dev:.2f}"
    except Exception:
        return None
        
    return None

def analyze_sequence(sequence_list) -> str | None:
    if not sequence_list or len(sequence_list) < 2:
        return None
        
    out_of_order_count = 0
    try:
        for i in range(1, len(sequence_list)):
            if sequence_list[i] is not None and sequence_list[i-1] is not None:
                if str(sequence_list[i]).strip() and str(sequence_list[i-1]).strip():
                    if float(sequence_list[i]) < float(sequence_list[i-1]):
                        out_of_order_count += 1
    except (ValueError, TypeError):
        return None
                
    if out_of_order_count > 50:
        return f"Out-of-order packets detected: {out_of_order_count}"
    return None

def detect_small_packet_flow(packet_lengths, threshold=0.9, min_packets=100) -> str | None:
    if not packet_lengths or len(packet_lengths) < min_packets:
        return None
        
    try:
        # ignore 0-byte payloads
        small_packets = [l for l in packet_lengths if l is not None and 0 < float(l) < 100]
        ratio = len(small_packets) / len(packet_lengths)
        
        if ratio > threshold:
            return f"Suspicious small packet ratio: {ratio:.2f}"
    except (ValueError, TypeError, ZeroDivisionError):
        return None
        
    return None

def detect_abnormal_flags(start_flags: list[str]) -> list[str]:
    # Simplified version of feature_tcp_flags.py logic
    # We need to map raw flags to "syn", "ack", etc.
    # But live_packets.json has "tcp_flags_syn": "True/False"
    return []

def main():
    packet_file = "docs/live_packets.json"
    flows = collections.defaultdict(lambda: {
        "src_ip": None, "dst_ip": None, "src_port": None, "dst_port": None,
        "ttl_list": [], "seq_list": [], "payload_len_list": [], 
        "flags_list": [], "protocols": []
    })

    print(f"Reading {packet_file}...")
    line_count = 0
    try:
        with open(packet_file, "r") as f:
            for line in f:
                if not line.strip(): continue
                line_count += 1
                if line_count % 5000 == 0:
                    print(f"Processed {line_count} packets...")
                    
                try:
                    p = json.loads(line)
                    # Key based on 5-tuple
                    key = (p.get("src_ip"), p.get("dst_ip"), p.get("src_port"), p.get("dst_port"), p.get("protocols", ""))
                    
                    flow = flows[key]
                    flow["src_ip"] = p.get("src_ip")
                    flow["dst_ip"] = p.get("dst_ip")
                    flow["src_port"] = p.get("src_port")
                    flow["dst_port"] = p.get("dst_port")
                    flow["protocols"].append(p.get("protocols"))
                    
                    flow["ttl_list"].append(p.get("ttl_hop_limit"))
                    flow["seq_list"].append(p.get("tcp_seq"))
                    flow["payload_len_list"].append(p.get("payload_len"))
                    
                    # Capture flags
                    flags = []
                    if p.get("tcp_flags_syn") == "True": flags.append("syn")
                    if p.get("tcp_flags_ack") == "True": flags.append("ack")
                    if p.get("tcp_flags_fin") == "True": flags.append("fin")
                    if p.get("tcp_flags_rst") == "True": flags.append("rst")
                    if p.get("tcp_flags_psh") == "True": flags.append("psh")
                    if p.get("tcp_flags_urg") == "True": flags.append("urg")
                    flow["flags_list"].append(flags)
                    
                except json.JSONDecodeError:
                    continue
    except FileNotFoundError:
        print("File not found.")
        return

    print(f"Done reading. Analyzed {len(flows)} flows.")
    
    anomalous_flows = 0
    for key, flow in flows.items():
        reasons = []
        
        ttl_anom = analyze_ttl(flow["ttl_list"])
        if ttl_anom: reasons.append(ttl_anom)
        
        seq_anom = analyze_sequence(flow["seq_list"])
        if seq_anom: reasons.append(seq_anom)
        
        small_pkt_anom = detect_small_packet_flow(flow["payload_len_list"])
        if small_pkt_anom: reasons.append(small_pkt_anom)
        
        # Flag Analysis (Manual Check of feature_tcp_flags logic)
        # 1. NULL Scan (No flags)
        # 2. XMAS Scan (FIN, PSH, URG)
        # 3. FIN Scan (Only FIN)
        # 4. SYN-FIN (SYN and FIN)
        
        abnormal_flags_found = set()
        for idx, flags in enumerate(flow["flags_list"]):
            proto = flow["protocols"][idx] if idx < len(flow["protocols"]) else ""
            if "tcp" not in proto: continue

            if not flags: 
                abnormal_flags_found.add("NULL Scan")
            if "fin" in flags and "psh" in flags and "urg" in flags:
                abnormal_flags_found.add("XMAS Scan")
            if len(flags) == 1 and "fin" in flags:
                abnormal_flags_found.add("FIN Scan")
            if "syn" in flags and "fin" in flags:
                abnormal_flags_found.add("SYN-FIN Scan")
            if "syn" in flags and "rst" in flags:
                abnormal_flags_found.add("SYN-RST Attempt")
            if "fin" in flags and "rst" in flags:
                abnormal_flags_found.add("FIN-RST Attempt")
        
        if abnormal_flags_found:
             reasons.append(f"Bad Flags: {', '.join(abnormal_flags_found)}")

        # Check if flow involves target IPs
        target_hit = False
        for ip in ["13.69.116.105", "2600:140f", "2401:4900"]:
            if ip in str(flow["dst_ip"]) or ip in str(flow["src_ip"]):
                target_hit = True
                break

        if reasons or target_hit:
            if reasons: anomalous_flows += 1
            print(f"\nFlow: {flow['src_ip']}:{flow['src_port']} -> {flow['dst_ip']}:{flow['dst_port']}")
            print(f"  Anomalies: {', '.join(reasons)}")
            print(f"  Packets: {len(flow['ttl_list'])}")
            
            numeric_ttls = [float(t) for t in flow["ttl_list"] if t is not None and str(t).strip()]
            if numeric_ttls:
                print(f"  TTL StdDev: {np.std(numeric_ttls):.2f}")
            
            numeric_seq = []
            for t in flow["seq_list"]:
                 try: numeric_seq.append(float(t))
                 except: pass
            
            p_lens = flow["payload_len_list"]
            s_pkts = [l for l in p_lens if l is not None and 0 < float(l) < 100]
            if len(p_lens) > 0:
                print(f"  Small Packet Ratio: {len(s_pkts)/len(p_lens):.2f} ({len(s_pkts)}/{len(p_lens)})")
            
            # Print Flags stats
            null_scans = 0
            has_syn_rst = 0
            has_fin_rst = 0
            for f in flow["flags_list"]:
                if not f: null_scans += 1
                if "syn" in f and "rst" in f: has_syn_rst += 1
                if "fin" in f and "rst" in f: has_fin_rst += 1
            print(f"  Null Scans: {null_scans}, SYN+RST: {has_syn_rst}, FIN+RST: {has_fin_rst}")
            print(f"  Protocols: {set(flow['protocols'])}")
            
            if anomalous_flows > 50: # Limit output
                 print("... (Truncating output) ...")
                 break

    print(f"\nTotal Anomalous Flows: {anomalous_flows}")

if __name__ == "__main__":
    main()
