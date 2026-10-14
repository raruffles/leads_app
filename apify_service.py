import urllib.parse
import re
from typing import List, Dict, Any, Tuple
import httpx
from brand_filter import is_major_brand_or_chain

def fetch_extra_photos_for_place_ids(place_ids: List[str], token: str) -> Dict[str, List[str]]:
    """
    Usa o Actor solidcode/google-maps-photos-scraper para buscar galerias completas
    (6 a 10 fotos reais) para locais que vieram com poucas fotos do crawler principal.
    """
    if not place_ids or not token:
        return {}
        
    url = f"https://api.apify.com/v2/acts/solidcode~google-maps-photos-scraper/run-sync-get-dataset-items?token={token.strip()}&timeout=45"
    payload = {
        "placeIds": place_ids[:5],
        "maxPhotosPerPlace": 10,
        "imageSize": "large",
        "photoCategories": ["all"]
    }
    
    place_photos_map = {}
    try:
        with httpx.Client(timeout=50.0) as client:
            resp = client.post(url, json=payload)
            if resp.status_code in (200, 201):
                items = resp.json()
                if isinstance(items, list):
                    for it in items:
                        pid = it.get("placeId") or (place_ids[0] if len(place_ids) == 1 else "")
                        p_list = []
                        for p in it.get("photos", []):
                            img_u = p.get("imageUrl")
                            if img_u and img_u.startswith("http") and img_u not in p_list:
                                p_list.append(img_u)
                        if pid and p_list:
                            place_photos_map[pid] = p_list
    except Exception as e:
        print(f"Aviso: Não foi possível enriquecer fotos adicionais via solidcode: {e}")
        
    return place_photos_map

def fetch_apify_google_places(
    niche: str, 
    cidade_nome: str, 
    token: str, 
    limit: int = 15,
    bairro: str = "",
    extra_blacklist: str = ""
) -> Tuple[List[Dict[str, Any]], str]:
    """
    Executa o Actor oficial do Google Places no Apify (compass/crawler-google-places).
    Coleta dados 100% REAIS e OFICIAIS do Google Maps:
    - Ignora grandes redes e franquias (SmartFit, Nubank, Skyfit, Panobianco, etc.)
    - Nome verificado da empresa
    - Telefone oficial com DDD
    - Website real (se houver)
    - Endereço completo
    - De 6 a 10 fotos reais de alta resolução exclusivas da empresa
    - Avaliação (Rating) e total de avaliações (Reviews)
    - URL direta do local no Google Maps
    """
    if not token or not token.strip():
        return [], "Token do Apify não configurado."

    search_query = f"{niche} em {cidade_nome}"
    if bairro:
        search_query += f" {bairro}"

    # Pede uma margem um pouco maior para compensar a filtragem de grandes marcas
    crawl_limit = min(limit * 2, 40)

    payload = {
        "searchStringsArray": [search_query],
        "locationQuery": f"{cidade_nome}, Brasil",
        "maxCrawledPlacesPerSearch": crawl_limit,
        "maxImages": 15,
        "scrapePlaceDetailPage": True,
        "language": "pt-BR"
    }

    url = f"https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token={token.strip()}&timeout=80"

    try:
        with httpx.Client(timeout=95.0) as client:
            resp = client.post(url, json=payload)
            if resp.status_code in (200, 201):
                raw_items = resp.json()
                if not isinstance(raw_items, list):
                    return [], "Formato de retorno inválido do Apify."

                candidates = []
                seen_names = set()
                needs_more_photos_pids = []

                for item in raw_items:
                    name = item.get("title") or ""
                    if not name or name.lower() in seen_names:
                        continue
                    
                    website = item.get("website") or ""
                    
                    # REGRA MANDATÓRIA: Ignora grandes redes e franquias corporativas (SmartFit, Skyfit, Nubank, etc.)
                    if is_major_brand_or_chain(name, website, extra_blacklist=extra_blacklist):
                        continue

                    seen_names.add(name.lower())

                    phone = item.get("phone") or item.get("phoneUnformatted") or ""
                    address = item.get("address") or f"{cidade_nome}, SP, Brasil"
                    total_score = item.get("totalScore")
                    reviews_count = item.get("reviewsCount") or 0
                    maps_url = item.get("url") or ""
                    place_id = item.get("placeId") or ""

                    # Extrai fotos REAIS de alta resolução
                    image_urls = item.get("imageUrls") or []
                    single_image = item.get("imageUrl")
                    
                    cleaned_photos = []
                    if single_image and single_image.startswith("http") and single_image not in cleaned_photos:
                        cleaned_photos.append(single_image)

                    for img in image_urls:
                        if isinstance(img, str) and img.startswith("http"):
                            # Ajustar para resolução nítida
                            if "=w" in img or "=s" in img:
                                clean_img = img.split("=")[0] + "=w1200-h800-k-no"
                            else:
                                clean_img = img
                            if clean_img not in cleaned_photos:
                                cleaned_photos.append(clean_img)

                    # Links de auditoria e análise humana
                    if not maps_url:
                        maps_url = f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote_plus(name + ' ' + address)}"
                    
                    google_url = f"https://www.google.com/search?q={urllib.parse.quote_plus(name + ' ' + address)}"

                    # Tenta capturar instagram se já presente nos dados sociais do Apify
                    instagram = ""
                    social_links = item.get("socialMediaProfiles") or {}
                    if isinstance(social_links, dict) and social_links.get("instagram"):
                        insta_val = social_links["instagram"]
                        if isinstance(insta_val, str) and "instagram.com/" in insta_val:
                            match_i = re.search(r'instagram\.com/([a-zA-Z0-9_\.]+)', insta_val)
                            if match_i and match_i.group(1).lower() not in ['p', 'reel', 'stories', 'explore']:
                                instagram = f"@{match_i.group(1)}"

                    lead_dict = {
                        "name": name,
                        "phone": phone,
                        "website": website,
                        "address": address,
                        "rating": float(total_score) if total_score is not None else None,
                        "reviews_count": int(reviews_count) if reviews_count else 0,
                        "category": niche.title(),
                        "instagram": instagram,
                        "photos": cleaned_photos[:10],
                        "maps_url": maps_url,
                        "google_url": google_url,
                        "place_id": place_id,
                        "source": "apify_google_places_official"
                    }
                    
                    if len(cleaned_photos) < 6 and place_id:
                        needs_more_photos_pids.append(place_id)

                    candidates.append(lead_dict)
                    if len(candidates) >= limit:
                        break

                # Se algum lead ficou com menos de 6 fotos, tenta enriquecer com o actor especializado em fotos
                if needs_more_photos_pids:
                    extra_map = fetch_extra_photos_for_place_ids(needs_more_photos_pids[:3], token)
                    if extra_map:
                        for cand in candidates:
                            pid = cand.get("place_id")
                            if pid in extra_map and len(cand["photos"]) < 6:
                                merged = cand["photos"] + [p for p in extra_map[pid] if p not in cand["photos"]]
                                cand["photos"] = merged[:10]

                return candidates, ""
            else:
                return [], f"Apify HTTP {resp.status_code}: {resp.text[:150]}"
    except Exception as e:
        return [], f"Erro na conexão com Apify: {str(e)}"
