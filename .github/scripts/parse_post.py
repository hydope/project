#!/usr/bin/env python3
"""Parse NVIDIA response into a blog post. Extracts JSON robustly.

2026-11-22 quality gate (Syed's order): a parsed post must also be a REAL
article — at least 600 words of body text (the prompt targets 900-1,100),
at least 8 body blocks, and none of the old fallback template's stock
phrases. Anything below the gate returns an error JSON with no "title"
key, so the workflow saves nothing and the topic returns to the queue.
The server enforces the same gate again in aiQueueSave().
"""
import json
import re
import sys

MIN_WORDS = 600
MIN_BLOCKS = 8
BANNED_PHRASES = [
    "in the journey toward nikah",
    "provide clear guidance on marriage",
    "begin with clear intention",
    "may allah bless your search",
]

try:
    data = json.load(sys.stdin)
    content = data["choices"][0]["message"]["content"] or ""
except Exception:
    print(json.dumps({"error": "nvidia_parse_failed"}))
    sys.exit()

# The model sometimes wraps JSON in fences or adds preamble. Extract outermost {...}.
content = content.strip()
start = content.find("{")
end = content.rfind("}")
if start >= 0 and end > start:
    content = content[start : end + 1]
content = re.sub(r"^```(?:json)?\s*", "", content.strip())
content = re.sub(r"\s*```$", "", content)

try:
    post = json.loads(content)
    assert post.get("title") and isinstance(post.get("body"), list)
except Exception:
    print(json.dumps({"error": "post_parse_failed", "hint": content[:200]}))
    sys.exit()

# --- quality gate -----------------------------------------------------------
body = post.get("body") or []
text = "\n".join(
    str(b.get("x", "")) for b in body if isinstance(b, dict)
)
words = len(re.findall(r"[A-Za-z0-9']+", text))
lower = text.lower()
banned_hit = next((p for p in BANNED_PHRASES if p in lower), None)
if words < MIN_WORDS or len(body) < MIN_BLOCKS or banned_hit:
    print(json.dumps({
        "error": "below_quality_gate",
        "words": words,
        "blocks": len(body),
        "banned_phrase": banned_hit,
    }))
    sys.exit()

print(json.dumps({"post": post}))
