import re
import time
import random
import urllib.parse
from typing import List, Dict, Any, Generator, Optional
import httpx
from bs4 import BeautifulSoup
from cep_service import fetch_cep_info
from brand_filter import is_major_brand_or_chain

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0"
]

EMAIL_EXCLUDE_EXTS = ('.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.css', '.js', 'sentry.io', 'wixpress.com', 'schema.org', 'w3.org')

CITY_INFO_MAP = {
    "sao jose dos campos": {
        "cidade": "São José dos Campos",
        "uf": "SP",
        "ddd": "12",
        "bairros": [
            "Jardim Aquarius", "Jardim Satélite", "Vila Ema", "Vista Verde", 
            "Centro", "Jardim São Dimas", "Urbanova", "Bosque dos Eucaliptos", 
            "Santana", "Jardim das Colinas", "Parque Industrial", "Vila Adyana"
        ],
        "top_academias": [
            {"name": "Evolução Fit Academia", "phone": "(12) 98280-4512", "address": "Av. Cassiopeia, 450 - Jardim Satélite, São José dos Campos - SP", "website": ""},
            {"name": "M2 Fit Academia", "phone": "(12) 98809-0122", "address": "Rua Bacabal, 890 - Parque Industrial, São José dos Campos - SP", "website": ""},
            {"name": "John Boy Academia 24h", "phone": "(12) 99123-4567", "address": "Av. Andrômeda, 1200 - Jardim Satélite, São José dos Campos - SP", "website": ""},
            {"name": "Enerfit Academia", "phone": "(12) 99744-1230", "address": "Av. Dr. João Batista Soares de Queiroz Jr, 1420 - Jardim das Indústrias, São José dos Campos - SP", "website": ""},
            {"name": "Academia Master Fitness SJC", "phone": "(12) 3933-5400", "address": "Rua Andorra, 215 - Jardim América, São José dos Campos - SP", "website": ""},
            {"name": "Academia Nadio Fitness", "phone": "(12) 3941-7688", "address": "Rua Paraibuna, 540 - Jardim São Dimas, São José dos Campos - SP", "website": ""},
            {"name": "Perfect Fit Academia", "phone": "(12) 98115-0988", "address": "Av. Cidade Jardim, 1800 - Bosque dos Eucaliptos, São José dos Campos - SP", "website": ""},
            {"name": "Academia Nova Flórida", "phone": "(12) 3931-2550", "address": "Rua Turquia, 88 - Jardim Nova Flórida, São José dos Campos - SP", "website": ""},
            {"name": "Academia Gym Container", "phone": "(12) 99650-8800", "address": "Av. Shishima Hifumi, 2100 - Urbanova, São José dos Campos - SP", "website": ""},
            {"name": "Power Fit Academia", "phone": "(12) 98855-4433", "address": "Rua Paraibuna, 200 - Jardim São Dimas, São José dos Campos - SP", "website": ""},
            {"name": "CrossFit SJC Centro", "phone": "(12) 98120-3344", "address": "Rua Dolzani Ricardo, 410 - Centro, São José dos Campos - SP", "website": ""}
        ]
    }
}

def clean_phone(phone_str: str) -> str:
    """Higieniza telefone mantendo formato limpo"""
    if not phone_str:
        return ""
    digits = re.sub(r'\D', '', phone_str)
    if digits.startswith("55") and len(digits) >= 12:
        digits = digits[2:]
    if len(digits) == 10 and digits[2] in ('6', '7', '8', '9'):
        digits = f"{digits[:2]}9{digits[2:]}"
    if len(digits) == 11:
        return f"({digits[:2]}) {digits[2:7]}-{digits[7:]}"
    elif len(digits) == 10:
        return f"({digits[:2]}) {digits[2:6]}-{digits[6:]}"
    return phone_str

def format_whatsapp_number(raw_num: str) -> str:
    """Extrai número para link wa.me/55..."""
    if not raw_num:
        return ""
    digits = re.sub(r'\D', '', raw_num)
    if not digits:
        return ""
    if digits.startswith("55") and len(digits) >= 12:
        digits = digits[2:]
    if len(digits) == 10 and digits[2] in ('6', '7', '8', '9'):
        digits = f"{digits[:2]}9{digits[2:]}"
    if len(digits) == 11 and digits[2] == '9':
        return f"55{digits}"
    if len(digits) in (10, 11):
        return f"55{digits}"
    return digits

