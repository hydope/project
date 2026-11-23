#!/usr/bin/env python3
"""Apply blog rewrites via POST /api/ai/queue-update, then hold templates.

Usage: apply_rewrites.py <rewrite-dir>
Env:   BLOG_CRON_KEY (service key), API_BASE (default https://shiarishta.com/api/ai)

Each <rewrite-dir>/*.json is {slug, title, excerpt, category, body:[{t,x}]}.
The endpoint is quality-gated server-side (>=600 words, no template text),
so a bad file is refused and reported, never stored. After the rewrites,
POST /hold-templates flips any still-scheduled fallback-template posts to
draft so they can never publish. Exits non-zero if any rewrite fails.
"""
import glob
import json
import os
import subprocess
import sys

API = os.environ.get("API_BASE", "https://shiarishta.com/api/ai")
KEY = os.environ.get("BLOG_CRON_KEY", "")
if not KEY:
    print("BLOG_CRON_KEY missing")
    sys.exit(2)


def post(path, payload):
    r = subprocess.run(
        ["curl", "-s", "--max-time", "60", "-X", "POST", f"{API}{path}",
         "-H", f"X-Blog-Cron-Key: {KEY}", "-H", "Content-Type: application/json",
         "-d", json.dumps(payload)],
        capture_output=True, text=True,
    )
    try:
        return json.loads(r.stdout)
    except Exception:
        return {"ok": False, "raw": r.stdout[:300], "rc": r.returncode}


def main():
    files = sorted(glob.glob(os.path.join(sys.argv[1], "*.json")))
    if not files:
        print("no rewrite files found")
        sys.exit(2)
    failed = 0
    for f in files:
        d = json.load(open(f))
        payload = {"slug": d["slug"], "post": {
            "title": d["title"], "excerpt": d["excerpt"],
            "category": d.get("category", "Guidance"), "body": d["body"],
        }}
        res = post("/queue-update", payload)
        print(f"{d['slug']}: {json.dumps(res)}")
        if not res.get("ok"):
            failed += 1
    held = post("/hold-templates", {})
    print(f"hold-templates: {json.dumps(held)}")
    print(f"done: {len(files) - failed}/{len(files)} rewrites applied")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
