"""Crossref and authoritative DOI metadata audit script with full UTF-8 output."""

import urllib.request
import json
import re
from pathlib import Path
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[3]
BIB_FILE = REPO_ROOT / "research" / "manuscript" / "references" / "references.bib"
OUT_CSV = REPO_ROOT / "research" / "manuscript" / "references" / "BIBLIOGRAPHY_AUDIT.csv"
OUT_JSON = REPO_ROOT / "research" / "manuscript" / "references" / "crossref_dump.json"

def audit_bib():
    bib_text = BIB_FILE.read_text(encoding="utf-8")
    entries = re.findall(r'@(\w+)\{([^,]+),\s*(.*?)\n\}', bib_text, re.DOTALL)
    print(f"Total BibTeX entries found: {len(entries)}")

    audit_rows = []

    for entry_type, cite_key, fields_str in entries:
        doi_match = re.search(r'doi\s*=\s*\{([^}]+)\}', fields_str, re.IGNORECASE)
        title_match = re.search(r'title\s*=\s*\{([^}]+)\}', fields_str, re.IGNORECASE)
        author_match = re.search(r'author\s*=\s*\{([^}]+)\}', fields_str, re.IGNORECASE)
        venue_match = re.search(r'journal\s*=\s*\{([^}]+)\}', fields_str, re.IGNORECASE) or re.search(r'booktitle\s*=\s*\{([^}]+)\}', fields_str, re.IGNORECASE)
        year_match = re.search(r'year\s*=\s*\{([^}]+)\}', fields_str, re.IGNORECASE)

        current_title = title_match.group(1).strip() if title_match else ""
        current_doi = doi_match.group(1).strip() if doi_match else ""
        current_authors = author_match.group(1).strip() if author_match else ""
        current_venue = venue_match.group(1).strip() if venue_match else ""
        current_year = year_match.group(1).strip() if year_match else ""

        row = {
            "citation_key": cite_key,
            "entry_type": entry_type,
            "current_title": current_title,
            "current_doi": current_doi,
            "current_authors": current_authors,
            "current_venue": current_venue,
            "current_year": current_year,
            "resolved_title": "",
            "resolved_doi": current_doi,
            "resolved_authors": "",
            "resolved_venue": "",
            "resolved_year": "",
            "resolved_volume": "",
            "resolved_issue": "",
            "resolved_page": "",
            "publisher_source": "",
            "crossref_verified": False,
            "status": "UNKNOWN",
            "action": "PENDING",
            "notes": ""
        }

        if current_doi:
            url = f"https://api.crossref.org/works/{current_doi}"
            req = urllib.request.Request(url, headers={"User-Agent": "AntigravityBibliographicAuditor/1.0 (mailto:audit@orca-research.org)"})
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    msg = data.get("message", {})
                    res_titles = msg.get("title", [])
                    row["resolved_title"] = res_titles[0] if res_titles else ""
                    
                    authors = msg.get("author", [])
                    author_list = []
                    for a in authors:
                        family = a.get("family", "")
                        given = a.get("given", "")
                        if family and given:
                            author_list.append(f"{family}, {given}")
                        elif family:
                            author_list.append(family)
                    row["resolved_authors"] = " and ".join(author_list)
                    
                    venues = msg.get("container-title", [])
                    row["resolved_venue"] = venues[0] if venues else ""
                    
                    issued = msg.get("issued", {}).get("date-parts", [[None]])[0][0]
                    row["resolved_year"] = str(issued) if issued else ""
                    row["resolved_volume"] = str(msg.get("volume", ""))
                    row["resolved_issue"] = str(msg.get("issue", ""))
                    row["resolved_page"] = str(msg.get("page", ""))
                    row["publisher_source"] = str(msg.get("publisher", ""))
                    row["crossref_verified"] = True
            except Exception as e:
                row["notes"] = f"Crossref lookup failed: {e}"

        audit_rows.append(row)

    OUT_JSON.write_text(json.dumps(audit_rows, indent=2, ensure_ascii=False), encoding="utf-8")
    df = pd.DataFrame(audit_rows)
    df.to_csv(OUT_CSV, index=False, encoding="utf-8")
    print(f"Saved audit results to {OUT_CSV} and {OUT_JSON}")
    return df

if __name__ == "__main__":
    audit_bib()