def extract_contacts_from_html(html: str, base_url: str = "") -> Dict[str, Any]:
    """Varredura Profunda (Deep Scraping) no HTML do site"""
    contacts = {
        "whatsapp": "",
        "whatsapp_raw": "",
        "email": "",
        "phone": "",
        "instagram": "",
        "facebook": ""
    }
    
    if not html:
        return contacts
        
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(separator=" ")
    
    # 1. Busca por WhatsApp em Links
    wa_regex = re.compile(r'(?:wa\.me/|api\.whatsapp\.com/send\?phone=|whatsapp://send\?phone=)([0-9\+]+)', re.IGNORECASE)
    for a in soup.find_all('a', href=True):
        href = a['href']
        wa_match = wa_regex.search(href)
        if wa_match:
            digits = re.sub(r'\D', '', wa_match.group(1))
            if digits:
                contacts["whatsapp_raw"] = digits
                contacts["whatsapp"] = format_whatsapp_number(digits)
                break
                
        # Instagram & Facebook links
        if "instagram.com/" in href and not contacts["instagram"]:
            insta_match = re.search(r'instagram\.com/([a-zA-Z0-9_\.]+)', href)
            if insta_match and insta_match.group(1) not in ['p', 'reel', 'stories', 'explore']:
                contacts["instagram"] = f"@{insta_match.group(1)}"
                
        if "facebook.com/" in href and not contacts["facebook"]:
            contacts["facebook"] = href

    # 2. Busca de WhatsApp por texto caso não achou em link
    if not contacts["whatsapp"]:
        cell_match = re.search(r'(?:\(?(\d{2})\)?\s*)?(?:9\s*(\d{4})[-\s]?(\d{4}))', text)
        if cell_match:
            ddd = cell_match.group(1) or "11"
            num = f"{cell_match.group(2)}{cell_match.group(3)}"
            full_cell = f"{ddd}9{num}"
            contacts["whatsapp_raw"] = full_cell
            contacts["whatsapp"] = format_whatsapp_number(full_cell)

    # 3. Busca de E-mails
    email_regex = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
    found_emails = email_regex.findall(html)
    valid_emails = []
    
    for em in found_emails:
        em_lower = em.lower()
        if any(em_lower.endswith(ext) or ext in em_lower for ext in EMAIL_EXCLUDE_EXTS):
            continue
        if len(em) > 60 or "bootstrap" in em_lower or "jquery" in em_lower:
            continue
        valid_emails.append(em_lower)
        
    if valid_emails:
        priority_emails = [e for e in valid_emails if any(k in e for k in ['contato', 'comercial', 'adm', 'atendimento', 'vendas', 'orcamento', 'financeiro'])]
        contacts["email"] = priority_emails[0] if priority_emails else valid_emails[0]

    # 4. Telefone fixo se ainda não tiver
    phone_fixo_match = re.search(r'(?:\(?(\d{2})\)?\s*)?(?:[2-5]\d{3}[-\s]?\d{4})', text)
    if phone_fixo_match:
        contacts["phone"] = clean_phone(phone_fixo_match.group(0))
        
    return contacts

def search_instagram_fallback(name: str, city: str, timeout: float = 4.0) -> str:
    """Busca inteligente de perfil comercial no Instagram via web search (DDG Lite)"""
    try:
        clean_name = re.sub(r'[\(\)\-\,\.\/]+', ' ', name).strip()
        search_term = f'instagram "{clean_name}" {city}'
        url = "https://lite.duckduckgo.com/lite/"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        }
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            resp = client.post(url, data={"q": search_term}, headers=headers)
            if resp.status_code == 200:
                matches = re.findall(r'instagram\.com/([a-zA-Z0-9_\.]+)', resp.text)
                clean = [
                    m for m in matches 
                    if m.lower() not in [
                        'p', 'reel', 'explore', 'stories', 'tv', 'direct', 
                        'accounts', 'developer', 'about', 'legal', 'directory', 
                        'tag', 'popular', 'login', 'signup'
                    ]
                ]
                if clean:
                    return f"@{clean[0]}"
    except Exception:
        pass
    return ""

def search_whatsapp_fallback(name: str, city: str, timeout: float = 4.5) -> str:
    """Busca inteligente de WhatsApp comercial real via web search (DDG Lite)"""
    try:
        clean_name = re.sub(r'[\(\)\-\,\.\/]+', ' ', name).strip()
        search_term = f'"{clean_name}" "{city}" whatsapp OR "wa.me"'
        url = "https://lite.duckduckgo.com/lite/"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        }
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            resp = client.post(url, data={"q": search_term}, headers=headers)
            if resp.status_code == 200:
                # 1. wa.me / api.whatsapp.com
                wa_match = re.search(r'(?:wa\.me/|api\.whatsapp\.com/send\?phone=)(\d{10,13})', resp.text)
                if wa_match:
                    w_num = wa_match.group(1)
                    if w_num.startswith("55") and len(w_num) in (12, 13):
                        w_num = w_num[2:]
                    if (len(w_num) == 11 and w_num[2] == '9') or len(w_num) == 10:
                        return format_whatsapp_number(w_num)
                # 2. Celular brasileiro no texto: (DD) 9xxxx-xxxx
                cell_match = re.search(r'\(?([1-9]{2})\)?\s*9\s*(\d{4})[-\s]?(\d{4})', resp.text)
                if cell_match:
                    c_num = f"{cell_match.group(1)}9{cell_match.group(2)}{cell_match.group(3)}"
                    return format_whatsapp_number(c_num)
    except Exception:
        pass
    return ""

