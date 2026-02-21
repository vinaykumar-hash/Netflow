import time
from scapy.all import IP, TCP, send

def trigger():
    start = time.time()
    while time.time() - start < 2:
        send(IP(src="192.168.1.10", dst="192.168.1.1") / TCP(sport=44444, dport=80, flags="S"), verbose=0, iface="wlo1mon")
        time.sleep(0.0005)

if __name__ == "__main__":
    trigger()
