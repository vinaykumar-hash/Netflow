from collections import defaultdict
import numpy as np
from scipy.stats import skew, entropy as scipy_entropy
import math
import pathway as pw

class Flow:
    def __init__(self):
        self.start_time = None
        self.end_time = None
        self.fwd_packets = 0
        self.bwd_packets = 0
        self.fwd_bytes = 0
        self.bwd_bytes = 0
        self.packet_sizes = []
        self.timestamps = []
        self.payloads = []
        self.retransmissions = 0
        self.seq_seen = set()

def entropy(data):
    if not data:
        return 0.0
    # Calculate byte distribution
    counts = defaultdict(int)
    for byte in data:
        counts[byte] += 1
    
    probs = [count / len(data) for count in counts.values()]
    return -sum(p * math.log2(p) for p in probs)

@pw.udf
def compute_flow_stats(
    timestamps: list[float],
    packet_sizes: list[int],
    src_ips: list[str],
    dst_ips: list[str],
    payloads: list[str],
    tcp_seqs: list[str],
    src_ports: list[str],
    dst_ports: list[str]
) -> dict:
    
    # We arbitrary define the "Forward" direction as the direction of the first packet seen in this window
    if not timestamps:
        return {}
    
    # Sanitize initial IP
    fwd_src_ip = src_ips[0].split(",")[0] if src_ips else ""
    
    flow = Flow()
    
    # Packets are passed as lists, we assume they are time-aligned by index
    # We zip them to iterate
    zipped_packets = zip(timestamps, packet_sizes, src_ips, dst_ips, payloads, tcp_seqs)
    
    # Sort by timestamp just in case (though Pathway windows usually order them)
    sorted_packets = sorted(list(zipped_packets), key=lambda x: x[0])
    
    for ts, size, sip_raw, dip, payload_hex, seq in sorted_packets:
        # Sanitize IP from packet
        sip = sip_raw.split(",")[0] if sip_raw else ""

        if flow.start_time is None:
            flow.start_time = ts
        flow.end_time = ts
        
        flow.timestamps.append(ts)
        flow.packet_sizes.append(size)
        
        # Check Direction
        is_fwd = (sip == fwd_src_ip)
        
        if is_fwd:
            flow.fwd_packets += 1
            flow.fwd_bytes += size
        else:
            flow.bwd_packets += 1
            flow.bwd_bytes += size
            
        try:
            seq_num = int(seq) if seq else 0
            if seq_num in flow.seq_seen and seq_num != 0:
                flow.retransmissions += 1
            else:
                flow.seq_seen.add(seq_num)
        except ValueError:
            pass
            
        # Payload handling (assuming input is hex string from tshark or raw)
        # For simplicity in this step, we just store length or simple entropy input
        # If payload is hex string, convert to bytes for entropy
        try:
            # Tshark fields might affect this format (e.g. 00:aa:bb vs 00aabb)
            clean_payload = payload_hex.replace(":", "") if payload_hex else ""
            if clean_payload:
                flow.payloads.append(bytes.fromhex(clean_payload))
        except Exception:
            pass

    # --- 3. Compute Metrics ---
    
    duration = max(0.000001, flow.end_time - flow.start_time)
    
    total_bytes = flow.fwd_bytes + flow.bwd_bytes
    
    total_packets = flow.fwd_packets + flow.bwd_packets
    
    if len(flow.timestamps) > 1:
        iat = np.diff(flow.timestamps)
        mean_iat = float(np.mean(iat))
        std_iat = float(np.std(iat))
    else:
        mean_iat = 0.0
        std_iat = 0.0
        
    direction_ratio = flow.fwd_bytes / (flow.bwd_bytes + 1e-6)
    
    retrans_rate = flow.retransmissions / max(1, total_packets)
    
    burstiness = (std_iat / mean_iat) if mean_iat > 0 else 0.0
    
    if len(flow.timestamps) > 1:
        iat = np.diff(flow.timestamps)
        idle_times = iat[iat > 2.0]
        mean_idle = float(np.mean(idle_times)) if len(idle_times) > 0 else 0.0
    else:
        mean_idle = 0.0

    if flow.packet_sizes:
        mean_size = float(np.mean(flow.packet_sizes))
        std_size = float(np.std(flow.packet_sizes))
        try:
             # Skew requires variance, if all same size skew is nan/error catch
            if len(flow.packet_sizes) > 2 and std_size > 0:
                skew_size = float(skew(flow.packet_sizes))
            else:
                skew_size = 0.0
        except:
             skew_size = 0.0
    else:
        mean_size = 0.0
        std_size = 0.0
        skew_size = 0.0
        
    #  Payload Entropy
    if flow.payloads:
        # Average entropy of packets
        entropy_vals = [entropy(p) for p in flow.payloads]
        payload_entropy = float(np.mean(entropy_vals))
    else:
        payload_entropy = 0.0
        
    #  Symmetry
    symmetry = 1.0 - (abs(flow.fwd_bytes - flow.bwd_bytes) / max(1, total_bytes))
    
    return {
        "duration": duration,
        "total_bytes": total_bytes,
        "total_packets": total_packets,
        "mean_iat": mean_iat,
        "std_iat": std_iat,
        "direction_ratio": direction_ratio,
        "retrans_rate": retrans_rate,
        "burstiness": burstiness,
        "mean_idle": mean_idle,
        "mean_size": mean_size,
        "std_size": std_size,
        "skew_size": skew_size,
        "payload_entropy": payload_entropy,
        "symmetry": symmetry,
        # Metadata for ID
        "fwd_ip": fwd_src_ip,
        "fwd_packets": flow.fwd_packets,
        "bwd_packets": flow.bwd_packets
    }
