def is_encrypted(protocols, dst_port):
    f_protocols = str(protocols).lower()
    f_dst_port = str(dst_port)
    
    if "tls" in f_protocols or "ssl" in f_protocols or f_dst_port == "443":
        return True
    return False

def analyze_encryption_ratio(encryption_list):
    if not encryption_list:
        return None
    
    encrypted_count = sum(1 for e in encryption_list if e)
    ratio = encrypted_count / len(encryption_list)
    return ratio
    
def get_encryption_label(protocols, dst_port):
    return "Encrypted" if is_encrypted(protocols, dst_port) else "Cleartext"
