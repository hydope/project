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


def main():
    ftps = connect()
    ensure_dir(ftps, REMOTE_ROOT)
    count = 0
    for dirpath, dirnames, filenames in os.walk(LOCAL_ROOT):
        dirnames[:] = [
            d for d in dirnames
            if not excluded(os.path.relpath(os.path.join(dirpath, d), LOCAL_ROOT))
        ]
        rel_dir = os.path.relpath(dirpath, LOCAL_ROOT)
        remote_dir = (REMOTE_ROOT if rel_dir == "."
                      else REMOTE_ROOT + "/" + rel_dir.replace(os.sep, "/"))
        ensure_dir(ftps, remote_dir)
        for fn in sorted(filenames):
            rel = fn if rel_dir == "." else rel_dir + os.sep + fn
            if excluded(rel):
                continue
            local_path = os.path.join(dirpath, fn)
            remote_path = remote_dir + "/" + fn
            for attempt in range(1, MAX_FILE_ATTEMPTS + 1):
                try:
                    with open(local_path, "rb") as f:
                        ftps.storbinary("STOR " + remote_path, f)
                    count += 1
                    break
                except Exception as e:  # noqa: BLE001 - retry any transfer error
                    print(f"  retry {attempt}/{MAX_FILE_ATTEMPTS} {rel}: "
                          f"{type(e).__name__}: {e}", flush=True)
                    if attempt == MAX_FILE_ATTEMPTS:
                        raise
                    time.sleep(RETRY_SLEEP)
                    ftps = connect()  # fresh control connection for the retry
                    ensure_dir(ftps, remote_dir)
    try:
        ftps.quit()
    except Exception:  # noqa: BLE001 - best effort close
        pass
    print(f"MIRROR_OK: {count} files -> {REMOTE_ROOT}", flush=True)


if __name__ == "__main__":
    main()
