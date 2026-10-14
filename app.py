import os
import io
import json
import asyncio
import subprocess
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Optional, Dict, Any, Union, List
from fastapi import FastAPI, Request, Query, BackgroundTasks, Body
from fastapi.responses import HTMLResponse, StreamingResponse, Response, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, field_validator, ConfigDict
import pandas as pd
import httpx
import base64

from fastapi.middleware.cors import CORSMiddleware
import database
from scraper import LeadScraper
from city_service import search_cities

# Inicializa banco de dados
database.init_db()

app = FastAPI(title="KAPTADOR - B2B Lead Harvester & Sales Engine", version="2.2.0")

@app.get("/favicon.ico", include_in_schema=False)
async def get_favicon():
    return FileResponse("static/img/favicon.svg", media_type="image/svg+xml")

@app.get("/api/cities")
async def api_get_cities(q: str = Query("", description="Termo de busca para cidades brasileiras")):
    """Retorna sugestões de cidades brasileiras no formato 'Cidade - UF'"""
    return search_cities(q.strip(), limit=15)

# Suporte a CORS para uso online e em rede local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pastas estáticas e templates
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

try:
    os.makedirs(STATIC_DIR, exist_ok=True)
    os.makedirs(TEMPLATES_DIR, exist_ok=True)
    os.makedirs(os.path.join(STATIC_DIR, "css"), exist_ok=True)
    os.makedirs(os.path.join(STATIC_DIR, "js"), exist_ok=True)
except OSError:
    pass

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

def clean_brl_value(v):
    if v is None or v == "":
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip().replace("R$", "").replace("r$", "").strip()
        if "." in s and "," in s:
            s = s.replace(".", "").replace(",", ".")
        elif "," in s:
            s = s.replace(",", ".")
        elif "." in s and len(s.split(".")[1]) == 3:
            s = s.replace(".", "")
        try:
            return float(s)
        except ValueError:
            return 0.0
    return 0.0

class LeadStatusUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    follow_stage: Optional[str] = None
    deal_value: Optional[Union[float, int, str]] = None
    assigned_to: Optional[str] = None

    @field_validator("deal_value", mode="before")
    @classmethod
    def parse_deal(cls, v):
        return clean_brl_value(v)

class OperatorCreatePayload(BaseModel):
    username: str
    name: str
    password: Optional[str] = "senha123"
    role: Optional[str] = "operador"

class OperatorUpdatePayload(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None

class SettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="allow")
    delay_between_requests: Optional[str] = "1.5"
    request_timeout: Optional[str] = "10"
    max_leads_per_scan: Optional[str] = "20"
    google_places_api_key: Optional[str] = ""
    apify_token: Optional[str] = ""
    pitch_template: Optional[str] = ""
    waha_base_url: Optional[str] = "http://localhost:3000"
    waha_session: Optional[str] = "default"
    waha_api_key: Optional[str] = ""
    waha_min_delay: Optional[str] = "15"
    waha_max_delay: Optional[str] = "35"
    auth_required: Optional[str] = "false"
    excluded_brands: Optional[str] = ""
    default_channel: Optional[str] = "whatsapp"
    smtp_host: Optional[str] = ""
    smtp_port: Optional[str] = "587"
    smtp_user: Optional[str] = ""
    smtp_password: Optional[str] = ""
    smtp_from_name: Optional[str] = "Kaptador Comercial"
    smtp_use_tls: Optional[str] = "true"
    email_subject_template: Optional[str] = ""
    email_body_template: Optional[str] = ""
    site_default_message: Optional[str] = ""
    site_operator_name: Optional[str] = ""
    site_contact_phone: Optional[str] = ""
    gmail_account: Optional[str] = ""
    gmail_connected: Optional[str] = "false"
    google_calendar_account: Optional[str] = ""
    google_drive_folder: Optional[str] = ""
    openai_api_key: Optional[str] = ""
    gemini_api_key: Optional[str] = ""
    claude_api_key: Optional[str] = ""
    groq_api_key: Optional[str] = ""
    pricing_base_hour: Optional[str] = "90.0"
    pricing_urgency_rate: Optional[str] = "20.0"
    pricing_outsource_margin: Optional[str] = "30.0"
    meta_pixel_id: Optional[str] = ""
    meta_access_token: Optional[str] = ""
    curator_instructions: Optional[str] = ""
    disparador_empresa_nome: Optional[str] = "Kaptador"
    disparador_solucao: Optional[str] = "modernização de sites e captação de clientes"
    disparador_publico_alvo: Optional[str] = "líderes do setor"
    disparador_beneficio: Optional[str] = "aumentar o faturamento através de contatos qualificados"
    disparador_opt_out: Optional[str] = "true"
    disparador_opt_out_text: Optional[str] = "Se preferir não receber mensagens, é só me avisar."
    disparador_template: Optional[str] = ""

class WahaSendRequest(BaseModel):
    chatId: str
    text: str
    session: Optional[str] = None
    lead_id: Optional[int] = None
    follow_stage: Optional[str] = None

class ChatSendPayload(BaseModel):
    lead_id: Optional[int] = None
    channel: Optional[str] = "whatsapp"  # "whatsapp", "email", "site"
    text: str
    subject: Optional[str] = ""
    recipient: Optional[str] = ""
    phone: Optional[str] = ""
    follow_stage: Optional[str] = None

class CreateChatContactPayload(BaseModel):
    name: str
    phone: str
    email: Optional[str] = ""
    notes: Optional[str] = ""
    initial_message: Optional[str] = ""
    send_now: Optional[bool] = False
    channel: Optional[str] = "whatsapp"

class EmailTestPayload(BaseModel):
    smtp_host: str
    smtp_port: Optional[str] = "587"
    smtp_user: Optional[str] = ""
    smtp_password: Optional[str] = ""
    smtp_use_tls: Optional[str] = "true"
    test_recipient: Optional[str] = None

class LoginPayload(BaseModel):
    username: str
    password: str

class UserUpdatePayload(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None

class OperatorSwitchPayload(BaseModel):
    operator_name: str

class CleanupPayload(BaseModel):
    mode: Optional[str] = "all"  # "keep_closed", "keep_new", "all"
    scan_id: Optional[int] = None

# ==========================================
# ROTAS DE AUTENTICAÇÃO & MULTI-USUÁRIO (ONLINE)
# ==========================================

@app.post("/api/auth/login")
async def api_login(payload: LoginPayload, response: Response):
    user = database.authenticate_user(payload.username, payload.password)
    if not user:
        return {"success": False, "error": "Usuário ou senha incorretos."}
    token = database.create_session(user["id"])
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        max_age=60*60*24*30,
        samesite="lax",
        path="/"
    )
    return {"success": True, "user": user, "token": token}

@app.post("/api/auth/logout")
async def api_logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        database.delete_session(token)
    response.delete_cookie("session_token", path="/")
    return {"success": True}

@app.post("/api/admin/login")
async def api_admin_login(payload: LoginPayload, response: Response):
    user = database.authenticate_user(payload.username, payload.password)
    if not user:
        return Response(
            content=json.dumps({"success": False, "error": "Credenciais incorretas. Verifique a senha do gerente."}),
            status_code=401,
            media_type="application/json"
        )
    if user.get("role") not in ("admin", "gerente"):
        return Response(
            content=json.dumps({"success": False, "error": "Este usuário não possui permissão de Gerente."}),
            status_code=403,
            media_type="application/json"
        )
    token = database.create_session(user["id"])
    response.set_cookie(
        key="admin_session_token",
        value=token,
        httponly=True,
        samesite="lax",
        path="/"
    )
    return {"success": True, "user": user, "token": token}

@app.post("/api/admin/logout")
async def api_admin_logout(request: Request, response: Response):
    token = request.cookies.get("admin_session_token")
    if token:
        database.delete_session(token)
    gen_token = request.cookies.get("session_token")
    if gen_token:
        database.delete_session(gen_token)
    response.delete_cookie("admin_session_token", path="/")
    response.delete_cookie("session_token", path="/")
    return {"success": True}

@app.post("/api/operator/active")
async def api_set_active_operator(payload: OperatorSwitchPayload, response: Response):
    response.set_cookie(key="active_operator", value=payload.operator_name, max_age=60*60*24*30, path="/")
    return {"success": True, "operator_name": payload.operator_name}

@app.get("/api/auth/me")
async def api_me(request: Request):
    token = request.cookies.get("session_token") or request.headers.get("X-Session-Token")
    admin_token = request.cookies.get("admin_session_token") or request.headers.get("X-Admin-Token")
    active_op = request.cookies.get("active_operator")
    user = database.get_session_user(admin_token or token) if (admin_token or token) else None
    users = database.get_users()
    default_op = users[0]["name"] if users else "Operador 1"
    return {
        "authenticated": user is not None,
        "user": user,
        "active_operator": active_op or default_op,
        "users": users
    }

@app.get("/api/auth/users")
async def api_get_users():
    return database.get_users()

@app.put("/api/auth/users/{user_id}")
async def api_update_user(user_id: int, payload: UserUpdatePayload):
    success = database.update_user(user_id, name=payload.name, password=payload.password)
    return {"success": success}

# ==========================================
# ROTAS PRINCIPAIS DO APP, CRM E ADMIN (GERÊNCIA)
# ==========================================

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

def get_current_admin(request: Request) -> Optional[Dict[str, Any]]:
    # Verifica preferencialmente o token de sessão do gerente
    token = request.cookies.get("admin_session_token") or request.headers.get("X-Admin-Token")
    if not token:
        token = request.cookies.get("session_token") or request.headers.get("X-Session-Token")
    if not token:
        return None
    user = database.get_session_user(token)
    if user and user.get("role") in ("admin", "gerente"):
        return user
    return None

@app.get("/admin", response_class=HTMLResponse)
async def read_admin(request: Request):
    admin_user = get_current_admin(request)
    return templates.TemplateResponse(
        request=request, 
        name="admin.html", 
        context={"is_authenticated": admin_user is not None, "admin_user": admin_user}
    )

# Rotas de Gestão de Operadores para o Gerente (/admin) protegidas por senha
@app.get("/api/admin/operators")
async def api_admin_get_operators(request: Request):
    admin_user = get_current_admin(request)
    if not admin_user:
        return Response(
            content=json.dumps({"success": False, "error": "Acesso restrito ao Gerente. Digite a senha para acessar.", "unauthorized": True}),
            status_code=401,
            media_type="application/json"
        )
    return database.get_operators_summary()

