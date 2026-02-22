#!/usr/bin/env python3
"""
NetFlow Sentinel - Initial Setup Script
Run once before starting the application for the first time.

Usage:
    python setup.py
"""

import subprocess
import sys
import os
import shutil
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENV_PYTHON = ROOT / ".venv" / "bin" / "python"
VENV_PIP = ROOT / ".venv" / "bin" / "pip"
FRONTEND_DIR = ROOT / "dashboard" / "frontend"
BACKEND_DIR = ROOT / "dashboard" / "backend"

# ─── ANSI colours ────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def banner():
    print(f"""
{BOLD}{CYAN}
╔══════════════════════════════════════════════╗
║        NetFlow Sentinel  —  Setup            ║
╚══════════════════════════════════════════════╝{RESET}
""")

def ok(msg):    print(f"  {GREEN}✔{RESET}  {msg}")
def warn(msg):  print(f"  {YELLOW}⚠{RESET}  {msg}")
def err(msg):   print(f"  {RED}✘{RESET}  {msg}")
def step(msg):  print(f"\n{BOLD}{CYAN}▶  {msg}{RESET}")
def run(cmd, cwd=None, check=True, capture=False):
    return subprocess.run(
        cmd, cwd=cwd or ROOT,
        check=check,
        capture_output=capture,
        text=True
    )

# ─── 1. Prerequisite checks ──────────────────────────────────────────────────
def check_prerequisites():
    step("Checking prerequisites")
    
    missing = []

    if shutil.which("uv"):
        ok(f"uv found at {shutil.which('uv')}")
    else:
        err("uv not found — install it with:  curl -Ls https://astral.sh/uv/install.sh | sh")
        missing.append("uv")

    if shutil.which("npm"):
        ok(f"npm found at {shutil.which('npm')}")
    else:
        err("npm not found — install Node.js from https://nodejs.org")
        missing.append("npm")

    if shutil.which("tshark"):
        ok(f"tshark found at {shutil.which('tshark')}")
    else:
        warn("tshark not found — live capture will be disabled. Install with:  sudo apt install tshark")

    if shutil.which("arpspoof"):
        ok(f"arpspoof found (ARP spoofing mode available)")
    else:
        warn("arpspoof not found — ARP spoofing mode unavailable. Install with:  sudo apt install dsniff")

    if missing:
        err(f"\nMissing required tools: {', '.join(missing)}. Please install them and re-run setup.")
        sys.exit(1)

# ─── 2. Python environment via uv ────────────────────────────────────────────
def setup_python_env():
    step("Setting up Python environment (uv sync)")
    
    # uv sync reads pyproject.toml and creates/updates .venv automatically
    print("  Running uv sync — this may take a few minutes on first run…")
    try:
        run(["uv", "sync"], cwd=ROOT)
        ok("Python virtualenv synced successfully (.venv)")
    except subprocess.CalledProcessError:
        err("uv sync failed. Check pyproject.toml and try again.")
        sys.exit(1)

    # Verify key packages are importable
    packages_to_check = ["pathway", "django", "daphne", "channels", "sentence_transformers"]
    for pkg in packages_to_check:
        result = run(
            [str(VENV_PYTHON), "-c", f"import {pkg}; print({pkg}.__version__ if hasattr({pkg}, '__version__') else 'ok')"],
            check=False, capture=True
        )
        if result.returncode == 0:
            ok(f"{pkg} ({result.stdout.strip()})")
        else:
            warn(f"{pkg} import failed — may need manual install")

# ─── 3. Django setup ─────────────────────────────────────────────────────────
def setup_django():
    step("Setting up Django backend")
    
    manage_py = BACKEND_DIR / "manage.py"
    if not manage_py.exists():
        err(f"manage.py not found at {manage_py}")
        sys.exit(1)
    
    # Run migrations
    print("  Running database migrations…")
    run([str(VENV_PYTHON), "manage.py", "migrate", "--run-syncdb"], cwd=BACKEND_DIR)
    ok("Django migrations applied")

    # Collect static files (non-interactive)
    print("  Collecting static files…")
    run([str(VENV_PYTHON), "manage.py", "collectstatic", "--noinput"], cwd=BACKEND_DIR, check=False)
    ok("Static files collected")

