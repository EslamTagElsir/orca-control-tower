"""Inspect resolved Crossref dump with utf-8 output."""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

dump_path = Path("research/manuscript/references/crossref_dump.json")
data = json.loads(dump_path.read_text(encoding="utf-8"))

for item in data:
    print("==================================================")
    print(f"KEY: {item['citation_key']}")
    print(f"  Current Title : {item['current_title']}")
    print(f"  Resolved Title: {item['resolved_title']}")
    print(f"  Current DOI   : {item['current_doi']}")
    print(f"  Resolved Venue: {item['resolved_venue']}")
    print(f"  Current Venue : {item['current_venue']}")
    print(f"  Resolved Auth : {item['resolved_authors']}")
    print(f"  Current Auth  : {item['current_authors']}")
    print(f"  Resolved Year : {item['resolved_year']} (Current: {item['current_year']})")
    print(f"  Resolved Vol/Iss/Page: {item['resolved_volume']} / {item['resolved_issue']} / {item['resolved_page']}")
    if item['notes']:
        print(f"  Notes: {item['notes']}")
