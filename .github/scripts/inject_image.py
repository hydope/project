#!/usr/bin/env python3
"""Inject image_url into a post JSON read from stdin, then print the bare
post object. Accepts either {"post": {...}} or the bare post itself.
Usage: echo "$POST_JSON" | python3 inject_image.py "$IMAGE_URL"
Kept as a file (not python3 -c) so the workflow YAML never fights with
block-scalar indentation again."""
import json
import sys

image_url = sys.argv[1]
d = json.load(sys.stdin)
post = d["post"] if "post" in d else d
post["image_url"] = image_url
print(json.dumps(post))
