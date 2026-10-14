import sqlite3
import json
import os
import urllib.parse
import hashlib
import secrets
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_PATH = os.environ.get("DB_PATH")
if not DB_PATH:
    if os.environ.get("VERCEL"):
        DB_PATH = "/tmp/leads.db"
    else:
        DB_PATH = os.path.join(os.path.dirname(__file__), "leads.db")


def hash_password(password: str, salt: Optional[str] = None) -> str:
    if not salt:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
    return f"{salt}${key.hex()}"

def verify_password(password: str, stored: str) -> bool:
    try:
        if "$" not in stored:
            return False
        salt, key = stored.split("$", 1)
        test_key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
        return secrets.compare_digest(key, test_key.hex())
    except Exception:
        return False

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # Tabela de buscas/varreduras (Histórico)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        niche TEXT NOT NULL,
        location TEXT NOT NULL,
        total_found INTEGER DEFAULT 0,
        no_website_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'completed',
        created_at TEXT NOT NULL
    )
    """)
    
    # Tabela de leads capturados
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_id INTEGER,
        name TEXT NOT NULL,
        phone TEXT,
        whatsapp TEXT,
        email TEXT,
        website TEXT,
        has_website INTEGER DEFAULT 1,
        address TEXT,
        category TEXT,
        instagram TEXT,
        opportunity_score INTEGER DEFAULT 50,
        campaign_status TEXT DEFAULT 'novo',
        follow_stage TEXT DEFAULT 'contato',
        notes TEXT,
        deal_value REAL DEFAULT 0.0,
        assigned_to TEXT DEFAULT '',
        closed_at TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (scan_id) REFERENCES scans (id)
    )
    """)

    # Migrações seguras
    try:
        cursor.execute("ALTER TABLE leads ADD COLUMN follow_stage TEXT DEFAULT 'contato'")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE leads ADD COLUMN photos TEXT DEFAULT '[]'")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE leads ADD COLUMN maps_url TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE leads ADD COLUMN google_url TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE leads ADD COLUMN deal_value REAL DEFAULT 0.0")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE leads ADD COLUMN assigned_to TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE leads ADD COLUMN closed_at TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass

    # Tabela de usuários para modo online e colaboração de 2 operadores
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'operador',
        created_at TEXT NOT NULL
    )
    """)

    # Tabela de sessões de login
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)

    # Seed de contas de operadores padrão
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        default_users = [
            ("operador1", hash_password("senha123"), "Operador 1", "operador"),
            ("operador2", hash_password("senha123"), "Operador 2", "operador"),
            ("admin", hash_password("Akali"), "Gerente Geral", "admin")
        ]
        for u, ph, n, r in default_users:
            cursor.execute(
                "INSERT INTO users (username, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?)",
                (u, ph, n, r, now_str)
            )

    # Garante a senha Akali para a conta admin
    try:
        cursor.execute("UPDATE users SET password_hash = ? WHERE username = 'admin'", (hash_password("Akali"),))
    except Exception:
        pass
    
    # Tabela de mensagens (Histórico unificado WhatsApp, E-mail e Site)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER,
        channel TEXT DEFAULT 'whatsapp',
        direction TEXT DEFAULT 'outgoing',
        sender TEXT DEFAULT '',
        recipient TEXT DEFAULT '',
        subject TEXT DEFAULT '',
        body TEXT NOT NULL,
        status TEXT DEFAULT 'sent',
        error_message TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (lead_id) REFERENCES leads (id)
    )
    """)

    # Tabela de configurações
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)
    
    # Configurações padrão se não existirem
    default_settings = {
        "delay_between_requests": "1.5",
        "request_timeout": "10",
        "max_leads_per_scan": "20",
        "deep_scrape": "true",
        "google_places_api_key": os.getenv("GOOGLE_PLACES_API_KEY", ""),
        "apify_token": os.getenv("APIFY_TOKEN", ""),
        "pitch_template": "Olá, tudo bem? Vi a empresa {empresa} em {localizacao} e notei uma grande oportunidade de atrair novos clientes com um site moderno de alta conversão. Gostaria de ver uma prévia sem compromisso?",
        "waha_base_url": "http://localhost:3000",
        "waha_session": "default",
        "waha_api_key": "2b5d16deb67241efa1cffa371e1f354b",
        "waha_min_delay": "15",
        "waha_max_delay": "35",
        "auth_required": "false",
        "excluded_brands": "smart fit, smartfit, skyfit, bluefit, panobianco, bio ritmo, nubank, itau, bradesco, santander, banco do brasil, caixa economica, droga raia, drogasil, pague menos, mcdonald, burger king, subway, habib, cacau show, carrefour, casas bahia, magalu, renner, c&a, havan, petz, cobasi, unimed",
        "default_channel": "whatsapp",
        "smtp_host": "",
        "smtp_port": "587",
        "smtp_user": "",
        "smtp_password": "",
        "smtp_from_name": "Kaptador Comercial",
        "smtp_use_tls": "true",
        "email_subject_template": "Oportunidade Comercial: Presença Digital para {empresa}",
        "email_body_template": "Olá equipe da {empresa},\n\nNotamos que sua empresa em {localizacao} possui grande potencial de atração de novos clientes com uma presença digital otimizada.\n\nPodemos apresentar uma proposta comercial personalizada sem compromisso?\n\nAtenciosamente,\nEquipe Comercial",
        "site_default_message": "Olá! Localizamos sua empresa {empresa} em {localizacao} e gostaríamos de apresentar uma solução moderna para captação de clientes.",
        "site_operator_name": "Equipe de Atendimento",
        "site_contact_phone": ""
    }
    
    for k, v in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))
        
    conn.commit()
    conn.close()

