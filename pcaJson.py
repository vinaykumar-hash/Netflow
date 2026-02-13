import subprocess
import json
import sys
from pathlib import Path


def convert_pcapng_to_json(input_file: str, output_file: str):
    input_path = Path(input_file)
    output_path = Path(output_file)

    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_file}")

    command = [
        "tshark",
        "-r", str(input_path),
        "-T", "json",
        "-x"  # includes raw hex + full dissection
    ]

    try:
        print("Running tshark...")
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True
        )

        print("Writing JSON output...")
        packets = json.loads(result.stdout.decode("utf-8"))
        with open(output_path, "w") as f:
            json.dump(packets, f, indent=2)

        print(f"Conversion complete: {output_file}")

    except subprocess.CalledProcessError as e:
        print("Error running tshark:")
        print(e.stderr.decode())
        sys.exit(1)


if __name__ == "__main__":
    convert_pcapng_to_json("testDumpWifi.pcapng", "output.json")
