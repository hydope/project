#!/usr/bin/env python3
"""Sequential FTPS mirror: local dir -> remote dir.

Why this exists: lftp and the FTP-Deploy-Action open parallel FTP data
connections, which this host's firewall answers with TCP RST ("Connection
refused"). A single sequential ftplib transfer works reliably. So: one data
connection at a time, per-file retries with reconnect, no deletes (deleting is
how you lose /public_html/api, .well-known/, and runtime data).

Usage: ftp_mirror.py <local_dir> <remote_dir> <exclude_csv>
  exclude_csv: comma-separated; "name*" matches basenames, "dir/" prunes dirs.
"""
import fnmatch
import ftplib
import os
import sys
import time

HOST = os.environ["FTP_SERVER"]
USER = os.environ["FTP_USERNAME"]
PASS = os.environ["FTP_PASSWORD"]
LOCAL_ROOT = sys.argv[1]
REMOTE_ROOT = sys.argv[2]
EXCLUDES = [e for e in sys.argv[3].split(",") if e]

MAX_FILE_ATTEMPTS = 3
RETRY_SLEEP = 10


def excluded(rel):
    parts = rel.split(os.sep)
    for pat in EXCLUDES:
        if pat.endswith("/"):
            if pat.rstrip("/") in parts:
                return True
        elif fnmatch.fnmatch(parts[-1], pat):
            return True
    return False


def connect():
    ftps = ftplib.FTP_TLS(HOST, timeout=40)
    ftps.login(USER, PASS)
    ftps.prot_p()  # encrypted data channel, like the old ftps deploys
    return ftps


def ensure_dir(ftps, remote_dir):
    parts = [p for p in remote_dir.split("/") if p]
    path = ""
    for p in parts:
        path += "/" + p
        try:
            ftps.mkd(path)
        except ftplib.error_perm:
            pass  # already exists


def upload(ftps, local_path, remote_path, remote_dir, label):
    """Upload one file with the standard retry/reconnect policy.

    Returns the (possibly reconnected) ftps handle."""
    for attempt in range(1, MAX_FILE_ATTEMPTS + 1):
        try:
            with open(local_path, "rb") as f:
                ftps.storbinary("STOR " + remote_path, f)
            return ftps
        except Exception as e:  # noqa: BLE001 - retry any transfer error
            print(f"  retry {attempt}/{MAX_FILE_ATTEMPTS} {label}: "
                  f"{type(e).__name__}: {e}", flush=True)
            if attempt == MAX_FILE_ATTEMPTS:
                raise
            time.sleep(RETRY_SLEEP)
            ftps = connect()  # fresh control connection for the retry
            ensure_dir(ftps, remote_dir)
    return ftps


def upload_priority(rel):
    """Upload order that keeps every live page servable mid-deploy.

    0 = the build's asset chunks (assets/…): every HTML page references
        them, so they land first.
    2 = any index.html (root AND per-route prerendered pages): a route's
        HTML must only go live after the chunks it references exist —
        uploading one early creates the broken window behind errors like
        "Importing binding name 'X' is not found" and the lazy-chunk
        'default' crashes logged 2026-11-20. The old code deferred only
        the ROOT index.html; prerendered route pages slipped through in
        walk order.
    1 = everything else.
    """
    parts = rel.split(os.sep)
    if parts[0] == "assets":
        return 0
    if parts[-1] == "index.html":
        return 2
    return 1


def main():
    ftps = connect()
    ensure_dir(ftps, REMOTE_ROOT)
    # Collect first, upload in priority order (see upload_priority).
    files = []
    for dirpath, dirnames, filenames in os.walk(LOCAL_ROOT):
        dirnames[:] = [
            d for d in dirnames
            if not excluded(os.path.relpath(os.path.join(dirpath, d), LOCAL_ROOT))
        ]
        rel_dir = os.path.relpath(dirpath, LOCAL_ROOT)
        remote_dir = (REMOTE_ROOT if rel_dir == "."
                      else REMOTE_ROOT + "/" + rel_dir.replace(os.sep, "/"))
        for fn in sorted(filenames):
            rel = fn if rel_dir == "." else rel_dir + os.sep + fn
            if excluded(rel):
                continue
            files.append((upload_priority(rel), rel,
                          os.path.join(dirpath, fn),
                          remote_dir + "/" + fn, remote_dir))
    files.sort(key=lambda t: (t[0], t[1]))
    ensured = set()
    count = 0
    for _prio, rel, local_path, remote_path, remote_dir in files:
        if remote_dir not in ensured:
            ensure_dir(ftps, remote_dir)
            ensured.add(remote_dir)
        ftps = upload(ftps, local_path, remote_path, remote_dir, rel)
        count += 1
    try:
        ftps.quit()
    except Exception:  # noqa: BLE001 - best effort close
        pass
    print(f"MIRROR_OK: {count} files -> {REMOTE_ROOT}", flush=True)


if __name__ == "__main__":
    main()
