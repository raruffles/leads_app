import json
import unicodedata
from pathlib import Path
from typing import List, Dict

_CITIES_CACHE: List[Dict] = []

def _normalize_text(text: str) -> str:
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()

def _load_cities():
    global _CITIES_CACHE
    if _CITIES_CACHE:
        return
    
    json_path = Path(__file__).parent / "data" / "brazilian_cities.json"
    if not json_path.exists():
        return
    
    with open(json_path, "r", encoding="utf-8") as f:
        raw_cities = json.load(f)
        
    for item in raw_cities:
        name = item.get("name", "").strip()
        uf = item.get("uf", "").strip().upper()
        norm_name = _normalize_text(name)
        label = f"{name} - {uf}"
        norm_label = f"{norm_name} - {uf.lower()}"
        
        _CITIES_CACHE.append({
            "name": name,
            "uf": uf,
            "label": label,
            "norm_name": norm_name,
            "norm_label": norm_label
        })

def search_cities(query: str, limit: int = 15) -> List[Dict[str, str]]:
    _load_cities()
    
    q_norm = _normalize_text(query)
    if not q_norm:
        return []
    
    exact_matches = []
    prefix_matches = []
    word_prefix_matches = []
    contains_matches = []
    
    for item in _CITIES_CACHE:
        norm_name = item["norm_name"]
        norm_label = item["norm_label"]
        
        if norm_name == q_norm or norm_label == q_norm:
            exact_matches.append(item)
        elif norm_name.startswith(q_norm):
            prefix_matches.append(item)
        elif any(part.startswith(q_norm) for part in norm_name.split()):
            word_prefix_matches.append(item)
        elif q_norm in norm_label:
            contains_matches.append(item)
            
    prefix_matches.sort(key=lambda x: (len(x["name"]), x["name"]))
    word_prefix_matches.sort(key=lambda x: (len(x["name"]), x["name"]))
    contains_matches.sort(key=lambda x: (len(x["name"]), x["name"]))
    
    results = (exact_matches + prefix_matches + word_prefix_matches + contains_matches)[:limit]
    
    return [
        {
            "name": r["name"],
            "uf": r["uf"],
            "label": r["label"]
        }
        for r in results
    ]
