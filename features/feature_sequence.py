def analyze_sequence(sequence_list, timestamp_list) -> str | None:
    if not sequence_list or not timestamp_list or len(sequence_list) < 2:
        return None
        
    out_of_order_count = 0
    try:
        # Zip and sort by timestamp to ensure we analyze in chronological order
        # Filter out invalid entries before sorting
        packets = []
        for seq, ts in zip(sequence_list, timestamp_list):
            if seq is not None and ts is not None:
                s_str = str(seq).strip()
                # timestamp is already float from schema
                if s_str:
                     packets.append((ts, float(s_str)))
        
        # Sort by timestamp (index 0)
        packets.sort(key=lambda x: x[0])
        
        # Check sequence order
        for i in range(1, len(packets)):
             # packets[i][1] is the sequence number
             if packets[i][1] < packets[i-1][1]:
                 out_of_order_count += 1
                 
    except (ValueError, TypeError):
        return None
                
    # Use ratio for high-volume flows to avoid false positives
    total_packets = len(packets)
    ratio = out_of_order_count / total_packets if total_packets > 0 else 0
    
    # Threshold: > 5% out-of-order AND at least 50 packets out-of-order
    if ratio > 0.05 and out_of_order_count > 50:
        return f"Out-of-order packets detected: {out_of_order_count} ({ratio:.1%})"
    return None
