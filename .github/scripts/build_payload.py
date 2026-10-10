#!/usr/bin/env python3
"""Build the NVIDIA API payload from a system prompt file. Avoids bash quoting hell."""
import json
import sys

with open(sys.argv[1]) as f:
    system = f.read()

payload = {
    "model": "nvidia/nemotron-3.5-lightning-30b-a3b",
    "messages": [{"role": "system", "content": system}],
    "max_tokens": 2000,
    "temperature": 0.25,
    "stream": False,
}

with open(sys.argv[2], "w") as f:
    json.dump(payload, f)