@app.post("/api/admin/operators")
async def api_admin_create_operator(payload: OperatorCreatePayload, request: Request):
    admin_user = get_current_admin(request)
    if not admin_user:
        return Response(
            content=json.dumps({"success": False, "error": "Acesso não autorizado.", "unauthorized": True}),
            status_code=401,
            media_type="application/json"
        )
    try:
        new_id = database.create_operator(
            username=payload.username,
            name=payload.name,
            password=payload.password or "senha123",
            role=payload.role or "operador"
        )
        return {"success": True, "id": new_id, "message": f"Operador '{payload.name}' cadastrado com sucesso!"}
    except Exception as e:
        return {"success": False, "error": f"Erro ao criar operador: {str(e)}"}

@app.put("/api/admin/operators/{user_id}")
async def api_admin_update_operator(user_id: int, payload: OperatorUpdatePayload, request: Request):
    admin_user = get_current_admin(request)
    if not admin_user:
        return Response(
            content=json.dumps({"success": False, "error": "Acesso não autorizado.", "unauthorized": True}),
            status_code=401,
            media_type="application/json"
        )
    try:
        success = database.update_operator(
            user_id=user_id,
            name=payload.name,
            username=payload.username,
            password=payload.password,
            role=payload.role
        )
        return {"success": success, "message": "Operador atualizado com sucesso!"}
    except Exception as e:
        return {"success": False, "error": f"Erro ao atualizar operador: {str(e)}"}

@app.delete("/api/admin/operators/{user_id}")
async def api_admin_delete_operator(user_id: int, request: Request):
    admin_user = get_current_admin(request)
    if not admin_user:
        return Response(
            content=json.dumps({"success": False, "error": "Acesso não autorizado.", "unauthorized": True}),
            status_code=401,
            media_type="application/json"
        )
    return database.delete_operator(user_id)

@app.get("/api/stats")
async def api_stats():
    return database.get_dashboard_stats()

@app.get("/api/scans")
async def api_scans(limit: int = 20):
    return database.get_scans(limit=limit)

@app.get("/api/leads")
async def api_leads(
    scan_id: Optional[int] = None,
    campaign_status: Optional[str] = None,
    filter_no_site: bool = False,
    search: Optional[str] = None,
    assigned_to: Optional[str] = None
):
    return database.get_leads(
        scan_id=scan_id,
        campaign_status=campaign_status,
        filter_no_site=filter_no_site,
        search=search,
        assigned_to=assigned_to
    )

@app.post("/api/leads/{lead_id}/status")
async def api_update_lead_status(lead_id: int, payload: LeadStatusUpdate):
    success = database.update_lead_status(
        lead_id=lead_id, 
        status=payload.status, 
        notes=payload.notes,
        follow_stage=payload.follow_stage,
        deal_value=payload.deal_value,
        assigned_to=payload.assigned_to
    )
    lead = database.get_lead_by_id(lead_id)
    return {
        "success": success,
        "lead": lead,
        "deal_value": lead.get("deal_value") if lead else payload.deal_value,
        "status": lead.get("campaign_status") if lead else payload.status,
        "assigned_to": lead.get("assigned_to") if lead else payload.assigned_to,
        "closed_at": lead.get("closed_at") if lead else None
    }

@app.delete("/api/leads/{lead_id}")
@app.post("/api/leads/{lead_id}/delete")
async def api_delete_lead(lead_id: int):
    success = database.delete_lead(lead_id)
    return {"success": success, "message": "Lead removido com sucesso!"}

class CreateManualLeadPayload(BaseModel):
    name: str
    phone: Optional[str] = ""
    whatsapp: Optional[str] = ""
    email: Optional[str] = ""
    website: Optional[str] = ""
    address: Optional[str] = ""
    category: Optional[str] = "Comércio Local"
    instagram: Optional[str] = ""
    opportunity_score: Optional[int] = None
    campaign_status: Optional[str] = "novo"
    follow_stage: Optional[str] = "contato"
    notes: Optional[str] = ""
    deal_value: Optional[float] = 0.0
    assigned_to: Optional[str] = ""
    source: Optional[str] = "Instagram"
    scan_id: Optional[int] = None

@app.post("/api/leads")
@app.post("/api/leads/manual")
async def api_create_manual_lead(payload: CreateManualLeadPayload):
    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=400, detail="O nome do estabelecimento é obrigatório.")
    lead = database.create_manual_lead(payload.dict())
    return {
        "success": True,
        "message": f"Lead '{lead.get('name')}' cadastrado com sucesso!",
        "lead": lead
    }

class BulkDeletePayload(BaseModel):
    lead_ids: List[int]

@app.post("/api/leads/bulk-delete")
async def api_bulk_delete_leads(payload: BulkDeletePayload):
    deleted = database.delete_leads_bulk(payload.lead_ids)
    return {
        "success": True,
        "deleted_count": deleted,
        "message": f"{deleted} leads excluídos com sucesso!"
    }

class SaveInstagramPayload(BaseModel):
    instagram: str

class BatchEnrichPayload(BaseModel):
    lead_ids: Optional[List[int]] = None
    limit: Optional[int] = 10

@app.post("/api/leads/{lead_id}/enrich")
async def api_enrich_lead(lead_id: int):
    import enrichment_service
    res = enrichment_service.enrich_single_lead(lead_id)
    return res

@app.post("/api/leads/{lead_id}/find-instagram")
async def api_find_instagram(lead_id: int):
    import enrichment_service
    res = enrichment_service.find_instagram_for_lead(lead_id)
    return res

@app.post("/api/leads/{lead_id}/save-instagram")
async def api_save_instagram(lead_id: int, payload: SaveInstagramPayload):
    import enrichment_service
    clean_h = enrichment_service.clean_instagram_handle(payload.instagram)
    database.update_lead_contacts(lead_id=lead_id, instagram=clean_h)
    lead = database.get_lead_by_id(lead_id)
    return {"success": True, "instagram": clean_h, "lead": lead}

@app.post("/api/leads/enrich-batch")
async def api_enrich_batch(payload: BatchEnrichPayload):
    import enrichment_service
    res = enrichment_service.enrich_batch_leads(lead_ids=payload.lead_ids, limit=payload.limit or 10)
    return res

class ClearDataPayload(BaseModel):
    scan_id: Optional[int] = None

@app.post("/api/leads/cleanup")
async def api_cleanup_leads(payload: CleanupPayload):
    res = database.cleanup_leads(mode=payload.mode or "all", scan_id=payload.scan_id)
    msg_map = {
        "keep_closed": f"Limpeza concluída! Apenas os leads fechados foram preservados ({res['remaining_count']} clientes).",
        "keep_new": f"Limpeza concluída! Apenas os novos leads foram preservados ({res['remaining_count']} novos).",
        "all": "Base de dados limpa com sucesso!"
    }
    res["message"] = msg_map.get(payload.mode or "all", "Limpeza realizada com sucesso!")
    return res

@app.delete("/api/leads/clear")
@app.post("/api/leads/clear")
async def api_clear_leads(payload: Optional[ClearDataPayload] = Body(None), scan_id: Optional[int] = None):
    effective_scan_id = (payload.scan_id if payload else None) or scan_id
    success = database.clear_leads_data(scan_id=effective_scan_id)
    return {
        "success": success,
        "message": "Dados da varredura atual limpos com sucesso!" if effective_scan_id else "Todos os leads e varreduras foram limpos com sucesso!"
    }

@app.get("/api/settings")
async def api_get_settings():
    return database.get_settings()

@app.post("/api/settings")
async def api_save_settings(payload: SettingsUpdate):
    database.update_settings(payload.model_dump())
    return {"success": True, "message": "Configurações salvas com sucesso!"}

# ==========================================
# ROTAS PROXY DO WAHA (WhatsApp HTTP API)
# ==========================================

def get_waha_headers(settings: dict, extra: Optional[dict] = None) -> dict:
    api_key = (settings.get("waha_api_key") or os.getenv("WAHA_API_KEY", "2b5d16deb67241efa1cffa371e1f354b")).strip()
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-Api-Key"] = api_key
    if extra:
        headers.update(extra)
    return headers

# Timeout estrito para chamadas ao WAHA (evita travamento do event loop/workers)
WAHA_HTTP_TIMEOUT = httpx.Timeout(5.0, connect=3.0)
WAHA_SEND_TIMEOUT = httpx.Timeout(6.0, connect=3.0)

@app.get("/api/waha/status")
async def api_waha_status():
    settings = database.get_settings()
    base_url = settings.get("waha_base_url", "http://localhost:3000").rstrip("/")
    session_name = settings.get("waha_session", "default").strip() or "default"
    headers = get_waha_headers(settings)

    async with httpx.AsyncClient(timeout=WAHA_HTTP_TIMEOUT) as client:
        try:
            resp = await client.get(f"{base_url}/api/sessions", headers=headers)
            if resp.status_code == 200:
                sessions = resp.json()
                current_session = next((s for s in sessions if s.get("name") == session_name), None)
                status_val = current_session.get("status") if current_session else "STOPPED"
                return {
                    "online": True,
                    "base_url": base_url,
                    "session": session_name,
                    "session_status": status_val,
                    "details": current_session,
                    "sessions": sessions
                }
            elif resp.status_code in (401, 403):
                return {
                    "online": True,
                    "base_url": base_url,
                    "session": session_name,
                    "session_status": "UNAUTHORIZED",
                    "error": "Autenticação rejeitada pelo WAHA. Verifique a API Key nas Configurações."
                }
            else:
                return {
                    "online": True,
                    "base_url": base_url,
                    "session": session_name,
                    "session_status": "UNKNOWN",
                    "status_code": resp.status_code,
                    "error": f"Resposta inesperada do WAHA ({resp.status_code})"
                }
        except httpx.ConnectError:
            return {
                "online": False,
                "base_url": base_url,
                "session": session_name,
                "session_status": "OFFLINE",
                "error": f"Servidor WAHA offline em {base_url}. Inicie o contêiner Docker do WAHA."
            }
        except Exception as e:
            return {
                "online": False,
                "base_url": base_url,
                "session": session_name,
                "session_status": "ERROR",
                "error": str(e)
            }