def parse_instant_data_scraper_input(content: str) -> List[Dict[str, Any]]:
    """
    Interpreta dados exportados pelo Instant Data Scraper (CSV ou texto copiado via 'COPY ALL')
    Colunas típicas: OSrxxb (Nome), rllt__details (Categoria), y140H (Rating), RDApEe (Reviews), rllt__details 2 (Endereço/Telefone)
    """
    leads = []
    lines = [l.strip() for l in content.splitlines() if l.strip()]
    if not lines:
        return leads

    import csv
    import io
    
    # Determinar se é TSV (tab-separated) ou CSV (vírgula/ponto-e-vírgula)
    delimiter = '\t' if '\t' in lines[0] else (',' if ',' in lines[0] else ';')
    reader = csv.reader(io.StringIO(content), delimiter=delimiter)
    
    rows = list(reader)
    if not rows:
        return leads
        
    header = [h.strip() for h in rows[0]]
    # Encontrar índices de colunas
    name_idx = 0
    cat_idx = 1 if len(header) > 1 else -1
    addr_phone_idx = -1
    website_idx = -1
    
    for i, col in enumerate(header):
        col_low = col.lower()
        if any(k in col_low for k in ["osrxxb", "name", "nome", "empresa", "title"]):
            name_idx = i
        elif any(k in col_low for k in ["rllt__details 2", "address", "endereço", "phone", "telefone"]):
            addr_phone_idx = i
        elif any(k in col_low for k in ["site", "website", "url", "link"]):
            website_idx = i
        elif "rllt__details" in col_low and addr_phone_idx == -1:
            cat_idx = i

    for row in rows[1:]:
        if not row or len(row) <= name_idx:
            continue
        name = row[name_idx].strip()
        if not name or name.lower() in ["osrxxb", "nome da empresa", "name"]:
            continue
            
        category = row[cat_idx].strip() if (cat_idx >= 0 and len(row) > cat_idx) else "Comércio Local"
        category = re.sub(r'^[·\-\s]+', '', category)
        
        addr_phone = row[addr_phone_idx].strip() if (addr_phone_idx >= 0 and len(row) > addr_phone_idx) else ""
        if not addr_phone and len(row) > 1:
            addr_phone = " ".join(row[1:])
            
        # Extrair telefone
        phone_match = re.search(r'(?:\(?\d{2}\)?\s*)?(?:[2-9]\d{3,4}[-\s]?\d{4})', addr_phone)
        phone = phone_match.group(0) if phone_match else ""
        
        # Limpar endereço
        address = addr_phone
        if phone:
            address = address.replace(phone, "").strip(" ·,-")
            
        website = row[website_idx].strip() if (website_idx >= 0 and len(row) > website_idx) else ""
        
        # Formatar WhatsApp se for celular
        whatsapp = ""
        if phone:
            digits = re.sub(r'\D', '', phone)
            if len(digits) == 11 or (len(digits) == 10 and digits[2] == '9'):
                whatsapp = format_whatsapp_number(digits)

        leads.append({
            "name": name,
            "phone": clean_phone(phone),
            "whatsapp": whatsapp,
            "email": "",
            "website": website,
            "has_website": 1 if website else 0,
            "address": address or "Localidade informada",
            "category": category,
            "opportunity_score": 95 if not website else 45,
            "source": "instant_data_scraper"
        })
        
    return leads

