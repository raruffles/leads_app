import httpx
from typing import List, Dict, Any, Tuple, Optional

def search_google_places_api(query: str, api_key: str, limit: int = 15) -> Tuple[List[Dict[str, Any]], str]:
    """
    Busca estabelecimentos reais via Google Places API (Text Search + Place Details)
    Documentação oficial do Google:
    https://developers.google.com/maps/documentation/places/web-service/search-text
    Retorna tupla: (leads, mensagem_de_erro_ou_vazio)
    """
    if not api_key or not api_key.strip():
        return [], ""

    api_key = api_key.strip()
    
    # Validação do formato da chave Google Places (sempre inicia com AIza...)
    if api_key.startswith("AQ."):
        return [], "A chave informada pertence ao Google AI Studio (Gemini), não ao Google Maps/Places API (que inicia com 'AIza...')."
    if not api_key.startswith("AIza"):
        return [], "Formato de chave inválido: chaves da API do Google Cloud/Maps iniciam com 'AIza'."

    leads = []
    try:
        # 1. Text Search
        search_url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
        params = {
            "query": query,
            "key": api_key,
            "language": "pt-BR"
        }
        
        with httpx.Client(timeout=12) as client:
            resp = client.get(search_url, params=params)
            if resp.status_code != 200:
                err_msg = f"HTTP {resp.status_code}"
                print(f"Google API HTTP Error: {err_msg}")
                return [], err_msg
                
            data = resp.json()
            status = data.get("status")
            if status != "OK":
                err_msg = f"{status}: {data.get('error_message', 'Sem permissão ou zero resultados')}"
                print(f"Google Places API Status: {err_msg}")
                return [], err_msg
                
            results = data.get("results", [])[:limit]
            
            # 2. Place Details para cada estabelecimento (para pegar telefone e website)
            details_url = "https://maps.googleapis.com/maps/api/place/details/json"
            
            for place in results:
                place_id = place.get("place_id")
                name = place.get("name", "")
                address = place.get("formatted_address", "")
                rating = place.get("rating", 0)
                user_ratings_total = place.get("user_ratings_total", 0)
                
                phone = ""
                website = ""
                
                if place_id:
                    detail_params = {
                        "place_id": place_id,
                        "fields": "name,formatted_phone_number,international_phone_number,website,url",
                        "key": api_key,
                        "language": "pt-BR"
                    }
                    d_resp = client.get(details_url, params=detail_params)
                    if d_resp.status_code == 200:
                        d_data = d_resp.json().get("result", {})
                        phone = d_data.get("formatted_phone_number") or d_data.get("international_phone_number") or ""
                        website = d_data.get("website", "")
                        
                leads.append({
                    "name": name,
                    "phone": phone,
                    "whatsapp": "",
                    "email": "",
                    "website": website,
                    "has_website": 1 if website else 0,
                    "address": address,
                    "category": query.split()[0].title(),
                    "rating": rating,
                    "reviews_count": user_ratings_total,
                    "source": "google_places_api_official"
                })
                
        return leads, ""
    except Exception as e:
        err_msg = str(e)
        print("Erro na integração com Google Places API:", err_msg)
        return [], err_msg