@app.get("/api/waha/qr")
async def api_waha_qr():
    """
    Proxy resiliente para o QR Code da sessão WAHA.
    - Se a sessão estiver STOPPED ou FAILED, dispara restart/start automaticamente.
    - Suporta retorno binário de imagem, JSON com Base64 e fallbacks.
    - Decodifica Base64 para garantir bytes PNG reais ao navegador.
    """
    settings = database.get_settings()
    base_url = settings.get("waha_base_url", "http://localhost:3000").rstrip("/")
    session_name = settings.get("waha_session", "default").strip() or "default"
    headers = get_waha_headers(settings, {"Accept": "image/png, image/*, application/json, text/plain, */*"})

    async with httpx.AsyncClient(timeout=WAHA_HTTP_TIMEOUT) as client:
        try:
            # 1. Verifica estado atual da sessão
            try:
                status_resp = await client.get(f"{base_url}/api/sessions", headers=headers)
                if status_resp.status_code == 200:
                    sessions = status_resp.json()
                    curr = next((s for s in sessions if s.get("name") == session_name), None)
                    if curr:
                        st = curr.get("status")
                        if st == "WORKING":
                            return Response(
                                content=json.dumps({"authenticated": True, "message": "Sessão já conectada ao WhatsApp!"}),
                                media_type="application/json",
                                status_code=200
                            )
                        elif st in ("STOPPED", "FAILED"):
                            # Reinicia a sessão automaticamente para gerar um novo QR Code válido
                            try:
                                await client.post(
                                    f"{base_url}/api/sessions/{session_name}/restart",
                                    headers=get_waha_headers(settings),
                                    json={}
                                )
                            except Exception:
                                await client.post(
                                    f"{base_url}/api/sessions/start",
                                    headers=get_waha_headers(settings),
                                    json={"name": session_name}
                                )
                            await asyncio.sleep(2.0)
            except Exception:
                pass

            # 2. Busca o QR Code em múltiplos formatos suportados pelo WAHA
            candidate_urls = [
                f"{base_url}/api/{session_name}/auth/qr?format=image",
                f"{base_url}/api/{session_name}/auth/qr",
                f"{base_url}/api/screenshot?session={session_name}"
            ]

            for url in candidate_urls:
                try:
                    resp = await client.get(url, headers=headers)
                    if resp.status_code == 200 and len(resp.content) > 0:
                        content = resp.content
                        content_type = resp.headers.get("content-type", "").lower()

                        # Se for imagem pura (PNG ou JPEG)
                        if content.startswith(b"\x89PNG") or content.startswith(b"\xff\xd8") or "image" in content_type:
                            return Response(content=content, media_type="image/png")

                        # Se for JSON contendo base64
                        try:
                            data_json = json.loads(content.decode("utf-8", errors="ignore"))
                            b64_val = None
                            for key in ["value", "data", "qr", "image"]:
                                if key in data_json and isinstance(data_json[key], str) and len(data_json[key]) > 50:
                                    b64_val = data_json[key]
                                    break
                            
                            if b64_val:
                                if "," in b64_val:
                                    b64_val = b64_val.split(",", 1)[1]
                                decoded = base64.b64decode(b64_val)
                                return Response(content=decoded, media_type="image/png")
                        except Exception:
                            pass

                        # Se for string Base64 plana
                        try:
                            clean_str = content.decode("utf-8", errors="ignore").strip().strip('"')
                            if clean_str.startswith("data:image"):
                                clean_str = clean_str.split(",", 1)[1]
                            if len(clean_str) > 100:
                                decoded = base64.b64decode(clean_str)
                                if decoded.startswith(b"\x89PNG") or decoded.startswith(b"\xff\xd8"):
                                    return Response(content=decoded, media_type="image/png")
                        except Exception:
                            pass
                except Exception:
                    continue

            return Response(
                content=json.dumps({"error": "QR Code ainda não disponível. A sessão pode estar inicializando (STARTING). Tente novamente em 2 segundos."}),
                status_code=404,
                media_type="application/json"
            )
        except httpx.ConnectError:
            return Response(
                content=json.dumps({"error": f"Servidor WAHA offline em {base_url}."}),
                status_code=503,
                media_type="application/json"
            )
        except Exception as e:
            return Response(
                content=json.dumps({"error": str(e)}),
                status_code=500,
                media_type="application/json"
            )

@app.get("/api/waha/docker-logs")
async def api_waha_docker_logs():
    """
    Puxa os logs em tempo real do container Docker do WAHA para a interface.
    Também detecta e extrai o QR Code em ASCII caso impresso no terminal.
    """
    try:
        proc = subprocess.run(
            ["docker", "logs", "--tail", "80", "waha"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=6
        )
        raw_text = proc.stdout.decode("utf-8", errors="ignore")
        
        # Extrai o bloco de QR Code ASCII se presente
        lines = raw_text.splitlines()
        qr_lines = []
        in_qr = False
        for line in reversed(lines):
            # Identifica linhas que compõem o bloco de caracteres do QR (█, ▄, ▀)
            if any(c in line for c in ["█", "▄", "▀"]):
                qr_lines.insert(0, line)
                in_qr = True
            elif in_qr and len(qr_lines) >= 20:
                break
        
        ascii_qr = "\n".join(qr_lines) if len(qr_lines) >= 20 else None

        return {
            "success": True,
            "container": "waha",
            "logs": raw_text,
            "ascii_qr": ascii_qr,
            "dashboard": {
                "url": "http://localhost:3000/dashboard",
                "username": "admin",
                "password": "bd4239a0af284e9d8731cb672736485f"
            }
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Não foi possível obter logs do Docker: {str(e)}"
        }

@app.post("/api/waha/session/{action}")
async def api_waha_session_action(action: str):
    """
    Controla o ciclo de vida da sessão WAHA usando os endpoints modernos /api/sessions/{session}/{action}
    Suporta: start, stop, restart, logout, reset
    """
    settings = database.get_settings()
    base_url = settings.get("waha_base_url", "http://localhost:3000").rstrip("/")
    session_name = settings.get("waha_session", "default").strip() or "default"
    headers = get_waha_headers(settings)

    valid_actions = ["start", "stop", "restart", "logout", "reset", "clean"]
    if action not in valid_actions:
        return {"success": False, "error": f"Ação '{action}' não suportada."}

    async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=3.0)) as client:
        try:
            # Caso especial: Reset total da sessão (Delete + Start)
            if action in ["reset", "clean"]:
                try:
                    await client.delete(f"{base_url}/api/sessions/{session_name}", headers=headers)
                except Exception:
                    pass
                await asyncio.sleep(1.0)
                create_resp = await client.post(f"{base_url}/api/sessions", headers=headers, json={"name": session_name})
                return {"success": True, "message": f"Sessão '{session_name}' resetada e reiniciada com sucesso!"}

            # Se for 'start', checa se está em FAILED; se sim, faz restart para renovar o processo e o QR Code
            if action == "start":
                try:
                    chk = await client.get(f"{base_url}/api/sessions/{session_name}", headers=headers)
                    if chk.status_code == 200 and chk.json().get("status") == "FAILED":
                        resp = await client.post(f"{base_url}/api/sessions/{session_name}/restart", headers=headers, json={})
                        data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                        return {"success": True, "status_code": resp.status_code, "data": data, "message": "Sessão reiniciada com sucesso para leitura do QR Code."}
                except Exception:
                    pass

            # 1. Tenta endpoint moderno: /api/sessions/{session_name}/{action}
            resp = await client.post(
                f"{base_url}/api/sessions/{session_name}/{action}",
                headers=headers,
                json={}
            )

            # Se for 'start' e a sessão não existe (404), cria via POST /api/sessions
            if resp.status_code == 404 and action == "start":
                create_resp = await client.post(f"{base_url}/api/sessions", headers=headers, json={"name": session_name})
                return {"success": create_resp.is_success, "status_code": create_resp.status_code, "data": create_resp.json() if create_resp.headers.get("content-type", "").startswith("application/json") else {}}

            # Se for 'start' e já estiver iniciada (422), é considerado sucesso
            if resp.status_code == 422 and action == "start":
                return {"success": True, "message": "A sessão já está iniciada e ativa."}

            data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            return {"success": resp.is_success, "status_code": resp.status_code, "data": data}
        except httpx.ConnectError:
            return {
                "success": False, 
                "error": f"O servidor WAHA está offline em {base_url}. Verifique se o container 'waha' está em execução no Docker."
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

@app.post("/api/waha/send")
async def api_waha_send(payload: WahaSendRequest):
    settings = database.get_settings()
    base_url = settings.get("waha_base_url", "http://localhost:3000").rstrip("/")
    session_name = payload.session or settings.get("waha_session", "default").strip() or "default"
    headers = get_waha_headers(settings)

    raw_chat_id = payload.chatId.strip()
    if "@" not in raw_chat_id:
        digits = "".join(c for c in raw_chat_id if c.isdigit())
        if len(digits) in (10, 11) and not digits.startswith("55"):
            digits = f"55{digits}"
        chat_id = f"{digits}@c.us"
    else:
        chat_id = raw_chat_id

    # Pré-validação do status da sessão WAHA
    async with httpx.AsyncClient(timeout=WAHA_HTTP_TIMEOUT) as client:
        try:
            chk = await client.get(f"{base_url}/api/sessions/{session_name}", headers=headers)
            if chk.status_code == 200:
                s_status = chk.json().get("status")
                if s_status != "WORKING":
                    # Se inativa ou expirada, força restart para renovar QR
                    if s_status in ("FAILED", "STOPPED"):
                        try:
                            await client.post(f"{base_url}/api/sessions/{session_name}/restart", headers=headers, json={})
                        except Exception:
                            pass
                    return {
                        "success": False,
                        "qr_required": True,
                        "status": s_status,
                        "error": f"WhatsApp não conectado (Status: {s_status}). Por favor, escaneie o QR Code exibido na tela com seu celular para autenticar o WhatsApp."
                    }
        except httpx.ConnectError:
            return {"success": False, "error": f"Servidor WAHA offline em {base_url}. Inicie o contêiner WAHA para enviar."}
        except Exception:
            pass

    waha_body = {
        "session": session_name,
        "chatId": chat_id,
        "text": payload.text
    }

    async with httpx.AsyncClient(timeout=WAHA_SEND_TIMEOUT) as client:
        try:
            resp = await client.post(f"{base_url}/api/sendText", headers=headers, json=waha_body)
            if resp.is_success:
                resp_json = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                # Salvar no histórico de mensagens unificado
                database.save_message(
                    lead_id=payload.lead_id,
                    channel="whatsapp",
                    direction="outgoing",
                    sender="Operador",
                    recipient=payload.chatId,
                    body=payload.text,
                    status="sent"
                )
                # Atualizar CRM automaticamente quando lead_id for fornecido
                if payload.lead_id:
                    database.update_lead_status(
                        lead_id=payload.lead_id, 
                        status="contatado", 
                        follow_stage=payload.follow_stage,
                        notes=f"Disparo de abordagem ({payload.follow_stage or 'geral'}) realizado com sucesso via WAHA."
                    )
                return {
                    "success": True,
                    "data": resp_json,
                    "message": "Mensagem enviada com sucesso via WAHA!"
                }
            else:
                err_text = resp.text
                try:
                    err_json = resp.json()
                    st = err_json.get("status")
                    if resp.status_code == 422:
                        try:
                            await client.post(f"{base_url}/api/sessions/{session_name}/restart", headers=headers, json={})
                        except Exception:
                            pass
                        return {
                            "success": False,
                            "qr_required": True,
                            "error": f"WhatsApp não conectado (Estado: {st or 'Aguardando QR Code'}). O QR Code foi atualizado na tela; aponte o WhatsApp do celular para conectar."
                        }
                    err_msg = err_json.get("message") or err_json.get("error") or err_text
                except Exception:
                    err_msg = err_text
                return {"success": False, "error": f"WAHA ({resp.status_code}): {err_msg}"}
        except httpx.ConnectError:
            return {"success": False, "error": f"Servidor WAHA offline em {base_url}. Inicie o contêiner WAHA para enviar."}
        except Exception as e:
            return {"success": False, "error": f"Falha de comunicação com o WAHA: {str(e)}"}

# ==========================================
# CENTRAL DE ATENDIMENTO MULTI-CANAL & CHAT
# ==========================================

def send_smtp_email(to_email: str, subject: str, body_text: str, settings: dict) -> dict:
    host = (settings.get("smtp_host") or "").strip()
    port_str = (settings.get("smtp_port") or "587").strip()
    user = (settings.get("smtp_user") or "").strip()
    pwd = (settings.get("smtp_password") or "").strip()
    from_name = (settings.get("smtp_from_name") or "Kaptador Comercial").strip()
    use_tls = (settings.get("smtp_use_tls") or "true").lower() in ("true", "1", "yes")

    if not host:
        return {"success": False, "error": "Servidor SMTP não configurado. Acesse a aba Configurações > E-mail."}
    if not to_email:
        return {"success": False, "error": "E-mail de destino não informado para este contato."}

    try:
        port = int(port_str)
    except ValueError:
        port = 587

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        from_header = f"{from_name} <{user}>" if user else from_name
        msg["From"] = from_header
        msg["To"] = to_email

        part_text = MIMEText(body_text, "plain", "utf-8")
        msg.attach(part_text)

        html_body = body_text.replace("\n", "<br>")
        part_html = MIMEText(f"<div style='font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.6;'>{html_body}</div>", "html", "utf-8")
        msg.attach(part_html)

        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=14)
        else:
            server = smtplib.SMTP(host, port, timeout=14)
            if use_tls:
                server.starttls()

        if user and pwd:
            server.login(user, pwd)

        server.sendmail(user or from_header, [to_email], msg.as_string())
        server.quit()
        return {"success": True, "message": f"E-mail enviado com sucesso para {to_email}!"}
    except Exception as e:
        return {"success": False, "error": f"Falha no envio de e-mail (SMTP): {str(e)}"}

