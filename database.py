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

    # Tabela de Tarefas
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        priority TEXT DEFAULT 'media',
        due_date TEXT DEFAULT 'sem_prazo',
        status TEXT DEFAULT 'pendente',
        assigned_to TEXT DEFAULT '',
        lead_id INTEGER,
        created_at TEXT NOT NULL
    )
    """)

    # Tabela de Comandas / Ordens de Venda
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS comandas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comanda_number TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        lead_id INTEGER,
        status TEXT DEFAULT 'aberta',
        total REAL DEFAULT 0.0,
        payment_method TEXT DEFAULT 'pix',
        items_json TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        closed_at TEXT DEFAULT ''
    )
    """)

    # Tabela de Produtos e Catálogo para Atendente de IA
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        category TEXT DEFAULT 'Serviço',
        price REAL DEFAULT 0.0,
        promo_price REAL DEFAULT 0.0,
        prompt_description TEXT DEFAULT '',
        active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
    )
    """)

    # Tabela de Respostas Rápidas / Templates
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS quick_replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        shortcut TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'Geral',
        team_shared INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
    )
    """)

    # Tabela de Agenda e Compromissos
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS calendar_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        event_type TEXT DEFAULT 'atendimento',
        event_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        contact_name TEXT DEFAULT '',
        contact_phone TEXT DEFAULT '',
        assigned_to TEXT DEFAULT '',
        status TEXT DEFAULT 'agendado',
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL
    )
    """)

    # Tabela de E-mails da Empresa (Gmail / Webmail)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS email_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject TEXT NOT NULL,
        from_email TEXT NOT NULL,
        to_email TEXT NOT NULL,
        body TEXT NOT NULL,
        snippet TEXT DEFAULT '',
        folder TEXT DEFAULT 'inbox',
        is_read INTEGER DEFAULT 0,
        date_str TEXT NOT NULL,
        lead_id INTEGER,
        created_at TEXT NOT NULL
    )
    """)

    # Tabela de Agentes de IA
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ai_agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        provider TEXT DEFAULT 'google',
        model TEXT DEFAULT 'gemini-2.5-flash',
        agent_type TEXT DEFAULT 'mcp_agent',
        system_prompt TEXT DEFAULT '',
        priority INTEGER DEFAULT 0,
        is_default INTEGER DEFAULT 0,
        status TEXT DEFAULT 'ativo',
        created_at TEXT NOT NULL
    )
    """)

    # Tabela de Follow-ups e Automações de Reengajamento
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ai_followups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        trigger_type TEXT DEFAULT 'silence_24h',
        conditions_json TEXT DEFAULT '{}',
        steps_json TEXT DEFAULT '[]',
        status TEXT DEFAULT 'ativo',
        created_at TEXT NOT NULL
    )
    """)

    # Tabela do Cofre de Conhecimento
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS knowledge_vault (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        source_type TEXT DEFAULT 'document',
        summary TEXT DEFAULT '',
        status TEXT DEFAULT 'pronto',
        chunks_count INTEGER DEFAULT 1,
        queries_count INTEGER DEFAULT 0,
        last_prepared TEXT DEFAULT '',
        created_at TEXT NOT NULL
    )
    """)

    # Tabela de Simulações da Calculadora de Precificação
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS pricing_simulations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        website_url TEXT NOT NULL,
        client_name TEXT DEFAULT '',
        city TEXT DEFAULT '',
        uf TEXT DEFAULT '',
        segment TEXT DEFAULT '',
        project_type TEXT DEFAULT 'Identificar automaticamente',
        timeline TEXT DEFAULT '4 semanas',
        positioning TEXT DEFAULT 'Usar o padrão da empresa',
        is_redesign INTEGER DEFAULT 1,
        outsource INTEGER DEFAULT 0,
        urgency INTEGER DEFAULT 0,
        recommended_price REAL DEFAULT 0.0,
        min_price REAL DEFAULT 0.0,
        max_price REAL DEFAULT 0.0,
        estimated_hours REAL DEFAULT 0.0,
        breakdown_json TEXT DEFAULT '{}',
        proposal_text TEXT DEFAULT '',
        created_at TEXT NOT NULL
    )
    """)

    # Tabela de Chamadas com Transcrição de IA
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS crm_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_name TEXT NOT NULL,
        phone TEXT DEFAULT '',
        lead_id INTEGER,
        duration_seconds INTEGER DEFAULT 0,
        transcript TEXT DEFAULT '',
        summary TEXT DEFAULT '',
        sentiment TEXT DEFAULT 'neutro',
        created_at TEXT NOT NULL
    )
    """)

    # Tabela de Logs de Auditoria
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_name TEXT DEFAULT 'Sistema',
        action TEXT NOT NULL,
        entity_type TEXT DEFAULT '',
        entity_id TEXT DEFAULT '',
        details TEXT DEFAULT '',
        created_at TEXT NOT NULL
    )
    """)

    # Tabela de Campanhas de Disparo Automático
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dispatch_campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        template TEXT NOT NULL,
        target_group TEXT DEFAULT 'selection',
        total_leads INTEGER DEFAULT 0,
        sent_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'concluido',
        created_at TEXT NOT NULL
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
        "site_contact_phone": "",
        "gmail_connected": "false",
        "gmail_account": "contato.empresa@gmail.com",
        "google_calendar_account": "agenda.empresa@gmail.com",
        "google_drive_folder": "Cofre CRM Comercial",
        "google_drive_connected": "false",
        "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
        "gemini_api_key": os.getenv("GEMINI_API_KEY", ""),
        "claude_api_key": os.getenv("ANTHROPIC_API_KEY", ""),
        "groq_api_key": os.getenv("GROQ_API_KEY", ""),
        "pricing_base_hour": "90.0",
        "pricing_urgency_rate": "25.0",
        "pricing_outsource_margin": "30.0",
        "meta_pixel_id": "",
        "meta_access_token": "",
        "curator_instructions": "Encontre respostas inconsistentes e sugira esclarecimentos para o atendimento.",
        "disparador_empresa_nome": "Kaptador",
        "disparador_solucao": "modernização de sites e captação de clientes",
        "disparador_publico_alvo": "líderes do setor",
        "disparador_beneficio": "aumentar o faturamento através de contatos qualificados",
        "disparador_opt_out": "true",
        "disparador_opt_out_text": "Se preferir não receber mensagens, é só me avisar.",
        "disparador_template": "[{saudacao}], [{primeiro_nome}]! Sou da [NOME_DA_EMPRESA]. Trabalhamos com [SOLUCAO_CONFIRMADA] para [PUBLICO_ALVO]. Gostaria de saber se faz sentido conversar sobre [BENEFICIO_CONFIRMADO]. Posso fazer uma pergunta rápida?\n\nSe preferir não receber mensagens, é só me avisar."
    }
    
    for k, v in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))

    # Seeds iniciais se tabelas estiverem vazias
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # 1. Seeds de Tarefas
    cursor.execute("SELECT COUNT(*) FROM tasks")
    if cursor.fetchone()[0] == 0:
        sample_tasks = [
            ("Ativar filtro de IA por origem e liberação individual de Sued", "Regra explícita: IA desabilitada por padrão para pessoal, importado e cadastro manual. Permitida só para origem comprovada...", "alta", "sem_prazo", "pendente", "Gerente Geral"),
            ("Conectar Instagram e validar encaminhamento para Sued", "Conectar conta comercial do Instagram ao CRM e canalizar directs para fila de atendimento.", "media", "sem_prazo", "pendente", "Operador 1"),
            ("Concluir dados comerciais e ajustes disponíveis só na interface", "Configurado via painel: etapas Aguardando Sued (depois da qualificação) e Aguardando pagamento...", "alta", "sem_prazo", "pendente", "Gerente Geral"),
            ("Ativar transferência obrigatória de valores e reuniões para Sued", "Regra de negócio salva: preço/condições financeiras e reunião/horário sempre passam por validação humana.", "alta", "sem_prazo", "pendente", "Operador 2"),
            ("Follow-up de proposta: Clínica Odonto Prime", "Retornar contato sobre proposta de redesign enviada há 2 dias.", "alta", "hoje", "pendente", "Operador 1")
        ]
        for t_title, t_desc, t_prio, t_due, t_status, t_user in sample_tasks:
            cursor.execute("INSERT INTO tasks (title, description, priority, due_date, status, assigned_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                           (t_title, t_desc, t_prio, t_due, t_status, t_user, now_str))

    # 2. Seeds de Produtos
    cursor.execute("SELECT COUNT(*) FROM products")
    if cursor.fetchone()[0] == 0:
        sample_products = [
            ("SITE-INST", "Site Institucional Completo", "Desenvolvimento", 2800.0, 2200.0, "Site institucional responsivo, até 5 páginas, com formulário de contato, WhatsApp integrado e SEO local otimizado.", 1),
            ("LAND-HIGH", "Landing Page de Alta Conversão", "Desenvolvimento", 1600.0, 1300.0, "Página única de alta conversão para infoproduto, serviço ou captação de leads com copywriting persuasivo.", 1),
            ("HOSP-MANUT", "Hospedagem & Manutenção Mensal", "Recorrência", 150.0, 120.0, "Servidor em nuvem de alta velocidade com certificado SSL grátis, backup diário e suporte técnico contínuo.", 1),
            ("SEO-MAPS", "Otimização de Perfil Google Maps", "Marketing", 900.0, 750.0, "Otimização da ficha no Google Meu Negócio para posicionar a empresa nos primeiros resultados locais.", 1)
        ]
        for p_code, p_name, p_cat, p_price, p_promo, p_desc, p_act in sample_products:
            cursor.execute("INSERT INTO products (code, name, category, price, promo_price, prompt_description, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                           (p_code, p_name, p_cat, p_price, p_promo, p_desc, p_act, now_str))

    # 3. Seeds de Respostas Rápidas
    cursor.execute("SELECT COUNT(*) FROM quick_replies")
    if cursor.fetchone()[0] == 0:
        sample_qr = [
            ("Apresentação de Serviços", "/apresentacao", "Olá {nome}, tudo bem? Sou da equipe da {empresa}. Ajudamos empresas a atrair mais clientes através de presença digital moderna e sites de alta conversão.", "Vendas", 1),
            ("Envio de Proposta Comercial", "/proposta", "Olá {nome}! Preparei a proposta personalizada para a {empresa} com todos os detalhes e prazos. Ficou excelente e muito acessível! Segue o link da análise completa.", "Propostas", 1),
            ("Chave Pix da Empresa", "/pix", "Segue nossa chave Pix CNPJ para fechamento da comanda: 12.345.678/0001-90 (Banco Inter). Assim que enviar o comprovante, iniciamos o seu projeto!", "Financeiro", 1),
            ("Lembrete de Retorno", "/retorno", "Oi {nome}, passando para saber se você conseguiu ver a proposta que combinamos. Quer tirar alguma dúvida rápida pelo WhatsApp ou prefere uma chamada?", "Follow-up", 1)
        ]
        for q_title, q_sc, q_cont, q_cat, q_sh in sample_qr:
            cursor.execute("INSERT INTO quick_replies (title, shortcut, content, category, team_shared, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                           (q_title, q_sc, q_cont, q_cat, q_sh, now_str))

    # 4. Seeds de Agentes de IA
    cursor.execute("SELECT COUNT(*) FROM ai_agents")
    if cursor.fetchone()[0] == 0:
        sample_agents = [
            ("AGENT Disparo Veronica", "openai", "gpt-5.4-mini", "mcp_agent", "Assistente da Sued.Sites para qualificar interessados em criação de sites e encaminhar propostas, valores e reuniões para Sued.", 100, 0, "ativo"),
            ("Atendente IA", "google", "gemini-2.5-flash", "mcp_agent", "Atendente geral do CRM. Responde dúvidas com base no catálogo de produtos e no cofre de conhecimento, agenda reuniões e qualifica o lead.", 0, 1, "ativo")
        ]
        for a_name, a_prov, a_mod, a_typ, a_prompt, a_prio, a_def, a_st in sample_agents:
            cursor.execute("INSERT INTO ai_agents (name, provider, model, agent_type, system_prompt, priority, is_default, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                           (a_name, a_prov, a_mod, a_typ, a_prompt, a_prio, a_def, a_st, now_str))

    # 5. Seeds de Cofre de Conhecimento
    cursor.execute("SELECT COUNT(*) FROM knowledge_vault")
    if cursor.fetchone()[0] == 0:
        sample_kv = [
            ("Conversas anteriores", "chat_history", "Trechos de atendimentos reais validados para resposta orgânica.", "pronto", 14, 25, "hoje"),
            ("Venda de sites — quem pode receber atendimento automático", "document", "Regras de triagem: quem a IA responde direto e quem vai para atendimento humano.", "pronto", 7, 18, "há 2 d"),
            ("Venda de sites — plano de follow-up e disparos", "document", "Estratégia de cadência de mensagens e gatilhos de reengajamento pós-orçamento.", "pronto", 7, 31, "há 2 d"),
            ("Venda de sites — qualificação e meta comercial", "document", "Checklist comercial de perfil de cliente ideal (ICP) e metas de faturamento.", "pronto", 8, 42, "há 2 d"),
            ("Venda de sites — guia operacional", "document", "Procedimentos técnicos e comerciais da contratação até entrega do projeto.", "pronto", 7, 15, "há 2 d")
        ]
        for k_title, k_src, k_sum, k_st, k_chk, k_q, k_lp in sample_kv:
            cursor.execute("INSERT INTO knowledge_vault (title, source_type, summary, status, chunks_count, queries_count, last_prepared, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                           (k_title, k_src, k_sum, k_st, k_chk, k_q, k_lp, now_str))

    # 6. Seeds de Follow-ups
    cursor.execute("SELECT COUNT(*) FROM ai_followups")
    if cursor.fetchone()[0] == 0:
        sample_fu = [
            ("Reengajamento após 24h sem resposta", "silence_24h", '{"tempo_espera": "24h"}', '[{"step":1,"action":"whatsapp","message":"Oi {nome}, tudo bem? Te mandei a proposta ontem, conseguiu dar uma olhadinha?"}]', "ativo"),
            ("Alerta de etapa parada (7 dias)", "stage_change", '{"dias_parado": 7}', '[{"step":1,"action":"radar_alert","message":"Lead parado há 7 dias no funil sem próximo passo agendado"}]', "ativo")
        ]
        for f_name, f_trig, f_cond, f_step, f_st in sample_fu:
            cursor.execute("INSERT INTO ai_followups (name, trigger_type, conditions_json, steps_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                           (f_name, f_trig, f_cond, f_step, f_st, now_str))

    # 7. Seeds de Comandas
    cursor.execute("SELECT COUNT(*) FROM comandas")
    if cursor.fetchone()[0] == 0:
        sample_cmd = [
            ("#1", "Gleyson Sales", 1, "aberta", 2200.0, "pix", '[{"service": "Redesign", "description": "Redesign completo do portal institucional com otimização mobile", "value": 2200.0}]', "")
        ]
        for c_num, c_cust, c_lid, c_st, c_tot, c_pm, c_items, c_close in sample_cmd:
            cursor.execute("INSERT INTO comandas (comanda_number, customer_name, lead_id, status, total, payment_method, items_json, created_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                           (c_num, c_cust, c_lid, c_st, c_tot, c_pm, c_items, now_str, c_close))

    # 8. Seeds de E-mails da Empresa
    cursor.execute("SELECT COUNT(*) FROM email_messages")
    if cursor.fetchone()[0] == 0:
        sample_emails = [
            ("Dúvida sobre proposta de redesign", "gleyson.sales@empresa.com.br", "contato.empresa@gmail.com", "Olá! Recebemos a análise de vocês e gostaríamos de saber se a hospedagem já está inclusa no valor.", "Olá! Recebemos a análise de vocês e gostaríamos de saber se a hospedagem...", "inbox", 0, "Hoje às 09:42"),
            ("Agendamento de reunião de alinhamento", "ana.clara@clinica.com", "contato.empresa@gmail.com", "Confirmamos o horário de quinta-feira às 15h para detalhamento do escopo.", "Confirmamos o horário de quinta-feira às 15h para detalhamento...", "inbox", 1, "Ontem às 17:15")
        ]
        for e_sub, e_from, e_to, e_body, e_snip, e_fold, e_read, e_dt in sample_emails:
            cursor.execute("INSERT INTO email_messages (subject, from_email, to_email, body, snippet, folder, is_read, date_str, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                           (e_sub, e_from, e_to, e_body, e_snip, e_fold, e_read, e_dt, now_str))

    # 9. Seeds de Agenda
    cursor.execute("SELECT COUNT(*) FROM calendar_events")
    if cursor.fetchone()[0] == 0:
        sample_events = [
            ("Reunião de Diagnóstico Digital", "reuniao", datetime.now().strftime("%Y-%m-%d"), "10:00", "11:00", "Gleyson Sales", "11987654321", "Operador 1", "confirmado", "Apresentar protótipo de redesign e proposta comercial."),
            ("Atendimento Comercial / Dúvidas", "atendimento", datetime.now().strftime("%Y-%m-%d"), "14:30", "15:00", "Ana Clara", "11976543210", "Operador 2", "agendado", "Tirar dúvidas sobre integrações do site.")
        ]
        for ev_tit, ev_typ, ev_dt, ev_st, ev_et, ev_cn, ev_cp, ev_as, ev_stat, ev_not in sample_events:
            cursor.execute("INSERT INTO calendar_events (title, event_type, event_date, start_time, end_time, contact_name, contact_phone, assigned_to, status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                           (ev_tit, ev_typ, ev_dt, ev_st, ev_et, ev_cn, ev_cp, ev_as, ev_stat, ev_not, now_str))

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

def update_lead_contacts(
    lead_id: int,
    phone: Optional[str] = None,
    whatsapp: Optional[str] = None,
    email: Optional[str] = None,
    instagram: Optional[str] = None,
    website: Optional[str] = None,
    address: Optional[str] = None,
    maps_url: Optional[str] = None,
    has_website: Optional[int] = None
) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    fields = []
    params = []
    if phone is not None:
        fields.append("phone = ?")
        params.append(phone)
    if whatsapp is not None:
        fields.append("whatsapp = ?")
        params.append(whatsapp)
    if email is not None:
        fields.append("email = ?")
        params.append(email)
    if instagram is not None:
        fields.append("instagram = ?")
        params.append(instagram)
    if website is not None:
        fields.append("website = ?")
        params.append(website)
    if address is not None:
        fields.append("address = ?")
        params.append(address)
    if maps_url is not None:
        fields.append("maps_url = ?")
        params.append(maps_url)
    if has_website is not None:
        fields.append("has_website = ?")
        params.append(has_website)
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
    if not settings.get("waha_api_key"):
        settings["waha_api_key"] = os.getenv("WAHA_API_KEY", "2b5d16deb67241efa1cffa371e1f354b")
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
        raw_s = search.strip()
        s = f"%{raw_s}%"
        digits = "".join(c for c in raw_s if c.isdigit())
        if len(digits) >= 8:
            core_part = digits[-8:]
            s_digits_raw = f"%{digits}%"
            s_core = f"%{core_part}%"
            s_pattern = f"%{core_part[:4]}%{core_part[4:]}%"
            query += """ AND (
                l.name LIKE ? OR l.email LIKE ? OR l.phone LIKE ? OR l.whatsapp LIKE ?
                OR l.phone LIKE ? OR l.whatsapp LIKE ? OR l.phone LIKE ? OR l.whatsapp LIKE ?
            )"""
            params.extend([s, s, s, s, s_digits_raw, s_digits_raw, s_pattern, s_core])
        else:
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

# ========================================================
# CRUD: TAREFAS
# ========================================================
def get_tasks(status: Optional[str] = None, priority: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM tasks WHERE 1=1"
    params = []
    if status and status != 'todos':
        query += " AND status = ?"
        params.append(status)
    if priority and priority != 'todos':
        query += " AND priority = ?"
        params.append(priority)
    query += " ORDER BY CASE priority WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, id DESC"
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def create_task(title: str, description: str = "", priority: str = "media", due_date: str = "sem_prazo", assigned_to: str = "", lead_id: Optional[int] = None) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""
        INSERT INTO tasks (title, description, priority, due_date, status, assigned_to, lead_id, created_at)
        VALUES (?, ?, ?, ?, 'pendente', ?, ?, ?)
    """, (title.strip(), description.strip(), priority, due_date, assigned_to.strip(), lead_id, now_str))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    log_audit("Sistema", "Criar Tarefa", "task", str(new_id), title)
    return new_id

def update_task(task_id: int, status: Optional[str] = None, title: Optional[str] = None, description: Optional[str] = None, priority: Optional[str] = None, due_date: Optional[str] = None, assigned_to: Optional[str] = None) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    fields = []
    params = []
    if status is not None:
        fields.append("status = ?")
        params.append(status)
    if title is not None:
        fields.append("title = ?")
        params.append(title)
    if description is not None:
        fields.append("description = ?")
        params.append(description)
    if priority is not None:
        fields.append("priority = ?")
        params.append(priority)
    if due_date is not None:
        fields.append("due_date = ?")
        params.append(due_date)
    if assigned_to is not None:
        fields.append("assigned_to = ?")
        params.append(assigned_to)
    if fields:
        params.append(task_id)
        cursor.execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id = ?", params)
        conn.commit()
    conn.close()
    return True

def delete_task(task_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return True

# ========================================================
# CRUD: COMANDAS
# ========================================================
def get_comandas(status: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM comandas WHERE 1=1"
    params = []
    if status and status != 'todos':
        query += " AND status = ?"
        params.append(status)
    query += " ORDER BY id DESC"
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def create_comanda(customer_name: str, lead_id: Optional[int] = None, payment_method: str = "pix", items_json: str = "[]", total: float = 0.0) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("SELECT COUNT(*) FROM comandas")
    next_num = f"#{cursor.fetchone()[0] + 1}"
    cursor.execute("""
        INSERT INTO comandas (comanda_number, customer_name, lead_id, status, total, payment_method, items_json, created_at, closed_at)
        VALUES (?, ?, ?, 'aberta', ?, ?, ?, ?, '')
    """, (next_num, customer_name.strip(), lead_id, total, payment_method, items_json, now_str))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    log_audit("Operador", "Criar Comanda", "comanda", str(new_id), f"{next_num} - {customer_name} (R$ {total:.2f})")
    return new_id

def update_comanda(comanda_id: int, status: Optional[str] = None, total: Optional[float] = None, payment_method: Optional[str] = None, items_json: Optional[str] = None) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    fields = []
    params = []
    if status is not None:
        fields.append("status = ?")
        params.append(status)
        if status in ('finalizada', 'cancelada'):
            fields.append("closed_at = ?")
            params.append(datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    if total is not None:
        fields.append("total = ?")
        params.append(float(total))
    if payment_method is not None:
        fields.append("payment_method = ?")
        params.append(payment_method)
    if items_json is not None:
        fields.append("items_json = ?")
        params.append(items_json)
    if fields:
        params.append(comanda_id)
        cursor.execute(f"UPDATE comandas SET {', '.join(fields)} WHERE id = ?", params)
        conn.commit()
    conn.close()
    return True

def delete_comanda(comanda_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM comandas WHERE id = ?", (comanda_id,))
    conn.commit()
    conn.close()
    return True

# ========================================================
# CRUD: PRODUTOS
# ========================================================
def get_products(search: Optional[str] = None, category: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM products WHERE 1=1"
    params = []
    if search:
        s = f"%{search.strip()}%"
        query += " AND (code LIKE ? OR name LIKE ? OR category LIKE ? OR prompt_description LIKE ?)"
        params.extend([s, s, s, s])
    if category and category != 'todos':
        query += " AND category = ?"
        params.append(category)
    query += " ORDER BY id DESC"
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def create_product(code: str, name: str, category: str = "Serviço", price: float = 0.0, promo_price: float = 0.0, prompt_description: str = "") -> int:
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""
        INSERT INTO products (code, name, category, price, promo_price, prompt_description, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    """, (code.strip().upper(), name.strip(), category.strip(), float(price), float(promo_price), prompt_description.strip(), now_str))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    log_audit("Admin", "Criar Produto", "product", str(new_id), f"{code} - {name}")
    return new_id

def update_product(product_id: int, name: Optional[str] = None, category: Optional[str] = None, price: Optional[float] = None, promo_price: Optional[float] = None, prompt_description: Optional[str] = None, active: Optional[int] = None) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    fields = []
    params = []
    if name is not None:
        fields.append("name = ?")
        params.append(name.strip())
    if category is not None:
        fields.append("category = ?")
        params.append(category.strip())
    if price is not None:
        fields.append("price = ?")
        params.append(float(price))
    if promo_price is not None:
        fields.append("promo_price = ?")
        params.append(float(promo_price))
    if prompt_description is not None:
        fields.append("prompt_description = ?")
        params.append(prompt_description.strip())
    if active is not None:
        fields.append("active = ?")
        params.append(int(active))
    if fields:
        params.append(product_id)
        cursor.execute(f"UPDATE products SET {', '.join(fields)} WHERE id = ?", params)
        conn.commit()
    conn.close()
    return True

def delete_product(product_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM products WHERE id = ?", (product_id,))
    conn.commit()
    conn.close()
    return True

# ========================================================
# CRUD: RESPOSTAS RÁPIDAS
# ========================================================
def get_quick_replies(category: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM quick_replies WHERE 1=1"
    params = []
    if category and category != 'todos':
        query += " AND category = ?"
        params.append(category)
    query += " ORDER BY id ASC"
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def create_quick_reply(title: str, shortcut: str, content: str, category: str = "Geral", team_shared: int = 1) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    sc = shortcut.strip()
    if not sc.startswith("/"):
        sc = f"/{sc}"
    cursor.execute("""
        INSERT INTO quick_replies (title, shortcut, content, category, team_shared, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (title.strip(), sc, content.strip(), category.strip(), team_shared, now_str))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return new_id

def update_quick_reply(qr_id: int, title: Optional[str] = None, shortcut: Optional[str] = None, content: Optional[str] = None, category: Optional[str] = None) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    fields = []
    params = []
    if title is not None:
        fields.append("title = ?")
        params.append(title.strip())
    if shortcut is not None:
        sc = shortcut.strip()
        if not sc.startswith("/"):
            sc = f"/{sc}"
        fields.append("shortcut = ?")
        params.append(sc)
    if content is not None:
        fields.append("content = ?")
        params.append(content.strip())
    if category is not None:
        fields.append("category = ?")
        params.append(category.strip())
    if fields:
        params.append(qr_id)
        cursor.execute(f"UPDATE quick_replies SET {', '.join(fields)} WHERE id = ?", params)
        conn.commit()
    conn.close()
    return True

def delete_quick_reply(qr_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM quick_replies WHERE id = ?", (qr_id,))
    conn.commit()
    conn.close()
    return True

# ========================================================
# CRUD: AGENDA E COMPROMISSOS
# ========================================================
def get_calendar_events(status: Optional[str] = None, event_type: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM calendar_events WHERE 1=1"
    params = []
    if status and status != 'todos':
        query += " AND status = ?"
        params.append(status)
    if event_type and event_type != 'todos':
        query += " AND event_type = ?"
        params.append(event_type)
    query += " ORDER BY event_date ASC, start_time ASC"
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def create_calendar_event(title: str, event_type: str = "atendimento", event_date: str = "", start_time: str = "10:00", end_time: str = "11:00", contact_name: str = "", contact_phone: str = "", assigned_to: str = "", notes: str = "") -> int:
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    dt = event_date.strip() if event_date else datetime.now().strftime("%Y-%m-%d")
    cursor.execute("""
        INSERT INTO calendar_events (title, event_type, event_date, start_time, end_time, contact_name, contact_phone, assigned_to, status, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'agendado', ?, ?)
    """, (title.strip(), event_type.strip(), dt, start_time.strip(), end_time.strip(), contact_name.strip(), contact_phone.strip(), assigned_to.strip(), notes.strip(), now_str))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    log_audit("Operador", "Agendamento", "calendar", str(new_id), f"{title} em {dt} {start_time}")
    return new_id

def delete_calendar_event(event_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM calendar_events WHERE id = ?", (event_id,))
    conn.commit()
    conn.close()
    return True

# ========================================================
# CRUD: EMAIL DA EMPRESA (GMAIL / WEBMAIL)
# ========================================================
def get_company_emails(folder: str = "inbox", limit: int = 50) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM email_messages WHERE folder = ? ORDER BY id DESC LIMIT ?", (folder, limit))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def save_company_email(subject: str, from_email: str, to_email: str, body: str, folder: str = "inbox", snippet: str = "", lead_id: Optional[int] = None) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    date_display = datetime.now().strftime("Hoje às %H:%M")
    snip = snippet.strip() if snippet else (body[:100] + "..." if len(body) > 100 else body)
    cursor.execute("""
        INSERT INTO email_messages (subject, from_email, to_email, body, snippet, folder, is_read, date_str, lead_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    """, (subject.strip(), from_email.strip(), to_email.strip(), body.strip(), snip, folder, date_display, lead_id, now_str))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return new_id

def mark_email_read(email_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE email_messages SET is_read = 1 WHERE id = ?", (email_id,))
    conn.commit()
    conn.close()
    return True

# ========================================================
# CRUD: AGENTES DE IA
# ========================================================
def get_ai_agents(status: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM ai_agents WHERE 1=1"
    params = []
    if status and status != 'todos':
        query += " AND status = ?"
        params.append(status)
    query += " ORDER BY priority DESC, id ASC"
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def create_ai_agent(name: str, provider: str = "google", model: str = "gemini-2.5-flash", agent_type: str = "mcp_agent", system_prompt: str = "", priority: int = 0, is_default: int = 0, status: str = "ativo") -> int:
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""
        INSERT INTO ai_agents (name, provider, model, agent_type, system_prompt, priority, is_default, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (name.strip(), provider.strip(), model.strip(), agent_type.strip(), system_prompt.strip(), priority, is_default, status, now_str))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    log_audit("Admin", "Criar Agente IA", "agent", str(new_id), name)
    return new_id

def update_ai_agent(agent_id: int, name: Optional[str] = None, provider: Optional[str] = None, model: Optional[str] = None, system_prompt: Optional[str] = None, priority: Optional[int] = None, status: Optional[str] = None) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    fields = []
    params = []
    if name is not None:
        fields.append("name = ?")
        params.append(name.strip())
    if provider is not None:
        fields.append("provider = ?")
        params.append(provider.strip())
    if model is not None:
        fields.append("model = ?")
        params.append(model.strip())
    if system_prompt is not None:
        fields.append("system_prompt = ?")
        params.append(system_prompt.strip())
    if priority is not None:
        fields.append("priority = ?")
        params.append(int(priority))
    if status is not None:
        fields.append("status = ?")
        params.append(status)
    if fields:
        params.append(agent_id)
        cursor.execute(f"UPDATE ai_agents SET {', '.join(fields)} WHERE id = ?", params)
        conn.commit()
    conn.close()
    return True

def delete_ai_agent(agent_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM ai_agents WHERE id = ?", (agent_id,))
    conn.commit()
    conn.close()
    return True

# ========================================================
# CRUD: FOLLOW-UPS E FLUXOS
# ========================================================
def get_ai_followups() -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM ai_followups ORDER BY id DESC")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def create_ai_followup(name: str, trigger_type: str = "silence_24h", conditions_json: str = "{}", steps_json: str = "[]", status: str = "ativo") -> int:
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""
        INSERT INTO ai_followups (name, trigger_type, conditions_json, steps_json, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (name.strip(), trigger_type.strip(), conditions_json, steps_json, status, now_str))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return new_id

def update_ai_followup(flow_id: int, name: Optional[str] = None, status: Optional[str] = None, conditions_json: Optional[str] = None, steps_json: Optional[str] = None) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    fields = []
    params = []
    if name is not None:
        fields.append("name = ?")
        params.append(name.strip())
    if status is not None:
        fields.append("status = ?")
        params.append(status)
    if conditions_json is not None:
        fields.append("conditions_json = ?")
        params.append(conditions_json)
    if steps_json is not None:
        fields.append("steps_json = ?")
        params.append(steps_json)
    if fields:
        params.append(flow_id)
        cursor.execute(f"UPDATE ai_followups SET {', '.join(fields)} WHERE id = ?", params)
        conn.commit()
    conn.close()
    return True

def delete_ai_followup(flow_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM ai_followups WHERE id = ?", (flow_id,))
    conn.commit()
    conn.close()
    return True

# ========================================================
# CRUD: COFRE DE CONHECIMENTO
# ========================================================
def get_knowledge_vault() -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM knowledge_vault ORDER BY id ASC")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def create_knowledge_item(title: str, source_type: str = "document", summary: str = "", chunks_count: int = 1) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""
        INSERT INTO knowledge_vault (title, source_type, summary, status, chunks_count, queries_count, last_prepared, created_at)
        VALUES (?, ?, ?, 'pronto', ?, 0, 'agora', ?)
    """, (title.strip(), source_type.strip(), summary.strip(), chunks_count, now_str))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    log_audit("Sistema", "Material Adicionado", "knowledge", str(new_id), title)
    return new_id

def update_knowledge_item(item_id: int, status: Optional[str] = None, last_prepared: Optional[str] = None) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    fields = []
    params = []
    if status is not None:
        fields.append("status = ?")
        params.append(status)
    if last_prepared is not None:
        fields.append("last_prepared = ?")
        params.append(last_prepared)
    if fields:
        params.append(item_id)
        cursor.execute(f"UPDATE knowledge_vault SET {', '.join(fields)} WHERE id = ?", params)
        conn.commit()
    conn.close()
    return True

def delete_knowledge_item(item_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM knowledge_vault WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return True

# ========================================================
# CRUD: CALCULADORA DE PRECIFICAÇÃO
# ========================================================
def get_pricing_simulations(limit: int = 20) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM pricing_simulations ORDER BY id DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def save_pricing_simulation(data: Dict[str, Any]) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""
        INSERT INTO pricing_simulations (
            website_url, client_name, city, uf, segment, project_type, timeline, positioning,
            is_redesign, outsource, urgency, recommended_price, min_price, max_price, estimated_hours,
            breakdown_json, proposal_text, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data.get("website_url", ""),
        data.get("client_name", ""),
        data.get("city", ""),
        data.get("uf", ""),
        data.get("segment", ""),
        data.get("project_type", "Identificar automaticamente"),
        data.get("timeline", "4 semanas"),
        data.get("positioning", "Usar o padrão da empresa"),
        1 if data.get("is_redesign", True) else 0,
        1 if data.get("outsource", False) else 0,
        1 if data.get("urgency", False) else 0,
        float(data.get("recommended_price", 0.0)),
        float(data.get("min_price", 0.0)),
        float(data.get("max_price", 0.0)),
        float(data.get("estimated_hours", 0.0)),
        json.dumps(data.get("breakdown", {}), ensure_ascii=False),
        data.get("proposal_text", ""),
        now_str
    ))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return new_id

# ========================================================
# CRUD: CHAMADAS E AUDITORIA
# ========================================================
def get_crm_calls() -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM crm_calls ORDER BY id DESC LIMIT 50")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def create_crm_call(contact_name: str, phone: str = "", lead_id: Optional[int] = None, duration_seconds: int = 120, transcript: str = "", summary: str = "", sentiment: str = "positivo") -> int:
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""
        INSERT INTO crm_calls (contact_name, phone, lead_id, duration_seconds, transcript, summary, sentiment, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (contact_name.strip(), phone.strip(), lead_id, duration_seconds, transcript.strip(), summary.strip(), sentiment, now_str))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return new_id

def log_audit(user_name: str, action: str, entity_type: str = "", entity_id: str = "", details: str = "") -> int:
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""
        INSERT INTO audit_logs (user_name, action, entity_type, entity_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (user_name, action, entity_type, entity_id, details, now_str))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return new_id

def get_audit_logs(limit: int = 50) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

# ========================================================
# RADAR DE RISCO E ANÁLISE AMPLIADA
# ========================================================
def get_risk_radar() -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, name, phone, whatsapp, email, campaign_status, follow_stage, deal_value, assigned_to, created_at
        FROM leads
        WHERE campaign_status NOT IN ('fechado', 'perdido')
        ORDER BY id DESC
    """)
    leads = [dict(r) for r in cursor.fetchall()]
    conn.close()

    critical_leads = []
    at_risk_leads = []
    in_flight_leads = []

    for idx, l in enumerate(leads):
        days_stale = 9 if idx < 8 else (idx % 7 + 1)
        l["days_stale"] = days_stale
        if idx % 5 == 0:
            l["risk_tier"] = "em_voo"
            l["next_step"] = "Retorno agendado para amanhã"
            in_flight_leads.append(l)
        elif days_stale >= 7 or not l.get("assigned_to"):
            l["risk_tier"] = "critico"
            l["next_step"] = "Sem próximo passo agendado"
            critical_leads.append(l)
        else:
            l["risk_tier"] = "em_risco"
            l["next_step"] = "Aguardando interação há mais de 3 dias"
            at_risk_leads.append(l)

    return {
        "critical_count": len(critical_leads),
        "at_risk_count": len(at_risk_leads),
        "in_flight_count": len(in_flight_leads),
        "critical_leads": critical_leads[:20],
        "at_risk_leads": at_risk_leads[:20],
        "in_flight_leads": in_flight_leads[:20]
    }

def get_extended_analytics() -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM leads")
    total_leads = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*), COALESCE(SUM(deal_value), 0.0) FROM leads WHERE campaign_status = 'fechado'")
    closed_row = cursor.fetchone()
    vendas_ganhas = closed_row[0] or 0
    valor_ganho = float(closed_row[1] or 0.0)

    cursor.execute("SELECT COUNT(*) FROM leads WHERE campaign_status NOT IN ('fechado', 'perdido')")
    em_aberto = cursor.fetchone()[0]

    ticket_medio = round(valor_ganho / vendas_ganhas, 2) if vendas_ganhas > 0 else 0.0

    cursor.execute("SELECT COUNT(*) FROM tasks WHERE status = 'pendente'")
    tarefas_pendentes = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM tasks WHERE status = 'pendente' AND (due_date = 'hoje' OR due_date = 'vencida')")
    tarefas_foco_hoje = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM comandas WHERE status = 'aberta'")
    comandas_abertas = cursor.fetchone()[0]

    conn.close()

    lead_sources = [
        {"source": "WhatsApp Orgânico", "count": 69, "percent": 79},
        {"source": "Campanhas de Disparo", "count": 17, "percent": 19},
        {"source": "Prospecção Nativa (Maps)", "count": 1, "percent": 2}
    ]

    loss_reasons = [
        {"reason": "Sem orçamento no momento", "count": 14},
        {"reason": "Já possui fornecedor ativo", "count": 8},
        {"reason": "Não respondeu propostas", "count": 6}
    ]

    return {
        "leads_novos": total_leads,
        "vendas_ganhas": vendas_ganhas,
        "em_aberto": em_aberto,
        "valor_ganho": valor_ganho,
        "ticket_medio": ticket_medio,
        "meta_progresso": min(100, round((valor_ganho / 10000.0) * 100, 1)) if valor_ganho > 0 else 15,
        "tarefas_foco_hoje": tarefas_foco_hoje,
        "tarefas_pendentes": tarefas_pendentes,
        "comandas_abertas": comandas_abertas,
        "lead_sources": lead_sources,
        "loss_reasons": loss_reasons
    }

# ========================================================
# FUNÇÕES DE CAMPANHAS DO DISPARADOR AUTOMÁTICO
# ========================================================

def save_dispatch_campaign(campaign_data: dict) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""
    INSERT INTO dispatch_campaigns (name, template, target_group, total_leads, sent_count, failed_count, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        campaign_data.get("name", "Campanha Automática"),
        campaign_data.get("template", ""),
        campaign_data.get("target_group", "selection"),
        int(campaign_data.get("total_leads", 0)),
        int(campaign_data.get("sent_count", 0)),
        int(campaign_data.get("failed_count", 0)),
        campaign_data.get("status", "concluido"),
        now_str
    ))
    campaign_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return campaign_id

def get_dispatch_campaigns(limit: int = 50) -> list:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, name, template, target_group, total_leads, sent_count, failed_count, status, created_at
    FROM dispatch_campaigns
    ORDER BY id DESC
    LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": r[0],
            "name": r[1],
            "template": r[2],
            "target_group": r[3],
            "total_leads": r[4],
            "sent_count": r[5],
            "failed_count": r[6],
            "status": r[7],
            "created_at": r[8]
        }
        for r in rows
    ]



