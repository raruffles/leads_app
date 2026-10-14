import re
import urllib.parse
import httpx
from bs4 import BeautifulSoup
from typing import Dict, Any, Optional

import database
from scraper import clean_phone, format_whatsapp_number, extract_contacts_from_html

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0"
]

def clean_instagram_handle(handle: str) -> str:
    """Higieniza e valida um @handle do Instagram"""
    if not handle:
        return ""
    handle = handle.strip().lstrip('@')
    handle = handle.split('/')[0].split('?')[0].split('#')[0]
    bad = [
        'p', 'reel', 'reels', 'stories', 'explore', 'direct', 'accounts',
        'developer', 'about', 'legal', 'tag', 'popular', 'login', 'signup',
        'directory', 'channel', 'tv', 'google', 'maps', 'share', 'terms', 'privacy'
    ]
    if handle.lower() in bad or len(handle) < 2:
        return ""
    # Permite apenas letras, números, pontos e underlines válidos no Instagram
    if not re.match(r'^[a-zA-Z0-9_\.]+$', handle):
        return ""
    return f"@{handle}"

def search_instagram_for_lead(name: str, location: str = "") -> str:
    """Busca o perfil comercial oficial do Instagram para um lead via web search"""
    clean_name = re.sub(r'[\(\)\-\,\.\/]+', ' ', name).strip()
    headers = {"User-Agent": USER_AGENTS[0]}
    
    # 1. Tentativa via DuckDuckGo Lite
    queries = [
        f'site:instagram.com "{clean_name}" {location}'.strip(),
        f'"{clean_name}" {location} instagram'.strip(),
        f'"{clean_name}" instagram'.strip()
    ]
    
    for q in queries:
        try:
            with httpx.Client(timeout=6.0, follow_redirects=True) as client:
                resp = client.post("https://lite.duckduckgo.com/lite/", data={"q": q}, headers=headers)
                if resp.status_code == 200:
                    unquoted = urllib.parse.unquote(resp.text)
                    matches = re.findall(r'instagram\.com/([a-zA-Z0-9_\.]+)', unquoted)
                    for m in matches:
                        clean = clean_instagram_handle(m)
                        if clean:
                            return clean
        except Exception:
            pass

    # 2. Tentativa via DuckDuckGo HTML
    try:
        url_html = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote_plus(f'{clean_name} {location} instagram')}"
        with httpx.Client(timeout=6.0, follow_redirects=True) as client:
            resp = client.get(url_html, headers=headers)
            if resp.status_code == 200:
                unquoted = urllib.parse.unquote(resp.text)
                matches = re.findall(r'instagram\.com/([a-zA-Z0-9_\.]+)', unquoted)
                for m in matches:
                    clean = clean_instagram_handle(m)
                    if clean:
                        return clean
    except Exception:
        pass

    return ""

