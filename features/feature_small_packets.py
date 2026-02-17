def detect_small_packet_flow(packet_lengths, threshold=0.9, min_packets=100) -> str | None:
    if not packet_lengths or len(packet_lengths) < min_packets:
        return None
        
    try:
        small_packets = [l for l in packet_lengths if l is not None and 0 < float(l) < 100]
        ratio = len(small_packets) / len(packet_lengths)
        
        if ratio > threshold:
            return f"Suspicious small packet ratio: {ratio:.2f}"
    except (ValueError, TypeError, ZeroDivisionError):
        return None
        
    return None
