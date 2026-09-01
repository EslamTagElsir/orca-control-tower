"""Search and verify supplementary high-impact papers across all 6 themes."""

import urllib.request
import json
from pathlib import Path

extra_dois = [
    # Supply chain resilience & ML
    {"key": "spieske2021improving", "doi": "10.1080/00207543.2021.1946980"}, # Spieske & Birkel (2021) IJPR
    {"key": "brintrup2020supply", "doi": "10.1080/00207543.2019.1633024"}, # Brintrup et al. (2020) IJPR
    {"key": "carbonneau2008application", "doi": "10.1080/00207540600988043"}, # Carbonneau et al. (2008) IJPR
    # Calibration
    {"key": "kull2019beyond", "doi": "10.1214/19-EJS1628"}, # Kull et al. (2019) Electronic Journal of Statistics (Beta/Dirichlet calibration)
    # Conformal time series & shift
    {"key": "zaffran2022adaptive", "doi": "10.48550/arXiv.2202.07282"}, # Zaffran et al. (2022) ICML
]

for item in extra_dois:
    doi = item["doi"]
    url = f"https://api.crossref.org/works/{doi}"
    req = urllib.request.Request(url, headers={"User-Agent": "AntigravityBibliographicAuditor/1.0 (mailto:audit@orca-research.org)"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            msg = data.get("message", {})
            print("========================================")
            print(f"KEY: {item['key']} | DOI: {doi}")
            print(f"Title  : {msg.get('title', [''])[0]}")
            print(f"Venue  : {msg.get('container-title', [''])[0]}")
            print(f"Issued : {msg.get('issued', {}).get('date-parts', [[None]])[0][0]}")
            authors = msg.get('author', [])
            auth_str = " and ".join([f"{a.get('family', '')}, {a.get('given', '')}" for a in authors])
            print(f"Authors: {auth_str}")
    except Exception as e:
        print(f"Failed {doi}: {e}")