def save_scan(niche: str, location: str, total_found: int, no_website_count: int) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute(
        "INSERT INTO scans (niche, location, total_found, no_website_count, created_at) VALUES (?, ?, ?, ?, ?)",
        (niche, location, total_found, no_website_count, created_at)
    )
    scan_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return scan_id

def save_leads(scan_id: int, leads: List[Dict[str, Any]]) -> List[int]:
    conn = get_connection()
    cursor = conn.cursor()
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    inserted_ids = []
    
    for lead in leads:
        has_web = 1 if (lead.get("website") and lead.get("website").strip()) else 0
        photos_val = lead.get("photos", [])
        if isinstance(photos_val, list):
            photos_str = json.dumps(photos_val, ensure_ascii=False)
        elif isinstance(photos_val, str):
            photos_str = photos_val
        else:
            photos_str = "[]"

        name = lead.get("name", "Empresa")
        address = lead.get("address", "")
        maps_url = lead.get("maps_url", "")
        if not maps_url:
            query_part = f"{name} {address}".strip()
            maps_url = f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote_plus(query_part)}"

        google_url = lead.get("google_url", "")
        if not google_url:
            query_part = f"{name} {address}".strip()
            google_url = f"https://www.google.com/search?q={urllib.parse.quote_plus(query_part)}"

        deal_val = float(lead.get("deal_value", 0.0) or 0.0)
        assigned = lead.get("assigned_to", "")
        closed_at = lead.get("closed_at", "")

        cursor.execute("""
            INSERT INTO leads (
                scan_id, name, phone, whatsapp, email, website, has_website,
                address, category, instagram, opportunity_score, campaign_status, notes, photos,
                maps_url, google_url, deal_value, assigned_to, closed_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            scan_id,
            name,
            lead.get("phone", ""),
            lead.get("whatsapp", ""),
            lead.get("email", ""),
            lead.get("website", ""),
            has_web,
            address,
            lead.get("category", ""),
            lead.get("instagram", ""),
            lead.get("opportunity_score", 50),
            lead.get("campaign_status", "novo"),
            lead.get("notes", ""),
            photos_str,
            maps_url,
            google_url,
            deal_val,
            assigned,
            closed_at,
            created_at
        ))
        inserted_ids.append(cursor.lastrowid)
        
    conn.commit()
    conn.close()
    return inserted_ids

def clear_leads_data(scan_id: Optional[int] = None) -> bool:
    """Limpa todos os leads e varreduras, ou somente da varredura especificada"""
    return cleanup_leads("all", scan_id=scan_id)["success"]

def cleanup_leads(mode: str = "all", scan_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Limpeza inteligente da base de leads:
    - 'keep_closed': Salva/mantém apenas fechados e limpa todos os outros
    - 'keep_new': Mantém apenas novos e limpa trabalhados/perdidos
    - 'all': Limpa todos os leads
    """
    conn = get_connection()
    cursor = conn.cursor()
    deleted_count = 0
    
    if mode == "keep_closed":
        if scan_id:
            cursor.execute("DELETE FROM leads WHERE scan_id = ? AND campaign_status != 'fechado'", (scan_id,))
        else:
            cursor.execute("DELETE FROM leads WHERE campaign_status != 'fechado'")
        deleted_count = cursor.rowcount
    elif mode == "keep_new":
        if scan_id:
            cursor.execute("DELETE FROM leads WHERE scan_id = ? AND campaign_status != 'novo'", (scan_id,))
        else:
            cursor.execute("DELETE FROM leads WHERE campaign_status != 'novo'")
        deleted_count = cursor.rowcount
    else:  # "all"
        if scan_id:
            cursor.execute("DELETE FROM leads WHERE scan_id = ?", (scan_id,))
            cursor.execute("DELETE FROM scans WHERE id = ?", (scan_id,))
        else:
            cursor.execute("DELETE FROM leads")
            cursor.execute("DELETE FROM scans")
        deleted_count = cursor.rowcount

    cursor.execute("SELECT COUNT(*) FROM leads")
    remaining_count = cursor.fetchone()[0]

    conn.commit()
    conn.close()
    return {
        "success": True,
        "mode": mode,
        "deleted_count": deleted_count,
        "remaining_count": remaining_count
    }

def get_scans(limit: int = 20) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM scans ORDER BY id DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_leads(
    scan_id: Optional[int] = None, 
    campaign_status: Optional[str] = None, 
    filter_no_site: bool = False, 
    search: Optional[str] = None,
    assigned_to: Optional[str] = None
) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM leads WHERE 1=1"
    params = []
    
    if scan_id:
        query += " AND scan_id = ?"
        params.append(scan_id)
    if campaign_status and campaign_status != 'todos':
        query += " AND campaign_status = ?"
        params.append(campaign_status)
    if filter_no_site:
        query += " AND has_website = 0"
    if assigned_to:
        query += " AND assigned_to = ?"
        params.append(assigned_to)
    if search:
        query += " AND (name LIKE ? OR phone LIKE ? OR email LIKE ? OR address LIKE ? OR notes LIKE ?)"
        s = f"%{search}%"
        params.extend([s, s, s, s, s])
        
    query += " ORDER BY id DESC LIMIT 500"
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_lead_by_id(lead_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM leads WHERE id = ?", (lead_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def update_lead_status(
    lead_id: int, 
    status: Optional[str] = None, 
    notes: Optional[str] = None, 
    follow_stage: Optional[str] = None,
    deal_value: Optional[float] = None,
    assigned_to: Optional[str] = None
) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    fields = []
    params = []
    
    if status is not None:
        fields.append("campaign_status = ?")
        params.append(status)
        if status == 'fechado':
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            fields.append("closed_at = COALESCE(NULLIF(closed_at, ''), ?)")
            params.append(now_str)
            
    if notes is not None:
        fields.append("notes = ?")
        params.append(notes)
    if follow_stage is not None:
        fields.append("follow_stage = ?")
        params.append(follow_stage)
    if deal_value is not None:
        fields.append("deal_value = ?")
        params.append(float(deal_value))
    if assigned_to is not None:
        fields.append("assigned_to = ?")
        params.append(str(assigned_to))
        
    if fields:
        params.append(lead_id)
        cursor.execute(f"UPDATE leads SET {', '.join(fields)} WHERE id = ?", params)
        conn.commit()
    conn.close()
    return True

def delete_lead(lead_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
    conn.commit()
    conn.close()
    return True

def get_dashboard_stats() -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM leads")
    total_leads = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM leads WHERE has_website = 0")
    no_website = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM leads WHERE whatsapp != '' AND whatsapp IS NOT NULL")
    with_whatsapp = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM leads WHERE email != '' AND email IS NOT NULL")
    with_email = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM scans")
    total_scans = cursor.fetchone()[0]
    
    # Campanhas por status
    cursor.execute("SELECT campaign_status, COUNT(*) as count FROM leads GROUP BY campaign_status")
    campaign_counts = {r['campaign_status']: r['count'] for r in cursor.fetchall()}
    
    # Métricas Financeiras e Pipeline de Fechamento
    cursor.execute("SELECT COUNT(*), COALESCE(SUM(deal_value), 0) FROM leads WHERE campaign_status = 'fechado'")
    row_fechados = cursor.fetchone()
    leads_fechado = row_fechados[0] or 0
    total_fechado_valor = float(row_fechados[1] or 0.0)

    cursor.execute("SELECT COUNT(*), COALESCE(SUM(deal_value), 0) FROM leads WHERE campaign_status = 'proposta'")
    row_propostas = cursor.fetchone()
    leads_proposta = row_propostas[0] or 0
    total_proposta_valor = float(row_propostas[1] or 0.0)

    cursor.execute("SELECT COUNT(*) FROM leads WHERE campaign_status = 'novo'")
    leads_novo = cursor.fetchone()[0] or 0

    cursor.execute("SELECT COUNT(*) FROM leads WHERE campaign_status = 'contatado'")
    leads_contatado = cursor.fetchone()[0] or 0

    conversion_rate = round((leads_fechado / total_leads * 100), 1) if total_leads > 0 else 0
    avg_ticket = round((total_fechado_valor / leads_fechado), 2) if leads_fechado > 0 else 0.0
    
    # Últimas 5 varreduras
    cursor.execute("SELECT * FROM scans ORDER BY id DESC LIMIT 5")
    recent_scans = [dict(r) for r in cursor.fetchall()]

    # Usuários / operadores cadastrados
    cursor.execute("SELECT id, username, name, role FROM users ORDER BY id ASC")
    users = [dict(r) for r in cursor.fetchall()]
    
    conn.close()
    
    return {
        "total_leads": total_leads,
        "no_website": no_website,
        "with_whatsapp": with_whatsapp,
        "with_email": with_email,
        "total_scans": total_scans,
        "campaign_counts": campaign_counts,
        "recent_scans": recent_scans,
        "leads_fechado": leads_fechado,
        "total_fechado_valor": total_fechado_valor,
        "leads_proposta": leads_proposta,
        "total_proposta_valor": total_proposta_valor,
        "leads_novo": leads_novo,
        "leads_contatado": leads_contatado,
        "conversion_rate": conversion_rate,
        "avg_ticket": avg_ticket,
        "users": users
    }

# ========================================================
# FUNÇÕES DE AUTENTICAÇÃO E GERENCIAMENTO DE USUÁRIOS
# ========================================================

def authenticate_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username.strip(),))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    user = dict(row)
    if verify_password(password, user["password_hash"]):
        user.pop("password_hash", None)
        return user
    return None