# ─── 4. Frontend (npm) ───────────────────────────────────────────────────────
def setup_frontend():
    step("Installing frontend dependencies (npm)")
    
    if not (FRONTEND_DIR / "package.json").exists():
        err(f"package.json not found at {FRONTEND_DIR}")
        sys.exit(1)
    
    print("  Running npm install — this may take a moment…")
    run(["npm", "install"], cwd=FRONTEND_DIR)
    ok("Frontend node_modules installed")

# ─── 5. Required directories & default files ─────────────────────────────────
def setup_directories():
    step("Creating required directories and default files")
    
    dirs = [
        ROOT / "live_data",
        ROOT / "docs",
        ROOT / "logs",
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)
        ok(f"Directory: {d.relative_to(ROOT)}/")
    
    # Ensure stream.jsonl exists (Pathway input)
    stream = ROOT / "live_data" / "stream.jsonl"
    if not stream.exists():
        stream.touch()
        ok("Created live_data/stream.jsonl (empty)")
    else:
        ok("live_data/stream.jsonl already exists")
    
    # Ensure whitelist.json exists with sensible defaults
    wl_path = ROOT / "whitelist.json"
    if not wl_path.exists():
        default_wl = {
            "ips": [],
            "ports": [8000, 8011, 5173],
            "anomaly_threshold": 0.5,
            "logging": {
                "all_packets": True,
                "anomalies": True,
                "rag_context": True,
                "graph_edges": True
            }
        }
        wl_path.write_text(json.dumps(default_wl, indent=2))
        ok("Created whitelist.json with defaults")
    else:
        ok("whitelist.json already exists")
    
    # Ensure active_targets.json exists
    at_path = ROOT / "active_targets.json"
    if not at_path.exists():
        at_path.write_text("[]")
        ok("Created active_targets.json")
    else:
        ok("active_targets.json already exists")

# ─── 6. .env check ───────────────────────────────────────────────────────────
def check_env_file():
    step("Checking environment configuration")
    
    env_path = ROOT / ".env"
    if env_path.exists():
        content = env_path.read_text()
        if "OPENROUTER_API_KEY" in content and "your_key_here" not in content:
            ok(".env found with OPENROUTER_API_KEY set")
        else:
            warn(".env exists but OPENROUTER_API_KEY may not be set")
            print(f"     Edit {env_path} and add your key:")
            print("     OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxx")
    else:
        warn(".env not found — creating template")
        env_path.write_text("OPENROUTER_API_KEY=your_key_here\n")
        print(f"     Edit {env_path} and replace 'your_key_here' with your actual API key.")
        print("     Get one free at: https://openrouter.ai/keys")

# ─── 7. Summary ──────────────────────────────────────────────────────────────
def print_summary():
    print(f"""
{BOLD}{GREEN}
════════════════════════════════════════════════
  Setup complete! 
════════════════════════════════════════════════{RESET}

{BOLD}How to start:{RESET}

  python start_sentinel.py

{BOLD}Services:{RESET}
  Dashboard  →  http://localhost:5173
  Django API →  http://localhost:8000
  Pathway    →  http://localhost:8011

{BOLD}Live logs:{RESET}
  tail -f django.log pathway.log capture.log vite.log

{YELLOW}⚠  Reminder:{RESET} Make sure OPENROUTER_API_KEY is set in .env
    before starting, otherwise the AI assistant won't work.
""")

# ─── Entry point ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    banner()
    check_prerequisites()
    setup_python_env()
    setup_django()
    setup_frontend()
    setup_directories()
    check_env_file()
    print_summary()
