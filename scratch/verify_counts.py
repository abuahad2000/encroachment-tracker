import json
import os
import sys

BASE_DIR = r"c:\antigravity files IDE\encroachment-tracker"
DATA_DIR = os.path.join(BASE_DIR, 'server', 'data', 'generated')
REPORTS_FILE = os.path.join(DATA_DIR, 'reports.json')

with open(REPORTS_FILE, 'r', encoding='utf-8') as f:
    reports = json.load(f)

pending = [r for r in reports if r.get('matched') and r.get('project') and not r.get('excluded') and r.get('status') == 'تحت معالجة المقاول']
in_prog = [r for r in reports if r.get('matched') and r.get('project') and not r.get('excluded') and r.get('status') != 'تحت معالجة المقاول' and r.get('status') != 'تمت المعالجة']
proc = [r for r in reports if r.get('matched') and r.get('project') and not r.get('excluded') and r.get('status') == 'تمت المعالجة']

print(f"Pending (under contractor): {len(pending)}")
print(f"In Progress: {len(in_prog)}")
print(f"Processed: {len(proc)}")
print(f"Total active assigned: {len(pending) + len(in_prog)}")
print(f"Total assigned: {len(pending) + len(in_prog) + len(proc)}")

from collections import Counter
print("\nIn progress statuses:")
print(Counter(r.get('status') for r in in_prog))

print("\nIn progress managers:")
print(Counter(r['project'].get('programManager') for r in in_prog))
