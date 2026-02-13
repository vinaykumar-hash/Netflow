def detect_small_packet_flow(packet_lengths, threshold=0.8, min_packets=50):
    if not packet_lengths or len(packet_lengths) < min_packets:
        return None
        
    try:
        small_packets = [l for l in packet_lengths if l is not None and float(l) < 100]
        ratio = len(small_packets) / len(packet_lengths)
        
        if ratio > threshold:
            return f"Suspicious small packet ratio: {ratio:.2f}"
    except (ValueError, TypeError, ZeroDivisionError):
        return None
        
    return None
