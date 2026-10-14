-- ===================================================================
-- SCHEMA SUPABASE / POSTGRESQL — KAPTADOR B2B LEADS & CRM
-- Execute este script no SQL Editor do Supabase (https://supabase.com/dashboard)
-- ===================================================================

-- 1. Tabela de buscas/varreduras (Histórico)
CREATE TABLE IF NOT EXISTS public.scans (
    id BIGSERIAL PRIMARY KEY,
    niche TEXT NOT NULL,
    location TEXT NOT NULL,
    total_found INTEGER DEFAULT 0,
    no_website_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabela de leads capturados
CREATE TABLE IF NOT EXISTS public.leads (
    id BIGSERIAL PRIMARY KEY,
    scan_id BIGINT REFERENCES public.scans (id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    whatsapp TEXT DEFAULT '',
    email TEXT DEFAULT '',
    website TEXT DEFAULT '',
    has_website INTEGER DEFAULT 1,
    address TEXT DEFAULT '',
    category TEXT DEFAULT '',
    instagram TEXT DEFAULT '',
    opportunity_score INTEGER DEFAULT 50,
    campaign_status TEXT DEFAULT 'novo',
    follow_stage TEXT DEFAULT 'contato',
    notes TEXT DEFAULT '',
    deal_value NUMERIC(12, 2) DEFAULT 0.0,
    assigned_to TEXT DEFAULT '',
    closed_at TEXT DEFAULT '',
    photos TEXT DEFAULT '[]',
    maps_url TEXT DEFAULT '',
    google_url TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabela de usuários para login e colaboração de operadores
CREATE TABLE IF NOT EXISTS public.users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'operador',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Tabela de sessões ativas
CREATE TABLE IF NOT EXISTS public.sessions (
    token TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- 5. Tabela de mensagens (Histórico unificado WhatsApp, E-mail e Site)
CREATE TABLE IF NOT EXISTS public.messages (
    id BIGSERIAL PRIMARY KEY,
    lead_id BIGINT REFERENCES public.leads (id) ON DELETE CASCADE,
    channel TEXT DEFAULT 'whatsapp',
    direction TEXT DEFAULT 'outgoing',
    sender TEXT DEFAULT '',
    recipient TEXT DEFAULT '',
    subject TEXT DEFAULT '',
    body TEXT NOT NULL,
    status TEXT DEFAULT 'sent',
    error_message TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Tabela de configurações
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- ===================================================================
-- SEED DE CONFIGURAÇÕES INICIAIS
-- ===================================================================
INSERT INTO public.settings (key, value) VALUES
    ('delay_between_requests', '1.5'),
    ('request_timeout', '10'),
    ('max_leads_per_scan', '20'),
    ('deep_scrape', 'true'),
    ('google_places_api_key', ''),
    ('apify_token', ''),
    ('pitch_template', 'Olá, tudo bem? Vi a empresa {empresa} em {localizacao} e notei uma grande oportunidade de atrair novos clientes com um site moderno de alta conversão. Gostaria de ver uma prévia sem compromisso?'),
    ('waha_base_url', 'http://localhost:3000'),
    ('waha_session', 'default'),
    ('waha_api_key', '2b5d16deb67241efa1cffa371e1f354b'),
    ('waha_min_delay', '15'),
    ('waha_max_delay', '35'),
    ('auth_required', 'false'),
    ('excluded_brands', 'smart fit, smartfit, skyfit, bluefit, panobianco, bio ritmo, nubank, itau, bradesco, santander, banco do brasil, caixa economica, droga raia, drogasil, pague menos, mcdonald, burger king, subway, habib, cacau show, carrefour, casas bahia, magalu, renner, c&a, havan, petz, cobasi, unimed'),
    ('default_channel', 'whatsapp'),
    ('smtp_host', ''),
    ('smtp_port', '587'),
    ('smtp_user', ''),
    ('smtp_password', ''),
    ('smtp_from_name', 'Kaptador Comercial'),
    ('smtp_use_tls', 'true'),
    ('email_subject_template', 'Oportunidade Comercial: Presença Digital para {empresa}'),
    ('email_body_template', 'Olá equipe da {empresa},\n\nNotamos que sua empresa em {localizacao} possui grande potencial de atração de novos clientes com uma presença digital otimizada.\n\nPodemos apresentar uma proposta comercial personalizada sem compromisso?\n\nAtenciosamente,\nEquipe Comercial'),
    ('site_default_message', 'Olá! Localizamos sua empresa {empresa} em {localizacao} e gostaríamos de apresentar uma solução moderna para captação de clientes.'),
    ('site_operator_name', 'Equipe de Atendimento'),
    ('site_contact_phone', '')
ON CONFLICT (key) DO NOTHING;

-- Índices de Performance
CREATE INDEX IF NOT EXISTS idx_leads_scan_id ON public.leads(scan_id);
CREATE INDEX IF NOT EXISTS idx_leads_has_website ON public.leads(has_website);
CREATE INDEX IF NOT EXISTS idx_leads_campaign_status ON public.leads(campaign_status);
CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON public.messages(lead_id);