@app.get("/api/chat/conversations")
async def api_chat_conversations(search: Optional[str] = None, filter: Optional[str] = None):
    convos = database.get_chat_conversations(search=search, filter_type=filter)
    return {"success": True, "conversations": convos, "count": len(convos)}

@app.get("/api/chat/messages")
async def api_chat_messages(lead_id: Optional[int] = None, phone: Optional[str] = None):
    messages = database.get_messages(lead_id=lead_id, phone=phone, limit=200)
    return {"success": True, "messages": messages, "count": len(messages)}

@app.post("/api/chat/send")
async def api_chat_send(payload: ChatSendPayload):
    lead = database.get_lead_by_id(payload.lead_id) if payload.lead_id else None
    settings = database.get_settings()
    channel = (payload.channel or "whatsapp").lower()

    if channel == "whatsapp":
        target_number = payload.phone or payload.recipient
        if not target_number and lead:
            target_number = lead.get("whatsapp") or lead.get("phone")
        
        if not target_number:
            return {"success": False, "error": "Número de WhatsApp não informado para este contato."}
        
        digits = "".join(c for c in target_number if c.isdigit())
        if len(digits) in (10, 11) and not digits.startswith("55"):
            digits = f"55{digits}"
        chat_id = f"{digits}@c.us" if "@" not in digits else digits

        base_url = settings.get("waha_base_url", "http://localhost:3000").rstrip("/")
        session_name = settings.get("waha_session", "default").strip() or "default"
        headers = get_waha_headers(settings)

        # Pré-validação do status da sessão WAHA
        async with httpx.AsyncClient(timeout=WAHA_HTTP_TIMEOUT) as client:
            try:
                chk = await client.get(f"{base_url}/api/sessions/{session_name}", headers=headers)
                if chk.status_code == 200:
                    s_status = chk.json().get("status")
                    if s_status != "WORKING":
                        if s_status in ("FAILED", "STOPPED"):
                            try:
                                await client.post(f"{base_url}/api/sessions/{session_name}/restart", headers=headers, json={})
                            except Exception:
                                pass
                        return {
                            "success": False,
                            "qr_required": True,
                            "status": s_status,
                            "error": f"WhatsApp não conectado (Status: {s_status}). Por favor, escaneie o QR Code exibido na tela com seu celular para autenticar o WhatsApp."
                        }
            except httpx.ConnectError:
                return {"success": False, "error": f"Servidor WAHA offline em {base_url}. Inicie o contêiner WAHA para enviar."}
            except Exception:
                pass

        waha_body = {"session": session_name, "chatId": chat_id, "text": payload.text}
        async with httpx.AsyncClient(timeout=WAHA_SEND_TIMEOUT) as client:
            try:
                resp = await client.post(f"{base_url}/api/sendText", headers=headers, json=waha_body)
                if resp.is_success:
                    msg_id = database.save_message(
                        lead_id=payload.lead_id,
                        channel="whatsapp",
                        direction="outgoing",
                        sender="Operador",
                        recipient=chat_id,
                        body=payload.text,
                        status="sent"
                    )
                    if payload.lead_id:
                        database.update_lead_status(
                            lead_id=payload.lead_id, 
                            status="contatado", 
                            follow_stage=payload.follow_stage,
                            notes=f"Mensagem enviada via WhatsApp Web (WAHA) - Etapa: {payload.follow_stage or 'Chat'}."
                        )
                    return {
                        "success": True,
                        "message_id": msg_id,
                        "channel": "whatsapp",
                        "recipient": chat_id,
                        "message": "Mensagem enviada com sucesso no WhatsApp!"
                    }
                else:
                    err_msg = resp.text
                    try:
                        err_json = resp.json()
                        st = err_json.get("status")
                        if resp.status_code == 422:
                            try:
                                await client.post(f"{base_url}/api/sessions/{session_name}/restart", headers=headers, json={})
                            except Exception:
                                pass
                            return {
                                "success": False,
                                "qr_required": True,
                                "error": f"WhatsApp não conectado (Estado: {st or 'Aguardando QR Code'}). O QR Code foi atualizado na tela; aponte o WhatsApp do celular para conectar."
                            }
                        err_msg = err_json.get("message") or err_msg
                    except Exception:
                        pass
                    return {"success": False, "error": f"Erro do WAHA ({resp.status_code}): {err_msg}"}
            except httpx.ConnectError:
                return {"success": False, "error": f"Servidor WAHA offline em {base_url}. Inicie o contêiner WAHA para enviar."}
            except Exception as e:
                return {"success": False, "error": f"Falha de comunicação com o WAHA: {str(e)}"}

    elif channel == "email":
        to_email = (payload.recipient or (lead.get("email") if lead else "")).strip()
        if not to_email:
            return {"success": False, "error": "Este lead não possui endereço de e-mail cadastrado."}
        subject = payload.subject or f"Oportunidade Comercial para {lead.get('name') if lead else 'sua empresa'}"
        result = send_smtp_email(to_email, subject, payload.text, settings)
        if result["success"]:
            msg_id = database.save_message(
                lead_id=payload.lead_id,
                channel="email",
                direction="outgoing",
                sender=settings.get("smtp_user", "Operador"),
                recipient=to_email,
                subject=subject,
                body=payload.text,
                status="sent"
            )
            if payload.lead_id:
                database.update_lead_status(payload.lead_id, "contatado", f"E-mail enviado via SMTP para {to_email}.")
            return {
                "success": True,
                "message_id": msg_id,
                "channel": "email",
                "recipient": to_email,
                "message": result["message"]
            }
        else:
            return result

    elif channel == "site":
        site_url = payload.recipient or (lead.get("website") if lead else "")
        msg_id = database.save_message(
            lead_id=payload.lead_id,
            channel="site",
            direction="outgoing",
            sender=settings.get("site_operator_name", "Operador"),
            recipient=site_url,
            body=payload.text,
            status="sent"
        )
        if payload.lead_id:
            database.update_lead_status(payload.lead_id, "contatado", f"Abordagem realizada pelo formulário do site ({site_url}).")
        return {
            "success": True,
            "message_id": msg_id,
            "channel": "site",
            "recipient": site_url,
            "message": "Contato via site registrado com sucesso no histórico!"
        }
    else:
        return {"success": False, "error": f"Canal '{channel}' desconhecido."}

@app.post("/api/email/test")
async def api_email_test(payload: EmailTestPayload):
    settings = {
        "smtp_host": payload.smtp_host,
        "smtp_port": payload.smtp_port or "587",
        "smtp_user": payload.smtp_user or "",
        "smtp_password": payload.smtp_password or "",
        "smtp_use_tls": payload.smtp_use_tls or "true",
        "smtp_from_name": "Teste Kaptador"
    }
    dest = payload.test_recipient or payload.smtp_user
    if not dest:
        return {"success": False, "error": "Informe um e-mail de destino para testar o envio."}
    res = send_smtp_email(dest, "✅ Teste de Conexão SMTP - KAPTADOR", "Se você recebeu este e-mail, seu servidor SMTP está configurado e pronto para disparos comerciais!", settings)
    return res

