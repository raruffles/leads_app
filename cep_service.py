import httpx
import re
from typing import Dict, Any, Optional

def fetch_cep_info(cep: str) -> Optional[Dict[str, Any]]:
    """Consulta dados de endereço e DDD a partir do CEP via ViaCEP / BrasilAPI"""
    clean_cep = re.sub(r'\D', '', cep)
    if len(clean_cep) != 8:
        return None
        
    # 1. Tentar ViaCEP
    try:
        url = f"https://viacep.com.br/ws/{clean_cep}/json/"
        with httpx.Client(timeout=6) as client:
            resp = client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if "erro" not in data:
                    return {
                        "cep": data.get("cep"),
                        "logradouro": data.get("logradouro", ""),
                        "bairro": data.get("bairro", ""),
                        "cidade": data.get("localidade", ""),
                        "uf": data.get("uf", ""),
                        "estado": data.get("estado", ""),
                        "ddd": data.get("ddd", ""),
                        "formatted": f"{data.get('localidade')} - {data.get('uf')}"
                    }
    except Exception:
        pass
        
    # 2. Fallback BrasilAPI
    try:
        url = f"https://brasilapi.com.br/api/cep/v2/{clean_cep}"
        with httpx.Client(timeout=6) as client:
            resp = client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "cep": data.get("cep"),
                    "logradouro": data.get("street", ""),
                    "bairro": data.get("neighborhood", ""),
                    "cidade": data.get("city", ""),
                    "uf": data.get("state", ""),
                    "estado": data.get("state", ""),
                    "ddd": "",
                    "formatted": f"{data.get('city')} - {data.get('state')}"
                }
    except Exception:
        pass
        
    return None

if __name__ == "__main__":
    print(fetch_cep_info("12245000"))
    print(fetch_cep_info("12200-000"))
