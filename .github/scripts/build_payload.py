#!/usr/bin/env python3
"""Build the NVIDIA API payload from a system prompt file. Avoids bash quoting hell.

2026-11-22: temperature raised 0.25 -> 0.7 and max_tokens 2000 -> 4500.
At 0.25 the model collapsed to the same safe structure every time, and
2000 tokens cannot hold the 900-1,100 word article the prompt now demands
plus JSON overhead — truncation was one cause of the parse failures that
the old template fallback then papered over.
"""
import json
import sys

with open(sys.argv[1]) as f:
    system = f.read()

payload = {
    "model": "nvidia/nemotron-3.5-lightning-30b-a3b",
    "messages": [{"role": "system", "content": system}],
    "max_tokens": 4500,
    "temperature": 0.7,
    "stream": False,
}

with open(sys.argv[2], "w") as f:
    json.dump(payload, f)
