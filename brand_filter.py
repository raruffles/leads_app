import re
import unicodedata
from typing import List, Optional

DEFAULT_EXCLUDED_BRANDS = [
    # Academias & Franquias Fitness Corporativas
    "smart fit", "smartfit", "skyfit", "sky fit", "bluefit", "blue fit", 
    "panobianco", "bio ritmo", "bioritmo", "bodytech", "selfit", "pratique fitness", 
    "just fit", "gavioes 24h", "gaviões 24h", "ironberg", "acm",

    # Bancos, Fintechs & Meios de Pagamento
    "nubank", "itau", "itaú", "bradesco", "santander", "banco do brasil", 
    "caixa economica", "caixa econômica", "banco inter", "c6 bank", "banco safra", 
    "btg pactual", "pagseguro", "stone", "cielo", "getnet", "rede",

    # Farmácias & Drogarias de rede nacional
    "droga raia", "drogasil", "drogaria sao paulo", "drogaria são paulo", 
    "pague menos", "ultrafarma", "drogaria araujo", "extrafarma", "drogarias pacheco",

    # Fast Food & Franquias de Alimentação em grande escala
    "mcdonald", "mc donald", "burger king", "subway", "habib", "ragazzo", 
    "kfc", "bobs", "bob's", "pizza hut", "dominos", "domino's", "outback", 
    "madero", "starbucks", "cacau show", "kopenhagen", "chiquinho sorvetes",
    "giraffas", "spoleto", "spoletto", "jeronimo", "jerônimo",

    # Grandes Lojas, Varejo & Hipermercados
    "carrefour", "pao de acucar", "pão de açúcar", "extra", "assai", "assaí", 
    "atacadão", "atacadao", "magalu", "magazine luiza", "casas bahia", "ponto frio", 
    "lojas americanas", "americanas", "havan", "leroy merlin", "telhanorte", 
    "c&a", "renner", "riachuelo", "marisa", "zara", "pernambucanas", "centauro", 
    "decathlon", "kalunga", "cobasi", "petz",

    # Postos de Combustível de grandes distribuidoras
    "posto ipiranga", "posto shell", "posto br", "petrobras", "ale combustiveis",

    # Telefonia & Telecom
    "vivo", "claro", "tim", "oi fibra",

    # Hotéis de Redes Internacionais/Corporativas
    "hotel ibis", "ibis budget", "novotel", "mercure", "sheraton", "radisson", 
    "accor hotels", "fasano", "bourbon hotel", "transamerica", "copacabana palace",

    # Imobiliárias de Rede Franquiada
    "re/max", "remax", "lopes imoveis", "quintoandar", "quinto andar", "loft",

    # Saúde & Diagnósticos Corporativos
    "fleury", "dasa", "lavoisier", "delboni", "hapvida", "notredame", "unimed", "notre dame"
]

def normalize_text(text: str) -> str:
    """Normaliza texto removendo acentuação e pontuação para comparação robusta"""
    if not text:
        return ""
    nfkd = unicodedata.normalize('NFKD', text)
    cleaned = "".join([c for c in nfkd if not unicodedata.combining(c)])
    return re.sub(r'[^a-zA-Z0-9\s]', ' ', cleaned).lower().strip()

def is_major_brand_or_chain(name: str, website: str = "", extra_blacklist: str = "") -> bool:
    """
    Identifica se a empresa pertence a grandes redes ou franquias corporativas
    (como SmartFit, Nubank, Skyfit, Panobianco, Bluefit, etc.) que já possuem
    agências grandes gerenciando seus portais e não são público-alvo para venda de sites.
    """
    norm_name = normalize_text(name)
    if not norm_name:
        return False

    all_brands = list(DEFAULT_EXCLUDED_BRANDS)
    if extra_blacklist:
        for b in extra_blacklist.split(','):
            b_clean = b.strip()
            if b_clean and b_clean not in all_brands:
                all_brands.append(b_clean)

    # 1. Verifica ocorrência no Nome da empresa
    for brand in all_brands:
        norm_brand = normalize_text(brand)
        if not norm_brand:
            continue
        # Verifica palavra isolada ou presença exata no nome
        pattern = r'(?:\b|_)' + re.escape(norm_brand) + r'(?:\b|_)'
        if re.search(pattern, norm_name) or norm_brand in norm_name:
            return True

    # 2. Verifica ocorrência no Website/Domínio
    if website:
        norm_site = normalize_text(website)
        for brand in all_brands:
            brand_token = normalize_text(brand).replace(' ', '')
            if brand_token and len(brand_token) >= 4 and brand_token in norm_site:
                return True

    return False
