def detect_abnormal_flags(syn, ack, fin, rst, psh, urg):
    # Convert string flags to boolean if necessary
    def to_bool(val):
        if isinstance(val, bool): return val
        return str(val).lower() in ("1", "true", "yes")

    f_syn = to_bool(syn)
    f_ack = to_bool(ack)
    f_fin = to_bool(fin)
    f_rst = to_bool(rst)
    f_psh = to_bool(psh)
    f_urg = to_bool(urg)

    if f_syn and f_fin:
        return "SYN+FIN"
    if f_syn and f_rst:
        return "SYN+RST"
    if f_fin and f_rst:
        return "FIN+RST"
    if not any([f_syn, f_ack, f_fin, f_rst, f_psh, f_urg]):
        return "NULL_SCAN"
    if f_fin and f_psh and f_urg:
        return "XMAS_SCAN"

    return None