@app.post("/api/chat/simulate-reply")
async def api_chat_simulate_reply(payload: Dict[str, Any]):
    lead_id = payload.get("lead_id")
    text = payload.get("text", "Olá! Recebi sua mensagem, gostaria de saber mais detalhes.")
    channel = payload.get("channel", "whatsapp")
    lead = database.get_lead_by_id(lead_id) if lead_id else None
    sender = lead.get("name") if lead else "Cliente"
    recipient = "Operador"
    msg_id = database.save_message(
        lead_id=lead_id,
        channel=channel,
        direction="incoming",
        sender=sender,
        recipient=recipient,
        body=text,
        status="read"
    )
    return {"success": True, "message_id": msg_id, "message": "Mensagem do cliente simulada com sucesso!"}

@app.post("/api/waha/webhook")
async def api_waha_webhook(request: Request):
    """Webhook para escutar mensagens recebidas pelo WAHA em tempo real"""
    try:
        body = await request.json()
        event_name = body.get("event")
        payload = body.get("payload", {})
        
        # Trata mensagens recebidas
        if event_name in ("message", "message.any"):
            from_jid = payload.get("from", "")
            body_text = payload.get("body", "")
            from_me = payload.get("fromMe", False)
            
            # Se a mensagem foi recebida (não enviada por mim)
            if not from_me and body_text:
                clean_phone = "".join(c for c in from_jid.split("@")[0] if c.isdigit())
                # Tenta localizar lead pelo telefone
                leads = database.get_leads(search=clean_phone[-8:] if len(clean_phone) >= 8 else clean_phone)
                matched_lead = leads[0] if leads else None
                lead_id = matched_lead["id"] if matched_lead else None
                
                database.save_message(
                    lead_id=lead_id,
                    channel="whatsapp",
                    direction="incoming",
                    sender=matched_lead["name"] if matched_lead else from_jid,
                    recipient="Operador",
                    body=body_text,
                    status="read"
                )
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "error": str(e)}

@app.post("/api/chat/contacts/create")
async def api_chat_create_contact(payload: CreateChatContactPayload):
    raw_phone = payload.phone.strip()
    digits = "".join(c for c in raw_phone if c.isdigit())
    if len(digits) < 8:
        return {"success": False, "error": "Número de telefone inválido. Informe o DDD e o número completo (ex: 12988801327)."}
    
    # Adiciona código do país 55 caso informado apenas com DDD (10 ou 11 dígitos)
    if len(digits) in (10, 11) and not digits.startswith("55"):
        digits = f"55{digits}"

    contact_name = payload.name.strip() or f"Contato {raw_phone}"

    lead = database.save_or_get_contact(
        name=contact_name,
        phone=raw_phone,
        whatsapp=digits,
        email=payload.email.strip() if payload.email else "",
        category="Contato Direto / Teste",
        notes=payload.notes.strip() if payload.notes else ""
    )

    send_result = None
    if payload.send_now and payload.initial_message and payload.initial_message.strip():
        send_payload = ChatSendPayload(
            lead_id=lead["id"],
            channel=payload.channel or "whatsapp",
            text=payload.initial_message.strip(),
            recipient=lead.get("email") if payload.channel == "email" else digits,
            phone=digits
        )
        send_result = await api_chat_send(send_payload)

    return {
        "success": True,
        "lead": lead,
        "send_result": send_result,
        "message": f"Conversa com '{contact_name}' pronta para atendimento!"
    }


@app.get("/api/cep/{cep}")
async def api_get_cep(cep: str):
    from cep_service import fetch_cep_info
    info = fetch_cep_info(cep)
    if not info:
        return {"found": False, "message": "CEP não localizado"}
    return {"found": True, "data": info}

class InstantDataScraperImport(BaseModel):
    content: str
    niche: Optional[str] = "Comércio Local"
    location: Optional[str] = "Importado do Google Maps"

@app.post("/api/import/instant-data-scraper")
async def api_import_instant_data(payload: InstantDataScraperImport):
    from scraper import parse_instant_data_scraper_input, extract_contacts_from_html
    leads = parse_instant_data_scraper_input(payload.content)
    if not leads:
        return {"success": False, "message": "Nenhum dado válido identificado no formato Instant Data Scraper."}
        
    settings = database.get_settings()
    timeout = int(settings.get("request_timeout", 8))
    scraper = LeadScraper(timeout=timeout)
    
    no_web_count = 0
    # Executar Deep Scraping nos leads que vieram com site
    for lead in leads:
        site = lead.get("website", "").strip()
        if site:
            html = scraper.fetch_website_content(site)
            if html:
                contacts = extract_contacts_from_html(html, base_url=site)
                if not lead.get("whatsapp") and contacts.get("whatsapp"):
                    lead["whatsapp"] = contacts["whatsapp"]
                if not lead.get("email") and contacts.get("email"):
                    lead["email"] = contacts["email"]
            else:
                lead["website"] = ""
                lead["has_website"] = 0
                lead["opportunity_score"] = 96
                no_web_count += 1
        else:
            lead["opportunity_score"] = 98
            no_web_count += 1
            
    scan_id = database.save_scan(payload.niche, payload.location, len(leads), no_web_count)
    database.save_leads(scan_id, leads)
    
    return {
        "success": True,
        "scan_id": scan_id,
        "total": len(leads),
        "no_website_count": no_web_count,
        "message": f"{len(leads)} leads importados com sucesso! ({no_web_count} sem site identificados)."
    }

@app.get("/api/scan/stream")
async def scan_stream(
    niche: str = Query(...), 
    location: str = Query(...), 
    cep: Optional[str] = Query(None),
    max_leads: int = Query(15)
):
    """Server-Sent Events (SSE) para atualização do progresso em tempo real"""
    
    settings = database.get_settings()
    delay = float(settings.get("delay_between_requests", 1.0))
    timeout = int(settings.get("request_timeout", 10))
    google_key = settings.get("google_places_api_key", "")
    apify_token = settings.get("apify_token", "")
    excluded_brands = settings.get("excluded_brands", "")
    
    scraper = LeadScraper(delay=delay, timeout=timeout, google_key=google_key, apify_token=apify_token, excluded_brands=excluded_brands)
    
    async def event_generator():
        last_leads = []
        no_web_count = 0
        
        try:
            for event in scraper.run_scan_stream(niche, location, cep=cep, max_leads=max_leads):
                if event.get("step") == "finished":
                    last_leads = event.get("leads", [])
                    no_web_count = event.get("no_website_count", 0)
                    city_name = event.get("city", location)
                    
                    # Salvar no SQLite com proteção contra erro
                    try:
                        scan_id = database.save_scan(niche, city_name, len(last_leads), no_web_count)
                        database.save_leads(scan_id, last_leads)
                        event["scan_id"] = scan_id
                    except Exception as db_err:
                        print(f"Aviso ao salvar leads no banco: {db_err}")
                    
                data_str = json.dumps(event, ensure_ascii=False)
                yield f"data: {data_str}\n\n"
                await asyncio.sleep(0.01)
        except Exception as e:
            print(f"Erro no streaming do scraper: {e}")
            err_event = {
                "step": "error",
                "percent": 100,
                "message": f"Erro durante a varredura: {str(e)}"
            }
            yield f"data: {json.dumps(err_event, ensure_ascii=False)}\n\n"
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/api/report/data")
async def api_report_data(scan_id: Optional[int] = None):
    leads = database.get_leads(scan_id=scan_id)
    stats = database.get_dashboard_stats()
    scans = database.get_scans(limit=10)
    active_scan = next((s for s in scans if s["id"] == scan_id), None) if scan_id else (scans[0] if scans else None)
    
    total = len(leads)
    no_site = sum(1 for l in leads if not l.get("website"))
    with_wa = sum(1 for l in leads if l.get("whatsapp"))
    with_insta = sum(1 for l in leads if l.get("instagram"))
    with_photos = sum(1 for l in leads if (l.get("photos") and l.get("photos") != "[]"))

    pct_no_site = round((no_site / total * 100), 1) if total > 0 else 0
    pct_wa = round((with_wa / total * 100), 1) if total > 0 else 0
    pct_insta = round((with_insta / total * 100), 1) if total > 0 else 0
    pct_photos = round((with_photos / total * 100), 1) if total > 0 else 0

    summary = {
        "total_leads": total,
        "no_website": no_site,
        "pct_no_website": pct_no_site,
        "with_whatsapp": with_wa,
        "pct_with_whatsapp": pct_wa,
        "with_instagram": with_insta,
        "pct_with_instagram": pct_insta,
        "with_photos": with_photos,
        "pct_with_photos": pct_photos
    }
    
    return {
        "active_scan": active_scan,
        "summary": summary,
        "total_leads": total,
        "no_site_count": no_site,
        "with_whatsapp_count": with_wa,
        "with_instagram_count": with_insta,
        "with_photos_count": with_photos,
        "leads": leads,
        "stats": stats
    }

