def analyze_sequence(sequence_list):
    if not sequence_list or len(sequence_list) < 2:
        return None
        
    out_of_order_count = 0
    try:
        # Pathways lists might not be sorted by time, but given Pathway's ordering 
        # we can check relative sequence
        for i in range(1, len(sequence_list)):
            if sequence_list[i] is not None and sequence_list[i-1] is not None:
                if str(sequence_list[i]).strip() and str(sequence_list[i-1]).strip():
                    if float(sequence_list[i]) < float(sequence_list[i-1]):
                        out_of_order_count += 1
    except (ValueError, TypeError):
        return None
                
    if out_of_order_count > 0:
        return f"Out-of-order packets detected: {out_of_order_count}"
    return None
