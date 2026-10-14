import asyncio
import re
import urllib.parse
import unicodedata
import concurrent.futures
from typing import List, Dict, Any, Optional
from playwright.async_api import async_playwright
from brand_filter import is_major_brand_or_chain

def clean_unicode_text(text: str) -> str:
    """Remove caracteres especiais da área de uso privado (ícones do Google) e espaços extras"""
    if not text:
        return ""
    cleaned = re.sub(r'[\ue000-\uf8ff]', '', text)
    return re.sub(r'\s+', ' ', cleaned).strip()

def normalize_signature(text: str) -> str:
    """Normaliza texto para comparação sem acento, pontuação ou espaços extras"""
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", text)
    cleaned = "".join(c for c in nfkd if not unicodedata.combining(c)).lower()
    return re.sub(r'[^a-z0-9]+', ' ', cleaned).strip()

def clean_and_decode_website(url: str) -> str:
    """Extrai e decodifica URLs reais do Google Maps removendo redirecionamentos google.com/url?q="""
    if not url:
        return ""
    url = url.strip()
    if "google.com/url?" in url:
        m = re.search(r'google\.com/url\?(?:q|url)=([^&]+)', url)
        if m:
            url = urllib.parse.unquote(m.group(1))
    elif "uddg=" in url:
        url = urllib.parse.unquote(url.split("uddg=")[-1].split("&")[0])
    
    url = url.strip()
    if not url:
        return ""
    if url.startswith("http://") or url.startswith("https://"):
        return url
    return f"https://{url}"

