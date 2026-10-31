#!/usr/bin/env python3
"""Conservative local Git preflight. Remote visibility and Cloud Run require manual check."""
from pathlib import Path
import subprocess
import sys

LIMIT = 8_000_000  # intentionally conservative below the official 10 MB cap

def run(*args):
    p = subprocess.run(args, capture_output=True, text=True)
    return p.returncode, p.stdout.strip(), p.stderr.strip()

ok = True
rc, root, err = run('git', 'rev-parse', '--show-toplevel')
if rc:
    print('FAIL: not inside a Git repository; clone/create GitHub repo first.'); sys.exit(1)
print('Repository:', root)
rc, branch, _ = run('git', 'branch', '--show-current')
if branch != 'main': print('FAIL: current branch is not main:', branch); ok = False
else: print('PASS: current branch is main')
rc, refs, _ = run('git', 'for-each-ref', '--format=%(refname:short)', 'refs/heads')
heads = [x for x in refs.splitlines() if x.strip()]
if heads != ['main']:
    print('WARN: local branches:', heads, '(event permits only one repository branch)')
    ok = False
else: print('PASS: only one local branch')
rc, remote, stderr = run('git', 'ls-remote', '--heads', 'origin')
if rc:
    print('WARN: remote branch check unavailable:', stderr or 'check Git remote/auth')
    ok = False
else:
    remote_heads = [x.split('refs/heads/',1)[-1] for x in remote.splitlines() if 'refs/heads/' in x]
    if remote_heads != ['main']:
        print('FAIL: remote heads:', remote_heads); ok = False
    else: print('PASS: only origin/main')
rc, tracked, _ = run('git', 'ls-files')
paths = [x.lower().replace('\\','/') for x in tracked.splitlines()]
forbidden = [x for x in paths if x.startswith('node_modules/') or x.startswith('dist/') or x.startswith('.env') or '/.env' in x or 'service-account' in x or 'credentials.json' in x or x.endswith(('.zip','.mp4','.mov','.pem','.key'))]
if forbidden:
    print('FAIL: suspicious tracked paths:', forbidden[:20]); ok = False
else: print('PASS: no obvious forbidden tracked files')
# Sum all reachable historical blob payload sizes, not only current checkout.
rc, objects, _ = run('git', 'rev-list', '--objects', '--all')
if rc or not objects:
    print('WARN: cannot inspect Git history yet'); ok = False
else:
    oids = [line.split(' ',1)[0] for line in objects.splitlines()]
    info = subprocess.run(['git','cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize)'],
                          input='\n'.join(oids)+'\n', text=True, capture_output=True)
    if info.returncode:
        print('WARN: cannot inspect historical blobs'); ok = False
    else:
        size = 0
        for line in info.stdout.splitlines():
            fields = line.split()
            if len(fields)==3 and fields[1]=='blob':
                try: size += int(fields[2])
                except ValueError: pass
        print(f'All reachable raw Git blobs: {size:,} bytes (conservative target < {LIMIT:,})')
        if size >= LIMIT:
            print('FAIL: conservative history budget exceeded; inspect before pushing'); ok = False
        else: print('PASS: historical Git blob budget below 8 MB')
print('MANUAL checks still required: GitHub PUBLIC, no hidden remote refs, live Google Cloud Run URL, end-to-end output ZIP integrity.')
sys.exit(0 if ok else 1)