def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, name, role, created_at FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_users() -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, name, role, created_at FROM users ORDER BY id ASC")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_operators_summary() -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, name, role, created_at FROM users ORDER BY id ASC")
    users = [dict(r) for r in cursor.fetchall()]
    
    for u in users:
        name = u.get("name", "")
        # Leads atribuídos
        cursor.execute("SELECT COUNT(*) FROM leads WHERE LOWER(assigned_to) = LOWER(?)", (name,))
        u["leads_count"] = cursor.fetchone()[0]
        
        # Leads fechados e valor faturado
        cursor.execute("""
            SELECT COUNT(*), COALESCE(SUM(deal_value), 0.0)
            FROM leads
            WHERE LOWER(assigned_to) = LOWER(?) AND campaign_status = 'fechado'
        """, (name,))
        row = cursor.fetchone()
        u["closed_count"] = row[0]
        u["closed_value"] = float(row[1])
        
    conn.close()
    return users

def create_operator(username: str, name: str, password: str = "senha123", role: str = "operador") -> int:
    conn = get_connection()
    cursor = conn.cursor()
    pwd_hash = hash_password(password.strip() if password else "senha123")
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""
        INSERT INTO users (username, name, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (username.strip(), name.strip(), pwd_hash, role, created_at))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return new_id

