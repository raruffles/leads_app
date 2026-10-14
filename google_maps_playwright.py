import asyncio
import re
import urllib.parse
import concurrent.futures
from typing import List, Dict, Any
from playwright.async_api import async_playwright
from brand_filter import is_major_brand_or_chain

def clean_unicode_text(text: str) -> str:
    """Remove caracteres especiais da área de uso privado (ícones do Google) e espaços extras"""
    if not text:
        return ""
    cleaned = re.sub(r'[\ue000-\uf8ff]', '', text)
    return re.sub(r'\s+', ' ', cleaned).strip()

async def scrape_google_maps_real(query: str, limit: int = 15) -> List[Dict[str, Any]]:
    """
    Busca estabelecimentos REAIS diretamente no Google Maps via Chromium headless.
    Captura Nome, Telefone real, Endereço completo com bairro/número/CEP e Site oficial.
    """
    leads = []
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
            
            # Se aparecer popup de cookies / consentimento do Google, fechar ou aceitar
            try:
                consent_btn = await page.query_selector('button[aria-label*="Aceitar tudo"], button[aria-label*="Accept all"], form[action*="consent"] button')
                if consent_btn:
                    await consent_btn.click()
                    await page.wait_for_timeout(1000)
            except Exception:
                pass

            # Rolar o container feed para carregar estabelecimentos suficientes
            feed = await page.query_selector('div[role="feed"]')
            if feed and limit > 5:
                scroll_times = min(4, max(1, limit // 4))
                for _ in range(scroll_times):
                    await page.evaluate('(feed) => feed.scrollTop = feed.scrollHeight', feed)
                    await page.wait_for_timeout(1200)

            # Elementos de cards reais do Google Maps
            cards = await page.query_selector_all('div.Nv2PK')
            seen_names = set()
            
            for idx in range(len(cards)):
                if len(leads) >= limit:
                    break
                    
                # Re-seleciona cards para evitar referências desatualizadas
                cards = await page.query_selector_all('div.Nv2PK')
                if idx >= len(cards):
                    break
                    
                card = cards[idx]
                
                # 1. Nome real da empresa
                name_el = await card.query_selector('.qBF1Pd, .fontHeadlineSmall')
                name = await name_el.inner_text() if name_el else ""
                link_el = await card.query_selector('a.hfpxzc')
                
                if not name and link_el:
                    name = await link_el.get_attribute("aria-label") or ""
                
                name = clean_unicode_text(name)
                if not name or len(name) < 2 or name.lower() in seen_names:
                    continue

                # Ignora grandes redes e franquias corporativas (SmartFit, Skyfit, Panobianco, Nubank, etc.)
                if is_major_brand_or_chain(name):
                    continue
                    
                seen_names.add(name.lower())
                
                # Texto prévio do card
                card_text = clean_unicode_text(await card.inner_text())
                
                # Rating do card
                rating = None
                rating_match = re.search(r'\b([1-5][,\.][0-9])\b', card_text)
                if rating_match:
                    try:
                        rating = float(rating_match.group(1).replace(',', '.'))
                    except ValueError:
                        pass
                
                # Avaliações (reviews)
                reviews_count = 0
                rev_match = re.search(r'\(([0-9\.\,]+)\)', card_text)
                if rev_match:
                    try:
                        reviews_count = int(rev_match.group(1).replace('.', '').replace(',', ''))
                    except ValueError:
                        pass
                
                # Clicar no card para abrir o painel lateral com detalhes completos
                phone = ""
                whatsapp = ""
                website = ""
                address = ""
                instagram = ""
                photos = []
                maps_url = ""
                
                raw_card_href = ""
                if link_el:
                    raw_card_href = await link_el.get_attribute("href") or ""

                if link_el:
                    try:
                        await link_el.scroll_into_view_if_needed()
                        await link_el.click()
                        await page.wait_for_timeout(2500)
                        
                        # Captura URL real do local no Google Maps
                        current_url = page.url
                        if "/maps/place/" in current_url:
                            maps_url = current_url
                        elif raw_card_href and raw_card_href.startswith("http"):
                            maps_url = raw_card_href

                        # Localiza o painel lateral exclusivo deste estabelecimento (o último div[role="main"])
                        mains = await page.query_selector_all('div[role="main"]')
                        detail_pane = mains[-1] if len(mains) > 1 else (mains[0] if mains else page)
                        scope = detail_pane if detail_pane else page

                        # 1. Extrai Telefone Oficial com seletores modernos e múltiplos fallbacks
                        phone_el = await scope.query_selector('button[data-item-id^="phone:"], a[href^="tel:"], button[aria-label*="Telefone" i], button[aria-label*="Phone" i], div[data-item-id^="phone:"]')
                        if not phone_el:
                            phone_el = await page.query_selector('button[data-item-id^="phone:"], a[href^="tel:"], button[aria-label*="Telefone" i], button[aria-label*="Phone" i], div[data-item-id^="phone:"]')
                        
                        if phone_el:
                            item_id = await phone_el.get_attribute("data-item-id") or ""
                            href = await phone_el.get_attribute("href") or ""
                            aria = await phone_el.get_attribute("aria-label") or ""
                            
                            if "phone:tel:" in item_id:
                                raw_digits = item_id.split("phone:tel:")[-1].strip()
                                if raw_digits.startswith("0") and len(raw_digits) in (11, 12):
                                    raw_digits = raw_digits[1:]
                                phone = raw_digits
                            elif href.startswith("tel:"):
                                raw_digits = href.replace("tel:", "").strip()
                                if raw_digits.startswith("0") and len(raw_digits) in (11, 12):
                                    raw_digits = raw_digits[1:]
                                phone = raw_digits
                            elif aria:
                                m = re.search(r'(?:\(?(\d{2})\)?\s*)?(?:[2-9]\d{3,4}[-\s]?\d{4})', aria)
                                if m:
                                    phone = m.group(0)
                                    
                            if not phone:
                                phone_raw = await phone_el.inner_text()
                                phone = clean_unicode_text(phone_raw)

                        # 1b. Extrai WhatsApp oficial se houver botão ou link direto
                        wa_el = await scope.query_selector('a[href*="wa.me"], a[href*="whatsapp.com"], a[href*="api.whatsapp.com"], button[data-item-id*="whatsapp" i]')
                        if not wa_el:
                            wa_el = await page.query_selector('a[href*="wa.me"], a[href*="whatsapp.com"], a[href*="api.whatsapp.com"], button[data-item-id*="whatsapp" i]')
                        if wa_el:
                            wa_href = await wa_el.get_attribute("href") or ""
                            wa_match = re.search(r'(?:wa\.me/|phone=|send\?phone=)([0-9\+]+)', wa_href)
                            if wa_match:
                                wa_digits = re.sub(r'\D', '', wa_match.group(1))
                                if wa_digits.startswith("55") and len(wa_digits) in (12, 13):
                                    whatsapp = wa_digits
                                elif len(wa_digits) in (10, 11):
                                    whatsapp = f"55{wa_digits}"
                                
                        # 2. Extrai Website Oficial
                        site_el = await scope.query_selector('a[data-item-id="authority"], a[aria-label*="site" i], a[aria-label*="website" i]')
                        if not site_el:
                            site_el = await page.query_selector('a[data-item-id="authority"], a[aria-label*="site" i], a[aria-label*="website" i]')
                        if site_el:
                            href = await site_el.get_attribute("href") or ""
                            if "google.com/url?q=" in href:
                                match_url = re.search(r'google\.com/url\?q=([^&]+)', href)
                                if match_url:
                                    website = urllib.parse.unquote(match_url.group(1))
                            elif href.startswith("http"):
                                website = href
                                
                        # 3. Extrai Endereço Completo Oficial
                        addr_el = await scope.query_selector('button[data-item-id="address"], button[aria-label*="Endereço" i], button[aria-label*="Address" i]')
                        if not addr_el:
                            addr_el = await page.query_selector('button[data-item-id="address"], button[aria-label*="Endereço" i], button[aria-label*="Address" i]')
                        if addr_el:
                            aria = await addr_el.get_attribute("aria-label") or ""
                            if aria and "Endereço:" in aria:
                                address = clean_unicode_text(aria.replace("Endereço:", "").strip())
                            else:
                                addr_raw = await addr_el.inner_text()
                                address = clean_unicode_text(addr_raw)

                        # 4. Extrai Fotos Reais do Estabelecimento exclusivamente dentro do painel deste local
                        if detail_pane:
                            img_els = await detail_pane.query_selector_all('button[jsaction*="heroHeaderImage"] img, div[jsaction*="heroHeaderImage"] img, button[aria-label*="Foto" i] img, button[aria-label*="foto" i] img')
                            for img_el in img_els:
                                src = await img_el.get_attribute("src") or ""
                                if src and not any(bad in src for bad in ["=s32", "=s36", "=s40", "=s48", "=s64", "avatar", "profile", "default_avatar", "result-no-thumbnail"]):
                                    if "=w" in src or "=s" in src or "p/" in src or "grass-" in src or "gps-" in src:
                                        clean_src = src.split("=")[0] + "=w800-h600-k-no"
                                        if clean_src not in photos:
                                            photos.append(clean_src)

                        # Se tiver menos de 6 fotos, clica na galeria oficial deste estabelecimento específico
                        if len(photos) < 6 and detail_pane:
                            photo_btn = await detail_pane.query_selector('button[jsaction*="heroHeaderImage"], button[aria-label*="Foto" i], button[aria-label*="foto" i]')
                            if photo_btn:
                                try:
                                    await photo_btn.click()
                                    await page.wait_for_timeout(1500)
                                    gallery_pane = await page.query_selector('div.m6QErb[aria-label], div[role="main"]')
                                    g_scope = gallery_pane if gallery_pane else detail_pane
                                    gallery_imgs = await g_scope.query_selector_all('div[data-photo-index] img, a[data-photo-index] img, button[data-photo-index] img')
                                    for g_img in gallery_imgs:
                                        g_src = await g_img.get_attribute("src") or ""
                                        if g_src and not any(bad in g_src for bad in ["=s32", "=s36", "=s40", "=s48", "=s64", "avatar", "profile", "default_avatar", "result-no-thumbnail"]):
                                            clean_g_src = g_src.split("=")[0] + "=w800-h600-k-no"
                                            if clean_g_src not in photos:
                                                photos.append(clean_g_src)
                                    back_btn = await page.query_selector('button[aria-label*="Voltar" i], button[aria-label*="Back" i]')
                                    if back_btn:
                                        await back_btn.click()
                                        await page.wait_for_timeout(600)
                                except Exception:
                                    pass

                        photos = photos[:10]

                        # Extrai Instagram direto dos links sociais oficiais cadastrados no Maps deste local
                        insta_el = await scope.query_selector('a[href*="instagram.com"]')
                        if insta_el:
                            i_href = await insta_el.get_attribute("href") or ""
                            match_i = re.search(r'instagram\.com/([a-zA-Z0-9_\.]+)', i_href)
                            if match_i:
                                uname = match_i.group(1).lower()
                                if uname not in ['p', 'reel', 'stories', 'explore', 'google', 'maps']:
                                    instagram = f"@{match_i.group(1)}"
                    except Exception as e:
                        print(f"Aviso no card {name}: {e}")
                
                # Fallback para site a partir do card se não pegou no painel
                if not website:
                    site_btn = await card.query_selector('a[data-value="Site"], a[aria-label*="site" i]')
                    if site_btn:
                        href = await site_btn.get_attribute("href") or ""
                        if "google.com/url?q=" in href:
                            match_url = re.search(r'google\.com/url\?q=([^&]+)', href)
                            if match_url:
                                website = urllib.parse.unquote(match_url.group(1))
                        elif href.startswith("http"):
                            website = href

                # Fallback para telefone por regex no texto do card
                if not phone:
                    phone_match = re.search(r'(?:\(?\d{2}\)?\s*)?(?:[2-9]\d{3,4}[-\s]?\d{4})', card_text)
                    if phone_match:
                        phone = phone_match.group(0)

                # Fallback para endereço
                if not address:
                    lines = [l.strip() for l in card_text.splitlines() if l.strip()]
                    for l in lines[1:]:
                        clean_l = clean_unicode_text(l)
                        if any(w in clean_l.lower() for w in ["rua", "r.", "av.", "avenida", "alameda", "travessa", "jardim", "jd.", "centro", "bairro", "cep"]):
                            address = clean_l
                            break
                    if not address and len(lines) > 1:
                        address = clean_unicode_text(lines[1])

                # Identifica WhatsApp direto se for celular ou se ainda não detectado
                if not whatsapp and phone:
                    p_digits = re.sub(r'\D', '', phone)
                    if p_digits.startswith("55") and len(p_digits) in (12, 13):
                        p_digits = p_digits[2:]
                    if len(p_digits) == 10 and p_digits[2] in ('6', '7', '8', '9'):
                        p_digits = f"{p_digits[:2]}9{p_digits[2:]}"
                        phone = f"({p_digits[:2]}) {p_digits[2:7]}-{p_digits[7:]}"
                    if len(p_digits) == 11 and p_digits[2] == '9':
                        whatsapp = f"55{p_digits}"

                # Links diretos para análise humana
                clean_address = address
                if not maps_url:
                    maps_url = raw_card_href or f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote_plus(name + ' ' + (clean_address or query))}"
                
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
                    "photos": photos,
                    "maps_url": maps_url,
                    "google_url": google_url,
                    "source": "google_maps_real_live"
                })

            await browser.close()
    except Exception as e:
        print(f"Erro no scrape_google_maps_real: {e}")
        
    return leads

def run_real_maps_sync(query: str, limit: int = 15) -> List[Dict[str, Any]]:
    """
    Wrapper síncrono thread-safe para executar a busca real do Google Maps.
    Executa em uma thread separada com loop dedicado para evitar o erro
    'RuntimeError: asyncio.run() cannot be called from a running event loop' no FastAPI.
    """
    def _worker():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(scrape_google_maps_real(query, limit=limit))
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
            return future.result(timeout=120)
    except Exception as e:
        print(f"Erro no run_real_maps_sync: {e}")
        return []

if __name__ == "__main__":
    results = run_real_maps_sync("academia caraguatatuba", limit=3)
    print(f"Total extraído: {len(results)}")
    for r in results:
        print(r)
