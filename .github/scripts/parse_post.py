#!/usr/bin/env python3
"""Parse NVIDIA response into a blog post. Extracts JSON robustly."""
import json
import re
import sys

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
    print(json.dumps({"post": post}))
except Exception:
    print(json.dumps({"error": "post_parse_failed", "hint": content[:200]}))
