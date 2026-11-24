#!/usr/bin/env python3
"""Delete an explicit allowlist of stale remote files over FTPS.

Why this exists: ftp_mirror.py is upload-only BY DESIGN. A delete-sync
(mirror --delete / clean-slate) computes "remote file with no local
counterpart" and removes it — and the two mirrored roots are full of
legitimate server-only files that must never be computed away:

  /public_html/api/            deployed by a SEPARATE mirror step; a
                               delete-sync of dist/ -> /public_html/
                               would see the whole API as "stale"
  /public_html/.well-known/    Let's Encrypt / ACME, host-managed
  /public_html/api/.env        generated from secrets at deploy time
  /public_html/api/storage/    runtime data: guest-*.json response
                               cache, rate/ limiter state
  /public_html/api/uploads/    runtime user photos (the repo carries
                               only seeded/ + blog-covers/ samples)
  /public_html/index.php       legacy WordPress file the .htaccess
                               DirectoryIndex rule exists to shadow

So deletions travel as an explicit, reviewed list instead: when a file
is removed from public/ or php-api/, add its remote path to STALE_PATHS
in the same commit. This script deletes exactly those paths — nothing
else is ever touched — and treats "already gone" (550) as success, so
it is safe to run on every deploy. Entries can be pruned once a deploy
log shows them deleted and a live check confirms they stay gone.

Same transport constraints as ftp_mirror.py: explicit FTPS, one
sequential connection (the host's firewall RSTs parallel data
connections).
"""
import ftplib
import os
import sys

HOST = os.environ["FTP_SERVER"]
USER = os.environ["FTP_USERNAME"]
PASS = os.environ["FTP_PASSWORD"]

# Remote absolute paths of files deleted from the repo. Add an entry in
# the same commit that deletes the source file.
STALE_PATHS = [
    # public/seed.html — deleted in cf1afca (audit A-04, 2026-11-24):
    # page listing seed test accounts. Still served live after the
    # deletion commit because the mirror never deletes; the .htaccess
    # 410 rule covers the URL until this cleanup removes the file.
    "/public_html/seed.html",
]


def main():
    ftps = ftplib.FTP_TLS(HOST, timeout=40)
    ftps.login(USER, PASS)
    ftps.prot_p()
    failures = 0
    for path in STALE_PATHS:
        try:
            ftps.delete(path)
            print(f"DELETED stale file: {path}", flush=True)
        except ftplib.error_perm as e:
            if "550" in str(e):
                print(f"already gone: {path}", flush=True)
            else:
                failures += 1
                print(f"FAILED to delete {path}: {e}", flush=True)
        except Exception as e:  # noqa: BLE001 - report and continue
            failures += 1
            print(f"FAILED to delete {path}: {type(e).__name__}: {e}",
                  flush=True)
    try:
        ftps.quit()
    except Exception:  # noqa: BLE001 - best effort close
        pass
    if failures:
        print(f"STALE_CLEANUP_INCOMPLETE: {failures} path(s) failed",
              flush=True)
        return 1
    print("STALE_CLEANUP_OK", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