def update_operator(
    user_id: int, 
    name: Optional[str] = None, 
    username: Optional[str] = None, 
    password: Optional[str] = None, 
    role: Optional[str] = None
) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    
    # Busca nome anterior para manter integridade dos leads atribuídos
    cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
    old_user = cursor.fetchone()
    old_name = old_user["name"] if old_user else None
    
    fields = []
    params = []
    if name:
        new_name = name.strip()
        fields.append("name = ?")
        params.append(new_name)
    if username:
        fields.append("username = ?")
        params.append(username.strip())
    if password and password.strip():
        fields.append("password_hash = ?")
        params.append(hash_password(password.strip()))
    if role:
        fields.append("role = ?")
        params.append(role)
        
    if fields:
        params.append(user_id)
        cursor.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", params)
        
        # Se alterou o nome do operador, atualiza os leads atribuídos a ele
        if name and old_name and name.strip() != old_name:
            cursor.execute("UPDATE leads SET assigned_to = ? WHERE LOWER(assigned_to) = LOWER(?)", (name.strip(), old_name))
            
        conn.commit()
    conn.close()
    return True

def delete_operator(user_id: int) -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT name, role FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return {"success": False, "error": "Usuário não localizado."}
        
    if row["role"] in ("admin", "gerente"):
        cursor.execute("SELECT COUNT(*) FROM users WHERE role IN ('admin', 'gerente')")
        if cursor.fetchone()[0] <= 1:
            conn.close()
            return {"success": False, "error": "Não é permitido excluir o único Gerente/Administrador do sistema."}
            
    name = row["name"]
    # Libera os leads atribuídos para 'Não atribuído'
    cursor.execute("UPDATE leads SET assigned_to = '' WHERE LOWER(assigned_to) = LOWER(?)", (name,))
    # Deleta sessões e o operador
    cursor.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return {"success": True}

