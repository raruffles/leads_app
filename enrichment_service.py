import re
import urllib.parse
import asyncio
import concurrent.futures
from typing import Dict, Any, Optional, List
import httpx
from bs4 import BeautifulSoup

import database
from scraper import clean_phone, format_whatsapp_number, extract_contacts_from_html

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0"
]

def clean_unicode_text(text: str) -> str:
    if not text:
        return ""
    cleaned = re.sub(r'[\ue000-\uf8ff]', '', text)
    return re.sub(r'\s+', ' ', cleaned).strip()

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
    if not re.match(r'^[a-zA-Z0-9_\.]+$', handle):
        return ""
    return f"@{handle}"

async def _resolve_maps_playwright_async(name: str, location: str = "") -> Dict[str, str]:
    """Extrai telefone real, endereço completo e site oficial direto do Google Maps com Playwright"""
    result = {"phone": "", "whatsapp": "", "website": "", "address": "", "maps_url": ""}
    clean_name = re.sub(r'[\ufffd\?]+', ' ', name).strip()
    query = f"{clean_name} {location}".strip()
    maps_search_url = f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote_plus(query)}&hl=pt-BR"
    
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
            )
            context = await browser.new_context(
                locale="pt-BR",
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            await page.goto(maps_search_url, wait_until="domcontentloaded", timeout=20000)
            await page.wait_for_timeout(3000)

            # Se houver lista de cards, clica no primeiro resultado para abrir os detalhes
            cards = await page.query_selector_all('div.Nv2PK')
            if cards:
                link = await cards[0].query_selector('a.hfpxzc')
                if link:
                    await link.click()
                    await page.wait_for_timeout(2500)

            current_url = page.url
            if "/maps/place/" in current_url:
                result["maps_url"] = current_url
            else:
                result["maps_url"] = maps_search_url

            # Telefone
            phone_el = await page.query_selector('button[data-item-id^="phone:"], a[href^="tel:"], button[aria-label*="Telefone" i]')
            if phone_el:
                item_id = await phone_el.get_attribute("data-item-id") or ""
                if "phone:tel:" in item_id:
                    raw_digits = item_id.split("phone:tel:")[-1].strip()
                    if raw_digits.startswith("0") and len(raw_digits) in (11, 12):
                        raw_digits = raw_digits[1:]
                    result["phone"] = clean_phone(raw_digits)
                elif await phone_el.get_attribute("href") and (await phone_el.get_attribute("href")).startswith("tel:"):
                    result["phone"] = clean_phone((await phone_el.get_attribute("href")).replace("tel:", "").strip())
                else:
                    aria = await phone_el.get_attribute("aria-label") or ""
                    m = re.search(r'(?:\(?\d{2}\)?\s*)?[2-9]\d{3,4}[-\s]?\d{4}', aria)
                    if m:
                        result["phone"] = clean_phone(m.group(0))

            # Endereço
            addr_el = await page.query_selector('button[data-item-id="address"], button[aria-label*="Endereço" i]')
            if addr_el:
                aria = await addr_el.get_attribute("aria-label") or ""
                if "Endereço:" in aria:
                    result["address"] = clean_unicode_text(aria.replace("Endereço:", "").strip())
                else:
                    result["address"] = clean_unicode_text(await addr_el.inner_text())

            # Site
            site_el = await page.query_selector('a[data-item-id="authority"], a[aria-label*="site" i]')
            if site_el:
                href = await site_el.get_attribute("href") or ""
                if "google.com/url?q=" in href:
                    m_u = re.search(r'google\.com/url\?q=([^&]+)', href)
                    if m_u:
                        result["website"] = urllib.parse.unquote(m_u.group(1))
                elif href.startswith("http"):
                    result["website"] = href

            # WhatsApp se for celular
            if result["phone"]:
                digits = re.sub(r'\D', '', result["phone"])
                if len(digits) == 11 and digits[2] == '9':
                    result["whatsapp"] = format_whatsapp_number(digits)

            await browser.close()
    except Exception as e:
        print(f"Erro no Maps Playwright: {e}")

    return result

def resolve_place_from_maps_sync(name: str, location: str = "") -> Dict[str, str]:
    """Wrapper thread-safe para executar a busca Playwright do Maps sem bloquear FastAPI"""
    def _worker():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(_resolve_maps_playwright_async(name, location))
        finally:
            try:
                loop.close()
            except Exception:
                pass

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(_worker)
            return future.result(timeout=45)
    except Exception as e:
        print(f"Erro no resolve_place_from_maps_sync: {e}")
        return {"phone": "", "whatsapp": "", "website": "", "address": "", "maps_url": ""}

def search_instagram_for_lead(name: str, location: str = "") -> str:
    """Busca o perfil comercial oficial do Instagram para um lead via web search"""
    clean_name = re.sub(r'[\(\)\-\,\.\/\ufffd\?]+', ' ', name).strip()
    headers = {"User-Agent": USER_AGENTS[0]}
    
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
    clean_name = re.sub(r'[\(\)\-\,\.\/\ufffd\?]+', ' ', name).strip()
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
                
                snippets = " ".join([el.get_text() for el in soup.find_all(class_=re.compile(r'result__snippet|result-snippet'))])
                
                wa_matches = re.findall(r'(?:wa\.me/|api\.whatsapp\.com/send\?phone=)(\d{10,13})', unquoted)
                if wa_matches:
                    num = wa_matches[0]
                    found["whatsapp"] = num if num.startswith("55") else f"55{num}"

                insta_matches = re.findall(r'instagram\.com/([a-zA-Z0-9_\.]+)', unquoted)
                for m in insta_matches:
                    clean = clean_instagram_handle(m)
                    if clean:
                        found["instagram"] = clean
                        break

                phone_matches = re.findall(r'\(?\d{2}\)?\s*(?:9\s*\d{4}[-\s]?\d{4}|[2-5]\d{3}[-\s]?\d{4})', snippets)
                if phone_matches:
                    found["phone"] = clean_phone(phone_matches[0])
                    digits = re.sub(r'\D', '', found["phone"])
                    if len(digits) == 11 and digits[2] == '9' and not found["whatsapp"]:
                        found["whatsapp"] = f"55{digits}"

                emails = re.findall(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', snippets)
                clean_emails = [
                    e for e in emails 
                    if not any(e.lower().endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.webp', '.svg'])
                    and 'sentry' not in e.lower() and len(e) < 55
                ]
                if clean_emails:
                    found["email"] = clean_emails[0]

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
    Enriquece um lead com dados reais:
    1. Resolve Maps e extrai telefone oficial, endereço e site via Google Maps
    2. Deep scraping no site oficial caso exista (para achar e-mail, whatsApp e instagram)
    3. Web search de apoio para contatos e perfil oficial do Instagram
    4. Atualiza no SQLite e retorna dados completos
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

    loc_hint = ""
    if address and "pousada em" not in address.lower() and len(address) > 4:
        loc_hint = address
    else:
        notes = lead.get("notes", "")
        city_m = re.search(r'Localizado em ([^.]+)', notes)
        if city_m:
            loc_hint = city_m.group(1).strip()
        else:
            loc_hint = "SP"

    # URL verificada do Google Maps
    clean_name = re.sub(r'[\ufffd\?]+', ' ', name).strip()
    verified_maps_url = current_maps_url
    if not verified_maps_url or not verified_maps_url.startswith("http"):
        verified_maps_url = f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote_plus(clean_name + ' ' + loc_hint)}&hl=pt-BR"

    new_phone = current_phone
    new_whatsapp = current_whatsapp
    new_email = current_email
    new_instagram = current_instagram
    new_site = site
    new_address = address

    # 1. Se falta telefone ou site ou endereço é genérico ("pousada em..."), consulta Google Maps
    if not new_phone or not new_site or not address or "pousada em" in address.lower():
        maps_res = resolve_place_from_maps_sync(name, loc_hint)
        if maps_res.get("phone") and not new_phone:
            new_phone = maps_res["phone"]
        if maps_res.get("whatsapp") and not new_whatsapp:
            new_whatsapp = maps_res["whatsapp"]
        if maps_res.get("website") and not new_site:
            new_site = maps_res["website"]
        if maps_res.get("address") and (not new_address or "pousada em" in new_address.lower()):
            new_address = maps_res["address"]
        if maps_res.get("maps_url") and maps_res["maps_url"].startswith("http"):
            verified_maps_url = maps_res["maps_url"]

    # 2. Se tiver site (inclusive Linktree), faz Deep Scraping no HTML
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

    # 3. Busca web complementar caso ainda falte algum contato
    if not new_phone or not new_whatsapp or not new_email or not new_instagram:
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

    # 4. Busca dedicada de Instagram se ainda não tem
    if not new_instagram:
        found_insta = search_instagram_for_lead(name, loc_hint)
        if found_insta:
            new_instagram = found_insta

    # 5. Formatar celular e WhatsApp caso tenhamos celular
    if new_phone and not new_whatsapp:
        digits = re.sub(r'\D', '', new_phone)
        if len(digits) == 11 and digits[2] == '9':
            new_whatsapp = f"55{digits}"

    # 6. Salva tudo no banco de dados
    has_web_val = 1 if (new_site and new_site.strip()) else 0
    database.update_lead_contacts(
        lead_id=lead_id,
        phone=new_phone,
        whatsapp=new_whatsapp,
        email=new_email,
        instagram=new_instagram,
        website=new_site,
        address=new_address,
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
            "address": new_address,
            "maps_url": verified_maps_url
        }
    }

def find_instagram_for_lead(lead_id: int) -> Dict[str, Any]:
    """Busca exclusivamente o Instagram do lead ou retorna a URL de busca direta no Instagram"""
    lead = database.get_lead_by_id(lead_id)
    if not lead:
        return {"success": False, "error": "Lead não encontrado."}

    name = lead.get("name", "")
    address = lead.get("address", "")
    clean_name = re.sub(r'[\(\)\-\,\.\/\ufffd\?]+', ' ', name).strip()

    loc_hint = ""
    if address and "pousada em" not in address.lower():
        loc_hint = address
    else:
        notes = lead.get("notes", "")
        city_m = re.search(r'Localizado em ([^.]+)', notes)
        loc_hint = city_m.group(1).strip() if city_m else "Ubatuba"

    # 1. Se já tem instagram salvo, retorna direto
    if lead.get("instagram") and lead["instagram"].strip():
        return {
            "success": True,
            "instagram": lead["instagram"].strip(),
            "already_present": True,
            "instagram_url": f"https://instagram.com/{lead['instagram'].strip().replace('@', '')}"
        }

    # 2. Se tem site, verifica o HTML do site
    site = lead.get("website", "")
    found_handle = ""
    if site:
        try:
            with httpx.Client(timeout=6.0, follow_redirects=True, verify=False) as client:
                resp = client.get(site if site.startswith("http") else f"https://{site}", headers={"User-Agent": USER_AGENTS[0]})
                if resp.status_code < 400:
                    contacts = extract_contacts_from_html(resp.text, site)
                    if contacts.get("instagram"):
                        found_handle = contacts["instagram"]
        except Exception:
            pass

    # 3. Se não achou no site, busca na web
    if not found_handle:
        found_handle = search_instagram_for_lead(clean_name, loc_hint)

    search_explore_url = f"https://www.instagram.com/explore/search/keyword/?q={urllib.parse.quote_plus(clean_name)}"

    if found_handle:
        database.update_lead_contacts(lead_id=lead_id, instagram=found_handle)
        return {
            "success": True,
            "instagram": found_handle,
            "saved": True,
            "instagram_url": f"https://instagram.com/{found_handle.replace('@', '')}",
            "search_url": search_explore_url
        }

    return {
        "success": False,
        "instagram": "",
        "saved": False,
        "search_url": search_explore_url,
        "message": f"Não foi possível confirmar o Instagram de '{name}' automaticamente. Abrimos a busca direta no Instagram para você conferir."
    }

def enrich_batch_leads(lead_ids: Optional[List[int]] = None, limit: int = 10) -> Dict[str, Any]:
    """Enriquece múltiplos leads com dados reais de telefone, whatsapp, e-mail e instagram"""
    if not lead_ids:
        # Se não informou IDs específicos, pega leads que estão sem telefone ou sem instagram
        conn = database.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM leads WHERE (phone = '' OR phone IS NULL OR instagram = '' OR instagram IS NULL) ORDER BY id DESC LIMIT ?", (limit,))
        lead_ids = [row[0] for row in cursor.fetchall()]
        conn.close()

    updated = []
    for lid in lead_ids:
        res = enrich_single_lead(lid)
        if res.get("success"):
            updated.append(res["lead"])

    return {
        "success": True,
        "total_enriched": len(updated),
        "leads": updated
    }
