# NetFlow Sentinel

A real-time network monitoring and anomaly detection system with an AI-powered assistant. It captures live traffic, analyses it using a streaming data engine, and presents everything in a dark-themed browser dashboard.

---

## What it does

NetFlow Sentinel watches your network in real time. It picks up every packet on a chosen interface, groups them into flows (conversations between two endpoints), and continuously scores each flow for suspicious behaviour. Anything that looks anomalous shows up immediately in the dashboard, and you can ask the built-in AI assistant questions about what it found.

---

## Architecture overview

```
Network interface
      │
      ▼
live_capture.py  ──────────────────────────────────────────────────────┐
(tshark wrapper)                                                        │
      │ JSONL stream                                                     │
      ▼                                                                  │
main.py (Pathway streaming engine, port 8011)                          │
  ├── Feature extraction (TCP flags, TTL, packet size, encryption …)   │
  ├── Per-flow aggregation & anomaly scoring                            │
  ├── Whitelisting (dynamic, hot-reloaded)                             │
  ├── CSV log writers (togglable)                                       │
  └── RAG context builder for the AI assistant                          │
      │ HTTP POST per update                                             │
      ▼                                                                  │
Django backend (port 8000)                                              │
  ├── WebSocket broadcaster → connected browsers                        │
  ├── REST API (whitelist, devices, interfaces, ARP spoof control)     │
  └── Chat proxy → Pathway LLM endpoint                                │
      │                                                                  │
      ▼                                                                  │
React dashboard (port 5173) ◄──────────────────────────────────────────┘
  ├── Live flow table with anomaly highlighting
  ├── Traffic & anomaly score charts
  ├── Network graph (node = IP, edge = flow)
  ├── AI Security Analyst chat panel
  └── Settings modal
```

---

## First-time setup

### Requirements

