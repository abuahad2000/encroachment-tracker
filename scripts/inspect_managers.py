import json
import os
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

def inspect_data():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    managers_file = os.path.join(base_dir, 'server', 'data', 'generated', 'managers.json')
    with open(managers_file, 'r', encoding='utf-8') as f:
        managers = json.load(f)
    for m in managers:
        print(f"{m['name']}: pending={m.get('pendingReportsCount')}, phone={m.get('phone')}, email={m.get('email')}, scope={m.get('scope')}")

if __name__ == '__main__':
    inspect_data()
