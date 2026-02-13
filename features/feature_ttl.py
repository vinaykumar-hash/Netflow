def analyze_ttl(ttl_list, threshold=5.0):
    import numpy as np
    # Filter out None and ensure they are floats
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
