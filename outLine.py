import json

with open("output.json") as f:
    data = json.load(f)

with open("packets.jsonl", "w") as f:
    for packet in data:
        f.write(json.dumps(packet) + "\n")