def update_user(user_id: int, name: Optional[str] = None, password: Optional[str] = None) -> bool:
    return update_operator(user_id, name=name, password=password)

def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, created_at)
    )
    conn.commit()
    conn.close()
    return token

def get_session_user(token: str) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.id, u.username, u.name, u.role, u.created_at
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ?
    """, (token,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def delete_session(token: str) -> bool:
    if not token:
        return False
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()
    return True

def get_settings() -> Dict[str, str]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    settings = {r['key']: r['value'] for r in cursor.fetchall()}
    conn.close()
    return settings

def update_settings(new_settings: Dict[str, str]):
    conn = get_connection()
    cursor = conn.cursor()
    for k, v in new_settings.items():
        cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, str(v)))
    conn.commit()
    conn.close()

# ========================================================
# FUNÇÕES DE MENSAGENS E CHAT MULTI-CANAL
# ========================================================

def save_message(
    lead_id: Optional[int],
    channel: str = "whatsapp",
    direction: str = "outgoing",
    sender: str = "",
    recipient: str = "",
    subject: str = "",
    body: str = "",
    status: str = "sent",
    error_message: str = ""
) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""
        INSERT INTO messages (
            lead_id, channel, direction, sender, recipient, subject, body, status, error_message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (lead_id, channel, direction, sender, recipient, subject, body, status, error_message, created_at))
    msg_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return msg_id

def get_messages(lead_id: Optional[int] = None, phone: Optional[str] = None, limit: int = 150) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    if lead_id:
        query = "SELECT * FROM messages WHERE lead_id = ? ORDER BY id ASC LIMIT ?"
        cursor.execute(query, (lead_id, limit))
    elif phone:
        clean_phone = "".join(c for c in phone if c.isdigit())
        s = f"%{clean_phone[-8:]}%" if len(clean_phone) >= 8 else f"%{clean_phone}%"
        query = """
            SELECT m.* FROM messages m
            LEFT JOIN leads l ON m.lead_id = l.id
            WHERE m.recipient LIKE ? OR l.whatsapp LIKE ? OR l.phone LIKE ?
            ORDER BY m.id ASC LIMIT ?
        """
        cursor.execute(query, (s, s, s, limit))
    else:
        query = "SELECT * FROM messages ORDER BY id DESC LIMIT ?"
        cursor.execute(query, (limit,))
    
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_chat_conversations(search: Optional[str] = None, filter_type: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    
    query = """
        SELECT 
            l.id, l.name, l.phone, l.whatsapp, l.email, l.website, l.category, 
            l.address, l.campaign_status, l.follow_stage, l.deal_value, l.opportunity_score,
            (SELECT body FROM messages WHERE lead_id = l.id ORDER BY id DESC LIMIT 1) as last_message_body,
            (SELECT channel FROM messages WHERE lead_id = l.id ORDER BY id DESC LIMIT 1) as last_message_channel,
            (SELECT direction FROM messages WHERE lead_id = l.id ORDER BY id DESC LIMIT 1) as last_message_direction,
            (SELECT created_at FROM messages WHERE lead_id = l.id ORDER BY id DESC LIMIT 1) as last_message_time,
            (SELECT COUNT(*) FROM messages WHERE lead_id = l.id) as message_count
        FROM leads l
        WHERE 1=1
    """
    params = []
    
    if search:
        s = f"%{search.strip()}%"
        query += " AND (l.name LIKE ? OR l.phone LIKE ? OR l.whatsapp LIKE ? OR l.email LIKE ?)"
        params.extend([s, s, s, s])
        
    if filter_type == 'whatsapp':
        query += " AND (l.whatsapp IS NOT NULL AND l.whatsapp != '')"
    elif filter_type == 'email':
        query += " AND (l.email IS NOT NULL AND l.email != '')"
    elif filter_type == 'has_messages':
        query += " AND (SELECT COUNT(*) FROM messages WHERE lead_id = l.id) > 0"
    elif filter_type == 'clients':
        query += " AND l.campaign_status = 'fechado'"
    elif filter_type == 'novos':
        query += " AND l.campaign_status = 'novo'"
        
    query += """
        ORDER BY 
            CASE WHEN last_message_time IS NOT NULL THEN 0 ELSE 1 END,
            last_message_time DESC,
            l.id DESC
        LIMIT 250
    """
    
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def save_or_get_contact(name: str, phone: str, whatsapp: str, email: str = "", category: str = "Contato Manual", notes: str = "") -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()
    
    clean_digits = "".join(c for c in whatsapp if c.isdigit())
    if len(clean_digits) in (10, 11) and not clean_digits.startswith("55"):
        clean_digits = f"55{clean_digits}"
        
    query_search = "%" + (clean_digits[-8:] if len(clean_digits) >= 8 else clean_digits) + "%"
    cursor.execute("""
        SELECT * FROM leads 
        WHERE whatsapp LIKE ? OR phone LIKE ? 
        ORDER BY id DESC LIMIT 1
    """, (query_search, query_search))
    existing = cursor.fetchone()
    if existing:
        lead_dict = dict(existing)
        if name and name.strip() and existing["name"] in ("Empresa", "Contato WhatsApp", "Sem nome"):
            cursor.execute("UPDATE leads SET name = ? WHERE id = ?", (name.strip(), existing["id"]))
            conn.commit()
            lead_dict["name"] = name.strip()
        conn.close()
        return lead_dict
    
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""
        INSERT INTO leads (
            name, phone, whatsapp, email, category, campaign_status, follow_stage, notes, created_at, has_website, opportunity_score
        ) VALUES (?, ?, ?, ?, ?, 'contatado', 'contato', ?, ?, 0, 50)
    """, (name.strip() or "Contato WhatsApp", phone.strip(), clean_digits, email.strip(), category, notes.strip(), created_at))
    new_id = cursor.lastrowid
    conn.commit()
    cursor.execute("SELECT * FROM leads WHERE id = ?", (new_id,))
    new_lead = dict(cursor.fetchone())
    conn.close()
    return new_lead