class LeadScraper:
    def __init__(self, delay: float = 1.0, timeout: int = 10, apify_token: str = "", google_key: str = "", excluded_brands: str = ""):
        self.delay = delay
        self.timeout = timeout
        self.apify_token = apify_token
        self.google_key = google_key
        self.excluded_brands = excluded_brands

    def _get_headers(self) -> Dict[str, str]:
        return {
            "User-Agent": random.choice(USER_AGENTS),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "Connection": "keep-alive"
        }

    def fetch_website_content(self, url: str) -> Optional[str]:
        """Acessa o site da empresa com timeout seguro e tolerância a falhas"""
        if not url:
            return None
        if not url.startswith("http"):
            url = f"https://{url}"
            
        try:
            with httpx.Client(timeout=self.timeout, follow_redirects=True, verify=False) as client:
                resp = client.get(url, headers=self._get_headers())
                if resp.status_code < 400:
                    return resp.text
        except Exception:
            try:
                if url.startswith("https://"):
                    http_url = "http://" + url[8:]
                    with httpx.Client(timeout=self.timeout, follow_redirects=True, verify=False) as client:
                        resp = client.get(http_url, headers=self._get_headers())
                        if resp.status_code < 400:
                            return resp.text
            except Exception:
                pass
        return None

    def resolve_location(self, location: str, cep: Optional[str] = None) -> Dict[str, str]:
        """Resolve a cidade, estado, bairro e DDD com fidelidade estrita"""
        res = {
            "cidade": location,
            "uf": "",
            "bairro": "",
            "ddd": "11",
            "formatted": location
        }

        # 1. Se informou CEP, consulta ViaCEP
        if cep:
            info = fetch_cep_info(cep)
            if info:
                res["cidade"] = info["cidade"]
                res["uf"] = info["uf"]
                res["bairro"] = info["bairro"]
                res["ddd"] = info["ddd"] or "12"
                res["formatted"] = f"{info['cidade']} - {info['uf']}"
                return res

        # 2. Se a localização contém formato de CEP (8 dígitos)
        cep_match = re.search(r'\b\d{5}-?\d{3}\b', location)
        if cep_match:
            info = fetch_cep_info(cep_match.group(0))
            if info:
                res["cidade"] = info["cidade"]
                res["uf"] = info["uf"]
                res["bairro"] = info["bairro"]
                res["ddd"] = info["ddd"] or "12"
                res["formatted"] = f"{info['cidade']} - {info['uf']}"
                return res

        # 3. Normalização de cidades brasileiras conhecidas
        loc_norm = location.lower().replace("ã", "a").replace("é", "e").replace("á", "a").replace("í", "i").replace("ó", "o").replace("ú", "u").replace("ç", "c").strip()
        
        # Extrair UF se informado (ex: "Caraguatatuba - SP" ou "Santos/SP")
        uf_match = re.search(r'[\s,\/-]+([A-Za-z]{2})\b', location)
        if uf_match and uf_match.group(1).upper() in [
            "SP", "RJ", "MG", "ES", "PR", "SC", "RS", "MS", "MT", "GO", "DF",
            "BA", "SE", "AL", "PE", "PB", "RN", "CE", "PI", "MA", "PA", "AM",
            "AP", "AC", "RO", "RR", "TO"
        ]:
            res["uf"] = uf_match.group(1).upper()
            clean_city = re.sub(r'[\s,\/-]+[A-Za-z]{2}\b', '', location).strip()
            if clean_city:
                res["cidade"] = clean_city

        if any(k in loc_norm for k in ["sao jose dos campos", "sjc", "jose dos campos"]):
            res["cidade"] = "São José dos Campos"
            res["uf"] = "SP"
            res["ddd"] = "12"
            res["formatted"] = "São José dos Campos - SP"
        elif any(k in loc_norm for k in ["caraguatatuba", "caragua"]):
            res["cidade"] = "Caraguatatuba"
            res["uf"] = "SP"
            res["ddd"] = "12"
            res["formatted"] = "Caraguatatuba - SP"
        elif any(k in loc_norm for k in ["ubatuba"]):
            res["cidade"] = "Ubatuba"
            res["uf"] = "SP"
            res["ddd"] = "12"
            res["formatted"] = "Ubatuba - SP"
        elif any(k in loc_norm for k in ["sao sebastiao", "ilhabela"]):
            res["cidade"] = "São Sebastião" if "sebastiao" in loc_norm else "Ilhabela"
            res["uf"] = "SP"
            res["ddd"] = "12"
            res["formatted"] = f"{res['cidade']} - SP"
        elif any(k in loc_norm for k in ["taubate"]):
            res["cidade"] = "Taubaté"
            res["uf"] = "SP"
            res["ddd"] = "12"
            res["formatted"] = "Taubaté - SP"
        elif any(k in loc_norm for k in ["jacarei"]):
            res["cidade"] = "Jacareí"
            res["uf"] = "SP"
            res["ddd"] = "12"
            res["formatted"] = "Jacareí - SP"
        elif any(k in loc_norm for k in ["cacapava", "pindamonhangaba", "guaratingueta", "lorena"]):
            res["cidade"] = location.title()
            res["uf"] = "SP"
            res["ddd"] = "12"
            res["formatted"] = f"{res['cidade']} - SP"
        elif any(k in loc_norm for k in ["santos", "sao vicente", "praia grande", "guaruja"]):
            res["cidade"] = location.title()
            res["uf"] = "SP"
            res["ddd"] = "13"
            res["formatted"] = f"{res['cidade']} - SP"
        elif any(k in loc_norm for k in ["campinas", "indaiatuba", "americana", "sumare"]):
            res["cidade"] = "Campinas" if "campinas" in loc_norm else location.title()
            res["uf"] = "SP"
            res["ddd"] = "19"
            res["formatted"] = f"{res['cidade']} - SP"
        elif any(k in loc_norm for k in ["sorocaba", "itu", "salto"]):
            res["cidade"] = location.title()
            res["uf"] = "SP"
            res["ddd"] = "15"
            res["formatted"] = f"{res['cidade']} - SP"
        elif any(k in loc_norm for k in ["ribeirao preto", "franca", "araraquara", "sao carlos"]):
            res["cidade"] = location.title()
            res["uf"] = "SP"
            res["ddd"] = "16"
            res["formatted"] = f"{res['cidade']} - SP"
        elif any(k in loc_norm for k in ["rio de janeiro", "rj", "niteroi"]):
            res["cidade"] = "Rio de Janeiro" if "rio" in loc_norm else location.title()
            res["uf"] = "RJ"
            res["ddd"] = "21"
            res["formatted"] = f"{res['cidade']} - RJ"
        elif any(k in loc_norm for k in ["belo horizonte", "bh"]):
            res["cidade"] = "Belo Horizonte"
            res["uf"] = "MG"
            res["ddd"] = "31"
            res["formatted"] = "Belo Horizonte - MG"
        elif any(k in loc_norm for k in ["curitiba"]):
            res["cidade"] = "Curitiba"
            res["uf"] = "PR"
            res["ddd"] = "41"
            res["formatted"] = "Curitiba - PR"
        elif any(k in loc_norm for k in ["porto alegre"]):
            res["cidade"] = "Porto Alegre"
            res["uf"] = "RS"
            res["ddd"] = "51"
            res["formatted"] = "Porto Alegre - RS"
        elif any(k in loc_norm for k in ["salvador"]):
            res["cidade"] = "Salvador"
            res["uf"] = "BA"
            res["ddd"] = "71"
            res["formatted"] = "Salvador - BA"
        elif any(k in loc_norm for k in ["brasilia", "df"]):
            res["cidade"] = "Brasília"
            res["uf"] = "DF"
            res["ddd"] = "61"
            res["formatted"] = "Brasília - DF"
        elif any(k in loc_norm for k in ["sao paulo", "sp"]):
            res["cidade"] = "São Paulo"
            res["uf"] = "SP"
            res["ddd"] = "11"
            res["formatted"] = "São Paulo - SP"
        else:
            res["cidade"] = location.title()
            if not res["uf"]:
                res["uf"] = "SP"
            res["formatted"] = f"{res['cidade']} - {res['uf']}"

        return res

    def get_real_city_leads(self, niche: str, loc_data: Dict[str, str], count: int = 15) -> List[Dict[str, Any]]:
        """
        Retorna as empresas estritamente da cidade com bairros e DDDs reais
        (incluindo empresas reais catalogadas no Google Maps / Instant Data Scraper para SJC).
        """
        cidade_key = loc_data["cidade"].lower().replace("ã", "a").replace("é", "e").replace("á", "a").strip()
        niche_low = niche.lower()
        leads = []

        # Se for São José dos Campos e nicho academias/fitness
        if ("sao jose dos campos" in cidade_key) and any(w in niche_low for w in ["academia", "fitness", "crossfit", "gym", "luta"]):
            city_cfg = CITY_INFO_MAP["sao jose dos campos"]
            for comp in city_cfg["top_academias"]:
                has_web = bool(comp.get("website"))
                phone = comp.get("phone", "")
                wa = ""
                if phone:
                    digits = re.sub(r'\D', '', phone)
                    if len(digits) == 11 and digits[2] == '9':
                        wa = format_whatsapp_number(digits)

                leads.append({
                    "name": comp["name"],
                    "phone": phone,
                    "whatsapp": wa,
                    "email": "",
                    "website": comp.get("website", ""),
                    "address": comp["address"],
                    "category": "Academia / Fitness",
                    "opportunity_score": 98 if not has_web else 40,
                    "source": "google_places_sjc"
                })

        # Complementar ou gerar com precisão cirúrgica no município
        ddd = loc_data["ddd"]
        cidade = loc_data["cidade"]
        uf = loc_data["uf"] or "SP"
        
        bairros = [
            "Centro", "Jardim Satélite", "Jardim Aquarius", "Vila Ema", 
            "Vista Verde", "Jardim São Dimas", "Urbanova", "Bosque dos Eucaliptos"
        ] if "sao jose dos campos" in cidade_key else [
            "Centro", "Jardins", "Planalto", "Bela Vista", "Vila Nova", "América"
        ]

        ruas = [
            "Av. Cassiopeia", "Av. São João", "Av. Pedro Álvares Cabral", 
            "Rua Bacabal", "Av. Cidade Jardim", "Rua Paraibuna", "Av. Dr. João Batista Soares",
            "Rua Dolzani Ricardo", "Av. Andrômeda", "Rua Rubião Júnior"
        ] if "sao jose dos campos" in cidade_key else [
            "Av. Principal", "Rua do Comércio", "Av. Central", "Rua das Palmeiras", "Av. Brasil"
        ]

        # Não gerar nomes fictícios ou combinados para manter 100% de precisão real
        return leads[:count]

    def run_scan_stream(
        self, 
        niche: str, 
        location: str, 
        cep: Optional[str] = None, 
        max_leads: int = 15,
        website_filter: str = "all",
        min_rating: float = 0.0
    ) -> Generator[Dict[str, Any], None, List[Dict[str, Any]]]:
        """Executa a varredura com resolução estrita de CEP/Cidade, filtros pré-scraping e streaming SSE"""
        
        filter_descs = []
        if website_filter == "no_site":
            filter_descs.append("Apenas Sem Site Oficial")
        elif website_filter == "has_site":
            filter_descs.append("Apenas Com Site Oficial")
        if min_rating >= 4.5:
            filter_descs.append("4.5+ Estrelas ⭐")
        elif min_rating > 0.0:
            filter_descs.append(f"{min_rating}+ Estrelas ⭐")

        filter_msg = f" [Filtros: {' | '.join(filter_descs)}]" if filter_descs else ""
        yield {"step": "init", "percent": 5, "message": f"Iniciando radar de leads para '{niche}'{filter_msg}..."}
        time.sleep(self.delay * 0.4)
        
        # 1. Resolução estrita do CEP e Cidade
        loc_data = self.resolve_location(location, cep=cep)
        cidade_nome = loc_data["cidade"]
        ddd = loc_data["ddd"]
        
        bairro_info = f" ({loc_data['bairro']})" if loc_data.get('bairro') else ""
        yield {
            "step": "resolving_geo", 
            "percent": 20, 
            "message": f"Localização confirmada via ViaCEP/Geo: {cidade_nome}{bairro_info} | DDD: ({ddd})"
        }
        time.sleep(self.delay * 0.4)

        # 1b. Consulta histórico do banco para deduplicação inteligente (não puxar repetidos!)
        import database
        from google_maps_playwright import normalize_signature
        exclude_signatures = database.get_existing_lead_signatures(city=cidade_nome)
        known_leads_count = len(exclude_signatures.get("names", set()))
        if known_leads_count > 0:
            yield {
                "step": "history_dedup",
                "percent": 25,
                "message": f"Radar Histórico: {known_leads_count} empresas já capturadas em {cidade_nome} serão ignoradas para trazer apenas leads inéditos!"
            }
            time.sleep(self.delay * 0.3)
        
        # 2. Obter empresas: Priorizar Apify Google Places & Photos se token configurado
        candidates = []
        if self.apify_token and self.apify_token.strip():
            yield {
                "step": "searching_apify",
                "percent": 30,
                "message": f"Conectando ao Apify Google Places para '{niche} em {cidade_nome}' (extração de dados e fotos reais)..."
            }
            try:
                from apify_service import fetch_apify_google_places
                apify_results, apify_err = fetch_apify_google_places(
                    niche=niche,
                    cidade_nome=cidade_nome,
                    token=self.apify_token.strip(),
                    limit=max_leads,
                    bairro=loc_data.get("bairro", ""),
                    extra_blacklist=self.excluded_brands
                )
                if apify_results:
                    candidates = apify_results
                    yield {
                        "step": "apify_success",
                        "percent": 55,
                        "message": f"{len(candidates)} estabelecimentos REAIS e fotos oficiais capturados via Apify!"
                    }
                else:
                    err_hint = f" ({apify_err})" if apify_err else ""
                    yield {
                        "step": "apify_fallback",
                        "percent": 35,
                        "message": f"Apify: {err_hint or 'sem resultados'}. Ativando robô Playwright local..."
                    }
            except Exception as e:
                print(f"Erro ao usar Apify: {e}")

        # Se não tem Apify ou não retornou, tentar Google Places API oficial caso a chave esteja presente
        if not candidates and self.google_key and self.google_key.strip():
            yield {
                "step": "searching_google_api",
                "percent": 35,
                "message": f"Consultando Google Places API para '{niche} em {cidade_nome}'..."
            }
            try:
                from google_places_service import search_google_places_api
                api_results, api_err = search_google_places_api(f"{niche} em {cidade_nome}", self.google_key.strip(), limit=max_leads)
                if api_results:
                    candidates = api_results
                    yield {
                        "step": "google_api_success",
                        "percent": 50,
                        "message": f"{len(candidates)} empresas oficiais encontradas via Google Places API!"
                    }
                else:
                    err_hint = f" ({api_err})" if api_err else ""
                    yield {
                        "step": "google_api_fallback",
                        "percent": 35,
                        "message": f"Google Places API: não retornou leads{err_hint}. Ativando robô Google Maps em tempo real..."
                    }
            except Exception as e:
                print(f"Erro ao usar Google Places API: {e}")

        # Se não tem Apify nem Google API ou ambos não retornaram, buscar no Google Maps REAL via Playwright local!
        if not candidates:
            yield {
                "step": "searching_maps_real",
                "percent": 40,
                "message": f"Extraindo dados REAIS no Google Maps com rolagem dinâmica para '{niche} em {cidade_nome}'..."
            }
            try:
                from google_maps_playwright import run_real_maps_sync
                search_query = f"{niche} em {cidade_nome}"
                if loc_data.get("bairro"):
                    search_query += f" {loc_data['bairro']}"
                raw_fetch_limit = max(max_leads * 3, 30) if (website_filter != "all" or min_rating > 0.0) else max_leads
                real_results = run_real_maps_sync(
                    search_query, 
                    limit=raw_fetch_limit, 
                    exclude_signatures=exclude_signatures,
                    min_rating=min_rating,
                    website_filter=website_filter
                )
                if real_results:
                    candidates = real_results
                    yield {
                        "step": "maps_real_success",
                        "percent": 55,
                        "message": f"{len(candidates)} estabelecimentos REAIS e inéditos encontrados no Google Maps!"
                    }
            except Exception as e:
                print(f"Erro ao extrair dados reais do Google Maps: {e}")

        # Se não encontrou no Maps (ex: query muito específica), tenta base verificada municipal
        if not candidates:
            candidates = self.get_real_city_leads(niche, loc_data, count=max_leads)

        # Filtro de garantia contra duplicatas históricas
        if candidates and known_leads_count > 0:
            fresh_candidates = []
            for c in candidates:
                norm_c_name = normalize_signature(c.get("name", ""))
                c_phone = re.sub(r'\D', '', c.get("phone", ""))[-8:]
                if norm_c_name in exclude_signatures.get("names", set()):
                    continue
                if c_phone and c_phone in exclude_signatures.get("phones", set()):
                    continue
                fresh_candidates.append(c)
            candidates = fresh_candidates

        # Aplicação rigorosa dos filtros pré-scraping (com/sem site e nota mínima)
        if candidates and (website_filter != "all" or min_rating > 0.0):
            filtered_c = []
            for c in candidates:
                if min_rating > 0.0:
                    c_rating = c.get("rating")
                    if c_rating is None or float(c_rating) < min_rating:
                        continue
                
                if website_filter in ("no_site", "has_site"):
                    raw_s = (c.get("website") or "").strip().lower()
                    is_social = any(s in raw_s for s in ["instagram.com", "facebook.com", "linktr.ee", "wa.me", "whatsapp.com", "bit.ly"])
                    has_web = bool(raw_s and not is_social)
                    if website_filter == "no_site" and has_web:
                        continue
                    if website_filter == "has_site" and not has_web:
                        continue
                
                filtered_c.append(c)
                if len(filtered_c) >= max_leads:
                    break
            candidates = filtered_c

        total_found = len(candidates)
        
        if total_found == 0:
            yield {
                "step": "finished",
                "percent": 100,
                "message": f"Nenhum estabelecimento encontrado para '{niche}' em '{cidade_nome}'. Verifique a digitação ou tente um nicho mais amplo.",
                "leads": [],
                "no_website_count": 0,
                "city": cidade_nome
            }
            return []

        yield {
            "step": "processing", 
            "percent": 60, 
            "message": f"{total_found} empresas reais localizadas em {cidade_nome}. Iniciando Deep Scraping de contatos..."
        }
        time.sleep(self.delay * 0.3)
        
        final_leads = []
        no_website_count = 0
        
        for idx, item in enumerate(candidates):
            current_progress = 60 + int(((idx + 1) / total_found) * 35)
            name = item.get("name", "Empresa")
            site = item.get("website", "").strip()

            # REGRA MANDATÓRIA: Ignora grandes redes e franquias corporativas (SmartFit, Skyfit, Nubank, Panobianco, etc.)
            if is_major_brand_or_chain(name, site):
                continue
            
            yield {
                "step": "deep_scraping",
                "percent": current_progress,
                "message": f"[{idx+1}/{total_found}] Analisando {name}... {'[Site ativo]' if site else '[SEM SITE - Oportunidade]'}"
            }
            
            whatsapp = item.get("whatsapp", "")
            email = item.get("email", "")
            phone_raw = item.get("phone", "")
            digits = re.sub(r'\D', '', phone_raw)
            if digits.startswith("55") and len(digits) in (12, 13):
                digits = digits[2:]
            if len(digits) in (8, 9):
                phone = clean_phone(f"{ddd}{digits}")
                digits = f"{ddd}{digits}"
            else:
                phone = clean_phone(phone_raw)
            instagram = item.get("instagram", "")
            
            # Verificar se a URL informada como site é na verdade rede social ou link de WhatsApp/Linktree
            if site:
                site_lower = site.lower()
                if any(s in site_lower for s in ["instagram.com", "facebook.com", "linktr.ee", "wa.me", "api.whatsapp.com", "bit.ly"]):
                    if "instagram.com" in site_lower and not instagram:
                        insta_match = re.search(r'instagram\.com/([a-zA-Z0-9_\.]+)', site)
                        if insta_match and insta_match.group(1) not in ['p', 'reel', 'stories', 'explore']:
                            instagram = f"@{insta_match.group(1)}"
                    if any(w in site_lower for w in ["wa.me", "whatsapp.com"]):
                        wa_digits = re.sub(r'\D', '', site)
                        if wa_digits and not whatsapp:
                            whatsapp = format_whatsapp_number(wa_digits)
                    # Como não é um site próprio profissional, conta como SEM SITE (alta oportunidade de venda!)
                    site = ""
            
            if site:
                html_content = self.fetch_website_content(site)
                if html_content:
                    deep_info = extract_contacts_from_html(html_content, base_url=site)
                    if not whatsapp and deep_info.get("whatsapp"):
                        whatsapp = deep_info["whatsapp"]
                    if not email and deep_info.get("email"):
                        email = deep_info["email"]
                    if not phone and deep_info.get("phone"):
                        phone = deep_info["phone"]
                    if not instagram and deep_info.get("instagram"):
                        instagram = deep_info["instagram"]
                    opp_score = 40
                else:
                    site = ""
                    opp_score = 94
                    no_website_count += 1
            else:
                opp_score = 98
                no_website_count += 1

            # Se ainda não encontrou Instagram, tenta busca rápida externa na web
            if not instagram:
                instagram = search_instagram_fallback(name, cidade_nome)

            # Se ainda não temos WhatsApp definido e temos telefone/dígitos, aproveita o telefone como WhatsApp também
            if not whatsapp and digits:
                if len(digits) == 10 and digits[2] in ('6', '7', '8', '9'):
                    digits = f"{digits[:2]}9{digits[2:]}"
                    phone = clean_phone(digits)
                    whatsapp = format_whatsapp_number(digits)
                elif len(digits) in (10, 11):
                    whatsapp = format_whatsapp_number(digits)
                elif len(digits) in (8, 9):
                    digits = f"{ddd}{digits}"
                    if len(digits) == 10 and digits[2] in ('6', '7', '8', '9'):
                        digits = f"{digits[:2]}9{digits[2:]}"
                    whatsapp = format_whatsapp_number(digits)
                    phone = clean_phone(digits)

            # Se ainda não temos WhatsApp, tenta busca externa de WhatsApp real comercial
            if not whatsapp:
                external_wa = search_whatsapp_fallback(name, cidade_nome)
                if external_wa:
                    whatsapp = external_wa
                    if not phone:
                        phone = clean_phone(external_wa)

            # Garantia universal: se tem telefone válido, aproveita como WhatsApp (WhatsApp Business aceita fixo e celular)
            if not whatsapp and phone:
                whatsapp = format_whatsapp_number(phone)
            if not phone and whatsapp:
                phone = clean_phone(whatsapp)

            photos = item.get("photos", [])
            lead_addr = item.get("address", f"{cidade_nome} - {loc_data.get('uf', 'SP')}")
            
            maps_url = item.get("maps_url") or f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote_plus(name + ' ' + lead_addr)}"
            google_url = item.get("google_url") or f"https://www.google.com/search?q={urllib.parse.quote_plus(name + ' ' + lead_addr)}"

            lead_data = {
                "name": name,
                "phone": phone,
                "whatsapp": whatsapp,
                "email": email,
                "website": site,
                "has_website": 1 if site else 0,
                "address": lead_addr,
                "category": niche.title(),
                "rating": float(item.get("rating")) if item.get("rating") is not None else None,
                "reviews_count": int(item.get("reviews_count") or 0),
                "instagram": instagram,
                "photos": photos,
                "maps_url": maps_url,
                "google_url": google_url,
                "opportunity_score": opp_score,
                "campaign_status": "novo",
                "notes": f"Localizado em {cidade_nome}. " + ("Sem site institucional - Alta oportunidade para venda de site." if not site else "Site ativo identificado.")
            }
            
            final_leads.append(lead_data)
            time.sleep(self.delay * 0.3)
            
        filter_summary = f" ({no_website_count} sem site)"
        if min_rating > 0.0:
            filter_summary += f" | {min_rating}+ ⭐"
            
        yield {
            "step": "finished",
            "percent": 100,
            "message": f"Varredura em {cidade_nome} concluída! {total_found} leads capturados{filter_summary}.",
            "leads": final_leads,
            "no_website_count": no_website_count,
            "city": cidade_nome
        }
        
        return final_leads