async def scrape_google_maps_real(
    query: str, 
    limit: int = 15, 
    exclude_signatures: Optional[Dict[str, Any]] = None,
    min_rating: float = 0.0,
    website_filter: str = "all"
) -> List[Dict[str, Any]]:
    """
    Busca estabelecimentos REAIS diretamente no Google Maps via Chromium headless com rolagem dinâmica.
    - Rolagem contínua até alcançar a quantidade real de leads solicitada (sem limite artificial de 4 ou 5).
    - Deduplicação inteligente em tempo real com base no histórico do banco de dados (pula leads já capturados).
    - Captura Nome, Telefone real, WhatsApp com DDD, Endereço completo, Website oficial, Avaliação e Fotos.
    """
    leads = []
    exclude_signatures = exclude_signatures or {}
    excluded_names = exclude_signatures.get("names", set()) or set()
    excluded_phones = exclude_signatures.get("phones", set()) or set()
    excluded_websites = exclude_signatures.get("websites", set()) or set()

    try:
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
            
            # URL de busca no Google Maps
            encoded_query = urllib.parse.quote_plus(query)
            url = f"https://www.google.com/maps/search/{encoded_query}?hl=pt-BR"
            
            await page.goto(url, wait_until="domcontentloaded", timeout=25000)
            await page.wait_for_timeout(2500)
            
            # Se aparecer popup de consentimento de cookies do Google, aceita
            try:
                consent_btn = await page.query_selector('button[aria-label*="Aceitar tudo"], button[aria-label*="Accept all"], form[action*="consent"] button')
                if consent_btn:
                    await consent_btn.click()
                    await page.wait_for_timeout(1000)
            except Exception:
                pass

            feed = await page.query_selector('div[role="feed"]')
            processed_card_ids = set()
            seen_names = set()
            consecutive_no_new_streak = 0
            max_empty_streaks = 5

            # Loop Dinâmico de Extração com Rolagem Contínua
            while len(leads) < limit and consecutive_no_new_streak < max_empty_streaks:
                cards = await page.query_selector_all('div.Nv2PK')
                if not cards:
                    break

                new_card_found = False

                for card in cards:
                    if len(leads) >= limit:
                        break

                    link_el = await card.query_selector('a.hfpxzc')
                    if not link_el:
                        continue

                    href = await link_el.get_attribute("href") or ""
                    card_id = href.split("?")[0] if href else ""
                    if not card_id or card_id in processed_card_ids:
                        continue

                    processed_card_ids.add(card_id)
                    new_card_found = True

                    # 1. Nome do estabelecimento
                    name_el = await card.query_selector('.qBF1Pd, .fontHeadlineSmall')
                    name = await name_el.inner_text() if name_el else ""
                    if not name:
                        name = await link_el.get_attribute("aria-label") or ""
                    name = clean_unicode_text(name)

                    if not name or len(name) < 2:
                        continue

                    norm_name = normalize_signature(name)
                    if not norm_name or norm_name in seen_names:
                        continue

                    # REGRA DE HISTÓRICO: Se já existe no banco de dados para esta cidade, pula!
                    if norm_name in excluded_names:
                        seen_names.add(norm_name)
                        continue

                    # Ignora grandes redes e franquias corporativas (SmartFit, Skyfit, Nubank, etc.)
                    if is_major_brand_or_chain(name):
                        continue

                    seen_names.add(norm_name)

                    # Texto prévio do card
                    card_text = clean_unicode_text(await card.inner_text())

                    # Rating e reviews
                    rating = None
                    rating_match = re.search(r'\b([1-5][,\.][0-9])\b', card_text)
                    if rating_match:
                        try:
                            rating = float(rating_match.group(1).replace(',', '.'))
                        except ValueError:
                            pass

                    reviews_count = 0
                    rev_match = re.search(r'\(([0-9\.\,]+)\)', card_text)
                    if rev_match:
                        try:
                            reviews_count = int(rev_match.group(1).replace('.', '').replace(',', ''))
                        except ValueError:
                            pass

                    # Filtro de Avaliação Mínima (ex: 4.5+ estrelas) antes de gastar tempo abrindo o card
                    if min_rating > 0.0:
                        if rating is None or rating < min_rating:
                            continue

                    # Detalhes completos ao clicar no card
                    phone = ""
                    whatsapp = ""
                    website = ""
                    address = ""
                    instagram = ""
                    photos = []
                    maps_url = href

                    # Extrai foto miniatura do card como primeiro thumbnail
                    card_img = await card.query_selector('img')
                    if card_img:
                        c_src = await card_img.get_attribute("src") or ""
                        if c_src and "googleusercontent" in c_src:
                            photos.append(c_src.split("=")[0] + "=w800-h600-k-no")

                    try:
                        await link_el.scroll_into_view_if_needed()
                        await link_el.click()
                        await page.wait_for_timeout(1800)

                        current_url = page.url
                        if "/maps/place/" in current_url:
                            maps_url = current_url

                        # Painel lateral ativo
                        mains = await page.query_selector_all('div[role="main"]')
                        detail_pane = mains[-1] if len(mains) > 1 else (mains[0] if mains else page)
                        scope = detail_pane if detail_pane else page

                        # 1. Telefone Oficial
                        phone_el = await scope.query_selector('button[data-item-id^="phone:"], a[href^="tel:"], button[aria-label*="Telefone" i]')
                        if not phone_el:
                            phone_el = await page.query_selector('button[data-item-id^="phone:"], a[href^="tel:"], button[aria-label*="Telefone" i]')

                        if phone_el:
                            item_id = await phone_el.get_attribute("data-item-id") or ""
                            p_href = await phone_el.get_attribute("href") or ""
                            aria = await phone_el.get_attribute("aria-label") or ""

                            if "phone:tel:" in item_id:
                                phone = item_id.split("phone:tel:")[-1].strip()
                            elif p_href.startswith("tel:"):
                                phone = p_href.replace("tel:", "").strip()
                            elif aria:
                                m = re.search(r'(?:\(?(\d{2})\)?\s*)?(?:[2-9]\d{3,4}[-\s]?\d{4})', aria)
                                if m:
                                    phone = m.group(0)

                            if not phone:
                                phone_raw = await phone_el.inner_text()
                                phone = clean_unicode_text(phone_raw)

                        # 1b. WhatsApp direto
                        wa_el = await scope.query_selector('a[href*="wa.me"], a[href*="whatsapp.com"], a[href*="api.whatsapp.com"], button[data-item-id*="whatsapp" i]')
                        if wa_el:
                            wa_href = await wa_el.get_attribute("href") or ""
                            wa_match = re.search(r'(?:wa\.me/|phone=|send\?phone=)([0-9\+]+)', wa_href)
                            if wa_match:
                                wa_digits = re.sub(r'\D', '', wa_match.group(1))
                                if wa_digits.startswith("55") and len(wa_digits) in (12, 13):
                                    whatsapp = wa_digits
                                elif len(wa_digits) in (10, 11):
                                    whatsapp = f"55{wa_digits}"

                        # 2. Website oficial
                        site_el = await scope.query_selector(
                            'a[data-item-id="authority"], a[aria-label*="site" i], a[aria-label*="website" i], '
                            'button[data-item-id="authority"], a[data-tooltip*="site" i], a[data-tooltip*="website" i], '
                            'a[data-value="Site"], a[data-attribution-url]'
                        )
                        if not site_el:
                            site_el = await page.query_selector(
                                'a[data-item-id="authority"], a[aria-label*="site" i], a[aria-label*="website" i], '
                                'button[data-item-id="authority"], a[data-tooltip*="site" i], a[data-tooltip*="website" i], '
                                'a[data-value="Site"], a[data-attribution-url]'
                            )
                        if site_el:
                            raw_href = await site_el.get_attribute("href") or await site_el.get_attribute("data-attribution-url") or ""
                            if not raw_href:
                                aria_lbl = await site_el.get_attribute("aria-label") or ""
                                m_url = re.search(r'(?:site|website):\s*([a-zA-Z0-9\-\._~:/\?#\[\]@!$&\'\(\)\*\+,;=%]+)', aria_lbl, re.IGNORECASE)
                                if m_url:
                                    raw_href = m_url.group(1)
                            website = clean_and_decode_website(raw_href)

                        # 3. Endereço oficial
                        addr_el = await scope.query_selector('button[data-item-id="address"], button[aria-label*="Endereço" i]')
                        if addr_el:
                            address = clean_unicode_text(await addr_el.inner_text())

                        # 4. Foto de alta resolução do cabeçalho
                        header_img = await scope.query_selector('button[jsaction*="heroHeaderImage"] img, div[jsaction*="heroHeaderImage"] img, img[decoding="async"]')
                        if header_img:
                            h_src = await header_img.get_attribute("src") or ""
                            if h_src and "googleusercontent" in h_src:
                                clean_h_src = h_src.split("=")[0] + "=w800-h600-k-no"
                                if clean_h_src not in photos:
                                    photos.insert(0, clean_h_src)

                        # 5. Instagram oficial cadastrado
                        insta_el = await scope.query_selector('a[href*="instagram.com"]')
                        if insta_el:
                            i_href = await insta_el.get_attribute("href") or ""
                            m_i = re.search(r'instagram\.com/([a-zA-Z0-9_\.]+)', i_href)
                            if m_i and m_i.group(1).lower() not in ['p', 'reel', 'stories', 'explore', 'google', 'maps']:
                                instagram = f"@{m_i.group(1)}"

                    except Exception as e:
                        pass

                    # Fallbacks para Website a partir do card
                    if not website:
                        site_btn = await card.query_selector('a[data-value="Site"], a[aria-label*="site" i], a[data-tooltip*="site" i], button[data-value="Site"]')
                        if site_btn:
                            href_site = await site_btn.get_attribute("href") or await site_btn.get_attribute("data-attribution-url") or ""
                            website = clean_and_decode_website(href_site)

                    # Filtro de Presença Web (com/sem site)
                    if website_filter in ("no_site", "has_site"):
                        site_lower = (website or "").lower()
                        is_social = any(s in site_lower for s in ["instagram.com", "facebook.com", "linktr.ee", "wa.me", "whatsapp.com", "bit.ly"])
                        has_real_web = bool(website and not is_social)
                        if website_filter == "no_site" and has_real_web:
                            continue
                        if website_filter == "has_site" and not has_real_web:
                            continue

                    # Fallbacks para Telefone por regex
                    if not phone:
                        phone_match = re.search(r'(?:\(?\d{2}\)?\s*)?(?:[2-9]\d{3,4}[-\s]?\d{4})', card_text)
                        if phone_match:
                            phone = phone_match.group(0)

                    # Fallbacks para Endereço
                    if not address:
                        lines = [l.strip() for l in card_text.splitlines() if l.strip()]
                        for l in lines[1:]:
                            clean_l = clean_unicode_text(l)
                            if any(w in clean_l.lower() for w in ["rua", "r.", "av.", "avenida", "alameda", "travessa", "jardim", "jd.", "centro", "bairro", "cep"]):
                                address = clean_l
                                break
                        if not address and len(lines) > 1:
                            address = clean_unicode_text(lines[1])

                    # Limpeza de Telefone / WhatsApp
                    if phone:
                        p_digits = re.sub(r'\D', '', phone)
                        if p_digits.startswith("0") and len(p_digits) in (11, 12):
                            p_digits = p_digits[1:]
                        if p_digits.startswith("55") and len(p_digits) in (12, 13):
                            p_digits = p_digits[2:]
                        if len(p_digits) == 10 and p_digits[2] in ('6', '7', '8', '9'):
                            p_digits = f"{p_digits[:2]}9{p_digits[2:]}"
                            phone = f"({p_digits[:2]}) {p_digits[2:7]}-{p_digits[7:]}"
                        elif len(p_digits) == 11:
                            phone = f"({p_digits[:2]}) {p_digits[2:7]}-{p_digits[7:]}"
                        elif len(p_digits) == 10:
                            phone = f"({p_digits[:2]}) {p_digits[2:6]}-{p_digits[6:]}"

                        if not whatsapp and len(p_digits) == 11 and p_digits[2] == '9':
                            whatsapp = f"55{p_digits}"

                        # DEDUPLICAÇÃO POR TELEFONE: Pula se telefone já existe no histórico
                        if p_digits[-8:] in excluded_phones:
                            continue

                    # DEDUPLICAÇÃO POR SITE: Pula se domínio do website já existe no histórico
                    if website:
                        clean_dom = re.sub(r'^https?://(www\.)?', '', website).split('/')[0].split('?')[0].lower()
                        if clean_dom in excluded_websites:
                            continue

                    clean_address = address
                    if not maps_url:
                        maps_url = href or f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote_plus(name + ' ' + (clean_address or query))}"

                    google_url = f"https://www.google.com/search?q={urllib.parse.quote_plus(name + ' ' + (clean_address or query))}"

                    leads.append({
                        "name": name,
                        "phone": phone,
                        "whatsapp": whatsapp,
                        "website": website,
                        "address": clean_address,
                        "rating": rating,
                        "reviews_count": reviews_count,
                        "category": query.split()[0].title(),
                        "instagram": instagram,
                        "photos": photos[:6],
                        "maps_url": maps_url,
                        "google_url": google_url,
                        "source": "google_maps_real_live"
                    })

                # Se ainda faltam leads para bater a cota solicitada, rola o feed para baixo!
                if len(leads) < limit:
                    if feed:
                        await page.evaluate('(feed) => feed.scrollBy(0, 2500)', feed)
                        await page.wait_for_timeout(1800)

                        # Verifica se o Google Maps avisou que a lista terminou
                        end_text = await page.query_selector('span:has-text("Você chegou ao final da lista"), span:has-text("You\'ve reached the end")')
                        if end_text and await end_text.is_visible():
                            break

                        if not new_card_found:
                            consecutive_no_new_streak += 1
                            await page.evaluate('(feed) => feed.scrollTop = feed.scrollHeight', feed)
                            await page.wait_for_timeout(2000)
                        else:
                            consecutive_no_new_streak = 0
                    else:
                        break

            await browser.close()
    except Exception as e:
        print(f"Erro no scrape_google_maps_real: {e}")

    return leads

def run_real_maps_sync(
    query: str, 
    limit: int = 15, 
    exclude_signatures: Optional[Dict[str, Any]] = None,
    min_rating: float = 0.0,
    website_filter: str = "all"
) -> List[Dict[str, Any]]:
    """
    Wrapper síncrono thread-safe para executar a busca real do Google Maps.
    """
    def _worker():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(
                scrape_google_maps_real(
                    query, 
                    limit=limit, 
                    exclude_signatures=exclude_signatures,
                    min_rating=min_rating,
                    website_filter=website_filter
                )
            )
        except Exception as e:
            print(f"Erro no worker scrape_google_maps_real: {e}")
            return []
        finally:
            try:
                loop.close()
            except Exception:
                pass

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(_worker)
            # Timeout dinâmico de acordo com a quantidade de leads solicitada
            timeout_sec = max(60, limit * 8)
            return future.result(timeout=timeout_sec)
    except Exception as e:
        print(f"Erro no run_real_maps_sync: {e}")
        return []

if __name__ == "__main__":
    results = run_real_maps_sync("hotel em jacarei", limit=10)
    print(f"Total extraído: {len(results)}")
    for r in results:
        print(r["name"], "-", r["phone"])
