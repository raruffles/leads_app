import json
import unicodedata
from pathlib import Path
from typing import List, Dict

_CITIES_CACHE: List[Dict] = []

# Abreviações e siglas comuns de cidades e capitais no Brasil
CITY_ALIASES = {
    "bh": "Belo Horizonte - MG",
    "belo horizonte": "Belo Horizonte - MG",
    "sp": "São Paulo - SP",
    "sampa": "São Paulo - SP",
    "sao paulo": "São Paulo - SP",
    "rj": "Rio de Janeiro - RJ",
    "rio": "Rio de Janeiro - RJ",
    "rio de janeiro": "Rio de Janeiro - RJ",
    "bsb": "Brasília - DF",
    "brasilia": "Brasília - DF",
    "cwb": "Curitiba - PR",
    "curitiba": "Curitiba - PR",
    "poa": "Porto Alegre - RS",
    "porto alegre": "Porto Alegre - RS",
    "floripa": "Florianópolis - SC",
    "florianopolis": "Florianópolis - SC",
    "ssa": "Salvador - BA",
    "salvador": "Salvador - BA",
    "vix": "Vitória - ES",
    "vitoria": "Vitória - ES",
    "gyn": "Goiânia - GO",
    "goiania": "Goiânia - GO",
    "rec": "Recife - PE",
    "recife": "Recife - PE",
    "for": "Fortaleza - CE",
    "fortaleza": "Fortaleza - CE",
    "cps": "Campinas - SP",
    "campinas": "Campinas - SP",
    "sjc": "São José dos Campos - SP",
    "sao jose dos campos": "São José dos Campos - SP",
    "jampa": "João Pessoa - PB",
    "slz": "São Luís - MA",
    "uba": "Ubatuba - SP",
    "ubatuba": "Ubatuba - SP",
}

# Principais capitais e polos econômicos do Brasil para priorização na busca
PRIORITY_CITIES = {
    "sao paulo - sp", "rio de janeiro - rj", "brasilia - df", "salvador - ba",
    "fortaleza - ce", "belo horizonte - mg", "manaus - am", "curitiba - pr",
    "recife - pe", "goiania - go", "belem - pa", "porto alegre - rs",
    "guarulhos - sp", "campinas - sp", "sao luis - ma", "sao goncalo - rj",
    "maceio - al", "duque de caxias - rj", "campo grande - ms", "natal - rn",
    "teresina - pi", "sao bernardo do campo - sp", "nova iguacu - rj",
    "joao pessoa - pb", "santo andre - sp", "osasco - sp", "sao jose dos campos - sp",
    "jaboatao dos guararapes - pe", "ribeirao preto - sp", "uberlandia - mg",
    "contagem - mg", "sorocaba - sp", "aracaju - se", "feira de santana - ba",
    "cuiaba - mt", "joinville - sc", "juiz de fora - mg", "londrina - pr",
    "aparecida de goiania - go", "niteroi - rj", "anapolis - go",
    "porto velho - ro", "serra - es", "caxias do sul - rs", "macapa - ap",
    "florianopolis - sc", "vila velha - es", "ubatuba - sp", "uberaba - mg",
    "santos - sp", "sao jose do rio preto - sp", "maringa - pr", "blumenau - sc",
    "vitoria - es", "rio branco - ac", "boa vista - rr", "palmas - to"
}

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
        is_priority = 0 if norm_label in PRIORITY_CITIES else 1
        
        _CITIES_CACHE.append({
            "name": name,
            "uf": uf,
            "label": label,
            "norm_name": norm_name,
            "norm_label": norm_label,
            "is_priority": is_priority
        })

def search_cities(query: str, limit: int = 15) -> List[Dict[str, str]]:
    _load_cities()
    
    q_norm = _normalize_text(query)
    if not q_norm:
        # Retorna as principais cidades do país como sugestão inicial ao focar
        priority_cities = [c for c in _CITIES_CACHE if c["is_priority"] == 0][:limit]
        return [{"name": c["name"], "uf": c["uf"], "label": c["label"]} for c in priority_cities]
    
    # 1. Checa apelido / sigla exata (ex: 'bh' -> Belo Horizonte, 'sjc' -> São José dos Campos)
    alias_label = CITY_ALIASES.get(q_norm)
    alias_match = None
    if alias_label:
        norm_alias = _normalize_text(alias_label)
        for item in _CITIES_CACHE:
            if item["norm_label"] == norm_alias:
                alias_match = item
                break

    exact_matches = []
    prefix_matches = []
    word_prefix_matches = []
    contains_matches = []
    
    for item in _CITIES_CACHE:
        norm_name = item["norm_name"]
        norm_label = item["norm_label"]
        
        if alias_match and item["norm_label"] == alias_match["norm_label"]:
            continue
            
        if norm_name == q_norm or norm_label == q_norm:
            exact_matches.append(item)
        elif norm_name.startswith(q_norm):
            prefix_matches.append(item)
        elif any(part.startswith(q_norm) for part in norm_name.split()):
            word_prefix_matches.append(item)
        elif q_norm in norm_label:
            contains_matches.append(item)
            
    # Ordenação com prioridade para cidades polos/capitais, depois tamanho do nome e ordem alfabética
    exact_matches.sort(key=lambda x: (x["is_priority"], len(x["name"]), x["name"]))
    prefix_matches.sort(key=lambda x: (x["is_priority"], len(x["name"]), x["name"]))
    word_prefix_matches.sort(key=lambda x: (x["is_priority"], len(x["name"]), x["name"]))
    contains_matches.sort(key=lambda x: (x["is_priority"], len(x["name"]), x["name"]))
    
    combined = []
    if alias_match:
        combined.append(alias_match)
    combined.extend(exact_matches)
    combined.extend(prefix_matches)
    combined.extend(word_prefix_matches)
    combined.extend(contains_matches)
    
    # Deduplicação preservando ordem
    seen = set()
    deduped = []
    for r in combined:
        if r["label"] not in seen:
            seen.add(r["label"])
            deduped.append({
                "name": r["name"],
                "uf": r["uf"],
                "label": r["label"]
            })
            if len(deduped) >= limit:
                break
                
    return deduped