| Tool | Purpose |
|---|---|
| Python ≥ 3.12 | Runtime |
| [uv](https://astral.sh/uv) | Python package manager |
| Node.js + npm | Frontend build |
| tshark | Packet capture (`sudo apt install tshark`) |
| arpspoof *(optional)* | ARP spoofing mode (`sudo apt install dsniff`) |

### Run setup

```bash
python setup.py
```

This will:
1. Check that `uv` and `npm` are installed
2. Run `uv sync` to install all Python dependencies into `.venv`
3. Run Django database migrations
4. Run `npm install` for the frontend
5. Create required directories (`live_data/`, `docs/`, `logs/`)
6. Create default `whitelist.json` and `active_targets.json`
7. Create a `.env` template if one doesn't exist

### Set your API key

Edit `.env` and add your OpenRouter API key:

```
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx
```

Get a free key at [openrouter.ai/keys](https://openrouter.ai/keys).

---

## Starting the application

```bash
python start_sentinel.py
```

This starts five services in the background and monitors them:

| Service | Port | Log file |
|---|---|---|
| Django backend | 8000 | `django.log` |
| Live packet capture | — | `capture.log` |
| Pathway engine | 8011 | `pathway.log` |
| React dashboard | 5173 | `vite.log` |
| System monitor | — | `monitor.log` |

Open **http://localhost:5173** in your browser.

To watch logs:
```bash
tail -f django.log pathway.log capture.log
```

Press **Ctrl+C** to shut everything down cleanly.

---

## Dashboard features

### Live flow table (LIST view)

The main panel shows every active network conversation as a row. Columns include:

- **Flow** — source and destination (IP:port → IP:port)
- **Packets** — total packets seen in this flow
- **Protocol** — TCP, UDP, HTTP, TLS, etc.
- **Encryption** — whether the traffic looks encrypted
- **Anomaly Score** — a 0–1 score; higher means more suspicious
- **Flags** — which anomaly signals were detected (SYN flood, bad TTL, retransmissions, small packets, sequence gaps …)
- **Last Info** — description of the most recent packet

Rows with anomalies are highlighted in red. Click any row (or hold Shift/Ctrl to select multiple) to send those flows as context to the AI assistant.

### Network graph (GRAPH view)

Switches to a live force-directed graph where each dot is an IP address and each line is an active flow. The graph updates as new traffic arrives. Useful for spotting unusual connection patterns at a glance.

### Traffic charts

Two mini-charts sit above the table:

- **Packet rate** — live area chart of packets per second
- **Anomaly score** — bar chart of the highest anomaly scores over time

### System stats (header bar)

The top bar shows live readings for CPU%, RAM%, total active flows, current anomaly count, and the percentage of encrypted traffic — all updated every 2 seconds.

---

## AI Security Analyst

A chat panel on the right side lets you talk to an LLM that has full context about what's happening on your network.

### How context works

Every message you send is bundled with:

1. **RAG context** — up to 15 of the most relevant anomaly records from live captures, retrieved using semantic search (sentence-transformers `all-MiniLM-L6-v2`) plus keyword boosting on IPs and ports.
2. **Selected flows** — if you've clicked rows in the flow table, those specific flow details are included verbatim.
3. **Your question** — appended at the end.

This means you can click a suspicious row and ask *"why is this flow anomalous?"* and get a precise answer grounded in real data.

### Choosing a model

A dropdown at the top of the chat panel lists available OpenRouter models. Switch freely between them — the selection is sent with each request.

### Multi-row context

Click one row to select it. Hold **Ctrl** or **Shift** to select multiple rows. The chat will tell the AI about all selected flows simultaneously.

### Auto-alerts

When the anomaly score threshold is set above 0, the chat panel will automatically show an alert whenever a new anomalous flow is detected. Deduplication prevents the same flow from spamming you.

---

## Monitoring modes

### Method 1 — Local capture

Captures all traffic passing through the chosen network interface. Best for monitoring your own machine or a router you have access to. Selected by default.

The capture interface is chosen in Settings → **Capture Interface**. Changes take effect on next restart.

### Method 2 — ARP Spoofing (interception)

Intercepts traffic between other devices on the LAN by performing ARP spoofing. This makes the monitored devices send their traffic through your machine where it can be inspected.

To use this mode:
1. Open Settings and select **Method 2 (ARP Spoofing)**
2. The setup wizard fetches all devices on your network via ARP scan
3. Check the boxes next to the devices you want to intercept
4. Click **Start Interception**

> ⚠️ Only use ARP spoofing on networks you own or have explicit permission to test. ARP spoofing on networks you don't control is illegal.

---

## Anomaly detection

The Pathway engine extracts these features from every flow and combines them into an anomaly score:

| Feature | What it looks for |
|---|---|
| TCP flag analysis | SYN floods, unexpected flag combinations |
| TTL anomalies | Unusually low TTL (may indicate spoofing or scanning) |
| Sequence anomalies | Out-of-order or missing TCP sequence numbers |
| Small packet anomalies | Many tiny packets (common in DoS or scanning) |
| Retransmissions | High retransmission rate suggests network stress or attack |
| Encryption detection | Identifies TLS/HTTPS vs. plaintext |
| Flow statistics | Packet rate, byte count, duration |

Scores are in the range 0–1. Flows above the configured **Anomaly Score Threshold** are flagged and written to the anomaly log.

---

## Whitelist

The whitelist lets you mark known-good traffic so it doesn't create noise.

### Whitelisted IPs

Traffic from or to a whitelisted IP is ignored by the anomaly scorer.

### Whitelisted ports

Flows involving only whitelisted ports (e.g. your own backend on 8000, 8011) are passed through without flagging.

### Anomaly threshold

Sets the minimum score a flow must reach before it counts as an anomaly. Set to `0.0` to log everything, `0.5` for a balanced default, `0.8` to only see severe cases.

The whitelist is stored in `whitelist.json` and **hot-reloaded every second** — no restart needed after saving.

---

## Log files

Log writing can be toggled per-file in Settings → **Log Files**. Changes take effect within ~1 second.

| Log file | Content |
|---|---|
| `logs/all_packets.csv` | Every raw captured packet |
| `docs/anomalies.csv` | All flows that exceeded the threshold |
| `docs/rag_context.csv` | Formatted anomaly descriptions used by the AI |
| `logs/debug_graph_edges.csv` | Network topology edges |

Disable logs you don't need to reduce disk I/O.

> ⚠️ Disabling **RAG Context** means the AI assistant will lose access to live network data.

---

## Settings reference

Open the settings panel by clicking the ⚙ icon in the header.

| Setting | Description |
|---|---|
| Monitoring Method | Switch between local capture and ARP spoofing |
| Capture Interface | Choose which network interface tshark listens on |
| Whitelisted Ports | Comma or space separated port numbers to ignore |
| Anomaly Score Threshold | 0.0–1.0. Flows above this score are flagged |
| Log Files | Toggle each log file on or off independently |
| AI Model | Select the LLM to use for the chat assistant |

---

## Simulating an attack (for testing)

```bash
sudo .venv/bin/python attack_simulator.py <TARGET_IP> <TARGET_PORT>
```

This sends a controlled SYN flood using Scapy for 10 seconds. The Pathway engine will detect the spike in SYN packets, high packet rate, and small packet size, and raise the anomaly score for that flow. You should see it highlighted in the dashboard within a few seconds.

---

## Project structure

```
Netflow/
├── main.py               # Pathway streaming engine (anomaly detection + AI)
├── live_capture.py       # tshark wrapper — writes packets to JSONL stream
├── system_monitor.py     # CPU/RAM sampler — sends stats to Django
├── attack_simulator.py   # SYN flood tool for testing detection
├── start_sentinel.py     # Orchestrator — starts all services
├── setup.py              # First-time setup script
├── whitelist.json        # Dynamic config (IPs, ports, threshold, logging)
├── active_targets.json   # ARP spoofing targets (managed by dashboard)
├── pyproject.toml        # Python dependencies (managed by uv)
├── .env                  # API keys (never committed)
│
├── features/             # Pathway UDFs — one file per anomaly feature
│   ├── feature_tcp_flags.py
│   ├── feature_ttl.py
│   ├── feature_small_packets.py
│   ├── feature_sequence.py
│   ├── feature_encryption.py
│   └── feature_flow_stats.py
│
├── dashboard/
│   ├── backend/          # Django + Channels (WebSocket + REST API)
│   └── frontend/         # React + Vite + Recharts dashboard
│
├── live_data/            # Packet stream written by live_capture.py
├── docs/                 # Anomaly logs and RAG context CSV
└── logs/                 # Raw packet and graph edge logs
```

---

## Troubleshooting

**Dashboard shows no flows**
- Check that `python start_sentinel.py` is running
- Check `capture.log` — tshark may have failed (try `sudo tshark -i wlo1 -c 5`)
- Make sure the correct capture interface is selected in Settings

**AI assistant says "Network context is empty"**
- Check that `docs/rag_context.csv` exists and is growing
- Check that the **RAG Context** log is enabled in Settings → Log Files
- The anomaly threshold may be too high — lower it to generate more RAG records

**ARP spoofing not working**
- Ensure `arpspoof` is installed: `sudo apt install dsniff`
- The script requires `sudo` — make sure passwordless sudo is configured for `arpspoof` and `sysctl`

**WebSocket connection failed**
- Django/Daphne may not be running. Check `django.log`
- Port 8000 may be in use. `start_sentinel.py` kills it on startup automatically

---

## License

MIT