@app.get("/api/export/csv")
async def export_csv(
    scan_id: Optional[int] = None, 
    filter_no_site: bool = False,
    status: Optional[str] = None
):
    leads = database.get_leads(scan_id=scan_id, campaign_status=status, filter_no_site=filter_no_site)
    if not leads:
        return Response(content="Nome,Telefone,WhatsApp,Instagram,Email,Site,Endereco,Fotos,Status,Valor,Responsavel\n", media_type="text/csv")
        
    df = pd.DataFrame(leads)
    
    # Processa contagem de fotos
    if "photos" in df.columns:
        df["photos_count"] = df["photos"].apply(lambda p: len(json.loads(p)) if (isinstance(p, str) and p.startswith("[")) else (len(p) if isinstance(p, list) else 0))
    else:
        df["photos_count"] = 0

    if "deal_value" in df.columns:
        df["deal_value_formatted"] = df["deal_value"].apply(lambda v: f"R$ {float(v or 0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") if v else "R$ 0,00")
    else:
        df["deal_value_formatted"] = "R$ 0,00"

    cols_map = {
        "name": "Nome da Empresa",
        "phone": "Telefone Fixo",
        "whatsapp": "WhatsApp",
        "instagram": "Instagram",
        "email": "E-mail",
        "website": "Site Oficial",
        "address": "Endereço",
        "category": "Nicho / Categoria",
        "campaign_status": "Status CRM",
        "follow_stage": "Etapa do Funil",
        "deal_value_formatted": "Valor de Fechamento (R$)",
        "assigned_to": "Responsável",
        "closed_at": "Data de Fechamento",
        "photos_count": "Qtd Fotos Reais",
        "maps_url": "Link Google Maps",
        "google_url": "Link Busca Google",
        "notes": "Anotações",
        "created_at": "Data de Captura"
    }
    
    existing_cols = [c for c in cols_map.keys() if c in df.columns]
    export_df = df[existing_cols].rename(columns=cols_map)
    export_df["Site Oficial"] = export_df["Site Oficial"].apply(lambda s: s if s else "SEM SITE (Oportunidade)")
    
    csv_buffer = io.StringIO()
    export_df.to_csv(csv_buffer, index=False, encoding="utf-8-sig")
    
    filename = f"leads_{status or 'todos'}_kaptador_{scan_id or 'all'}.csv"
    return Response(
        content=csv_buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.get("/api/export/excel")
async def export_excel(
    scan_id: Optional[int] = None, 
    filter_no_site: bool = False,
    status: Optional[str] = None
):
    leads = database.get_leads(scan_id=scan_id, campaign_status=status, filter_no_site=filter_no_site)
    
    output = io.BytesIO()
    if leads:
        df = pd.DataFrame(leads)
        if "photos" in df.columns:
            df["photos_count"] = df["photos"].apply(lambda p: len(json.loads(p)) if (isinstance(p, str) and p.startswith("[")) else (len(p) if isinstance(p, list) else 0))
        else:
            df["photos_count"] = 0

        if "deal_value" in df.columns:
            df["deal_value_formatted"] = df["deal_value"].apply(lambda v: f"R$ {float(v or 0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") if v else "R$ 0,00")
        else:
            df["deal_value_formatted"] = "R$ 0,00"

        cols_map = {
            "name": "Nome da Empresa",
            "phone": "Telefone Comercial",
            "whatsapp": "WhatsApp",
            "instagram": "Instagram",
            "email": "E-mail",
            "website": "Site",
            "address": "Endereço",
            "category": "Nicho",
            "campaign_status": "Status CRM",
            "follow_stage": "Etapa do Funil",
            "deal_value_formatted": "Valor de Fechamento (R$)",
            "assigned_to": "Responsável",
            "closed_at": "Data de Fechamento",
            "opportunity_score": "Score Oportunidade (0-100)",
            "photos_count": "Qtd Fotos Reais",
            "maps_url": "Link Google Maps",
            "google_url": "Link Busca Google",
            "notes": "Anotações",
            "created_at": "Capturado Em"
        }
        existing_cols = [c for c in cols_map.keys() if c in df.columns]
        export_df = df[existing_cols].rename(columns=cols_map)
        export_df["Site"] = export_df["Site"].apply(lambda s: s if s else "SEM SITE / PRECISA DE SITE")
    else:
        export_df = pd.DataFrame([{"Aviso": "Nenhum lead encontrado"}])

    sheet_title = "Leads Fechados" if status == "fechado" else "Leads KAPTADOR"
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        export_df.to_excel(writer, index=False, sheet_name=sheet_title)
        
    output.seek(0)
    filename = f"leads_{status or 'todos'}_kaptador_{scan_id or 'all'}.xlsx"
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

def generate_markdown_report(report_data: Dict[str, Any]) -> str:
    s = report_data.get("summary", {})
    leads = report_data.get("leads", [])
    now_str = datetime.now().strftime("%d/%m/%Y %H:%M")

    md = []
    md.append(f"# 📊 Dossiê Executivo de Mercado B2B & Auditoria Digital\n\n")
    md.append(f"**Data da Auditoria:** {now_str}  \n")
    md.append(f"**Amostra Analisada:** {s.get('total_leads', 0)} estabelecimentos comerciais  \n\n")

    md.append("## 📈 Métricas-Chave & Indicadores de Presença Digital (KPIs)\n\n")
    md.append("| Métrica | Total | Percentual | Impacto Comercial |\n")
    md.append("| :--- | :---: | :---: | :--- |\n")
    md.append(f"| **Empresas Auditadas** | {s.get('total_leads', 0)} | 100% | Universo amostral coletado |\n")
    md.append(f"| **Sem Site Próprio** | {s.get('no_website', 0)} | **{s.get('pct_no_website', 0)}%** | 🔥 Alta prioridade para venda de desenvolvimento web |\n")
    md.append(f"| **Com WhatsApp Validado** | {s.get('with_whatsapp', 0)} | {s.get('pct_with_whatsapp', 0)}% | Canal direto aberto para abordagem imediata |\n")
    md.append(f"| **Com Perfil Instagram** | {s.get('with_instagram', 0)} | {s.get('pct_with_instagram', 0)}% | Presença social ativa identificada |\n")
    md.append(f"| **Com Fotos Reais Mapeadas** | {s.get('with_photos', 0)} | {s.get('pct_with_photos', 0)}% | Material visual rico para criação de layout/protótipo |\n\n")

    md.append("## 💡 Diagnóstico Comercial & Estratégia de Prospecção\n\n")
    md.append(f"> Foi identificado que **{s.get('pct_no_website', 0)}% dos estabelecimentos auditados não contam com site institucional próprio**, dependendo unicamente de páginas em redes sociais ou cadastros genéricos. Isso representa uma perda expressiva de clientes que buscam diretamente pelo celular no Google.\n\n")
    md.append("### Recomendação Tática:\n")
    md.append("1. **Abordagem Visual:** Utilizar as fotos reais capturadas do estabelecimento para demonstrar uma prévia moderna de como ficaria a presença digital da empresa.\n")
    md.append("2. **Abordagem via WhatsApp:** Enviar mensagem consultiva e objetiva com diagnóstico rápido sem compromisso.\n")
    md.append("3. **Conexão Instagram:** Integrar links da bio diretamente para a nova landing page.\n\n")

    md.append("## 📋 Listagem Analítica dos Estabelecimentos Mapeados\n\n")
    md.append("| Empresa | WhatsApp / Tel | Status Site | Instagram | Fotos Reais | Google Maps | Análise Google |\n")
    md.append("| :--- | :--- | :--- | :--- | :---: | :---: | :---: |\n")

    for l in leads:
        name = l.get("name", "Empresa")
        addr = l.get("address", "")
        phone = l.get("whatsapp") or l.get("phone") or "Não informado"
        has_web = bool(l.get("website"))
        site_str = f"[{l.get('website')}]({l.get('website')})" if has_web else "❌ **Sem Site**"
        insta = f"[{l.get('instagram')}](https://instagram.com/{l.get('instagram').replace('@', '')})" if l.get("instagram") else "-"
        
        photos_val = l.get("photos", [])
        if isinstance(photos_val, str):
            try:
                photos_val = json.loads(photos_val)
            except Exception:
                photos_val = []
        p_count = len(photos_val) if isinstance(photos_val, list) else 0

        maps_link = f"[Abrir Maps]({l.get('maps_url')})" if l.get("maps_url") else "-"
        google_link = f"[Buscar Google]({l.get('google_url')})" if l.get("google_url") else "-"

        md.append(f"| **{name}**<br>_{addr}_ | `{phone}` | {site_str} | {insta} | {p_count} fotos | {maps_link} | {google_link} |\n")

    md.append("\n---\n*Relatório gerado automaticamente por KAPTADOR Leads Engine*\n")
    return "".join(md)

@app.get("/api/report/markdown")
async def api_report_markdown(scan_id: Optional[int] = None, download: bool = False):
    report_data = await api_report_data(scan_id=scan_id)
    md_text = generate_markdown_report(report_data)
    headers = {}
    if download:
        headers["Content-Disposition"] = f"attachment; filename=relatorio_executivo_{scan_id or 'all'}.md"
    return Response(content=md_text, media_type="text/markdown; charset=utf-8", headers=headers)

# ========================================================
# NOVOS RECURSOS DO CRM - MODELOS E ROTAS
# ========================================================

class TaskCreatePayload(BaseModel):
    title: str
    description: Optional[str] = ""
    priority: Optional[str] = "media"
    due_date: Optional[str] = "sem_prazo"
    assigned_to: Optional[str] = ""
    lead_id: Optional[int] = None