def search_web_contacts(name: str, location: str = "") -> Dict[str, str]:
    """Busca dados de telefone, whatsapp, e-mail e site na web para empresas locais"""
    clean_name = re.sub(r'[\(\)\-\,\.\/]+', ' ', name).strip()
    headers = {"User-Agent": USER_AGENTS[0]}
    query = f'"{clean_name}" {location} telefone whatsapp email site'.strip()
    
    found = {
        "phone": "",
        "whatsapp": "",
        "email": "",
        "website": "",
        "instagram": ""
    }

    try:
        with httpx.Client(timeout=7.0, follow_redirects=True) as client:
            resp = client.get(f"https://html.duckduckgo.com/html/?q={urllib.parse.quote_plus(query)}", headers=headers)
            if resp.status_code == 200:
                text = resp.text
                unquoted = urllib.parse.unquote(text)
                soup = BeautifulSoup(text, "html.parser")
                
                # Snippets de texto
                snippets = " ".join([el.get_text() for el in soup.find_all(class_=re.compile(r'result__snippet|result-snippet'))])
                
                # Links de WhatsApp
                wa_matches = re.findall(r'(?:wa\.me/|api\.whatsapp\.com/send\?phone=)(\d{10,13})', unquoted)
                if wa_matches:
                    num = wa_matches[0]
                    found["whatsapp"] = num if num.startswith("55") else f"55{num}"

                # Instagram
                insta_matches = re.findall(r'instagram\.com/([a-zA-Z0-9_\.]+)', unquoted)
                for m in insta_matches:
                    clean = clean_instagram_handle(m)
                    if clean:
                        found["instagram"] = clean
                        break

                # Telefones com DDD no texto
                phone_matches = re.findall(r'\(?\d{2}\)?\s*(?:9\s*\d{4}[-\s]?\d{4}|[2-5]\d{3}[-\s]?\d{4})', snippets)
                if phone_matches:
                    found["phone"] = clean_phone(phone_matches[0])
                    digits = re.sub(r'\D', '', found["phone"])
                    if len(digits) == 11 and digits[2] == '9' and not found["whatsapp"]:
                        found["whatsapp"] = f"55{digits}"

                # E-mail
                emails = re.findall(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', snippets)
                clean_emails = [
                    e for e in emails 
                    if not any(e.lower().endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.webp', '.svg'])
                    and 'sentry' not in e.lower() and len(e) < 55
                ]
                if clean_emails:
                    found["email"] = clean_emails[0]

                # Site Oficial (ignora redes sociais e agregadores)
                for a in soup.find_all('a', class_=re.compile(r'result__url|result-link')):
                    raw_href = a.get('href', '')
                    if 'uddg=' in raw_href:
                        raw_href = urllib.parse.unquote(raw_href.split('uddg=')[-1].split('&')[0])
                    if raw_href.startswith('http'):
                        bad_domains = [
                            'duckduckgo', 'tripadvisor', 'booking.com', 'facebook.com',
                            'instagram.com', 'youtube.com', 'trivago', 'hoteis.com',
                            'airbnb', 'google', 'apontador', 'guiamais', 'telelistas',
                            'linkedin', 'twitter', 'tiktok', 'yelp'
                        ]
                        if not any(b in raw_href.lower() for b in bad_domains):
                            found["website"] = raw_href
                            break
    except Exception:
        pass

    return found

def enrich_single_lead(lead_id: int) -> Dict[str, Any]:
    """
    Enriquece um lead existente com dados reais:
    1. Verifica e corrige maps_url para garantir que abre o local real
    2. Deep scraping no site oficial caso exista
    3. Busca na web por telefone, whatsapp, e-mail e Instagram
    4. Atualiza no banco de dados e retorna o lead atualizado
    """
    lead = database.get_lead_by_id(lead_id)
    if not lead:
        return {"success": False, "error": f"Lead #{lead_id} não encontrado."}

    name = lead.get("name", "")
    address = lead.get("address", "")
    site = lead.get("website", "")
    current_phone = lead.get("phone", "")
    current_whatsapp = lead.get("whatsapp", "")
    current_email = lead.get("email", "")
    current_instagram = lead.get("instagram", "")
    current_maps_url = lead.get("maps_url", "")

    # Localização de apoio para busca
    loc_hint = ""
    if address and "pousada em" not in address.lower() and len(address) > 4:
        loc_hint = address
    else:
        # Tenta extrair a cidade de notas ou do nome
        notes = lead.get("notes", "")
        city_m = re.search(r'Localizado em ([^.]+)', notes)
        if city_m:
            loc_hint = city_m.group(1).strip()
        else:
            loc_hint = "SP"

    # 1. Garante que maps_url é uma URL válida do Google Maps que leva ao estabelecimento real
    verified_maps_url = current_maps_url
    if not verified_maps_url or not verified_maps_url.startswith("http"):
        verified_maps_url = f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote_plus(name + ' ' + loc_hint)}"

    new_phone = current_phone
    new_whatsapp = current_whatsapp
    new_email = current_email
    new_instagram = current_instagram
    new_site = site

    # 2. Se tiver site, faz Deep Scraping no HTML
    if new_site:
        try:
            with httpx.Client(timeout=8.0, follow_redirects=True, verify=False) as client:
                headers = {"User-Agent": USER_AGENTS[0]}
                resp = client.get(new_site if new_site.startswith("http") else f"https://{new_site}", headers=headers)
                if resp.status_code < 400:
                    contacts = extract_contacts_from_html(resp.text, new_site)
                    if not new_whatsapp and contacts.get("whatsapp"):
                        new_whatsapp = contacts["whatsapp"]
                    if not new_email and contacts.get("email"):
                        new_email = contacts["email"]
                    if not new_phone and contacts.get("phone"):
                        new_phone = contacts["phone"]
                    if not new_instagram and contacts.get("instagram"):
                        new_instagram = contacts["instagram"]
        except Exception:
            pass

    # 3. Se ainda faltar telefone, whatsapp, e-mail ou instagram, faz busca complementar na web
    if not new_phone or not new_whatsapp or not new_email or not new_instagram or not new_site:
        web_info = search_web_contacts(name, loc_hint)
        if not new_phone and web_info.get("phone"):
            new_phone = web_info["phone"]
        if not new_whatsapp and web_info.get("whatsapp"):
            new_whatsapp = web_info["whatsapp"]
        if not new_email and web_info.get("email"):
            new_email = web_info["email"]
        if not new_instagram and web_info.get("instagram"):
            new_instagram = web_info["instagram"]
        if not new_site and web_info.get("website"):
            new_site = web_info["website"]

    # 4. Se ainda faltar Instagram, executa busca dedicada de Instagram
    if not new_instagram:
        found_insta = search_instagram_for_lead(name, loc_hint)
        if found_insta:
            new_instagram = found_insta

    # 5. Formatar celular e WhatsApp caso tenha telefone celular válido
    if new_phone and not new_whatsapp:
        digits = re.sub(r'\D', '', new_phone)
        if len(digits) == 11 and digits[2] == '9':
            new_whatsapp = f"55{digits}"

    # 6. Salva as atualizações no banco de dados
    has_web_val = 1 if (new_site and new_site.strip()) else 0
    database.update_lead_contacts(
        lead_id=lead_id,
        phone=new_phone,
        whatsapp=new_whatsapp,
        email=new_email,
        instagram=new_instagram,
        website=new_site,
        maps_url=verified_maps_url,
        has_website=has_web_val
    )

    updated_lead = database.get_lead_by_id(lead_id)
    return {
        "success": True,
        "lead": updated_lead,
        "enriched": {
            "phone": new_phone,
            "whatsapp": new_whatsapp,
            "email": new_email,
            "instagram": new_instagram,
            "website": new_site,
            "maps_url": verified_maps_url
        }
    }