class TaskUpdatePayload(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None

class ComandaItemModel(BaseModel):
    service: str
    description: Optional[str] = ""
    value: float

class ComandaCreatePayload(BaseModel):
    customer_name: str
    lead_id: Optional[int] = None
    payment_method: Optional[str] = "pix"
    items: Optional[List[Dict[str, Any]]] = []
    total: Optional[float] = 0.0

class ComandaUpdatePayload(BaseModel):
    status: Optional[str] = None
    total: Optional[float] = None
    payment_method: Optional[str] = None
    items: Optional[List[Dict[str, Any]]] = None

class ProductCreatePayload(BaseModel):
    code: str
    name: str
    category: Optional[str] = "Serviço"
    price: Optional[float] = 0.0
    promo_price: Optional[float] = 0.0
    prompt_description: Optional[str] = ""

class ProductUpdatePayload(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    promo_price: Optional[float] = None
    prompt_description: Optional[str] = None
    active: Optional[int] = None

class QuickReplyCreatePayload(BaseModel):
    title: str
    shortcut: str
    content: str
    category: Optional[str] = "Geral"
    team_shared: Optional[int] = 1

class QuickReplyUpdatePayload(BaseModel):
    title: Optional[str] = None
    shortcut: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None

class CalendarEventCreatePayload(BaseModel):
    title: str
    event_type: Optional[str] = "atendimento"
    event_date: Optional[str] = None
    start_time: Optional[str] = "10:00"
    end_time: Optional[str] = "11:00"
    contact_name: Optional[str] = ""
    contact_phone: Optional[str] = ""
    assigned_to: Optional[str] = ""
    notes: Optional[str] = ""

class CompanyEmailSendPayload(BaseModel):
    to_email: str
    subject: str
    body: str
    model_template: Optional[str] = None
    lead_id: Optional[int] = None

class AIAgentPayload(BaseModel):
    name: str
    provider: Optional[str] = "google"
    model: Optional[str] = "gemini-2.5-flash"
    agent_type: Optional[str] = "mcp_agent"
    system_prompt: Optional[str] = ""
    priority: Optional[int] = 0
    is_default: Optional[int] = 0
    status: Optional[str] = "ativo"

class AIAgentUpdatePayload(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    system_prompt: Optional[str] = None
    priority: Optional[int] = None
    status: Optional[str] = None

class AIFollowupPayload(BaseModel):
    name: str
    trigger_type: Optional[str] = "silence_24h"
    conditions: Optional[Dict[str, Any]] = {}
    steps: Optional[List[Dict[str, Any]]] = []
    status: Optional[str] = "ativo"

class KnowledgeVaultPayload(BaseModel):
    title: str
    source_type: Optional[str] = "document"
    summary: Optional[str] = ""
    chunks_count: Optional[int] = 1

class PricingCalculatePayload(BaseModel):
    website_url: Optional[str] = ""
    client_name: Optional[str] = ""
    city: Optional[str] = ""
    uf: Optional[str] = ""
    segment: Optional[str] = ""
    project_type: Optional[str] = "Identificar automaticamente"
    timeline: Optional[str] = "4 semanas"
    positioning: Optional[str] = "Usar o padrão da empresa"
    is_redesign: Optional[bool] = True
    outsource: Optional[bool] = False
    urgency: Optional[bool] = False

# ----------------- ROTAS: RADAR DE RISCO -----------------
@app.get("/api/radar")
async def api_get_radar():
    return database.get_risk_radar()

@app.post("/api/radar/assume/{lead_id}")
async def api_radar_assume(lead_id: int, request: Request):
    user_name = "Operador"
    token = request.cookies.get("session_token")
    if token:
        user = database.get_session_user(token)
        if user:
            user_name = user.get("name", "Operador")
    database.update_lead_status(lead_id=lead_id, assigned_to=user_name, follow_stage="em_andamento")
    database.log_audit(user_name, "Assumir Lead do Radar", "lead", str(lead_id), f"Atribuído a {user_name}")
    return {"success": True, "message": f"Lead assumido com sucesso por {user_name}!"}

# ----------------- ROTAS: ANÁLISE AMPLIADA -----------------
@app.get("/api/analytics/extended")
async def api_get_extended_analytics():
    return database.get_extended_analytics()

# ----------------- ROTAS: TAREFAS -----------------
@app.get("/api/tasks")
async def api_get_tasks(status: Optional[str] = None, priority: Optional[str] = None):
    return {"tasks": database.get_tasks(status=status, priority=priority)}

@app.post("/api/tasks")
async def api_create_task(payload: TaskCreatePayload):
    task_id = database.create_task(
        title=payload.title,
        description=payload.description or "",
        priority=payload.priority or "media",
        due_date=payload.due_date or "sem_prazo",
        assigned_to=payload.assigned_to or "",
        lead_id=payload.lead_id
    )
    return {"success": True, "task_id": task_id, "message": "Tarefa criada com sucesso!"}

@app.put("/api/tasks/{task_id}")
async def api_update_task(task_id: int, payload: TaskUpdatePayload):
    database.update_task(
        task_id=task_id,
        status=payload.status,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        due_date=payload.due_date,
        assigned_to=payload.assigned_to
    )
    return {"success": True}

@app.delete("/api/tasks/{task_id}")
async def api_delete_task(task_id: int):
    database.delete_task(task_id)
    return {"success": True}

# ----------------- ROTAS: COMANDAS -----------------
@app.get("/api/comandas")
async def api_get_comandas(status: Optional[str] = None):
    return {"comandas": database.get_comandas(status=status)}

@app.post("/api/comandas")
async def api_create_comanda(payload: ComandaCreatePayload):
    items_str = json.dumps(payload.items or [], ensure_ascii=False)
    comanda_id = database.create_comanda(
        customer_name=payload.customer_name,
        lead_id=payload.lead_id,
        payment_method=payload.payment_method or "pix",
        items_json=items_str,
        total=payload.total or 0.0
    )
    return {"success": True, "comanda_id": comanda_id}

@app.put("/api/comandas/{comanda_id}")
async def api_update_comanda(comanda_id: int, payload: ComandaUpdatePayload):
    items_str = json.dumps(payload.items, ensure_ascii=False) if payload.items is not None else None
    database.update_comanda(
        comanda_id=comanda_id,
        status=payload.status,
        total=payload.total,
        payment_method=payload.payment_method,
        items_json=items_str
    )
    return {"success": True}

@app.delete("/api/comandas/{comanda_id}")
async def api_delete_comanda(comanda_id: int):
    database.delete_comanda(comanda_id)
    return {"success": True}

# ----------------- ROTAS: PRODUTOS -----------------
@app.get("/api/products")
async def api_get_products(search: Optional[str] = None, category: Optional[str] = None):
    return {"products": database.get_products(search=search, category=category)}

@app.post("/api/products")
async def api_create_product(payload: ProductCreatePayload):
    prod_id = database.create_product(
        code=payload.code,
        name=payload.name,
        category=payload.category or "Serviço",
        price=payload.price or 0.0,
        promo_price=payload.promo_price or 0.0,
        prompt_description=payload.prompt_description or ""
    )
    return {"success": True, "product_id": prod_id}

@app.put("/api/products/{product_id}")
async def api_update_product(product_id: int, payload: ProductUpdatePayload):
    database.update_product(
        product_id=product_id,
        name=payload.name,
        category=payload.category,
        price=payload.price,
        promo_price=payload.promo_price,
        prompt_description=payload.prompt_description,
        active=payload.active
    )
    return {"success": True}

@app.delete("/api/products/{product_id}")
async def api_delete_product(product_id: int):
    database.delete_product(product_id)
    return {"success": True}

@app.get("/api/products/sample-csv")
async def api_products_sample_csv():
    csv_content = "codigo,nome,categoria,preco,preco_promocional,descricao_ia\nSITE-INST,Site Institucional Completo,Desenvolvimento,2800.00,2200.00,Site com 5 páginas e SEO\nLAND-01,Landing Page de Vendas,Desenvolvimento,1600.00,1300.00,Página focada em conversão\nHOSP-MENSAL,Hospedagem & Manutenção,Recorrência,150.00,120.00,Servidor em nuvem com SSL\n"
    return Response(content=csv_content, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=modelo_produtos.csv"})

# ----------------- ROTAS: RESPOSTAS RÁPIDAS -----------------
@app.get("/api/quick-replies")
async def api_get_quick_replies(category: Optional[str] = None):
    return {"quick_replies": database.get_quick_replies(category=category)}

@app.post("/api/quick-replies")
async def api_create_quick_reply(payload: QuickReplyCreatePayload):
    qr_id = database.create_quick_reply(
        title=payload.title,
        shortcut=payload.shortcut,
        content=payload.content,
        category=payload.category or "Geral",
        team_shared=payload.team_shared if payload.team_shared is not None else 1
    )
    return {"success": True, "quick_reply_id": qr_id}

@app.put("/api/quick-replies/{qr_id}")
async def api_update_quick_reply(qr_id: int, payload: QuickReplyUpdatePayload):
    database.update_quick_reply(
        qr_id=qr_id,
        title=payload.title,
        shortcut=payload.shortcut,
        content=payload.content,
        category=payload.category
    )
    return {"success": True}

@app.delete("/api/quick-replies/{qr_id}")
async def api_delete_quick_reply(qr_id: int):
    database.delete_quick_reply(qr_id)
    return {"success": True}

# ----------------- ROTAS: AGENDA -----------------
@app.get("/api/calendar/events")
async def api_get_calendar_events(status: Optional[str] = None, event_type: Optional[str] = None):
    return {"events": database.get_calendar_events(status=status, event_type=event_type)}

@app.post("/api/calendar/events")
async def api_create_calendar_event(payload: CalendarEventCreatePayload):
    ev_id = database.create_calendar_event(
        title=payload.title,
        event_type=payload.event_type or "atendimento",
        event_date=payload.event_date or datetime.now().strftime("%Y-%m-%d"),
        start_time=payload.start_time or "10:00",
        end_time=payload.end_time or "11:00",
        contact_name=payload.contact_name or "",
        contact_phone=payload.contact_phone or "",
        assigned_to=payload.assigned_to or "",
        notes=payload.notes or ""
    )
    return {"success": True, "event_id": ev_id}

@app.delete("/api/calendar/events/{event_id}")
async def api_delete_calendar_event(event_id: int):
    database.delete_calendar_event(event_id)
    return {"success": True}

@app.post("/api/calendar/connect-google")
async def api_calendar_connect_google(request: Request):
    data = await request.json() if request.headers.get("content-type") == "application/json" else {}
    email = data.get("email") or "agenda.empresa@gmail.com"
    database.update_settings({"google_calendar_account": email})
    return {"success": True, "account": email, "message": f"Google Agenda conectada para {email}!"}

# ----------------- ROTAS: EMAIL DA EMPRESA -----------------
@app.get("/api/email/inbox")
async def api_get_company_emails(folder: str = "inbox"):
    settings = database.get_settings()
    emails = database.get_company_emails(folder=folder)
    return {
        "connected": settings.get("gmail_connected") == "true",
        "account": settings.get("gmail_account", "contato.empresa@gmail.com"),
        "emails": emails
    }

@app.post("/api/email/inbox")
async def api_send_company_email(payload: CompanyEmailSendPayload):
    settings = database.get_settings()
    from_email = settings.get("gmail_account", "contato.empresa@gmail.com")
    email_id = database.save_company_email(
        subject=payload.subject,
        from_email=from_email,
        to_email=payload.to_email,
        body=payload.body,
        folder="sent",
        lead_id=payload.lead_id
    )
    return {"success": True, "email_id": email_id, "message": f"E-mail enviado com sucesso para {payload.to_email}!"}

@app.post("/api/email/connect-google")
async def api_email_connect_google(request: Request):
    data = await request.json() if request.headers.get("content-type") == "application/json" else {}
    email = data.get("email") or "contato.empresa@gmail.com"
    database.update_settings({"gmail_account": email, "gmail_connected": "true"})
    return {"success": True, "account": email, "message": f"Conta Gmail ({email}) conectada com sucesso!"}

@app.post("/api/email/{email_id}/read")
async def api_email_mark_read(email_id: int):
    database.mark_email_read(email_id)
    return {"success": True}

# ----------------- ROTAS: AGENTES DE IA -----------------
@app.get("/api/ai/agents")
async def api_get_ai_agents(status: Optional[str] = None):
    return {"agents": database.get_ai_agents(status=status)}

@app.post("/api/ai/agents")
async def api_create_ai_agent(payload: AIAgentPayload):
    agent_id = database.create_ai_agent(
        name=payload.name,
        provider=payload.provider or "google",
        model=payload.model or "gemini-2.5-flash",
        agent_type=payload.agent_type or "mcp_agent",
        system_prompt=payload.system_prompt or "",
        priority=payload.priority or 0,
        is_default=payload.is_default or 0,
        status=payload.status or "ativo"
    )
    return {"success": True, "agent_id": agent_id}

@app.put("/api/ai/agents/{agent_id}")
async def api_update_ai_agent(agent_id: int, payload: AIAgentUpdatePayload):
    database.update_ai_agent(
        agent_id=agent_id,
        name=payload.name,
        provider=payload.provider,
        model=payload.model,
        system_prompt=payload.system_prompt,
        priority=payload.priority,
        status=payload.status
    )
    return {"success": True}

@app.delete("/api/ai/agents/{agent_id}")
async def api_delete_ai_agent(agent_id: int):
    database.delete_ai_agent(agent_id)
    return {"success": True}

# ----------------- ROTAS: FOLLOW-UPS -----------------
@app.get("/api/ai/followups")
async def api_get_ai_followups():
    return {"followups": database.get_ai_followups()}

@app.post("/api/ai/followups")
async def api_create_ai_followup(payload: AIFollowupPayload):
    flow_id = database.create_ai_followup(
        name=payload.name,
        trigger_type=payload.trigger_type or "silence_24h",
        conditions_json=json.dumps(payload.conditions or {}, ensure_ascii=False),
        steps_json=json.dumps(payload.steps or [], ensure_ascii=False),
        status=payload.status or "ativo"
    )
    return {"success": True, "flow_id": flow_id}

@app.delete("/api/ai/followups/{flow_id}")
async def api_delete_ai_followup(flow_id: int):
    database.delete_ai_followup(flow_id)
    return {"success": True}

# ----------------- ROTAS: COFRE DE CONHECIMENTO -----------------
@app.get("/api/ai/knowledge")
async def api_get_knowledge_vault():
    settings = database.get_settings()
    return {
        "items": database.get_knowledge_vault(),
        "drive_connected": settings.get("google_drive_connected") == "true",
        "drive_folder": settings.get("google_drive_folder", "Cofre CRM Comercial"),
        "curator_instructions": settings.get("curator_instructions", "")
    }

@app.post("/api/ai/knowledge")
async def api_create_knowledge_item(payload: KnowledgeVaultPayload):
    item_id = database.create_knowledge_item(
        title=payload.title,
        source_type=payload.source_type or "document",
        summary=payload.summary or "",
        chunks_count=payload.chunks_count or 1
    )
    return {"success": True, "item_id": item_id}

@app.delete("/api/ai/knowledge/{item_id}")
async def api_delete_knowledge_item(item_id: int):
    database.delete_knowledge_item(item_id)
    return {"success": True}

@app.post("/api/ai/knowledge/{item_id}/reprepare")
async def api_reprepare_knowledge_item(item_id: int):
    database.update_knowledge_item(item_id, last_prepared="agora mesmo", status="pronto")
    return {"success": True, "message": "Material reindexado com sucesso para os agentes!"}

@app.post("/api/ai/knowledge/connect-drive")
async def api_connect_google_drive(request: Request):
    data = await request.json() if request.headers.get("content-type") == "application/json" else {}
    folder = data.get("folder") or "Cofre CRM Comercial"
    database.update_settings({"google_drive_folder": folder, "google_drive_connected": "true"})
    return {"success": True, "folder": folder, "message": f"Google Drive conectado à pasta '{folder}'!"}

@app.post("/api/ai/knowledge/analyze-curator")
async def api_analyze_curator(request: Request):
    return {
        "success": True,
        "proposals": [
            {"topic": "Condições de Pagamento", "suggestion": "Adicionar regra explícita para parcelamento em até 10x na comanda."},
            {"topic": "Suporte Pós-Lançamento", "suggestion": "Esclarecer que os primeiros 30 dias de suporte pós-redesign são gratuitos."}
        ],
        "message": "Curadoria concluída com sucesso! 2 propostas geradas para revisão."
    }

# ----------------- ROTAS: CALCULADORA DE PRECIFICAÇÃO -----------------
@app.post("/api/pricing/calculate")
async def api_calculate_pricing(payload: PricingCalculatePayload):
    settings = database.get_settings()
    base_hour = float(settings.get("pricing_base_hour", 90.0) or 90.0)
    urgency_rate = float(settings.get("pricing_urgency_rate", 20.0) or 20.0) / 100.0
    outsource_margin = float(settings.get("pricing_outsource_margin", 30.0) or 30.0) / 100.0

    # Estimativa de horas com base no tipo
    type_hours = {
        "Landing Page": 18.0,
        "Site Institucional": 32.0,
        "E-commerce": 58.0,
        "Portal de Serviços": 45.0,
        "Identificar automaticamente": 28.0
    }
    hours = type_hours.get(payload.project_type, 28.0)
    if not payload.is_redesign:
        hours *= 1.35  # Criação do zero leva mais tempo

    # Multiplicador regional
    uf_upper = (payload.uf or "").upper().strip()
    uf_mult = 1.0
    if uf_upper in ("SP", "RJ", "DF"):
        uf_mult = 1.25
    elif uf_upper in ("SC", "PR", "RS", "MG"):
        uf_mult = 1.15
    elif uf_upper in ("BA", "PE", "CE", "GO"):
        uf_mult = 1.05

    # Multiplicador de posicionamento
    pos_mult = {
        "Especialista de Alto Valor": 1.35,
        "Agência Premium": 1.5,
        "Usar o padrão da empresa": 1.0,
        "Custo-benefício Acessível": 0.85
    }.get(payload.positioning, 1.0)

    raw_calc = hours * base_hour * uf_mult * pos_mult

    if payload.outsource:
        raw_calc *= (1.0 + outsource_margin)
    if payload.urgency:
        raw_calc *= (1.0 + urgency_rate)

    # Arredonda para centena mais próxima
    recommended = round(raw_calc / 50.0) * 50.0
    min_price = round((recommended * 0.8) / 50.0) * 50.0
    max_price = round((recommended * 1.35) / 50.0) * 50.0

    client_display = payload.client_name.strip() or "Empresa Parceira"
    segment_display = payload.segment.strip() or "Comércio Local / Serviços"
    city_display = f"{payload.city}/{payload.uf}" if payload.city else "Brasil"

    proposal_md = f"""# Proposta de Modernização Digital — {client_display}
**Segmento:** {segment_display} | **Localização:** {city_display}
**Modelo:** {"Redesign Otimizado" if payload.is_redesign else "Criação do Zero"} | **Prazo Estimado:** {payload.timeline or "3 a 4 semanas"}

### Escopo do Projeto:
1. Arquitetura de informação moderna e responsiva (Desktop + Mobile)
2. Copywriting orientado a conversão e botões diretos para WhatsApp
3. Integração com Google Meu Negócio, SEO técnico e Meta Pixel
4. Painel de atualização rápida e certificado SSL incluso

### Investimento Recomendado:
- **Valor Recomendado:** **R$ {recommended:,.2f}**
- **Faixa de Mercado Aceitável:** R$ {min_price:,.2f} a R$ {max_price:,.2f}
- **Condições:** 50% de entrada + 50% na aprovação final (ou em até 10x via cartão)
"""

    breakdown = {
        "base_hour": base_hour,
        "estimated_hours": hours,
        "regional_factor": uf_mult,
        "positioning_factor": pos_mult,
        "urgency_applied": payload.urgency,
        "outsource_applied": payload.outsource
    }

    sim_data = {
        "website_url": payload.website_url,
        "client_name": payload.client_name,
        "city": payload.city,
        "uf": payload.uf,
        "segment": payload.segment,
        "project_type": payload.project_type,
        "timeline": payload.timeline,
        "positioning": payload.positioning,
        "is_redesign": payload.is_redesign,
        "outsource": payload.outsource,
        "urgency": payload.urgency,
        "recommended_price": recommended,
        "min_price": min_price,
        "max_price": max_price,
        "estimated_hours": hours,
        "breakdown": breakdown,
        "proposal_text": proposal_md
    }
    database.save_pricing_simulation(sim_data)

    return {
        "success": True,
        "recommended_price": recommended,
        "min_price": min_price,
        "max_price": max_price,
        "estimated_hours": hours,
        "breakdown": breakdown,
        "proposal_text": proposal_md
    }

@app.get("/api/pricing/simulations")
async def api_get_pricing_simulations():
    return {"simulations": database.get_pricing_simulations()}

# ----------------- ROTAS: AUDITORIA E DUPLICADOS -----------------
@app.get("/api/audit/logs")
async def api_get_audit_logs():
    return {"logs": database.get_audit_logs()}

@app.get("/api/contacts/duplicates")
async def api_get_contact_duplicates():
    conn = database.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT whatsapp, COUNT(*) as cnt, GROUP_CONCAT(name, ' | ') as names, GROUP_CONCAT(id, ',') as ids
        FROM leads
        WHERE whatsapp != '' AND whatsapp IS NOT NULL
        GROUP BY whatsapp
        HAVING cnt > 1
        ORDER BY cnt DESC
    """)
    dups = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"duplicates_count": len(dups), "duplicates": dups}

# ----------------- ROTAS: DISPARADOR AUTOMÁTICO -----------------
class DispatchCampaignCreatePayload(BaseModel):
    name: str = "Campanha Automática"
    template: str
    target_group: Optional[str] = "selection"
    total_leads: Optional[int] = 0
    sent_count: Optional[int] = 0
    failed_count: Optional[int] = 0
    status: Optional[str] = "concluido"

@app.post("/api/disparador/campaign")
async def api_save_dispatch_campaign(payload: DispatchCampaignCreatePayload):
    camp_id = database.save_dispatch_campaign(payload.model_dump())
    database.log_audit("Operador", "Executar Disparo Automático", "campanha", str(camp_id), f"{payload.sent_count} disparos enviados")
    return {"success": True, "campaign_id": camp_id}

@app.get("/api/disparador/campaigns")
async def api_get_dispatch_campaigns():
    return {"campaigns": database.get_dispatch_campaigns()}

@app.get("/api/disparador/stats")
async def api_get_disparador_stats():
    conn = database.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM leads WHERE (whatsapp != '' AND whatsapp IS NOT NULL) OR (phone != '' AND phone IS NOT NULL)")
    leads_with_phone = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM leads WHERE campaign_status = 'contatado' OR follow_stage = 'contatado'")
    leads_contatados = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM dispatch_campaigns")
    total_campaigns = cursor.fetchone()[0]
    cursor.execute("SELECT COALESCE(SUM(sent_count), 0) FROM dispatch_campaigns")
    total_sent = cursor.fetchone()[0]
    conn.close()
    return {
        "leads_with_phone": leads_with_phone,
        "leads_contatados": leads_contatados,
        "total_campaigns": total_campaigns,
        "total_sent": total_sent
    }



if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    # Modo de produção estável (sem reload automático para evitar loops com SQLite e waha-sessions)
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
