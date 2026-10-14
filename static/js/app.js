// KAPTADOR - B2B Lead Harvester & Sales Engine Application Script

let currentLeads = [];
let activeFilter = 'all';
let currentScanId = null;
let activeLeadForModal = null;
let currentEventSource = null;
let currentUser = { id: 1, username: 'operador1', name: 'Operador 1', role: 'operador' };
let systemUsers = [];
let pendingCleanupMode = 'all';

function formatBRL(value) {
    const num = parseFloat(value) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function parseBRLInput(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return isNaN(value) ? 0 : value;
    let s = String(value).trim().replace(/r\$/gi, '').trim();
    if (!s) return 0;
    if (s.includes('.') && s.includes(',')) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
        s = s.replace(',', '.');
    } else if (s.includes('.') && s.split('.')[1] && s.split('.')[1].length === 3) {
        s = s.replace(/\./g, '');
    }
    const num = parseFloat(s);
    return isNaN(num) ? 0 : num;
}

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    checkAuthMe();
    loadDashboardStats();
    loadLeads();
    loadSettings();
    loadRecentScans();
    setupEventListeners();
    checkWahaStatus(false);
});

// 1. NAVEGAÇÃO (DESKTOP SIDEBAR + MOBILE BOTTOM BAR)
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const bottomNavItems = document.querySelectorAll('.bottom-nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    const pageTitle = document.getElementById('page-title-text');

    const titlesMap = {
        'dashboard': 'Visão Geral & Métricas',
        'scraper': 'Varredura de Leads B2B',
        'campaigns': 'Pipeline de Prospecção & CRM',
        'chat': 'WhatsApp Web & Central Multi-Canal',
        'whatsapp': 'Central de Automação WhatsApp (WAHA)',
        'settings': 'Configurações do Sistema'
    };

    function switchTab(tabId) {
        window.switchTab = switchTab;
        navItems.forEach(n => {
            if (n.getAttribute('data-tab') === tabId) n.classList.add('active');
            else n.classList.remove('active');
        });

        bottomNavItems.forEach(b => {
            if (b.getAttribute('data-tab') === tabId) b.classList.add('active');
            else b.classList.remove('active');
        });

        tabContents.forEach(t => t.classList.remove('active'));
        const targetTab = document.getElementById(`tab-${tabId}`);
        if (targetTab) targetTab.classList.add('active');

        if (pageTitle && titlesMap[tabId]) {
            pageTitle.textContent = titlesMap[tabId];
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (tabId === 'dashboard') {
            loadDashboardStats();
            loadDashboardRecentLeads();
        }
        if (tabId === 'campaigns') loadCampaignsView();
        if (tabId === 'chat') {
            if (typeof loadChatConversations === 'function') loadChatConversations();
            if (typeof startChatPolling === 'function') startChatPolling();
        } else {
            if (typeof stopChatPolling === 'function') stopChatPolling();
        }
        if (tabId === 'whatsapp') {
            if (typeof startWahaTabPolling === 'function') startWahaTabPolling();
            updateBulkAudienceCount();
        } else {
            if (typeof stopWahaTabPolling === 'function') stopWahaTabPolling();
        }
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => switchTab(item.getAttribute('data-tab')));
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            const tab = item.getAttribute('data-tab');
            if (tab && typeof draggedLeadId !== 'undefined' && draggedLeadId) {
                switchTab(tab);
            }
        });
    });

    bottomNavItems.forEach(item => {
        item.addEventListener('click', () => switchTab(item.getAttribute('data-tab')));
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            const tab = item.getAttribute('data-tab');
            if (tab && typeof draggedLeadId !== 'undefined' && draggedLeadId) {
                switchTab(tab);
            }
        });
    });
    window.switchTab = switchTab;
}

// 2. CARREGAR ESTATÍSTICAS DO DASHBOARD
async function loadDashboardStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        
        if (document.getElementById('stat-total-leads')) document.getElementById('stat-total-leads').textContent = data.total_leads || 0;
        if (document.getElementById('stat-no-website')) document.getElementById('stat-no-website').textContent = data.no_website || 0;
        if (document.getElementById('stat-with-whatsapp')) document.getElementById('stat-with-whatsapp').textContent = data.with_whatsapp || 0;
        if (document.getElementById('stat-with-email')) document.getElementById('stat-with-email').textContent = data.with_email || 0;
        
        // Novos KPIs Financeiros e Fechamento
        if (document.getElementById('stat-total-fechado-valor')) {
            document.getElementById('stat-total-fechado-valor').textContent = formatBRL(data.total_fechado_valor);
        }
        if (document.getElementById('stat-leads-fechado-count')) {
            document.getElementById('stat-leads-fechado-count').textContent = data.leads_fechado || 0;
        }
        if (document.getElementById('stat-total-proposta-valor')) {
            document.getElementById('stat-total-proposta-valor').textContent = formatBRL(data.total_proposta_valor);
        }
        if (document.getElementById('stat-leads-proposta-count')) {
            document.getElementById('stat-leads-proposta-count').textContent = data.leads_proposta || 0;
        }
        if (document.getElementById('stat-conversion-rate')) {
            document.getElementById('stat-conversion-rate').textContent = `${data.conversion_rate || 0}%`;
        }
        if (document.getElementById('stat-avg-ticket')) {
            document.getElementById('stat-avg-ticket').textContent = formatBRL(data.avg_ticket);
        }

        // Usuários do sistema
        if (data.users && Array.isArray(data.users)) {
            systemUsers = data.users;
            updateOperatorDropdowns();
        }
        
        renderRecentScansList(data.recent_scans || []);
        loadDashboardRecentLeads();
    } catch (err) {
        console.error("Erro ao carregar estatísticas:", err);
    }
}

async function loadDashboardRecentLeads() {
    const container = document.getElementById('dashboard-leads-grid');
    if (!container) return;

    if (!currentLeads || currentLeads.length === 0) {
        try {
            const res = await fetch('/api/leads');
            currentLeads = await res.json();
        } catch (e) {
            console.error("Erro ao buscar leads para o radar:", e);
        }
    }

    if (!currentLeads || currentLeads.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 36px 20px; color: var(--text-secondary); font-size: 13.5px; font-weight: 500; background: rgba(17, 14, 36, 0.4); border: 1px dashed var(--border-color); border-radius: 10px;">
                <i class="fas fa-crosshairs fa-2x" style="opacity: 0.8; margin-bottom: 12px; display: block; color: var(--neon-cyan);"></i>
                <strong style="color: #ffffff;">Nenhum lead disponível no radar.</strong><br>
                <small style="color: var(--text-muted); font-size: 12px; margin-top: 4px; display: inline-block;">Execute uma varredura para capturar leads e abastecer seu pipeline comercial!</small>
            </div>
        `;
        return;
    }

    const displayLeads = currentLeads.slice(0, 9);
    container.innerHTML = displayLeads.map(lead => {
        const rawPhone = lead.whatsapp || lead.phone || '';
        const hasWeb = lead.has_website && lead.website;
        const dealVal = parseFloat(lead.deal_value || 0);
        const status = (lead.campaign_status || 'novo').toLowerCase();
        
        const statusMap = {
            'novo': { label: 'Novo Lead', color: 'var(--neon-cyan)', bg: 'rgba(0, 210, 255, 0.12)' },
            'contatado': { label: 'Em Contato', color: 'var(--purple-light)', bg: 'rgba(168, 85, 247, 0.12)' },
            'proposta': { label: 'Proposta Enviada', color: 'var(--alert-orange)', bg: 'rgba(255, 123, 0, 0.12)' },
            'fechado': { label: 'Fechado / Cliente', color: 'var(--neon-green)', bg: 'rgba(0, 255, 136, 0.12)' }
        };
        const st = statusMap[status] || statusMap['novo'];

        return `
            <div class="dashboard-lead-card" 
                 draggable="true" 
                 ondragstart="onCardDragStart(event, ${lead.id})" 
                 ondragend="onCardDragEnd(event)">
                
                <div>
                    <div class="dashboard-lead-header">
                        <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
                            <i class="fas fa-grip-vertical" style="color:var(--neon-cyan); cursor:grab; font-size:13px; flex-shrink:0;" title="Arraste para a aba CRM ou para as colunas!"></i>
                            <span class="dashboard-lead-name" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(lead.name)}</span>
                        </div>
                        <span style="font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:4px; color:${st.color}; background:${st.bg}; border:1px solid ${st.color}40; flex-shrink:0;">
                            ${st.label}
                        </span>
                    </div>

                    <div class="dashboard-lead-meta">
                        <div><i class="fas fa-map-marker-alt" style="color:var(--neon-green); margin-right:4px;"></i>${escapeHtml(lead.address || 'Endereço não informado')}</div>
                        ${lead.phone ? `<div style="margin-top:2px;"><i class="fas fa-phone-alt" style="color:var(--neon-cyan); margin-right:4px;"></i>${lead.phone}</div>` : ''}
                    </div>

                    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">
                        ${!hasWeb 
                            ? `<span class="badge-no-site" style="font-size:10px; padding:2px 6px;">Sem Site</span>` 
                            : `<span class="badge-has-site" style="font-size:10px; padding:2px 6px;"><i class="fas fa-globe"></i> Com Site</span>`}
                        ${lead.whatsapp 
                            ? `<span style="font-size:10.5px; color:var(--neon-green);"><i class="fab fa-whatsapp"></i> WA</span>` 
                            : ''}
                        ${dealVal > 0 
                            ? `<span class="badge-deal-value" style="font-size:10.5px; padding:2px 6px;">${formatBRL(dealVal)}</span>` 
                            : ''}
                    </div>
                </div>

                <div class="dashboard-lead-footer">
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button type="button" class="btn btn-secondary btn-sm" onclick="quickSendToCRM(event, ${lead.id})" title="Abrir e gerenciar no Pipeline" style="font-size:11px; padding:3px 8px; color:var(--neon-cyan); border-color:rgba(0,210,255,0.3);">
                            <i class="fas fa-columns"></i> CRM
                        </button>
                        <button type="button" class="btn btn-secondary btn-sm" onclick="openLeadModal(${lead.id})" title="Ver ficha técnica" style="font-size:11px; padding:3px 8px;">
                            <i class="fas fa-eye"></i> Detalhes
                        </button>
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="deleteLeadConfirm(event, ${lead.id})" title="Remover este lead da lista" style="color:#ff5b73; border-color:rgba(255,91,115,0.3); font-size:11px; padding:3px 7px;">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

window.quickSendToCRM = function(e, leadId) {
    if (e && e.stopPropagation) e.stopPropagation();
    switchTab('campaigns');
    setTimeout(() => {
        const card = document.querySelector(`.kanban-card[ondragstart*="${leadId}"]`);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.style.boxShadow = '0 0 20px var(--neon-cyan)';
            setTimeout(() => { card.style.boxShadow = ''; }, 1500);
        }
    }, 250);
};

// 3. EVENT LISTENERS
function setupEventListeners() {
    // Formulário de Varredura
    const form = document.getElementById('scan-form');
    if (form) {
        form.addEventListener('submit', handleScanSubmit);
    }

    // Consulta de CEP em Tempo Real
    const cepInput = document.getElementById('cep-input');
    if (cepInput) {
        cepInput.addEventListener('input', async (e) => {
            const raw = e.target.value.replace(/\D/g, '');
            if (raw.length === 8) {
                try {
                    const res = await fetch(`/api/cep/${raw}`);
                    const json = await res.json();
                    if (json.found && json.data) {
                        const d = json.data;
                        const locInput = document.getElementById('location-input');
                        if (locInput) locInput.value = d.formatted;

                        const badge = document.getElementById('cep-resolved-badge');
                        const badgeText = document.getElementById('cep-resolved-text');
                        if (badge && badgeText) {
                            badgeText.innerHTML = `<strong>${d.cidade} - ${d.uf}</strong> ${d.bairro ? `(Bairro: ${d.bairro})` : ''} | <strong>DDD (${d.ddd || '12'})</strong> verificado via ViaCEP`;
                            badge.style.display = 'block';
                        }
                    }
                } catch (err) {
                    console.error("Erro ao consultar CEP:", err);
                }
            } else if (raw.length < 8) {
                const badge = document.getElementById('cep-resolved-badge');
                if (badge) badge.style.display = 'none';
            }
        });
    }

    // Filtros da tabela
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.getAttribute('data-filter');
            applyFiltersAndRender();
        });
    });

    // Busca rápida na tabela
    const searchInput = document.getElementById('table-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = currentLeads.filter(l => 
                (l.name && l.name.toLowerCase().includes(term)) ||
                (l.phone && l.phone.toLowerCase().includes(term)) ||
                (l.email && l.email.toLowerCase().includes(term)) ||
                (l.address && l.address.toLowerCase().includes(term))
            );
            renderLeadsTable(filtered);
        });
    }

    // Modal Detalhes close
    const modalClose = document.getElementById('modal-close-btn');
    const modalOverlay = document.getElementById('lead-details-modal');
    if (modalClose && modalOverlay) {
        modalClose.addEventListener('click', () => modalOverlay.classList.remove('active'));
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) modalOverlay.classList.remove('active');
        });
    }

    // Modal Importação close on overlay click
    const importOverlay = document.getElementById('import-data-modal');
    if (importOverlay) {
        importOverlay.addEventListener('click', (e) => {
            if (e.target === importOverlay) importOverlay.classList.remove('active');
        });
    }

    // Modal Lightbox close on overlay click
    const lightboxOverlay = document.getElementById('photo-lightbox-modal');
    if (lightboxOverlay) {
        lightboxOverlay.addEventListener('click', (e) => {
            if (e.target === lightboxOverlay) closePhotoLightbox();
        });
    }

    // Modal Relatório Executivo close on overlay click
    const reportOverlay = document.getElementById('executive-report-modal');
    if (reportOverlay) {
        reportOverlay.addEventListener('click', (e) => {
            if (e.target === reportOverlay) closeExecutiveReportModal();
        });
    }

    // Modal Confirmar Limpeza close on overlay click
    const clearOverlay = document.getElementById('confirm-clear-modal');
    if (clearOverlay) {
        clearOverlay.addEventListener('click', (e) => {
            if (e.target === clearOverlay) closeClearModal();
        });
    }

    // Formulário de Configurações
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', handleSaveSettings);
    }
}

// 4. EXECUÇÃO DA VARREDURA COM SSE EM TEMPO REAL
async function handleScanSubmit(e) {
    e.preventDefault();
    
    const niche = document.getElementById('niche-input').value.trim();
    const location = document.getElementById('location-input').value.trim();
    const cep = document.getElementById('cep-input') ? document.getElementById('cep-input').value.trim() : '';
    const maxLeads = document.getElementById('max-leads-select').value || 15;

    if (!niche || !location) {
        alert("Por favor, preencha o Nicho e a Localização para iniciar a varredura!");
        return;
    }

    const startBtn = document.getElementById('start-scan-btn');
    const progressPanel = document.getElementById('progress-panel');
    const progressBar = document.getElementById('progress-bar-fill');
    const progressPercent = document.getElementById('progress-percent-text');
    const progressStatus = document.getElementById('progress-status-text');
    const terminalLogs = document.getElementById('terminal-logs');

    // UI Feedback
    startBtn.disabled = true;
    startBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ESCANEANDO...`;
    progressPanel.style.display = 'block';
    terminalLogs.innerHTML = '';
    progressBar.style.width = '0%';
    progressPercent.textContent = '0%';
    progressStatus.innerHTML = `<i class="fas fa-satellite-dish fa-spin"></i> Conectando radar de leads...`;

    // Fecha stream anterior se houver
    if (currentEventSource) {
        currentEventSource.close();
    }

    let streamUrl = `/api/scan/stream?niche=${encodeURIComponent(niche)}&location=${encodeURIComponent(location)}&max_leads=${maxLeads}`;
    if (cep) {
        streamUrl += `&cep=${encodeURIComponent(cep)}`;
    }
    currentEventSource = new EventSource(streamUrl);

    function addLog(msg) {
        const now = new Date().toLocaleTimeString();
        const line = document.createElement('div');
        line.className = 'log-line';
        line.innerHTML = `<span class="log-time">[${now}]</span> <span class="log-prefix">&gt;</span> <span>${msg}</span>`;
        terminalLogs.appendChild(line);
        terminalLogs.scrollTop = terminalLogs.scrollHeight;
    }

    addLog(`Iniciando varredura para nicho: "${niche}" em "${location}"`);

    currentEventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            // Atualizar barra de progresso
            if (data.percent !== undefined) {
                progressBar.style.width = `${data.percent}%`;
                progressPercent.textContent = `${data.percent}%`;
            }

            if (data.message) {
                progressStatus.innerHTML = `<i class="fas fa-radar fa-spin"></i> ${data.message}`;
                addLog(data.message);
            }

            // Ao finalizar a varredura
            if (data.step === 'finished') {
                currentEventSource.close();
                startBtn.disabled = false;
                startBtn.innerHTML = `<i class="fas fa-bolt"></i> INICIAR VARREDURA`;
                progressStatus.innerHTML = `<i class="fas fa-check-circle" style="color:var(--neon-green)"></i> ${data.message}`;
                
                currentScanId = data.scan_id;
                loadDashboardStats();
                loadLeads(data.scan_id);
                loadRecentScans();
            }
        } catch (err) {
            console.error("Erro no parse do SSE:", err);
        }
    };

    currentEventSource.onerror = (err) => {
        console.error("Erro no SSE:", err);
        currentEventSource.close();
        startBtn.disabled = false;
        startBtn.innerHTML = `<i class="fas fa-bolt"></i> INICIAR VARREDURA`;
        addLog("Conexão com o scanner finalizada.");
        loadDashboardStats();
        loadLeads();
    };
}

// 5. CARREGAR E RENDERIZAR TABELA DE LEADS
async function loadLeads(scanId = null) {
    try {
        let url = '/api/leads';
        if (scanId) url += `?scan_id=${scanId}`;
        const res = await fetch(url);
        currentLeads = await res.json();
        applyFiltersAndRender();
        loadDashboardRecentLeads();
    } catch (err) {
        console.error("Erro ao carregar leads:", err);
    }
}
window.loadLeads = loadLeads;

function getLeadPhotos(lead) {
    if (!lead || !lead.photos) return [];
    if (Array.isArray(lead.photos)) return lead.photos;
    if (typeof lead.photos === 'string') {
        try {
            const parsed = JSON.parse(lead.photos);
            if (Array.isArray(parsed)) return parsed;
        } catch (e) {}
    }
    return [];
}

function applyFiltersAndRender() {
    let filtered = [...currentLeads];

    if (activeFilter === 'no-site') {
        filtered = filtered.filter(l => !l.has_website || !l.website);
    } else if (activeFilter === 'whatsapp') {
        filtered = filtered.filter(l => l.whatsapp && l.whatsapp.trim().length > 0);
    } else if (activeFilter === 'instagram') {
        filtered = filtered.filter(l => l.instagram && l.instagram.trim().length > 0);
    } else if (activeFilter === 'photos') {
        filtered = filtered.filter(l => getLeadPhotos(l).length > 0);
    } else if (activeFilter === 'email') {
        filtered = filtered.filter(l => l.email && l.email.trim().length > 0);
    } else if (activeFilter === 'proposta') {
        filtered = filtered.filter(l => l.campaign_status === 'proposta');
    } else if (activeFilter === 'fechado') {
        filtered = filtered.filter(l => l.campaign_status === 'fechado');
    } else if (activeFilter === 'my-leads') {
        if (currentUser && currentUser.name) {
            filtered = filtered.filter(l => l.assigned_to && l.assigned_to.toLowerCase() === currentUser.name.toLowerCase());
        }
    }

    // Filtro por operador do select
    const opSelect = document.getElementById('table-operator-filter');
    if (opSelect && opSelect.value && opSelect.value !== 'all') {
        filtered = filtered.filter(l => (l.assigned_to || '') === opSelect.value);
    }

    // Busca rápida
    const searchInput = document.getElementById('table-search-input');
    if (searchInput && searchInput.value.trim()) {
        const term = searchInput.value.trim().toLowerCase();
        filtered = filtered.filter(l =>
            (l.name && l.name.toLowerCase().includes(term)) ||
            (l.phone && l.phone.toLowerCase().includes(term)) ||
            (l.email && l.email.toLowerCase().includes(term)) ||
            (l.address && l.address.toLowerCase().includes(term)) ||
            (l.assigned_to && l.assigned_to.toLowerCase().includes(term)) ||
            (l.deal_value && String(l.deal_value).includes(term))
        );
    }

    renderLeadsTable(filtered);
}

function renderLeadsTable(leads) {
    const tbody = document.getElementById('leads-table-body');
    const countBadge = document.getElementById('table-count-badge');
    if (countBadge) countBadge.textContent = `${leads.length} encontrados`;

    if (!tbody) return;

    const mobileCardsContainer = document.getElementById('leads-mobile-cards');

    if (leads.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 40px; color: var(--text-secondary); font-size: 13.5px; font-weight: 500;">
                    <i class="fas fa-search" style="font-size: 28px; margin-bottom: 12px; display: block; opacity: 0.8; color: var(--neon-cyan);"></i>
                    Nenhum lead encontrado com os filtros selecionados.<br>
                    <small style="color: var(--text-muted); font-size: 12px; margin-top: 4px; display: inline-block;">Inicie uma nova varredura no formulário acima para capturar contatos!</small>
                </td>
            </tr>
        `;
        if (mobileCardsContainer) {
            mobileCardsContainer.innerHTML = `
                <div style="text-align: center; padding: 30px; color: var(--text-secondary); font-size: 13.5px; font-weight: 500;">
                    <i class="fas fa-search" style="font-size: 24px; margin-bottom: 10px; display: block; opacity: 0.8; color: var(--neon-cyan);"></i>
                    Nenhum lead encontrado com os filtros selecionados.
                </div>
            `;
        }
        return;
    }

    // 1. Renderiza a tabela clássica (para Desktop)
    tbody.innerHTML = leads.map(lead => {
        const rawPhone = lead.whatsapp || lead.phone || '';
        const waLink = rawPhone 
            ? `<div style="display:flex; gap:6px; align-items:center;">
                 <button type="button" class="btn btn-whatsapp btn-sm" onclick="handleTableConversarClick(${lead.id})" title="Disparar mensagem via WAHA">
                   <i class="fab fa-whatsapp"></i> Conversar
                 </button>
                 <a href="https://wa.me/${rawPhone.replace(/\D/g, '')}?text=${encodeURIComponent(getPitchMessage(lead))}" target="_blank" class="btn btn-secondary btn-sm" style="padding: 4px 7px;" title="Abrir WhatsApp Web manualmente">
                   <i class="fas fa-external-link-alt"></i>
                 </a>
               </div>`
            : `<span style="color:var(--text-secondary); font-size:12px; font-weight:500;">—</span>`;

        const phoneDisplay = lead.phone 
            ? `<span style="font-family:var(--font-mono); font-size:12.5px;"><i class="fas fa-phone-alt" style="color:var(--neon-cyan); margin-right:4px;"></i>${lead.phone}</span>`
            : `<span style="color:var(--text-secondary); font-size:12px; font-weight:500;">—</span>`;

        const dealVal = parseFloat(lead.deal_value || 0);
        const isProposta = (lead.campaign_status === 'proposta');
        const dealValueDisplay = `
            <div style="display:flex; align-items:center; gap:5px;">
                <span class="badge-deal-value ${isProposta ? 'proposta' : ''}" style="cursor:pointer;" onclick="editDealValueQuick(event, ${lead.id})" title="Clique para alterar valor em R$">${dealVal > 0 ? formatBRL(dealVal) : 'R$ 0,00'}</span>
                <button type="button" class="btn btn-secondary btn-sm" style="padding:2px 5px; font-size:10px; opacity:0.8;" onclick="editDealValueQuick(event, ${lead.id})" title="Alterar Valor">
                    <i class="fas fa-pen"></i>
                </button>
            </div>
        `;

        const assignedDisplay = lead.assigned_to
            ? `<span class="badge-assigned"><i class="fas fa-user"></i> ${escapeHtml(lead.assigned_to)}</span>`
            : `<span style="color:var(--text-secondary); font-size:11.5px; font-weight:500;">Sem resp.</span>`;

        const siteDisplay = lead.has_website && lead.website
            ? `<a href="${lead.website}" target="_blank" class="badge-has-site">
                 <i class="fas fa-external-link-alt"></i> ${truncateUrl(lead.website)}
               </a>`
            : `<span class="badge-no-site">
                 <i class="fas fa-exclamation-triangle"></i> Sem Site
               </span>`;

        const mapsHref = lead.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.name + ' ' + (lead.address || ''))}`;
        const googleHref = lead.google_url || `https://www.google.com/search?q=${encodeURIComponent(lead.name + ' ' + (lead.address || ''))}`;
        const analysisDisplay = `
            <div style="display:flex; gap:4px; align-items:center;">
                <a href="${mapsHref}" target="_blank" class="btn btn-secondary btn-sm" title="Abrir no Google Maps Oficial" style="padding:4px 7px; font-size:11.5px; color:var(--neon-cyan);">
                    <i class="fas fa-map-marked-alt"></i> Maps
                </a>
                <a href="${googleHref}" target="_blank" class="btn btn-secondary btn-sm" title="Buscar Empresa no Google" style="padding:4px 7px; font-size:11.5px; color:#ffb703;">
                    <i class="fab fa-google"></i> Busca
                </a>
            </div>
        `;

        return `
            <tr draggable="true" ondragstart="onCardDragStart(event, ${lead.id})" ondragend="onCardDragEnd(event)" style="cursor: grab;">
                <td style="text-align: center;">
                    <input type="checkbox" class="lead-select-checkbox" value="${lead.id}" onchange="updateSelectedLeadsCount()">
                </td>
                <td>
                    <div class="company-cell">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <i class="fas fa-grip-vertical" style="color:var(--text-secondary); cursor:grab; font-size:12px;" title="Arraste este lead para a aba Campanhas & CRM!"></i>
                            <span class="company-name">${escapeHtml(lead.name)}</span>
                        </div>
                        <span class="company-meta"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(lead.address || 'Local não especificado')}</span>
                        ${(() => {
                            const pList = getLeadPhotos(lead);
                            return pList.length > 0 
                                ? `<div style="margin-top:3px;"><span class="badge-photos" style="display:inline-flex; align-items:center; gap:4px; font-size:10.5px; padding:2px 7px; border-radius:4px; background:rgba(0, 210, 255, 0.12); border:1px solid rgba(0, 210, 255, 0.3); color:var(--neon-cyan); cursor:pointer;" onclick="openLeadPhotosModal(${lead.id})" title="Clique para ver o acervo de fotos reais"><i class="fas fa-camera"></i> ${pList.length} fotos reais</span></div>` 
                                : '';
                        })()}
                    </div>
                </td>
                <td>${waLink}</td>
                <td>${phoneDisplay}</td>
                <td>${dealValueDisplay}</td>
                <td>${assignedDisplay}</td>
                <td>${siteDisplay}</td>
                <td>${analysisDisplay}</td>
                <td>
                    <div style="display:flex; gap:5px; align-items:center;">
                        <button class="btn btn-secondary btn-sm" onclick="openLeadModal(${lead.id})" title="Ver Detalhes do Lead">
                            <i class="fas fa-eye"></i> Detalhes
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="deleteLeadConfirm(event, ${lead.id})" title="Remover este lead da lista" style="color:#ff5b73; border-color:rgba(255,91,115,0.3); padding:4px 7px;">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // 2. Renderiza os Cards Touch-Friendly (para Celular / Mobile)
    if (mobileCardsContainer) {
        mobileCardsContainer.innerHTML = leads.map(lead => {
            const hasWeb = lead.has_website && lead.website;
            const rawPhone = lead.whatsapp || lead.phone || '';
            const phoneDigits = rawPhone.replace(/\D/g, '');
            const telHref = phoneDigits ? `tel:${phoneDigits}` : '#';
            const photos = getLeadPhotos(lead);
            const mapsHref = lead.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.name + ' ' + (lead.address || ''))}`;
            const googleHref = lead.google_url || `https://www.google.com/search?q=${encodeURIComponent(lead.name + ' ' + (lead.address || ''))}`;
            const dealVal = parseFloat(lead.deal_value || 0);
            const isProposta = (lead.campaign_status === 'proposta');

            return `
                <div class="lead-mobile-card">
                    <div class="lead-card-header">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <input type="checkbox" class="lead-select-checkbox" value="${lead.id}" onchange="updateSelectedLeadsCount()">
                            <div>
                                <div class="lead-card-title">${escapeHtml(lead.name)}</div>
                                <span class="lead-card-category">${escapeHtml(lead.category || 'Comércio')}</span>
                            </div>
                        </div>
                        ${!hasWeb 
                            ? `<span class="badge-no-site" style="font-size:10.5px; padding:3px 7px;">Sem Site</span>` 
                            : `<a href="${lead.website}" target="_blank" class="badge-has-site" style="font-size:11.5px;"><i class="fas fa-globe"></i> Ver Site</a>`}
                    </div>

                    <div class="lead-card-address">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${escapeHtml(lead.address || 'Endereço local')}</span>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--text-secondary); margin-bottom: 6px;">
                        ${lead.phone ? `<span><i class="fas fa-phone"></i> ${lead.phone}</span>` : '<span>Sem telefone</span>'}
                        ${lead.email ? `<span><i class="fas fa-envelope"></i> ${lead.email}</span>` : ''}
                    </div>

                    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">
                        ${dealVal > 0 ? `<span class="badge-deal-value ${isProposta ? 'proposta' : ''}" style="font-size:11px; padding:2px 7px;">${formatBRL(dealVal)}</span>` : ''}
                        ${lead.assigned_to ? `<span class="badge-assigned" style="font-size:11px; padding:2px 7px;"><i class="fas fa-user"></i> ${escapeHtml(lead.assigned_to)}</span>` : ''}
                        ${photos.length > 0 ? `<button type="button" class="badge-photos" style="font-size:11px; padding:3px 7px;" onclick="openLeadPhotosModal(${lead.id})"><i class="fas fa-camera"></i> ${photos.length} fotos</button>` : ''}
                        <a href="${mapsHref}" target="_blank" class="badge-has-site" style="font-size:11px; padding:3px 7px; color:var(--neon-cyan); border-color:rgba(0,210,255,0.3);"><i class="fas fa-map-marked-alt"></i> Maps</a>
                        <a href="${googleHref}" target="_blank" class="badge-has-site" style="font-size:11px; padding:3px 7px; color:#ffb703; border-color:rgba(255,183,3,0.3);"><i class="fab fa-google"></i> Google</a>
                    </div>

                    <div class="lead-card-actions">
                        ${rawPhone 
                            ? `<button type="button" class="btn btn-whatsapp" style="text-align:center;" onclick="handleTableConversarClick(${lead.id})">
                                 <i class="fab fa-whatsapp"></i> Conversar WAHA
                               </button>` 
                            : (lead.phone ? `<a href="${telHref}" class="btn btn-secondary"><i class="fas fa-phone-alt"></i> Ligar</a>` : `<span class="btn btn-secondary" style="opacity:0.75; color:var(--text-secondary);">Sem Contato</span>`)}
                        
                        <button type="button" class="btn btn-secondary" onclick="openLeadModal(${lead.id})">
                            <i class="fas fa-eye"></i> Detalhes
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="deleteLeadConfirm(event, ${lead.id})" style="color:#ff5b73; border-color:rgba(255,91,115,0.3); padding:7px 11px;" title="Remover este lead da lista">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
    updateSelectedLeadsCount();
}

// 6. MODAL DE DETALHES & PITCH DE VENDAS
let currentModalPitchTab = 'contato';

function getFollowStageInfo(stage) {
    const s = (stage || 'contato').toLowerCase();
    if (s === 'follow1') {
        return { text: 'Follow 1', cls: 'stage-follow1' };
    }
    if (s === 'follow2') {
        return { text: 'Follow 2', cls: 'stage-follow2' };
    }
    return { text: 'Contato', cls: 'stage-contato' };
}

window.cycleLeadFollowStage = async function(e, leadId) {
    if (e) e.stopPropagation();
    const lead = currentLeads.find(l => l.id === leadId);
    if (!lead) return;

    const currentStage = (lead.follow_stage || 'contato').toLowerCase();
    let nextStage = 'follow1';
    if (currentStage === 'contato') nextStage = 'follow1';
    else if (currentStage === 'follow1') nextStage = 'follow2';
    else if (currentStage === 'follow2') nextStage = 'contato';

    lead.follow_stage = nextStage;

    // Atualiza imediatamente o botão no DOM para resposta visual instantânea
    if (e && e.currentTarget) {
        const btn = e.currentTarget;
        const info = getFollowStageInfo(nextStage);
        btn.className = `kanban-stage-btn ${info.cls}`;
        btn.textContent = info.text;
    }

    try {
        await fetch(`/api/leads/${leadId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ follow_stage: nextStage })
        });
    } catch (err) {
        console.error("Erro ao atualizar follow_stage:", err);
    }
};

window.openLeadModal = function(leadId) {
    const lead = currentLeads.find(l => l.id === leadId);
    if (!lead) return;
    activeLeadForModal = lead;

    document.getElementById('modal-lead-name').textContent = lead.name;
    document.getElementById('modal-lead-category').textContent = lead.category || 'Comércio Local';
    document.getElementById('modal-lead-address').textContent = lead.address || 'Não informado';
    document.getElementById('modal-lead-phone').textContent = lead.phone || 'Não informado';
    document.getElementById('modal-lead-whatsapp').textContent = lead.whatsapp || 'Não detectado';
    document.getElementById('modal-lead-email').textContent = lead.email || 'Não informado';

    // Links de Análise Real (Google Maps e Busca Google)
    const mapsBtn = document.getElementById('modal-google-maps-btn');
    if (mapsBtn) {
        const mapsHref = lead.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.name + ' ' + (lead.address || ''))}`;
        mapsBtn.href = mapsHref;
    }

    const googleBtn = document.getElementById('modal-google-search-btn');
    if (googleBtn) {
        const googleHref = lead.google_url || `https://www.google.com/search?q=${encodeURIComponent(lead.name + ' ' + (lead.address || ''))}`;
        googleBtn.href = googleHref;
    }

    // Instagram no modal
    const instaElem = document.getElementById('modal-lead-instagram');
    if (instaElem) {
        if (lead.instagram && lead.instagram.trim()) {
            const h = lead.instagram.trim();
            instaElem.innerHTML = `<a href="https://instagram.com/${h.replace('@', '')}" target="_blank" class="badge-instagram"><i class="fab fa-instagram"></i> ${escapeHtml(h)}</a>`;
        } else {
            instaElem.innerHTML = `<span style="color:var(--text-secondary); font-size:13px; font-weight:500;">Não detectado</span>`;
        }
    }

    // Galeria de Fotos no modal (INICIALMENTE OCULTA SOB DEMANDA DO USUÁRIO)
    const photosContainer = document.getElementById('modal-lead-photos-container');
    const photosGrid = document.getElementById('modal-lead-photos-grid');
    const photosCount = document.getElementById('modal-photos-count');
    const togglePhotosBtn = document.getElementById('btn-toggle-lead-photos');
    const photos = getLeadPhotos(lead);

    // Oculta a galeria ao abrir o modal
    if (photosContainer) {
        photosContainer.style.display = 'none';
    }
    if (photosCount) {
        photosCount.textContent = `(${photos.length} fotos reais mapeadas)`;
    }
    if (togglePhotosBtn) {
        togglePhotosBtn.innerHTML = `<i class="fas fa-eye"></i> Exibir Fotos Reais (${photos.length})`;
    }

    if (photosGrid) {
        if (photos.length > 0) {
            photosGrid.innerHTML = photos.map((url, idx) => `
                <div class="photo-card-item" onclick="openPhotoLightbox('${escapeHtml(url)}', '${escapeHtml(lead.name)} (Foto ${idx + 1} de ${photos.length})')">
                    <img src="${escapeHtml(url)}" alt="Foto ${idx+1}" loading="lazy">
                    <span class="photo-card-num">${idx + 1}</span>
                </div>
            `).join('');
        } else {
            photosGrid.innerHTML = `<div style="grid-column: 1 / -1; color: var(--text-secondary); font-size: 13px; padding: 14px; text-align: center; font-weight: 500;">Nenhuma foto capturada diretamente no Maps para este local.</div>`;
        }
    }
    
    // Status do site no modal
    const siteStatusElem = document.getElementById('modal-site-status');
    if (!lead.has_website || !lead.website) {
        siteStatusElem.innerHTML = `<span class="badge-no-site"><i class="fas fa-exclamation-triangle"></i> SEM SITE CADASTRADO (Lead Prioritário)</span>`;
    } else {
        siteStatusElem.innerHTML = `<a href="${lead.website}" target="_blank" class="badge-has-site"><i class="fas fa-globe"></i> ${lead.website}</a>`;
    }

    // Opportunity Score
    const scoreVal = lead.opportunity_score || (!lead.has_website ? 95 : 45);
    const scoreBadge = document.getElementById('modal-opp-score');
    if (scoreBadge) {
        scoreBadge.textContent = `${scoreVal}/100`;
        scoreBadge.className = `opp-badge ${scoreVal > 80 ? 'opp-high' : (scoreVal > 50 ? 'opp-med' : 'opp-low')}`;
    }

    // Define aba de pitch correspondente à etapa do lead
    const currentFollow = (lead.follow_stage || 'contato').toLowerCase();
    switchPitchScript(currentFollow === 'follow2' ? 'follow2' : (currentFollow === 'follow1' ? 'follow1' : 'contato'));

    // Status CRM select
    const statusSelect = document.getElementById('modal-crm-status');
    if (statusSelect) {
        statusSelect.value = lead.campaign_status || 'novo';
    }

    // Follow stage select
    const followSelect = document.getElementById('modal-follow-stage');
    if (followSelect) {
        followSelect.value = currentFollow;
    }

    // Deal Value e Data de Fechamento
    const dealInput = document.getElementById('modal-deal-value');
    if (dealInput) {
        dealInput.value = (lead.deal_value && lead.deal_value > 0) ? lead.deal_value : '';
    }
    const closedInfo = document.getElementById('modal-closed-at-info');
    const closedText = document.getElementById('modal-closed-at-text');
    if (closedInfo && closedText) {
        if (lead.closed_at) {
            closedText.textContent = lead.closed_at;
            closedInfo.style.display = 'inline-block';
        } else {
            closedInfo.style.display = 'none';
        }
    }

    // Operador Responsável (assigned_to)
    const assignedSelect = document.getElementById('modal-assigned-to');
    if (assignedSelect) {
        assignedSelect.value = lead.assigned_to || '';
    }

    document.getElementById('lead-details-modal').classList.add('active');
};

window.switchPitchScript = function(type) {
    currentModalPitchTab = type;
    document.querySelectorAll('.pitch-tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`tab-pitch-${type}`);
    if (activeBtn) activeBtn.classList.add('active');

    if (!activeLeadForModal) return;
    const pitchText = getPitchMessage(activeLeadForModal, type);
    document.getElementById('modal-pitch-text').textContent = pitchText;

    const modalWaBtn = document.getElementById('modal-send-wa-btn');
    if (activeLeadForModal.whatsapp) {
        modalWaBtn.style.display = 'inline-flex';
        modalWaBtn.href = `https://wa.me/${activeLeadForModal.whatsapp}?text=${encodeURIComponent(pitchText)}`;
    } else {
        modalWaBtn.style.display = 'none';
    }
};

window.copyModalPitch = function() {
    const text = document.getElementById('modal-pitch-text').textContent;
    navigator.clipboard.writeText(text).then(() => {
        alert("Pitch de abordagem copiado para a área de transferência!");
    });
};

window.updateModalDealValue = async function() {
    if (!activeLeadForModal) return;
    const dealInput = document.getElementById('modal-deal-value');
    const saveBtn = document.getElementById('btn-save-deal-val');
    const rawVal = dealInput ? dealInput.value : 0;
    const val = parseBRLInput(rawVal);
    
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Salvando...`;
    }

    try {
        const res = await fetch(`/api/leads/${activeLeadForModal.id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deal_value: val })
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
            activeLeadForModal.deal_value = val;
            const target = currentLeads.find(l => l.id === activeLeadForModal.id);
            if (target) target.deal_value = val;
            
            if (dealInput) {
                dealInput.value = val > 0 ? val : '';
            }

            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `<i class="fas fa-check"></i> Salvo!`;
                saveBtn.style.background = 'var(--neon-green)';
                saveBtn.style.color = '#000';
                setTimeout(() => {
                    saveBtn.innerHTML = `<i class="fas fa-save"></i> Salvar Valor`;
                    saveBtn.style.background = '';
                    saveBtn.style.color = '';
                }, 2000);
            }

            applyFiltersAndRender();
            loadDashboardStats();
            if (document.getElementById('tab-campaigns')?.classList.contains('active')) {
                loadCampaignsView();
            }

            if (typeof showToast === 'function') {
                showToast(`Valor de ${formatBRL(val)} salvo para ${activeLeadForModal.name}!`, 'success');
            }
        } else {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `<i class="fas fa-save"></i> Salvar Valor`;
            }
            alert(data.error || data.detail || "Erro ao salvar valor.");
        }
    } catch (err) {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<i class="fas fa-save"></i> Salvar Valor`;
        }
        console.error("Erro ao salvar valor:", err);
        alert("Erro ao salvar valor: " + err.message);
    }
};

window.setPresetDealValue = function(val) {
    const dealInput = document.getElementById('modal-deal-value');
    if (dealInput) {
        dealInput.value = val;
        updateModalDealValue();
    }
};

window.editDealValueQuick = async function(e, leadId) {
    if (e) e.stopPropagation();
    const lead = currentLeads.find(l => l.id === leadId);
    if (!lead) return;

    const currentVal = lead.deal_value || 0;
    const inputVal = prompt(`Alterar valor de fechamento/proposta para "${lead.name}":\n(Digite o valor em R$, ex: 1500 ou 2500,00)`, currentVal > 0 ? String(currentVal) : "1500");
    if (inputVal === null) return;

    const numVal = parseBRLInput(inputVal);
    try {
        const res = await fetch(`/api/leads/${leadId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deal_value: numVal })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            lead.deal_value = numVal;
            if (activeLeadForModal && activeLeadForModal.id === leadId) {
                activeLeadForModal.deal_value = numVal;
                const dealInput = document.getElementById('modal-deal-value');
                if (dealInput) dealInput.value = numVal > 0 ? numVal : '';
            }
            applyFiltersAndRender();
            loadDashboardStats();
            if (document.getElementById('tab-campaigns')?.classList.contains('active')) {
                loadCampaignsView();
            }
            if (typeof showToast === 'function') {
                showToast(`Valor de ${formatBRL(numVal)} salvo para ${lead.name}!`, 'success');
            }
        } else {
            alert(data.error || "Erro ao salvar valor.");
        }
    } catch (err) {
        alert("Erro ao conectar com servidor: " + err.message);
    }
};

window.updateModalAssignedTo = async function() {
    if (!activeLeadForModal) return;
    const assignedSelect = document.getElementById('modal-assigned-to');
    const assigned = assignedSelect.value;
    
    try {
        await fetch(`/api/leads/${activeLeadForModal.id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assigned_to: assigned })
        });
        activeLeadForModal.assigned_to = assigned;
        const target = currentLeads.find(l => l.id === activeLeadForModal.id);
        if (target) target.assigned_to = assigned;
        
        applyFiltersAndRender();
        if (document.getElementById('tab-campaigns')?.classList.contains('active')) {
            loadCampaignsView();
        }
        if (typeof showToast === 'function') {
            showToast(`Lead atribuído para ${assigned || 'Ninguém'}!`, 'info');
        }
    } catch (err) {
        console.error("Erro ao atribuir operador:", err);
    }
};

window.assignLeadToMe = function() {
    const assignedSelect = document.getElementById('modal-assigned-to');
    if (assignedSelect && currentUser && currentUser.name) {
        assignedSelect.value = currentUser.name;
        updateModalAssignedTo();
    }
};

window.updateModalLeadStatus = async function() {
    if (!activeLeadForModal) return;
    const statusSelect = document.getElementById('modal-crm-status');
    const newStatus = statusSelect.value;
    const dealInput = document.getElementById('modal-deal-value');
    let currentDealVal = parseBRLInput(dealInput ? dealInput.value : (activeLeadForModal.deal_value || 0));

    // Se marcou como fechado e não tem valor definido, sugere preencher
    if (newStatus === 'fechado' && currentDealVal <= 0) {
        const promptVal = prompt("Parabéns pela venda! Qual foi o valor acordado com o cliente (R$)?", "1500");
        if (promptVal !== null) {
            const parsed = parseBRLInput(promptVal);
            if (parsed > 0) {
                currentDealVal = parsed;
                if (dealInput) dealInput.value = parsed;
            }
        }
    }
    
    try {
        const res = await fetch(`/api/leads/${activeLeadForModal.id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus, deal_value: currentDealVal })
        });
        const updated = await res.json();
        if (res.ok && updated.success) {
            activeLeadForModal.campaign_status = newStatus;
            activeLeadForModal.deal_value = currentDealVal;
            if (updated.closed_at) {
                activeLeadForModal.closed_at = updated.closed_at;
                const closedInfo = document.getElementById('modal-closed-at-info');
                const closedText = document.getElementById('modal-closed-at-text');
                if (closedInfo && closedText) {
                    closedText.textContent = updated.closed_at;
                    closedInfo.style.display = 'inline-block';
                }
            }
            const target = currentLeads.find(l => l.id === activeLeadForModal.id);
            if (target) {
                target.campaign_status = newStatus;
                target.deal_value = currentDealVal;
                if (updated.closed_at) target.closed_at = updated.closed_at;
            }

            loadDashboardStats();
            loadCampaignsView();
            applyFiltersAndRender();
        }
    } catch (err) {
        console.error("Erro ao atualizar status:", err);
    }
};

window.updateModalFollowStage = async function() {
    if (!activeLeadForModal) return;
    const followSelect = document.getElementById('modal-follow-stage');
    const newStage = followSelect.value;
    
    try {
        await fetch(`/api/leads/${activeLeadForModal.id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ follow_stage: newStage })
        });
        activeLeadForModal.follow_stage = newStage;
        switchPitchScript(newStage);
        loadCampaignsView();
    } catch (err) {
        console.error("Erro ao atualizar follow_stage:", err);
    }
};

function getPitchMessage(lead, type = 'contato') {
    if (!lead) return '';
    const name = lead.name || 'Empresa';
    const site = lead.website || '';
    const hasWeb = lead.has_website && site.trim().length > 0;

    if (type === 'contato') {
        if (!hasWeb) {
            return `Olá equipe da ${name}! Tudo bem?

` +
                   `Meu nome é especialista em presença digital e notei que a ${name} é uma referência na região, mas ainda não possui um site próprio institucional no Google.

` +
                   `Hoje, mais de 80% das pessoas pesquisam e fecham direto pelo celular. Desenvolvemos sites rápidos, modernos e integrados ao WhatsApp para empresas do seu nicho.

` +
                   `Gostaria de ver uma demonstração visual de como ficaria a presença digital da ${name} sem custo?`;
        } else {
            return `Olá equipe da ${name}! Tudo bem?

` +
                   `Estava analisando o site de vocês (${site}) e identifiquei oportunidades excelentes para acelerar o carregamento mobile e aumentar a taxa de contatos via WhatsApp.

` +
                   `Posso lhe enviar um diagnóstico gratuito de melhorias de conversão?`;
        }
    } else if (type === 'follow1') {
        return `Olá equipe da ${name}! Tudo bem por aí?

` +
               `Passando para saber se vocês conseguiram ver a mensagem que enviei anteriormente sobre a presença digital e criação do site.

` +
               `Conseguem avaliar uma prévia rápida hoje de como ficaria o projeto para vocês?`;
    } else if (type === 'follow2') {
        return `Oi pessoal da ${name}! Tudo bem por aí?

` +
               `Imagino que a rotina esteja bem corrida. Estou finalizando a agenda de desenvolvimento de demonstrações desta semana e gostaria de saber se ainda faz sentido apresentar o modelo exclusivo para a ${name} ou se preferem que eu retome mais adiante.

` +
               `Um abraço!`;
    } else if (type === 'proposta') {
        return `Olá equipe da ${name}! Tudo bem?

` +
               `Conforme alinhamos, preparei os detalhes da proposta para o desenvolvimento do site profissional da ${name}, otimizado para o Google e com captação direta no WhatsApp.

` +
               `Ficou alguma dúvida sobre o escopo ou condições para darmos início?`;
    }
    return '';
}

// 7. EXPORTAÇÃO (CSV E EXCEL)
window.exportLeads = function(type) {
    let url = type === 'excel' ? '/api/export/excel' : '/api/export/csv';
    const params = [];
    if (currentScanId) params.push(`scan_id=${currentScanId}`);
    if (activeFilter === 'no-site') params.push(`filter_no_site=true`);
    if (params.length > 0) url += `?${params.join('&')}`;

    window.open(url, '_blank');
};

window.exportClosedLeads = function(type) {
    let url = type === 'excel' ? '/api/export/excel' : '/api/export/csv';
    const params = ['status=fechado'];
    if (currentScanId) params.push(`scan_id=${currentScanId}`);
    url += `?${params.join('&')}`;

    window.open(url, '_blank');
};

// 8. CRM / CAMPANHAS & ETAPAS DO FUNIL
let draggedLeadId = null;
let kanbanFilterNoSite = false;

window.onCardDragStart = function(e, leadId) {
    draggedLeadId = leadId;
    document.body.classList.add('is-card-dragging');
    if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', String(leadId));
        e.dataTransfer.effectAllowed = 'move';
    }
    if (e.currentTarget) e.currentTarget.classList.add('is-dragging');
};

window.onCardDragEnd = function(e) {
    document.body.classList.remove('is-card-dragging');
    if (e && e.currentTarget) e.currentTarget.classList.remove('is-dragging');
    document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
    const trash = document.getElementById('kanban-trash-dropzone');
    if (trash) trash.classList.remove('drag-over-trash');
};

window.onColDragOver = function(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
};

window.onColDragLeave = function(e) {
    e.currentTarget.classList.remove('drag-over');
};

window.onColDrop = async function(e, colKey) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (!draggedLeadId) return;
    
    const lead = currentLeads.find(l => l.id === draggedLeadId);
    let payload = { status: colKey };
    
    if (colKey === 'fechado') {
        const curVal = lead ? (lead.deal_value || 0) : 0;
        let pVal = prompt(`Parabéns pela venda de "${lead ? lead.name : 'Lead'}"!\nQual foi o valor do contrato fechado com o cliente (R$)?`, curVal > 0 ? String(curVal) : "1500");
        if (pVal !== null) {
            payload.deal_value = parseBRLInput(pVal);
        }
    }

    try {
        const res = await fetch(`/api/leads/${draggedLeadId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (lead) {
            lead.campaign_status = colKey;
            if (payload.deal_value !== undefined) lead.deal_value = payload.deal_value;
        }
        loadCampaignsView();
        loadDashboardStats();
        applyFiltersAndRender();
        if (typeof showToast === 'function') {
            const colNames = { novo: 'Novos Leads', contatado: 'Em Contato', proposta: 'Proposta Enviada', fechado: 'Fechados / Clientes' };
            showToast(`Lead "${lead ? lead.name : 'selecionado'}" movido para ${colNames[colKey] || colKey}!`, 'success');
        }
    } catch (err) {
        console.error("Erro ao mover card:", err);
    }
    draggedLeadId = null;
};

// ZONA DE REMOÇÃO VIA DRAG & DROP
window.onTrashDragOver = function(e) {
    e.preventDefault();
    const zone = document.getElementById('kanban-trash-dropzone');
    if (zone) zone.classList.add('drag-over-trash');
};

window.onTrashDragLeave = function(e) {
    const zone = document.getElementById('kanban-trash-dropzone');
    if (zone) zone.classList.remove('drag-over-trash');
};

window.onTrashDrop = async function(e) {
    e.preventDefault();
    const zone = document.getElementById('kanban-trash-dropzone');
    if (zone) zone.classList.remove('drag-over-trash');

    if (!draggedLeadId) return;
    const targetLeadId = draggedLeadId;
    draggedLeadId = null;

    await deleteLeadConfirm(null, targetLeadId);
};

// EXCLUSÃO UNIVERSAL DE LEAD COM CONFIRMAÇÃO
window.deleteLeadConfirm = async function(e, leadId) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!leadId) return;

    const lead = currentLeads.find(l => l.id === leadId);
    const leadName = lead ? lead.name : `Lead #${leadId}`;

    if (!confirm(`Deseja realmente remover "${leadName}" da lista e do banco de dados?\n\nEsta ação excluirá o lead definitivamente de todas as abas.`)) {
        return;
    }

    try {
        const res = await fetch(`/api/leads/${leadId}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
            currentLeads = currentLeads.filter(l => l.id !== leadId);
            
            if (activeLeadForModal && activeLeadForModal.id === leadId) {
                closeLeadModal();
            }

            applyFiltersAndRender();
            loadDashboardStats();
            loadDashboardRecentLeads();
            if (document.getElementById('tab-campaigns')?.classList.contains('active')) {
                loadCampaignsView();
            }

            if (typeof showToast === 'function') {
                showToast(`Lead "${leadName}" removido com sucesso!`, 'info');
            }
        } else {
            alert("Erro ao remover lead: " + (data.error || "Tente novamente"));
        }
    } catch (err) {
        console.error("Erro ao excluir lead:", err);
        alert("Erro de conexão ao remover lead.");
    }
};

window.toggleKanbanNoSiteFilter = function() {
    kanbanFilterNoSite = !kanbanFilterNoSite;
    const btn = document.getElementById('kanban-btn-no-site');
    if (btn) {
        if (kanbanFilterNoSite) {
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-neon');
            btn.innerHTML = `<i class="fas fa-check"></i> Só Sem Site (Ativo)`;
        } else {
            btn.classList.add('btn-secondary');
            btn.classList.remove('btn-neon');
            btn.innerHTML = `<i class="fas fa-filter"></i> Só Sem Site`;
        }
    }
    loadCampaignsView();
};

window.filterKanbanCards = function() {
    loadCampaignsView();
};

async function loadCampaignsView() {
    const container = document.getElementById('kanban-container');
    if (!container) return;

    try {
        const res = await fetch('/api/leads');
        const leads = await res.json();
        currentLeads = leads;
        
        const cols = {
            'novo': { title: 'Novos Leads', color: 'var(--neon-cyan)', dotColor: '#00d2ff', items: [] },
            'contatado': { title: 'Em Contato', color: 'var(--purple-light)', dotColor: '#a855f7', items: [] },
            'proposta': { title: 'Proposta Enviada', color: 'var(--alert-orange)', dotColor: '#ff7b00', items: [] },
            'fechado': { title: 'Fechados / Clientes', color: 'var(--neon-green)', dotColor: '#00ff88', items: [] }
        };

        // Filtros rápidos no Kanban
        const searchInput = document.getElementById('kanban-search-input');
        const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const opSelect = document.getElementById('kanban-operator-filter');
        const selectedOp = opSelect ? opSelect.value : 'all';

        if (opSelect && opSelect.options.length <= 1 && Array.isArray(systemUsers)) {
            systemUsers.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.name;
                opt.textContent = `${u.name} (${u.role})`;
                opSelect.appendChild(opt);
            });
        }

        let filteredLeads = leads;
        if (searchTerm) {
            filteredLeads = filteredLeads.filter(l => 
                (l.name && l.name.toLowerCase().includes(searchTerm)) ||
                (l.phone && l.phone.toLowerCase().includes(searchTerm)) ||
                (l.address && l.address.toLowerCase().includes(searchTerm)) ||
                (l.assigned_to && l.assigned_to.toLowerCase().includes(searchTerm))
            );
        }
        if (selectedOp && selectedOp !== 'all') {
            filteredLeads = filteredLeads.filter(l => (l.assigned_to || '') === selectedOp);
        }
        if (kanbanFilterNoSite) {
            filteredLeads = filteredLeads.filter(l => !l.has_website || !l.website);
        }

        filteredLeads.forEach((l, index) => {
            let st = (l.campaign_status || 'novo').toLowerCase();
            if (st === 'contato') st = 'contatado';
            if (cols[st]) cols[st].items.push(l);
            else cols['novo'].items.push(l);
        });

        container.innerHTML = Object.keys(cols).map(key => {
            const col = cols[key];
            const cardsHtml = col.items.map((lead, idx) => {
                let stage = lead.follow_stage;
                if (!stage) {
                    stage = (idx === 1 ? 'follow1' : (idx === 2 ? 'follow2' : 'contato'));
                }
                const stageInfo = getFollowStageInfo(stage);
                const dealVal = parseFloat(lead.deal_value || 0);
                const isProposta = (lead.campaign_status === 'proposta');
                const dealValHtml = `
                    <span class="badge-deal-value ${isProposta ? 'proposta' : ''}" style="font-size:10.5px; padding:2px 6px; cursor:pointer;" onclick="editDealValueQuick(event, ${lead.id})" title="Clique para alterar valor em R$">
                        <i class="fas fa-coins"></i> ${dealVal > 0 ? formatBRL(dealVal) : 'Definir Valor'}
                    </span>
                `;
                const assignedHtml = lead.assigned_to 
                    ? `<span class="badge-assigned" style="font-size:10px; padding:2px 6px;"><i class="fas fa-user"></i> ${escapeHtml(lead.assigned_to)}</span>`
                    : '';

                return `
                    <div class="kanban-card" 
                         draggable="true" 
                         ondragstart="onCardDragStart(event, ${lead.id})" 
                         ondragend="onCardDragEnd(event)" 
                         onclick="openLeadModal(${lead.id})">
                        
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px; gap:8px;">
                            <div style="display:flex; align-items:center; gap:6px; flex:1; min-width:0;">
                                <i class="fas fa-grip-vertical" style="color:var(--text-secondary); cursor:grab; font-size:12px; flex-shrink:0;" title="Arrastar card"></i>
                                <div style="font-weight:700; font-size:13.5px; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(lead.name)}</div>
                            </div>
                            <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                                <button type="button" 
                                        class="kanban-stage-btn ${stageInfo.cls}" 
                                        onclick="cycleLeadFollowStage(event, ${lead.id})" 
                                        title="Clique para alternar etapa (Contato ➔ Follow 1 ➔ Follow 2)">
                                    ${stageInfo.text}
                                </button>
                                <button type="button" 
                                        class="kanban-card-delete-btn" 
                                        onclick="deleteLeadConfirm(event, ${lead.id})" 
                                        title="Remover este lead da lista">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </div>

                        <div class="kanban-lead-address">
                            <i class="fas fa-map-marker-alt"></i>
                            <span style="overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${escapeHtml(lead.address || 'Local não informado')}</span>
                        </div>

                        <div style="display:flex; gap:5px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
                            ${dealValHtml}
                            ${assignedHtml}
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            ${!lead.has_website 
                                ? `<span class="badge-no-site" style="font-size:10px; padding:2px 6px;">Sem Site</span>` 
                                : `<span style="font-size:11px; color:var(--neon-cyan);"><i class="fas fa-globe"></i> Com Site</span>`}
                            ${lead.whatsapp 
                                ? `<span style="font-size:11px; color:var(--neon-green);"><i class="fab fa-whatsapp"></i> WA</span>` 
                                : ''}
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="kanban-col" 
                     ondragover="onColDragOver(event)" 
                     ondragleave="onColDragLeave(event)" 
                     ondrop="onColDrop(event, '${key}')">
                    <div class="kanban-col-header">
                        <span class="kanban-col-title" style="color:${col.color}">
                            <i class="fas fa-circle" style="font-size:8px; color:${col.dotColor};"></i> ${col.title}
                        </span>
                        <span class="kanban-count">${col.items.length}</span>
                    </div>
                    <div class="kanban-items">
                        ${cardsHtml || '<div style="color:var(--text-secondary); font-size:12.5px; text-align:center; padding:20px; font-weight:500;">Nenhum lead</div>'}
                    </div>
                </div>
            `;
        }).join('');

        // Atualizar KPIs do Kanban Financial Strip
        try {
            const statsRes = await fetch('/api/stats');
            const stats = await statsRes.json();
            if (document.getElementById('kanban-total-fechado')) {
                document.getElementById('kanban-total-fechado').textContent = formatBRL(stats.total_fechado_valor);
            }
            if (document.getElementById('kanban-total-proposta')) {
                document.getElementById('kanban-total-proposta').textContent = formatBRL(stats.total_proposta_valor);
            }
            if (document.getElementById('kanban-avg-ticket')) {
                document.getElementById('kanban-avg-ticket').textContent = formatBRL(stats.avg_ticket);
            }
            if (document.getElementById('kanban-conversion-rate')) {
                document.getElementById('kanban-conversion-rate').textContent = `${stats.conversion_rate || 0}%`;
            }
        } catch (e) {
            console.error("Erro ao atualizar strip do Kanban:", e);
        }

    } catch (err) {
        console.error("Erro ao carregar campanhas:", err);
    }
}


// 9. HISTÓRICO DE VARREDURAS
async function loadRecentScans() {
    try {
        const res = await fetch('/api/scans?limit=5');
        const scans = await res.json();
        renderRecentScansList(scans);
    } catch (err) {
        console.error("Erro ao carregar buscas recentes:", err);
    }
}

function renderRecentScansList(scans) {
    const list = document.getElementById('recent-scans-list');
    if (!list) return;

    if (scans.length === 0) {
        list.innerHTML = `<div style="color:var(--text-secondary); font-size:13.5px; font-weight:500;">Nenhuma varredura recente realizada.</div>`;
        return;
    }

    list.innerHTML = scans.map(s => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid rgba(157,78,221,0.1);">
            <div>
                <strong style="color:#fff; font-size:14px;">${escapeHtml(s.niche)}</strong> em 
                <span style="color:var(--neon-cyan); font-size:13px;">${escapeHtml(s.location)}</span>
                <div style="font-size:12px; color:var(--text-secondary); margin-top:3px; font-weight:500;">${s.created_at}</div>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
                <span class="badge-no-site" style="font-size:11px; padding:3px 7px;">${s.no_website_count} sem site</span>
                <button class="btn btn-secondary btn-sm" onclick="filterByScan(${s.id})">
                    <i class="fas fa-filter"></i> Ver (${s.total_found})
                </button>
            </div>
        </div>
    `).join('');
}

window.filterByScan = function(scanId) {
    currentScanId = scanId;
    // Muda para aba de varredura
    document.querySelector('[data-tab="scraper"]').click();
    loadLeads(scanId);
};

// 10. CONFIGURAÇÕES
async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        const settings = await res.json();
        
        if (document.getElementById('cfg-delay')) document.getElementById('cfg-delay').value = settings.delay_between_requests || '1.5';
        if (document.getElementById('cfg-timeout')) document.getElementById('cfg-timeout').value = settings.request_timeout || '10';
        if (document.getElementById('cfg-max-leads')) document.getElementById('cfg-max-leads').value = settings.max_leads_per_scan || '20';
        if (document.getElementById('cfg-google-key')) document.getElementById('cfg-google-key').value = settings.google_places_api_key || '';
        if (document.getElementById('cfg-apify-token')) document.getElementById('cfg-apify-token').value = settings.apify_token || '';
        if (document.getElementById('cfg-pitch-template')) document.getElementById('cfg-pitch-template').value = settings.pitch_template || '';
        if (document.getElementById('cfg-excluded-brands')) document.getElementById('cfg-excluded-brands').value = settings.excluded_brands || '';

        // Campos do WAHA
        if (document.getElementById('cfg-waha-url')) document.getElementById('cfg-waha-url').value = settings.waha_base_url || 'http://localhost:3000';
        if (document.getElementById('cfg-waha-session')) document.getElementById('cfg-waha-session').value = settings.waha_session || 'default';
        if (document.getElementById('cfg-waha-apikey')) document.getElementById('cfg-waha-apikey').value = settings.waha_api_key || '';
        if (document.getElementById('cfg-waha-min-delay')) document.getElementById('cfg-waha-min-delay').value = settings.waha_min_delay || '15';
        if (document.getElementById('cfg-waha-max-delay')) document.getElementById('cfg-waha-max-delay').value = settings.waha_max_delay || '35';

        // Atualiza inputs no painel da aba WhatsApp
        if (document.getElementById('bulk-delay-min')) document.getElementById('bulk-delay-min').value = settings.waha_min_delay || '15';
        if (document.getElementById('bulk-delay-max')) document.getElementById('bulk-delay-max').value = settings.waha_max_delay || '35';

        // Campos Multi-Canal (E-mail e Site)
        const defChannel = settings.default_channel || 'whatsapp';
        const chRadio = document.querySelector(`input[name="default_channel"][value="${defChannel}"]`);
        if (chRadio) chRadio.checked = true;

        if (document.getElementById('cfg-smtp-host')) document.getElementById('cfg-smtp-host').value = settings.smtp_host || '';
        if (document.getElementById('cfg-smtp-port')) document.getElementById('cfg-smtp-port').value = settings.smtp_port || '587';
        if (document.getElementById('cfg-smtp-user')) document.getElementById('cfg-smtp-user').value = settings.smtp_user || '';
        if (document.getElementById('cfg-smtp-password')) document.getElementById('cfg-smtp-password').value = settings.smtp_password || '';
        if (document.getElementById('cfg-smtp-from-name')) document.getElementById('cfg-smtp-from-name').value = settings.smtp_from_name || 'Kaptador Comercial';
        if (document.getElementById('cfg-smtp-tls')) document.getElementById('cfg-smtp-tls').value = settings.smtp_use_tls || 'true';
        if (document.getElementById('cfg-email-subject')) document.getElementById('cfg-email-subject').value = settings.email_subject_template || '';
        if (document.getElementById('cfg-email-body')) document.getElementById('cfg-email-body').value = settings.email_body_template || '';

        if (document.getElementById('cfg-site-operator-name')) document.getElementById('cfg-site-operator-name').value = settings.site_operator_name || '';
        if (document.getElementById('cfg-site-contact-phone')) document.getElementById('cfg-site-contact-phone').value = settings.site_contact_phone || '';
        if (document.getElementById('cfg-site-message')) document.getElementById('cfg-site-message').value = settings.site_default_message || '';
    } catch (err) {
        console.error("Erro ao carregar configurações:", err);
    }
}

async function handleSaveSettings(e) {
    e.preventDefault();
    const payload = {
        delay_between_requests: document.getElementById('cfg-delay').value,
        request_timeout: document.getElementById('cfg-timeout').value,
        max_leads_per_scan: document.getElementById('cfg-max-leads').value,
        google_places_api_key: document.getElementById('cfg-google-key').value,
        apify_token: document.getElementById('cfg-apify-token').value,
        pitch_template: document.getElementById('cfg-pitch-template').value,
        excluded_brands: document.getElementById('cfg-excluded-brands') ? document.getElementById('cfg-excluded-brands').value : '',
        waha_base_url: document.getElementById('cfg-waha-url') ? document.getElementById('cfg-waha-url').value : 'http://localhost:3000',
        waha_session: document.getElementById('cfg-waha-session') ? document.getElementById('cfg-waha-session').value : 'default',
        waha_api_key: document.getElementById('cfg-waha-apikey') ? document.getElementById('cfg-waha-apikey').value : '',
        waha_min_delay: document.getElementById('cfg-waha-min-delay') ? document.getElementById('cfg-waha-min-delay').value : '15',
        waha_max_delay: document.getElementById('cfg-waha-max-delay') ? document.getElementById('cfg-waha-max-delay').value : '35',
        default_channel: document.querySelector('input[name="default_channel"]:checked') ? document.querySelector('input[name="default_channel"]:checked').value : 'whatsapp',
        smtp_host: document.getElementById('cfg-smtp-host') ? document.getElementById('cfg-smtp-host').value : '',
        smtp_port: document.getElementById('cfg-smtp-port') ? document.getElementById('cfg-smtp-port').value : '587',
        smtp_user: document.getElementById('cfg-smtp-user') ? document.getElementById('cfg-smtp-user').value : '',
        smtp_password: document.getElementById('cfg-smtp-password') ? document.getElementById('cfg-smtp-password').value : '',
        smtp_from_name: document.getElementById('cfg-smtp-from-name') ? document.getElementById('cfg-smtp-from-name').value : 'Kaptador Comercial',
        smtp_use_tls: document.getElementById('cfg-smtp-tls') ? document.getElementById('cfg-smtp-tls').value : 'true',
        email_subject_template: document.getElementById('cfg-email-subject') ? document.getElementById('cfg-email-subject').value : '',
        email_body_template: document.getElementById('cfg-email-body') ? document.getElementById('cfg-email-body').value : '',
        site_operator_name: document.getElementById('cfg-site-operator-name') ? document.getElementById('cfg-site-operator-name').value : '',
        site_contact_phone: document.getElementById('cfg-site-contact-phone') ? document.getElementById('cfg-site-contact-phone').value : '',
        site_default_message: document.getElementById('cfg-site-message') ? document.getElementById('cfg-site-message').value : ''
    };

    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        showToast(data.message || "Configurações salvas com sucesso!", "success");
        checkWahaStatus(false);
    } catch (err) {
        showToast("Erro ao salvar configurações.", "error");
    }
}

window.testSmtpConnection = async function() {
    const host = document.getElementById('cfg-smtp-host') ? document.getElementById('cfg-smtp-host').value.trim() : '';
    const user = document.getElementById('cfg-smtp-user') ? document.getElementById('cfg-smtp-user').value.trim() : '';
    const pwd = document.getElementById('cfg-smtp-password') ? document.getElementById('cfg-smtp-password').value : '';
    const port = document.getElementById('cfg-smtp-port') ? document.getElementById('cfg-smtp-port').value.trim() : '587';
    const tls = document.getElementById('cfg-smtp-tls') ? document.getElementById('cfg-smtp-tls').value : 'true';

    if (!host) {
        alert("Preencha o servidor SMTP (Host) antes de testar.");
        return;
    }

    const testEmail = prompt("Informe um e-mail para receber a mensagem de teste:", user || "");
    if (!testEmail) return;

    try {
        const res = await fetch('/api/email/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                smtp_host: host,
                smtp_port: port,
                smtp_user: user,
                smtp_password: pwd,
                smtp_use_tls: tls,
                test_recipient: testEmail
            })
        });
        const data = await res.json();
        if (data.success) {
            alert("✅ " + data.message);
        } else {
            alert("❌ " + (data.error || "Falha na conexão SMTP."));
        }
    } catch (err) {
        alert("Erro ao testar SMTP: " + err.message);
    }
};

// Helpers
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function truncateUrl(url) {
    if (!url) return '';
    return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

// 11. IMPORTAÇÃO DO INSTANT DATA SCRAPER
window.openImportModal = function() {
    const modal = document.getElementById('import-data-modal');
    if (modal) modal.classList.add('active');
};

window.closeImportModal = function() {
    const modal = document.getElementById('import-data-modal');
    if (modal) modal.classList.remove('active');
};

window.handleCsvFileUpload = function(e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('import-file-name').textContent = file.name;
    const reader = new FileReader();
    reader.onload = function(evt) {
        document.getElementById('import-content').value = evt.target.result;
    };
    reader.readAsText(file, 'utf-8');
};

window.submitInstantDataImport = async function() {
    const content = document.getElementById('import-content').value.trim();
    const niche = document.getElementById('import-niche').value.trim() || 'Comércio Local';
    const location = document.getElementById('import-location').value.trim() || 'Importado do Google Maps';

    if (!content) {
        alert("Por favor, cole os dados do Instant Data Scraper ou carregue um arquivo .CSV!");
        return;
    }

    const btn = document.getElementById('import-submit-btn');
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processando Deep Scraping...`;

    try {
        const res = await fetch('/api/import/instant-data-scraper', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, niche, location })
        });
        const data = await res.json();
        
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-magic"></i> Processar & Deep Scraping`;

        if (data.success) {
            showToast(data.message, "success");
            closeImportModal();
            loadDashboardStats();
            loadLeads(data.scan_id);
            currentScanId = data.scan_id;
        } else {
            showToast(data.message || "Erro ao importar dados.", "error");
        }
    } catch (err) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-magic"></i> Processar & Deep Scraping`;
        showToast("Erro de conexão ao processar importação.", "error");
    }
};

// ========================================================
// 12. CENTRAL DE INTEGRAÇÃO & AUTOMAÇÃO WAHA (LOCAL)
// ========================================================

let isBulkCampaignActive = false;

/**
 * Toast Notification Visual
 */
function showToast(message, type = 'info', duration = 4500) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            top: 24px;
            right: 24px;
            z-index: 999999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 400px;
            pointer-events: none;
        `;
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const colors = {
        success: { bg: '#0b1f17', border: '#00ff88', icon: 'fa-check-circle', text: '#00ff88' },
        error:   { bg: '#250f14', border: '#ff3b57', icon: 'fa-times-circle', text: '#ff3b57' },
        warning: { bg: '#241a08', border: '#ffb300', icon: 'fa-exclamation-triangle', text: '#ffb300' },
        info:    { bg: '#0c1a29', border: '#00d2ff', icon: 'fa-info-circle', text: '#00d2ff' }
    };
    const c = colors[type] || colors.info;

    toast.style.cssText = `
        background: ${c.bg};
        border: 1px solid ${c.border};
        border-left: 5px solid ${c.border};
        color: #fff;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.6);
        pointer-events: auto;
        opacity: 0;
        transform: translateY(-15px);
        transition: all 0.25s ease-out;
    `;

    toast.innerHTML = `
        <i class="fas ${c.icon}" style="color: ${c.text}; font-size: 18px;"></i>
        <div style="flex: 1; line-height: 1.4;">${escapeHtml(message)}</div>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-15px)';
        setTimeout(() => toast.remove(), 250);
    }, duration);
}

/**
 * Formata telefone para o padrão WAHA: 55... e sufixo @c.us
 */
function formatWhatsAppChatId(rawPhone) {
    if (!rawPhone) return null;
    let clean = rawPhone.toString().replace(/\D/g, '');
    if (!clean) return null;
    if (clean.startsWith('0')) clean = clean.substring(1);
    if (!clean.startsWith('55') && (clean.length === 10 || clean.length === 11)) {
        clean = `55${clean}`;
    }
    return `${clean}@c.us`;
}

/**
 * Resolve Spintax: {Olá|Oi|Tudo bem?}
 */
function parseSpintax(text) {
    if (!text) return '';
    const regex = /\{([^{}]+)\}/g;
    return text.replace(regex, (match, choices) => {
        const options = choices.split('|');
        return options[Math.floor(Math.random() * options.length)].trim();
    });
}

/**
 * Extrai a cidade do endereço
 */
function extractCity(address) {
    if (!address) return 'sua região';
    const parts = address.split('-');
    if (parts.length >= 2) {
        const candidate = parts[parts.length - 2].trim();
        const clean = candidate.split(',').pop().trim();
        if (clean.length > 2) return clean;
    }
    return 'sua região';
}

/**
 * Monta mensagem dinâmica personalizada
 */
function buildPersonalizedMessage(lead, customTemplate = null) {
    const empresa = lead.name || 'Empresa';
    const cidade = extractCity(lead.address);
    const semSite = !lead.has_website || !lead.website;
    const statusText = semSite ? 'Sem Site Oficial' : 'Site precisando de otimização mobile';

    let template = customTemplate;
    if (!template) {
        if (semSite) {
            template = `{Olá|Oi|Olá, tudo bem?} equipe da *{empresa}*!\n\n` +
                       `Percebi que vocês atendem a região de *{cidade}*, mas atualmente estão marcados como *{status}* no Google.\n\n` +
                       `Mais de 80% das pessoas pesquisam e fecham direto pelo celular. Desenvolvemos sites modernos e integrados ao WhatsApp para o seu nicho.\n\n` +
                       `Gostaria de ver uma demonstração sem custo?`;
        } else {
            template = `{Olá|Oi|Tudo bem?} equipe da *{empresa}*!\n\n` +
                       `Estava analisando o site de vocês (${lead.website}) em *{cidade}* e identifiquei oportunidades excelentes para acelerar a captação de contatos via WhatsApp.\n\n` +
                       `Posso lhe enviar um diagnóstico visual rápido?`;
        }
    }

    return parseSpintax(template)
        .replace(/{empresa}/g, empresa)
        .replace(/{cidade}/g, cidade)
        .replace(/{status}/g, statusText);
}

/**
 * Escreve mensagem no console de logs da aba WhatsApp
 */
function appendWahaLog(msg, type = 'info') {
    const consoleBox = document.getElementById('waha-console-logs');
    if (!consoleBox) return;

    const time = new Date().toLocaleTimeString('pt-BR');
    const logDiv = document.createElement('div');
    logDiv.className = `log-${type}`;
    logDiv.innerHTML = `[${time}] ${escapeHtml(msg)}`;
    consoleBox.appendChild(logDiv);
    consoleBox.scrollTop = consoleBox.scrollHeight;
}

window.clearWahaLogs = function() {
    const consoleBox = document.getElementById('waha-console-logs');
    if (consoleBox) {
        consoleBox.innerHTML = '<div class="log-info">[Sistema] Console de logs limpo.</div>';
    }
};

let wahaStatusPoller = null;
let wahaQrRefreshInterval = null;
let qrCountdownTimer = null;
let qrSecondsRemaining = 20;
let lastKnownWahaState = null;

function resetQrCountdown(secs = 20) {
    qrSecondsRemaining = secs;
    const timerElem = document.getElementById('waha-timer-secs');
    if (timerElem) timerElem.textContent = qrSecondsRemaining;

    if (qrCountdownTimer) clearInterval(qrCountdownTimer);
    qrCountdownTimer = setInterval(() => {
        qrSecondsRemaining--;
        const el = document.getElementById('waha-timer-secs');
        if (el) el.textContent = Math.max(0, qrSecondsRemaining);

        if (qrSecondsRemaining <= 0) {
            clearInterval(qrCountdownTimer);
            // Auto-renova o QR Code suavemente em segundo plano
            window.loadWahaQrCode(true);
        }
    }, 1000);
}

function stopQrTimers() {
    if (qrCountdownTimer) {
        clearInterval(qrCountdownTimer);
        qrCountdownTimer = null;
    }
    if (wahaQrRefreshInterval) {
        clearInterval(wahaQrRefreshInterval);
        wahaQrRefreshInterval = null;
    }
}

/**
 * Poller automático de status quando a aba WhatsApp está ativa
 */
window.startWahaTabPolling = function() {
    if (!wahaStatusPoller) {
        checkWahaStatus(false);
        wahaStatusPoller = setInterval(() => {
            checkWahaStatus(false);
        }, 4000);
    }
};

window.stopWahaTabPolling = function() {
    if (wahaStatusPoller) {
        clearInterval(wahaStatusPoller);
        wahaStatusPoller = null;
    }
    stopQrTimers();
};

/**
 * Consulta status do WAHA via rota Proxy no FastAPI (/api/waha/status)
 */
async function checkWahaStatus(showFeedback = false) {
    try {
        const res = await fetch('/api/waha/status');
        const data = await res.json();

        const sidebarDot = document.getElementById('waha-sidebar-dot');
        const sidebarStatus = document.getElementById('waha-sidebar-status');
        const badgeStatus = document.getElementById('waha-badge-status');
        const badgeText = document.getElementById('waha-badge-text');
        const endpointDisp = document.getElementById('waha-endpoint-display');
        const stateDisp = document.getElementById('waha-state-display');
        const sessionTag = document.getElementById('waha-session-name-tag');
        const qrWrapper = document.getElementById('waha-qr-wrapper');
        const qrPlaceholder = document.getElementById('waha-qr-placeholder');
        const qrContent = document.getElementById('waha-qr-content');
        const connectedCard = document.getElementById('waha-connected-card');
        const connectedDetails = document.getElementById('waha-connected-details');

        if (endpointDisp && data.base_url) endpointDisp.textContent = data.base_url;
        if (sessionTag && data.session) sessionTag.textContent = `session: ${data.session}`;

        if (data.online) {
            const st = (data.session_status || 'UNKNOWN').toUpperCase();
            if (stateDisp) stateDisp.textContent = st;

            const previousState = lastKnownWahaState;
            lastKnownWahaState = st;

            if (st === 'WORKING') {
                if (sidebarDot) sidebarDot.style.background = 'var(--neon-green)';
                if (sidebarStatus) { sidebarStatus.textContent = 'CONECTADO'; sidebarStatus.style.color = 'var(--neon-green)'; }
                if (badgeStatus) badgeStatus.className = 'waha-status-badge working';
                if (badgeText) badgeText.textContent = 'ONLINE (CONECTADO)';
                if (stateDisp) stateDisp.style.color = 'var(--neon-green)';

                // Exibe card de conectado e esconde QR Code
                if (qrPlaceholder) qrPlaceholder.style.display = 'none';
                if (qrContent) qrContent.style.display = 'none';
                if (connectedCard) connectedCard.style.display = 'flex';

                stopQrTimers();

                if (connectedDetails && data.details && data.details.me) {
                    const me = data.details.me;
                    const phone = me.id ? me.id.split('@')[0] : '';
                    const pushName = me.pushName || '';
                    connectedDetails.textContent = `Número: +${phone} ${pushName ? '(' + pushName + ')' : ''} | Sessão ativa e conectada`;
                } else if (connectedDetails) {
                    connectedDetails.textContent = `Sessão "${data.session}" ativa e pronta para envios`;
                }

                if (previousState && previousState !== 'WORKING') {
                    showToast('🎉 WhatsApp Pareado e Conectado com Sucesso!', 'success');
                    appendWahaLog('🎉 WhatsApp pareado e conectado com sucesso! Sessão ativa.', 'success');
                }
            } else if (st === 'SCAN_QR_CODE') {
                if (sidebarDot) sidebarDot.style.background = 'var(--alert-orange)';
                if (sidebarStatus) { sidebarStatus.textContent = 'LER QR CODE'; sidebarStatus.style.color = 'var(--alert-orange)'; }
                if (badgeStatus) badgeStatus.className = 'waha-status-badge scan_qr_code';
                if (badgeText) badgeText.textContent = 'LER QR CODE';
                if (stateDisp) stateDisp.style.color = 'var(--alert-orange)';

                if (connectedCard) connectedCard.style.display = 'none';

                // Se o QR Code ainda não está visível, carrega
                const qrImg = document.getElementById('waha-qr-image');
                if (qrContent && (qrContent.style.display === 'none' || !qrImg || !qrImg.src || qrImg.src.endsWith('#') || qrImg.src === window.location.href)) {
                    loadWahaQrCode(false);
                } else if (!qrCountdownTimer) {
                    resetQrCountdown(20);
                }
            } else {
                if (sidebarDot) sidebarDot.style.background = 'var(--text-muted)';
                if (sidebarStatus) { sidebarStatus.textContent = st; sidebarStatus.style.color = 'var(--text-secondary)'; }
                if (badgeStatus) badgeStatus.className = 'waha-status-badge stopped';
                if (badgeText) badgeText.textContent = st;
                if (stateDisp) stateDisp.style.color = 'var(--text-secondary)';

                if (connectedCard) connectedCard.style.display = 'none';
                if (qrContent) qrContent.style.display = 'none';
                if (qrPlaceholder) {
                    qrPlaceholder.style.display = 'block';
                    qrPlaceholder.innerHTML = `
                        <i class="fas fa-power-off" style="font-size: 36px; margin-bottom: 10px; display: block; opacity: 0.5;"></i>
                        <span>Sessão parada (${st}). Clique em <strong>"Iniciar"</strong> para iniciar o WhatsApp.</span>
                    `;
                }
                stopQrTimers();
            }

            if (showFeedback) showToast(`WAHA Online! Sessão "${data.session}": ${st}`, 'success');
        } else {
            if (sidebarDot) sidebarDot.style.background = 'var(--alert-red)';
            if (sidebarStatus) { sidebarStatus.textContent = 'OFFLINE'; sidebarStatus.style.color = 'var(--alert-red)'; }
            if (badgeStatus) badgeStatus.className = 'waha-status-badge offline';
            if (badgeText) badgeText.textContent = 'OFFLINE';
            if (stateDisp) { stateDisp.textContent = 'OFFLINE'; stateDisp.style.color = 'var(--alert-red)'; }

            if (connectedCard) connectedCard.style.display = 'none';
            if (qrContent) qrContent.style.display = 'none';
            if (qrPlaceholder) {
                qrPlaceholder.style.display = 'block';
                qrPlaceholder.innerHTML = `
                    <i class="fas fa-plug" style="font-size: 36px; color: var(--alert-red); margin-bottom: 10px; display: block; opacity: 0.8;"></i>
                    <strong style="color: #fff; font-size: 13px; display: block;">Servidor WAHA Offline</strong>
                    <span style="font-size: 11.5px; color: var(--text-secondary); display: block; margin-top: 4px;">
                        Inicie o contêiner Docker do WAHA em <code>${data.base_url || 'http://localhost:3000'}</code>
                    </span>
                `;
            }
            stopQrTimers();

            if (showFeedback) showToast(`WAHA Offline: ${data.error || 'Não foi possível conectar ao servidor.'}`, 'error');
        }
    } catch (err) {
        console.error("Erro ao verificar WAHA:", err);
        if (showFeedback) showToast("Erro de comunicação com o backend ao consultar WAHA.", "error");
    }
}

/**
 * Carrega o QR Code da sessão do WAHA com suporte a renovação suave (sem piscar a tela)
 */
window.loadWahaQrCode = async function(isBackground = false) {
    const placeholder = document.getElementById('waha-qr-placeholder');
    const content = document.getElementById('waha-qr-content');
    const qrImg = document.getElementById('waha-qr-image');
    const connectedCard = document.getElementById('waha-connected-card');

    if (!placeholder || !qrImg) return;

    if (!isBackground) {
        if (!qrImg.src || qrImg.src.endsWith('#') || qrImg.src === window.location.href) {
            placeholder.style.display = 'block';
            placeholder.innerHTML = `
                <div style="padding: 15px; text-align: center;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 32px; color: var(--neon-green); margin-bottom: 12px; display: block;"></i>
                    <strong style="color: #fff; font-size: 13.5px; display: block; margin-bottom: 4px;">Carregando QR Code do WhatsApp...</strong>
                    <span style="font-size: 12px; color: var(--text-secondary);">Obtendo chave de pareamento criptográfica.</span>
                </div>
            `;
            if (content) content.style.display = 'none';
        }
    }

    try {
        const response = await fetch(`/api/waha/qr?t=${Date.now()}`);
        const contentType = response.headers.get("content-type") || "";

        // Caso 1: O endpoint retornou imagem binária real (PNG / JPEG)
        if (contentType.includes("image") || contentType.includes("octet-stream")) {
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            qrImg.src = objectUrl;

            placeholder.style.display = 'none';
            if (connectedCard) connectedCard.style.display = 'none';
            if (content) content.style.display = 'flex';

            resetQrCountdown(20);
            if (typeof window.refreshDockerLogs === 'function') window.refreshDockerLogs();

            if (!isBackground) {
                appendWahaLog("✅ QR Code pronto! Aponte a câmera DE DENTRO do WhatsApp no celular.", "success");
            }
            return;
        }

        // Caso 2: Retornou JSON (informação de status, autenticação ou erro)
        const data = await response.json().catch(() => ({}));

        if (data.authenticated) {
            checkWahaStatus(false);
            return;
        }

        // Se for estado STARTING, tenta um retry curto
        if (!isBackground && (data.error || '').includes('STARTING')) {
            appendWahaLog("Sessão inicializando no WAHA. Carregando QR Code em 2s...", "info");
            setTimeout(() => window.loadWahaQrCode(false), 2000);
            return;
        }

        // Caso 3: Erro ou aguardando
        if (!isBackground) {
            const errMessage = data.error || `Servidor retornou status ${response.status}`;
            placeholder.style.display = 'block';
            placeholder.innerHTML = `
                <div style="padding: 15px; text-align: center;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 30px; color: var(--alert-orange); margin-bottom: 10px; display: block;"></i>
                    <strong style="color: #fff; font-size: 13.5px; display: block; margin-bottom: 4px;">QR Code em Inicialização</strong>
                    <span style="font-size: 12px; color: var(--text-secondary); display: block; margin-bottom: 12px;">
                        ${escapeHtml(errMessage)}
                    </span>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="loadWahaQrCode(false)">
                        <i class="fas fa-redo"></i> Tentar Novamente
                    </button>
                </div>
            `;
            if (content) content.style.display = 'none';
        }

    } catch (err) {
        console.error("Erro ao carregar QR Code:", err);
        if (!isBackground) {
            placeholder.style.display = 'block';
            placeholder.innerHTML = `
                <div style="padding: 15px; text-align: center;">
                    <i class="fas fa-plug" style="font-size: 30px; color: var(--alert-red); margin-bottom: 10px; display: block;"></i>
                    <strong style="color: #fff; font-size: 13.5px; display: block; margin-bottom: 4px;">Falha de Conexão com o Servidor</strong>
                    <span style="font-size: 12px; color: var(--text-secondary); display: block; margin-bottom: 12px;">
                        Verifique se o backend e o WAHA estão ativos.
                    </span>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="loadWahaQrCode(false)">
                        <i class="fas fa-redo"></i> Tentar Novamente
                    </button>
                </div>
            `;
            if (content) content.style.display = 'none';
        }
    }
};

/**
 * Alterna visualização entre Logs da Aplicação e Terminal Docker do WAHA
 */
window.switchLogView = function(view) {
    const appBox = document.getElementById('waha-console-logs');
    const dockerBox = document.getElementById('waha-docker-logs');
    const btnApp = document.getElementById('btn-log-app');
    const btnDocker = document.getElementById('btn-log-docker');

    if (view === 'docker') {
        if (appBox) appBox.style.display = 'none';
        if (dockerBox) dockerBox.style.display = 'block';
        if (btnApp) btnApp.className = 'btn btn-secondary btn-sm';
        if (btnDocker) btnDocker.className = 'btn btn-neon btn-sm';
        window.refreshDockerLogs();
    } else {
        if (appBox) appBox.style.display = 'block';
        if (dockerBox) dockerBox.style.display = 'none';
        if (btnApp) btnApp.className = 'btn btn-neon btn-sm';
        if (btnDocker) btnDocker.className = 'btn btn-secondary btn-sm';
    }
};

/**
 * Puxa os logs ao vivo direto do container Docker do WAHA (/api/waha/docker-logs)
 */
window.refreshDockerLogs = async function() {
    const dockerBox = document.getElementById('waha-docker-logs');
    const asciiText = document.getElementById('waha-qr-ascii-text');

    try {
        const res = await fetch('/api/waha/docker-logs');
        const data = await res.json();

        if (data.success) {
            if (dockerBox) {
                dockerBox.textContent = data.logs || '[Docker] Nenhum log recente retornado.';
                dockerBox.scrollTop = dockerBox.scrollHeight;
            }
            if (data.ascii_qr && asciiText) {
                asciiText.textContent = data.ascii_qr;
            }
        } else if (dockerBox) {
            dockerBox.textContent = `[Erro Docker] ${data.error || 'Falha ao buscar logs.'}`;
        }
    } catch (err) {
        if (dockerBox) dockerBox.textContent = `[Erro de Rede] ${err.message}`;
    }
};

/**
 * Alterna entre QR Code em Imagem PNG e QR Code em formato ASCII (terminal)
 */
window.toggleQrViewMode = function(mode) {
    const imgContainer = document.getElementById('waha-qr-img-container');
    const asciiContainer = document.getElementById('waha-qr-ascii-container');
    const btnImg = document.getElementById('btn-qr-view-img');
    const btnAscii = document.getElementById('btn-qr-view-ascii');

    if (mode === 'ascii') {
        if (imgContainer) imgContainer.style.display = 'none';
        if (asciiContainer) asciiContainer.style.display = 'block';
        if (btnImg) btnImg.className = 'btn btn-secondary btn-sm';
        if (btnAscii) btnAscii.className = 'btn btn-neon btn-sm';
        window.refreshDockerLogs();
    } else {
        if (imgContainer) imgContainer.style.display = 'inline-block';
        if (asciiContainer) asciiContainer.style.display = 'none';
        if (btnImg) btnImg.className = 'btn btn-neon btn-sm';
        if (btnAscii) btnAscii.className = 'btn btn-secondary btn-sm';
    }
};

/**
 * Ações na sessão WAHA (start, stop, restart, reset)
 */
window.handleWahaSessionAction = async function(action) {
    if (action === 'reset') {
        if (!confirm("Tem certeza que deseja resetar e limpar a sessão 'default' do WAHA? Isso reiniciará o pareamento do zero.")) {
            return;
        }
    }

    appendWahaLog(`Enviando comando para a sessão: ${action}...`, 'info');
    try {
        const res = await fetch(`/api/waha/session/${action}`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast(`Comando "${action}" executado com sucesso na sessão WAHA!`, 'success');
            appendWahaLog(`Sessão WAHA comando "${action}" OK. ${data.message || ''}`, 'success');
        } else {
            showToast(`Falha no comando "${action}": ${data.error || 'Erro desconhecido'}`, 'error');
            appendWahaLog(`Falha no comando "${action}": ${data.error || 'Erro'}`, 'error');
        }
        setTimeout(() => checkWahaStatus(false), 1500);
    } catch (err) {
        showToast(`Erro ao executar ação na sessão: ${err.message}`, 'error');
    }
};

/**
 * Disparo Individual usando o Proxy Backend (/api/waha/send)
 */
async function sendSingleWhatsApp(lead, customMessage = null) {
    const rawNumber = lead.whatsapp || lead.phone;
    const chatId = formatWhatsAppChatId(rawNumber);

    if (!chatId) {
        showToast(`Lead "${lead.name}" não possui telefone válido para envio.`, 'warning');
        appendWahaLog(`Falha de envio: Lead "${lead.name}" sem número válido.`, 'warn');
        return false;
    }

    const messageText = customMessage || buildPersonalizedMessage(lead);

    const payload = {
        chatId: chatId,
        text: messageText,
        lead_id: lead.id || null
    };

    appendWahaLog(`Disparando WhatsApp para "${lead.name}" (${chatId})...`, 'info');

    try {
        const res = await fetch('/api/waha/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            const errDesc = data.error || `Erro HTTP ${res.status}`;
            throw new Error(errDesc);
        }

        showToast(`Mensagem enviada com sucesso para ${lead.name}!`, 'success');
        appendWahaLog(`✅ Mensagem entregue com sucesso para ${lead.name} (${chatId})`, 'success');

        // Atualiza status local do lead para 'contatado'
        lead.campaign_status = 'contatado';
        if (typeof loadCampaignsView === 'function') loadCampaignsView();
        if (typeof loadDashboardStats === 'function') loadDashboardStats();

        return true;
    } catch (err) {
        console.error("Erro ao enviar WhatsApp:", err);
        showToast(err.message, 'error');
        appendWahaLog(`❌ Falha no envio para ${lead.name}: ${err.message}`, 'error');
        return false;
    }
}

/**
 * Handlers de clique para botões existentes
 */
window.handleTableConversarClick = function(leadId) {
    const lead = currentLeads.find(l => l.id === leadId);
    if (!lead) return;
    if (confirm(`Disparar mensagem personalizada via WAHA para "${lead.name}"?`)) {
        sendSingleWhatsApp(lead);
    }
};

window.handleKanbanWAClick = function(event, leadId) {
    if (event) event.stopPropagation();
    const lead = currentLeads.find(l => l.id === leadId);
    if (!lead) return;
    if (confirm(`Disparar abordagem direta via WAHA para "${lead.name}"?`)) {
        sendSingleWhatsApp(lead);
    }
};

/**
 * Seleção em massa na Tabela
 */
window.updateSelectedLeadsCount = function() {
    const checkedBoxes = document.querySelectorAll('.lead-select-checkbox:checked');
    const count = checkedBoxes.length;

    const badge = document.getElementById('selected-leads-count');
    const bulkBtnCount = document.getElementById('bulk-btn-count');
    if (badge) badge.textContent = count;
    if (bulkBtnCount) bulkBtnCount.textContent = count;

    const masterCb = document.getElementById('th-select-all');
    const allBoxes = document.querySelectorAll('.lead-select-checkbox');
    if (masterCb && allBoxes.length > 0) {
        masterCb.checked = (checkedBoxes.length === allBoxes.length);
    }

    updateBulkAudienceCount();
};

window.toggleSelectAllRows = function(masterCb) {
    document.querySelectorAll('.lead-select-checkbox').forEach(cb => {
        cb.checked = masterCb.checked;
    });
    updateSelectedLeadsCount();
};

window.selectAllLeads = function(selectAll) {
    document.querySelectorAll('.lead-select-checkbox').forEach(cb => {
        cb.checked = selectAll;
    });
    const masterCb = document.getElementById('th-select-all');
    if (masterCb) masterCb.checked = selectAll;
    updateSelectedLeadsCount();
};

window.updateBulkAudienceCount = function() {
    const groupSelect = document.getElementById('bulk-target-group');
    const summary = document.getElementById('bulk-audience-summary');
    if (!groupSelect || !summary) return;

    const group = groupSelect.value;
    let leadsToCount = [];

    if (group === 'selection') {
        const selectedIds = Array.from(document.querySelectorAll('.lead-select-checkbox:checked'))
                                 .map(cb => parseInt(cb.value));
        leadsToCount = currentLeads.filter(l => selectedIds.includes(l.id) && (l.whatsapp || l.phone));
        summary.textContent = `${leadsToCount.length} lead(s) selecionados com telefone/WhatsApp prontos para disparo.`;
    } else if (group === 'no-site') {
        leadsToCount = currentLeads.filter(l => (!l.has_website || !l.website) && (l.whatsapp || l.phone));
        summary.textContent = `${leadsToCount.length} lead(s) 'SEM SITE' identificados na base para abordagem.`;
    } else if (group === 'stage-contato') {
        leadsToCount = currentLeads.filter(l => (l.follow_stage || 'contato') === 'contato' && (l.whatsapp || l.phone));
        summary.textContent = `${leadsToCount.length} lead(s) na etapa '1º Contato' prontos para abordagem.`;
    } else if (group === 'stage-follow1') {
        leadsToCount = currentLeads.filter(l => l.follow_stage === 'follow1' && (l.whatsapp || l.phone));
        summary.textContent = `${leadsToCount.length} lead(s) na etapa 'Follow 1' aguardando retorno.`;
    } else if (group === 'stage-follow2') {
        leadsToCount = currentLeads.filter(l => l.follow_stage === 'follow2' && (l.whatsapp || l.phone));
        summary.textContent = `${leadsToCount.length} lead(s) na etapa 'Follow 2' para encerramento.`;
    } else {
        leadsToCount = currentLeads.filter(l => l.whatsapp || l.phone);
        summary.textContent = `${leadsToCount.length} lead(s) com contato telefônico cadastrados.`;
    }
};

window.previewBulkSpintax = function() {
    const template = document.getElementById('bulk-message-template').value;
    const previewBox = document.getElementById('bulk-preview-box');
    const sampleLead = currentLeads[0] || {
        name: 'Auto Mecânica Modelo',
        address: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP',
        has_website: 0,
        website: ''
    };

    const resolved = buildPersonalizedMessage(sampleLead, template);
    if (previewBox) {
        previewBox.style.display = 'block';
        previewBox.innerHTML = `<strong>Prévia da Mensagem (Exemplo com "${sampleLead.name}"):</strong>\n\n${escapeHtml(resolved)}`;
    }
};

window.previewSpintaxQuick = function() {
    const text = document.getElementById('quick-wa-text').value;
    const resolved = parseSpintax(text);
    showToast(`Spintax sorteado:\n"${resolved}"`, "info", 5000);
};

window.handleQuickSend = async function(btn) {
    const rawPhone = document.getElementById('quick-wa-phone').value.trim();
    const text = document.getElementById('quick-wa-text').value.trim();

    if (!rawPhone) {
        showToast("Digite o número de telefone.", "warning");
        return;
    }
    if (!text) {
        showToast("Digite a mensagem.", "warning");
        return;
    }

    const chatId = formatWhatsAppChatId(rawPhone);
    if (!chatId) {
        showToast("Número inválido.", "error");
        return;
    }

    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Enviando...`;

    try {
        const res = await fetch('/api/waha/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId: chatId,
                text: parseSpintax(text)
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast("Mensagem rápida enviada com sucesso!", "success");
            appendWahaLog(`Mensagem rápida enviada para ${chatId}`, "success");
        } else {
            showToast(data.error || "Erro ao enviar.", "error");
        }
    } catch (err) {
        showToast(`Erro na requisição: ${err.message}`, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
    }
};

/**
 * Iniciar disparo em massa a partir do botão da tabela
 */
window.handleBulkSendAction = function(btn) {
    const selectedCount = document.querySelectorAll('.lead-select-checkbox:checked').length;
    if (selectedCount === 0) {
        showToast("Marque pelo menos um lead na tabela usando as caixas de seleção.", "warning");
        return;
    }

    // Muda para a aba WhatsApp com o filtro "selection" já ativo
    const waTab = document.querySelector('[data-tab="whatsapp"]');
    if (waTab) waTab.click();

    const targetGroup = document.getElementById('bulk-target-group');
    if (targetGroup) {
        targetGroup.value = 'selection';
        updateBulkAudienceCount();
    }
};

window.handleStartBulkCampaign = function() {
    const group = document.getElementById('bulk-target-group').value;
    let targetLeads = [];

    if (group === 'selection') {
        const selectedIds = Array.from(document.querySelectorAll('.lead-select-checkbox:checked'))
                                 .map(cb => parseInt(cb.value));
        targetLeads = currentLeads.filter(l => selectedIds.includes(l.id) && (l.whatsapp || l.phone));
    } else if (group === 'no-site') {
        targetLeads = currentLeads.filter(l => (!l.has_website || !l.website) && (l.whatsapp || l.phone));
    } else if (group === 'stage-contato') {
        targetLeads = currentLeads.filter(l => (l.follow_stage || 'contato') === 'contato' && (l.whatsapp || l.phone));
    } else if (group === 'stage-follow1') {
        targetLeads = currentLeads.filter(l => l.follow_stage === 'follow1' && (l.whatsapp || l.phone));
    } else if (group === 'stage-follow2') {
        targetLeads = currentLeads.filter(l => l.follow_stage === 'follow2' && (l.whatsapp || l.phone));
    } else {
        targetLeads = currentLeads.filter(l => l.whatsapp || l.phone);
    }

    if (targetLeads.length === 0) {
        showToast("Nenhum lead com telefone/WhatsApp encontrado para o grupo selecionado.", "warning");
        return;
    }

    const minSec = parseInt(document.getElementById('bulk-delay-min').value) || 15;
    const maxSec = parseInt(document.getElementById('bulk-delay-max').value) || 35;

    if (confirm(`Iniciar disparo em massa para ${targetLeads.length} leads com delay humano entre ${minSec}s e ${maxSec}s?`)) {
        sendBulkWhatsApp(targetLeads, document.getElementById('btn-start-bulk'));
    }
};

window.handleStopBulkCampaign = function() {
    isBulkCampaignActive = false;
    showToast("Interrupção solicitada. O envio será pausado no próximo ciclo.", "warning");
    appendWahaLog("Interrupção da campanha solicitada pelo usuário.", "warn");
};

/**
 * Função de Envio em Massa com Delay Randômico Anti-Ban (15s a 35s)
 */
async function sendBulkWhatsApp(leadsList, triggerButton = null) {
    if (!leadsList || leadsList.length === 0) return;

    isBulkCampaignActive = true;
    const minDelaySec = parseInt(document.getElementById('bulk-delay-min').value) || 15;
    const maxDelaySec = parseInt(document.getElementById('bulk-delay-max').value) || 35;
    const customTemplate = document.getElementById('bulk-message-template').value;

    const stopBtn = document.getElementById('btn-stop-bulk');
    const statusContainer = document.getElementById('bulk-status-container');
    const progressBar = document.getElementById('bulk-progress-bar');
    const progressText = document.getElementById('bulk-progress-text');
    const countdownText = document.getElementById('bulk-countdown-text');

    let originalHtml = '';
    if (triggerButton) {
        originalHtml = triggerButton.innerHTML;
        triggerButton.disabled = true;
    }
    if (stopBtn) stopBtn.style.display = 'inline-flex';
    if (statusContainer) statusContainer.style.display = 'block';

    let successCount = 0;
    let failCount = 0;
    const total = leadsList.length;

    appendWahaLog(`🚀 Iniciando campanha em massa para ${total} leads (Delay: ${minDelaySec}s-${maxDelaySec}s)...`, 'info');

    try {
        for (let i = 0; i < total; i++) {
            if (!isBulkCampaignActive) {
                appendWahaLog("🛑 Campanha interrompida pelo usuário.", "warn");
                break;
            }

            const lead = leadsList[i];
            const currentIdx = i + 1;
            const pct = Math.round((currentIdx / total) * 100);

            if (progressBar) progressBar.style.width = `${pct}%`;
            if (progressText) progressText.textContent = `Progresso: ${currentIdx} de ${total} (${pct}%)`;
            if (countdownText) countdownText.textContent = `Disparando...`;

            if (triggerButton) {
                triggerButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Enviando (${currentIdx}/${total})...`;
            }

            // Monta mensagem personalizada dinâmica com Spintax
            const message = buildPersonalizedMessage(lead, customTemplate);
            const success = await sendSingleWhatsApp(lead, message);

            if (success) successCount++;
            else failCount++;

            // Se não for o último lead e a campanha continuar ativa, aguarda o delay humano
            if (i < total - 1 && isBulkCampaignActive) {
                const randomDelayMs = Math.floor(Math.random() * ((maxDelaySec - minDelaySec) * 1000 + 1)) + (minDelaySec * 1000);
                const delaySecs = Math.round(randomDelayMs / 1000);

                appendWahaLog(`⏳ Aguardando delay anti-banimento de ${delaySecs}s antes do próximo disparo...`, 'info');

                let remaining = delaySecs;
                while (remaining > 0 && isBulkCampaignActive) {
                    if (countdownText) countdownText.textContent = `Delay humano: ${remaining}s...`;
                    if (triggerButton) triggerButton.innerHTML = `<i class="fas fa-clock"></i> Aguardando ${remaining}s (${currentIdx}/${total})...`;
                    await new Promise(r => setTimeout(r, 1000));
                    remaining--;
                }
            }
        }

        showToast(`Campanha finalizada! ${successCount} enviados com sucesso, ${failCount} falhas.`, successCount > 0 ? 'success' : 'warning', 7000);
        appendWahaLog(`🏁 Campanha finalizada: ${successCount} enviados, ${failCount} falhas.`, 'success');

    } catch (err) {
        showToast(`Erro durante a campanha: ${err.message}`, 'error');
        appendWahaLog(`Erro crítico na campanha: ${err.message}`, 'error');
    } finally {
        isBulkCampaignActive = false;
        if (triggerButton) {
            triggerButton.disabled = false;
            triggerButton.innerHTML = originalHtml;
        }
        if (stopBtn) stopBtn.style.display = 'none';
        if (countdownText) countdownText.textContent = 'Concluído';
    }
}

// 9. FUNÇÕES DE VISUALIZAÇÃO DE FOTOS E LIGHTBOX
window.openPhotoLightbox = function(url, caption = '') {
    const modal = document.getElementById('photo-lightbox-modal');
    const img = document.getElementById('lightbox-full-img');
    const cap = document.getElementById('lightbox-caption');
    if (!modal || !img) return;

    img.src = url;
    if (cap) cap.textContent = caption || 'Foto Real do Estabelecimento';
    modal.classList.add('active');
};

window.closePhotoLightbox = function() {
    const modal = document.getElementById('photo-lightbox-modal');
    if (modal) modal.classList.remove('active');
};

window.toggleLeadPhotosView = function() {
    const photosContainer = document.getElementById('modal-lead-photos-container');
    const toggleBtn = document.getElementById('btn-toggle-lead-photos');
    if (!photosContainer || !activeLeadForModal) return;

    const photos = getLeadPhotos(activeLeadForModal);
    if (photosContainer.style.display === 'none' || !photosContainer.style.display) {
        photosContainer.style.display = 'block';
        if (toggleBtn) {
            toggleBtn.innerHTML = `<i class="fas fa-eye-slash"></i> Ocultar Fotos Reais`;
        }
    } else {
        photosContainer.style.display = 'none';
        if (toggleBtn) {
            toggleBtn.innerHTML = `<i class="fas fa-eye"></i> Exibir Fotos Reais (${photos.length})`;
        }
    }
};

window.copyLeadMarkdownDossier = function() {
    if (!activeLeadForModal) return;
    const lead = activeLeadForModal;
    const photos = getLeadPhotos(lead);
    const mapsUrl = lead.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.name + ' ' + (lead.address || ''))}`;
    const googleUrl = lead.google_url || `https://www.google.com/search?q=${encodeURIComponent(lead.name + ' ' + (lead.address || ''))}`;

    let md = `# 🏢 Ficha Técnica B2B: ${lead.name}\n\n`;
    md += `- **Nicho / Categoria:** ${lead.category || 'Não informado'}\n`;
    md += `- **Endereço Completo:** ${lead.address || 'Não informado'}\n`;
    md += `- **WhatsApp:** ${lead.whatsapp || 'Não detectado'}\n`;
    md += `- **Telefone Comercial:** ${lead.phone || 'Não informado'}\n`;
    md += `- **Instagram:** ${lead.instagram || 'Não detectado'}\n`;
    md += `- **Site Oficial:** ${lead.website ? `[${lead.website}](${lead.website})` : '❌ Sem site cadastrado (Alta Oportunidade)'}\n`;
    md += `- **Score de Oportunidade:** ${lead.opportunity_score || (!lead.has_website ? 95 : 45)}/100\n`;
    md += `- **Etapa no Funil CRM:** ${(lead.follow_stage || 'contato').toUpperCase()}\n\n`;
    md += `### 🔗 Links Oficiais de Auditoria & Validação\n`;
    md += `- [Abrir Local no Google Maps](${mapsUrl})\n`;
    md += `- [Pesquisar Empresa no Google](${googleUrl})\n\n`;

    if (photos.length > 0) {
        md += `### 📸 Acervo de Fotos Reais da Empresa (${photos.length} fotos extraídas)\n`;
        photos.forEach((url, i) => {
            md += `${i + 1}. [Foto ${i + 1} em Alta Resolução (800x600)](${url})\n`;
        });
        md += `\n`;
    }

    md += `### 💬 Script Sugerido de Abordagem Comercial\n`;
    md += `> ${getPitchMessage(lead, lead.follow_stage || 'contato').replace(/\n/g, '\n> ')}\n`;

    navigator.clipboard.writeText(md).then(() => {
        if (typeof showToast === 'function') {
            showToast("Ficha do lead copiada em Markdown (.md) com links do Maps e Fotos!", "success");
        } else {
            alert("Ficha do lead copiada em Markdown!");
        }
    }).catch(err => {
        alert("Erro ao copiar markdown: " + err.message);
    });
};

window.openLeadPhotosModal = function(leadId) {
    const lead = currentLeads.find(l => l.id === leadId);
    if (!lead) return;
    openLeadModal(leadId);
    // Como o usuário clicou especificamente no botão de fotos, expande a galeria imediatamente
    const photosContainer = document.getElementById('modal-lead-photos-container');
    const toggleBtn = document.getElementById('btn-toggle-lead-photos');
    if (photosContainer) {
        photosContainer.style.display = 'block';
    }
    if (toggleBtn) {
        toggleBtn.innerHTML = `<i class="fas fa-eye-slash"></i> Ocultar Fotos Reais`;
    }
    setTimeout(() => {
        if (photosContainer) {
            photosContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, 200);
};

// 10. RELATÓRIO EXECUTIVO & EXPORTAÇÃO DE DOSSIÊ
window.openExecutiveReportModal = async function() {
    const modal = document.getElementById('executive-report-modal');
    const body = document.getElementById('report-content-body');
    const dlBtn = document.getElementById('btn-download-report-md');
    if (!modal || !body) return;

    if (dlBtn) {
        let mdDownloadUrl = '/api/report/markdown?download=true';
        if (currentScanId) mdDownloadUrl += `&scan_id=${currentScanId}`;
        dlBtn.href = mdDownloadUrl;
    }

    modal.classList.add('active');
    body.innerHTML = `
        <div style="text-align:center; padding: 40px; color: var(--neon-cyan);">
            <i class="fas fa-spinner fa-spin fa-2x"></i>
            <div style="margin-top:12px; font-weight:600;">Consolidando métricas e gerando Dossiê Executivo...</div>
        </div>
    `;

    try {
        let url = '/api/report/data';
        if (currentScanId) url += `?scan_id=${currentScanId}`;
        const res = await fetch(url);
        const report = await res.json();

        const s = report.summary || {};
        const leads = report.leads || [];

        const nowFormatted = new Date().toLocaleDateString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        body.innerHTML = `
            <div class="report-header-banner">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
                    <div>
                        <div style="font-size:22px; font-weight:800; color:var(--neon-green); letter-spacing:0.5px; display:flex; align-items:center; gap:8px;">
                            <i class="fas fa-chart-pie"></i> Dossiê de Inteligência Comercial B2B
                        </div>
                        <div style="font-size:13.5px; color:var(--text-secondary); margin-top:4px;">
                            Análise de Presença Digital, Fotos Reais e Oportunidades de Vendas
                        </div>
                    </div>
                    <div style="text-align:right; font-size:12px; color:var(--text-secondary); font-weight:500;">
                        <div><strong>Data do Dossiê:</strong> ${nowFormatted}</div>
                        <div><strong>Amostra Analisada:</strong> ${s.total_leads || 0} estabelecimentos</div>
                    </div>
                </div>
            </div>

            <!-- CARDS DE KPIS -->
            <div class="report-kpis-grid">
                <div class="report-kpi-card" style="border-left: 4px solid var(--neon-cyan);">
                    <div class="report-kpi-val" style="color:var(--neon-cyan);">${s.total_leads || 0}</div>
                    <div class="report-kpi-label">Empresas Analisadas</div>
                </div>
                <div class="report-kpi-card" style="border-left: 4px solid var(--alert-red);">
                    <div class="report-kpi-val" style="color:var(--alert-red);">${s.no_website || 0} <span style="font-size:14px; font-weight:500;">(${s.pct_no_website || 0}%)</span></div>
                    <div class="report-kpi-label">Sem Site Próprio (Alta Prioridade)</div>
                </div>
                <div class="report-kpi-card" style="border-left: 4px solid var(--neon-green);">
                    <div class="report-kpi-val" style="color:var(--neon-green);">${s.with_whatsapp || 0} <span style="font-size:14px; font-weight:500;">(${s.pct_with_whatsapp || 0}%)</span></div>
                    <div class="report-kpi-label">Com WhatsApp Validado</div>
                </div>
                <div class="report-kpi-card" style="border-left: 4px solid #ff6b9d);">
                    <div class="report-kpi-val" style="color:#ff6b9d;">${s.with_instagram || 0} <span style="font-size:14px; font-weight:500;">(${s.pct_with_instagram || 0}%)</span></div>
                    <div class="report-kpi-label">Com Perfil Instagram Mapeado</div>
                </div>
                <div class="report-kpi-card" style="border-left: 4px solid #ffaa00);">
                    <div class="report-kpi-val" style="color:#ffaa00;">${s.with_photos || 0} <span style="font-size:14px; font-weight:500;">(${s.pct_with_photos || 0}%)</span></div>
                    <div class="report-kpi-label">Com Acervo de Fotos Reais</div>
                </div>
            </div>

            <!-- DIAGNÓSTICO E RECOMENDAÇÃO ESTRATÉGICA -->
            <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(0, 210, 255, 0.25); border-radius: 10px; padding: 18px; margin-bottom: 24px;">
                <div style="font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 8px; display:flex; align-items:center; gap:8px;">
                    <i class="fas fa-lightbulb" style="color:var(--neon-cyan);"></i> Diagnóstico de Mercado & Pitch Recomendado
                </div>
                <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.6;">
                    Identificamos que <strong>${s.pct_no_website || 0}% dos estabelecimentos pesquisados não possuem site institucional próprio</strong>, dependendo exclusivamente de plataformas de terceiros ou listagens genéricas. 
                    Empresas com fotos reais mapeadas (${s.with_photos || 0} locais) têm alto apelo visual e convertem significativamente mais quando abordadas com propostas de landing pages modernas e focadas em reservas/contatos diretos via WhatsApp.
                </div>
            </div>

            <!-- TABELA DETALHADA PARA IMPRESSÃO / ANÁLISE -->
            <div style="font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 12px; display:flex; justify-content:space-between; align-items:center;">
                <span><i class="fas fa-list-check" style="color:var(--neon-green);"></i> Listagem Analítica dos Estabelecimentos</span>
                <span style="font-size:12px; color:var(--text-secondary); font-weight:500;">Total de ${leads.length} registros</span>
            </div>

            <div style="overflow-x: auto; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px;">
                <table class="report-table">
                    <thead>
                        <tr>
                            <th style="width: 25%;">Empresa / Localização</th>
                            <th>Status Site</th>
                            <th>WhatsApp / Telefone</th>
                            <th>Instagram</th>
                            <th>Fotos Reais</th>
                            <th>Google Maps</th>
                            <th>Busca Google</th>
                            <th>Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${leads.map(lead => {
                            const pCount = (lead.photos_count !== undefined) ? lead.photos_count : getLeadPhotos(lead).length;
                            const hasWeb = lead.has_website && lead.website;
                            const score = lead.opportunity_score || (!hasWeb ? 95 : 45);
                            const mapsHref = lead.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.name + ' ' + (lead.address || ''))}`;
                            const googleHref = lead.google_url || `https://www.google.com/search?q=${encodeURIComponent(lead.name + ' ' + (lead.address || ''))}`;

                            return `
                                <tr>
                                    <td>
                                        <div style="font-weight: 700; color: #ffffff; font-size: 13.5px;">${escapeHtml(lead.name)}</div>
                                        <div style="font-size: 12px; font-weight: 500; color: var(--text-address); margin-top: 3px; display: flex; align-items: center; gap: 5px;">
                                            <i class="fas fa-map-marker-alt" style="color: var(--neon-cyan); font-size: 11px;"></i>
                                            <span>${escapeHtml(lead.address || 'Local não informado')}</span>
                                        </div>
                                    </td>
                                    <td>
                                        ${!hasWeb 
                                            ? `<span class="badge-no-site" style="font-size:11px; padding:3px 8px;">SEM SITE</span>` 
                                            : `<span class="badge-has-site" style="font-size:11px; padding:3px 8px;"><i class="fas fa-globe"></i> ${truncateUrl(lead.website)}</span>`}
                                    </td>
                                    <td>
                                        <div style="font-weight:600; font-size:12.5px; color:var(--neon-green);">${lead.whatsapp || lead.phone || '<span style="color:var(--text-secondary); font-size:12px; font-weight:500;">Não informado</span>'}</div>
                                    </td>
                                    <td>
                                        ${lead.instagram 
                                            ? `<span class="badge-instagram" style="font-size:11px; padding:2px 7px;"><i class="fab fa-instagram"></i> ${escapeHtml(lead.instagram)}</span>` 
                                            : `<span style="color:var(--text-secondary); font-size:12px; font-weight:500;">—</span>`}
                                    </td>
                                    <td>
                                        ${pCount > 0 
                                            ? `<span class="badge-photos" style="font-size:11px; padding:2px 7px;"><i class="fas fa-camera"></i> ${pCount} fotos</span>` 
                                            : `<span style="color:var(--text-secondary); font-size:12px; font-weight:500;">0 fotos</span>`}
                                    </td>
                                    <td>
                                        <a href="${mapsHref}" target="_blank" style="color:var(--neon-cyan); font-size:12px; font-weight:600; text-decoration:none;">
                                            <i class="fas fa-map-marked-alt"></i> Ver Maps
                                        </a>
                                    </td>
                                    <td>
                                        <a href="${googleHref}" target="_blank" style="color:#ffb703; font-size:12px; font-weight:600; text-decoration:none;">
                                            <i class="fab fa-google"></i> Analisar
                                        </a>
                                    </td>
                                    <td>
                                        <span class="opp-badge ${score > 80 ? 'opp-high' : 'opp-med'}" style="font-size:11.5px; padding:3px 8px;">${score}/100</span>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        body.innerHTML = `
            <div style="text-align:center; padding: 30px; color: var(--alert-red);">
                <i class="fas fa-exclamation-triangle fa-2x"></i>
                <div style="margin-top:10px; font-weight:600;">Erro ao gerar relatório: ${escapeHtml(err.message)}</div>
            </div>
        `;
    }
};

window.copyExecutiveReportMarkdown = async function() {
    try {
        let url = '/api/report/markdown';
        if (currentScanId) url += `?scan_id=${currentScanId}`;
        const res = await fetch(url);
        const mdText = await res.text();
        await navigator.clipboard.writeText(mdText);
        if (typeof showToast === 'function') {
            showToast("Relatório Executivo copiado em Markdown (.md) com sucesso!", "success");
        } else {
            alert("Relatório copiado em formato Markdown (.md)!");
        }
    } catch (err) {
        alert("Erro ao copiar markdown: " + err.message);
    }
};

window.closeExecutiveReportModal = function() {
    const modal = document.getElementById('executive-report-modal');
    if (modal) modal.classList.remove('active');
};

// 11. LIMPEZA DE DADOS ATUAIS
window.handleClearCurrentData = function() {
    const modal = document.getElementById('confirm-clear-modal');
    if (modal) modal.classList.add('active');
};

window.closeClearModal = function() {
    const modal = document.getElementById('confirm-clear-modal');
    if (modal) modal.classList.remove('active');
};

window.executeClearCurrentData = async function() {
    try {
        const res = await fetch('/api/leads/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scan_id: currentScanId || null })
        });
        const data = await res.json();
        
        closeClearModal();
        currentScanId = null;
        await loadLeads();
        await loadDashboardStats();
        
        if (typeof showToast === 'function') {
            showToast(data.message || "Dados limpos com sucesso!", "success");
        } else {
            alert(data.message || "Dados limpos com sucesso!");
        }
    } catch (err) {
        console.error("Erro ao limpar dados:", err);
        alert("Erro ao limpar dados: " + err.message);
    }
};

// 12. DROPDOWNS DO CABEÇALHO (EXPORTAÇÃO & LIMPEZA)
window.toggleDropdown = function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const isShown = el.classList.contains('show');
    closeAllDropdowns();
    if (!isShown) el.classList.add('show');
};

window.closeAllDropdowns = function() {
    document.querySelectorAll('.dropdown-content.show').forEach(d => d.classList.remove('show'));
};

window.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-container')) {
        closeAllDropdowns();
    }
});

// 13. GESTÃO SELETIVA E LIMPEZA DE BASE (SALVAR SOMENTE FECHADOS, MANTER NOVOS, LIMPAR TUDO)
window.openCleanupModal = function(mode = 'keep_closed') {
    pendingCleanupMode = mode;
    const modal = document.getElementById('confirm-cleanup-modal');
    const title = document.getElementById('cleanup-modal-title');
    const badge = document.getElementById('cleanup-modal-badge');
    const desc = document.getElementById('cleanup-modal-desc');
    const confirmBtn = document.getElementById('cleanup-confirm-btn');
    if (!modal) return;

    if (mode === 'keep_closed') {
        title.innerHTML = `<i class="fas fa-shield-alt" style="color:var(--neon-green)"></i> Salvar Somente Fechados`;
        if (badge) {
            badge.style.background = 'rgba(0,255,136,0.1)';
            badge.style.borderColor = 'rgba(0,255,136,0.3)';
            badge.innerHTML = `<i class="fas fa-trophy" style="color:var(--neon-green)"></i> <strong>Proteção de Vendas:</strong> Preserva TODOS os clientes que fecharam contrato e limpa os contatos frios/não convertidos.`;
        }
        if (desc) {
            desc.textContent = "Esta ação manterá intactos todos os leads com status 'Fechados / Clientes' (com seus respectivos valores em R$ e datas) e removerá os leads novos, contatados e propostas da base. Ideal para finalizar uma campanha garantindo sua carteira de clientes adquiridos.";
        }
        if (confirmBtn) {
            confirmBtn.style.background = 'var(--neon-green)';
            confirmBtn.style.color = '#000';
            confirmBtn.innerHTML = `<i class="fas fa-check"></i> Salvar Fechados & Limpar Resto`;
        }
    } else if (mode === 'keep_new') {
        title.innerHTML = `<i class="fas fa-sparkles" style="color:var(--neon-cyan)"></i> Manter Apenas Novos Leads`;
        if (badge) {
            badge.style.background = 'rgba(0,210,255,0.1)';
            badge.style.borderColor = 'rgba(0,210,255,0.3)';
            badge.innerHTML = `<i class="fas fa-broom" style="color:var(--neon-cyan)"></i> <strong>Limpeza de Funil:</strong> Preserva apenas os leads recém-extraídos (novos) e limpa negociações antigas.`;
        }
        if (desc) {
            desc.textContent = "Esta ação removerá leads em status Contatado, Proposta e Fechado, deixando apenas os leads 'Novos' que ainda não foram abordados pela sua equipe.";
        }
        if (confirmBtn) {
            confirmBtn.style.background = 'var(--neon-cyan)';
            confirmBtn.style.color = '#000';
            confirmBtn.innerHTML = `<i class="fas fa-check"></i> Manter Só Novos Leads`;
        }
    } else {
        title.innerHTML = `<i class="fas fa-trash-alt" style="color:#ff5b73"></i> Limpeza Geral da Base`;
        if (badge) {
            badge.style.background = 'rgba(255,91,115,0.1)';
            badge.style.borderColor = 'rgba(255,91,115,0.3)';
            badge.innerHTML = `<i class="fas fa-exclamation-triangle" style="color:#ff5b73"></i> <strong>Atenção Extrema:</strong> Esta ação apagará TODOS os leads da base atual.`;
        }
        if (desc) {
            desc.textContent = "Todos os leads, histórico de contatos e valores salvos serão apagados permanentemente. Utilize apenas se desejar reiniciar seu CRM do zero.";
        }
        if (confirmBtn) {
            confirmBtn.style.background = '#ff5b73';
            confirmBtn.style.color = '#fff';
            confirmBtn.innerHTML = `<i class="fas fa-trash-alt"></i> Apagar Todos os Leads`;
        }
    }

    modal.classList.add('active');
};

window.closeCleanupModal = function() {
    const modal = document.getElementById('confirm-cleanup-modal');
    if (modal) modal.classList.remove('active');
};

window.executeCleanupAction = async function() {
    try {
        const confirmBtn = document.getElementById('cleanup-confirm-btn');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processando...`;
        }

        const res = await fetch('/api/leads/cleanup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: pendingCleanupMode, scan_id: currentScanId || null })
        });
        const data = await res.json();

        closeCleanupModal();
        if (confirmBtn) {
            confirmBtn.disabled = false;
        }

        await loadLeads();
        await loadDashboardStats();
        if (document.getElementById('tab-campaigns')?.classList.contains('active')) {
            loadCampaignsView();
        }

        if (typeof showToast === 'function') {
            showToast(data.message || "Base de leads reorganizada com sucesso!", "success");
        } else {
            alert(data.message || "Base de leads reorganizada com sucesso!");
        }
    } catch (err) {
        console.error("Erro na limpeza da base:", err);
        alert("Erro na limpeza da base: " + err.message);
    }
};

// 14. GESTÃO DE OPERADORES & AUTENTICAÇÃO (ONLINE / DUAS PESSOAS)
window.openLoginModal = function() {
    const modal = document.getElementById('login-user-modal');
    if (modal) modal.classList.add('active');
};

window.closeLoginModal = function() {
    const modal = document.getElementById('login-user-modal');
    if (modal) modal.classList.remove('active');
};

window.checkAuthMe = async function() {
    try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
            const data = await res.json();
            if (data.users && Array.isArray(data.users)) {
                systemUsers = data.users;
                updateOperatorDropdowns();
            }
            if (data.active_operator) {
                const found = (systemUsers || []).find(u => u.name === data.active_operator);
                if (found) {
                    currentUser = found;
                } else {
                    currentUser = { id: 1, name: data.active_operator, username: data.active_operator.toLowerCase(), role: 'operador' };
                }
            }
        }
    } catch (err) {
        console.warn("Auth check falhou ou modo local:", err);
    }
    updateCurrentUserUI();
};

window.updateCurrentUserUI = function() {
    const pill = document.getElementById('topbar-user-name');
    if (pill && currentUser) {
        pill.textContent = currentUser.name || currentUser.username;
    }

    const container = document.getElementById('operator-switch-buttons-container');
    if (container && systemUsers && systemUsers.length > 0) {
        // Exibe os operadores de vendas cadastrados
        const ops = systemUsers.filter(u => u.role !== 'admin');
        const listToRender = ops.length > 0 ? ops : systemUsers;
        
        container.innerHTML = listToRender.map(u => {
            const isActive = currentUser && (currentUser.name === u.name || currentUser.username === u.username);
            return `
                <button type="button" class="btn ${isActive ? 'btn-neon' : 'btn-secondary'} btn-sm" 
                        style="flex: 1 1 calc(50% - 10px); justify-content: center; padding: 12px; font-weight: 700;"
                        onclick="selectOperator('${escapeHtml(u.name)}')">
                    <i class="fas fa-user-circle"></i> ${escapeHtml(u.name)}
                    ${isActive ? '<i class="fas fa-check" style="margin-left: 6px; color: var(--neon-green);"></i>' : ''}
                </button>
            `;
        }).join('');
    }
};

window.selectOperator = async function(operatorName) {
    try {
        await fetch('/api/operator/active', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operator_name: operatorName })
        });

        const found = (systemUsers || []).find(u => u.name === operatorName);
        if (found) {
            currentUser = found;
        } else {
            currentUser = { id: 1, name: operatorName, username: operatorName.toLowerCase(), role: 'operador' };
        }

        updateCurrentUserUI();
        closeLoginModal();

        if (typeof showToast === 'function') {
            showToast(`Operador ativo alterado para ${operatorName}!`, 'info');
        }

        // Se o filtro atual for de operador, reaplica
        applyFiltersAndRender();
    } catch (e) {
        console.error("Erro ao alternar operador:", e);
    }
};

window.updateOperatorDropdowns = function() {
    const filterSelect = document.getElementById('table-operator-filter');
    const modalSelect = document.getElementById('modal-assigned-to');
    const cfgSelect = document.getElementById('cfg-user-select');

    if (systemUsers && systemUsers.length > 0) {
        if (filterSelect) {
            const curVal = filterSelect.value;
            filterSelect.innerHTML = `<option value="all">👤 Todos Operadores</option>` +
                systemUsers.map(u => `<option value="${escapeHtml(u.name)}">${escapeHtml(u.name)} (${escapeHtml(u.role)})</option>`).join('');
            filterSelect.value = curVal || 'all';
        }

        if (modalSelect) {
            const curVal = modalSelect.value;
            modalSelect.innerHTML = `<option value="">Não atribuído</option>` +
                systemUsers.map(u => `<option value="${escapeHtml(u.name)}">${escapeHtml(u.name)}</option>`).join('');
            if (curVal) modalSelect.value = curVal;
        }

        if (cfgSelect) {
            cfgSelect.innerHTML = systemUsers.map(u => `<option value="${u.id}">${escapeHtml(u.name)} (@${escapeHtml(u.username)})</option>`).join('');
            onSelectUserToEdit();
        }
    }
};

window.onSelectUserToEdit = function() {
    const sel = document.getElementById('cfg-user-select');
    if (!sel) return;
    const uid = parseInt(sel.value);
    const u = systemUsers.find(x => x.id === uid);
    if (u) {
        const nameInput = document.getElementById('cfg-user-name');
        if (nameInput) nameInput.value = u.name;
    }
};

window.saveUserAccountDetails = async function() {
    const sel = document.getElementById('cfg-user-select');
    if (!sel) return;
    const uid = parseInt(sel.value);
    const name = document.getElementById('cfg-user-name').value.trim();
    const pwd = document.getElementById('cfg-user-password').value;

    const payload = {};
    if (name) payload.name = name;
    if (pwd) payload.password = pwd;

    try {
        const res = await fetch(`/api/auth/users/${uid}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
            document.getElementById('cfg-user-password').value = '';
            if (typeof showToast === 'function') {
                showToast("Dados do usuário atualizados com sucesso!", "success");
            } else {
                alert("Dados do usuário atualizados com sucesso!");
            }
            loadDashboardStats();
            checkAuthMe();
        } else {
            alert(data.detail || "Erro ao atualizar dados.");
        }
    } catch (err) {
        alert("Erro ao atualizar usuário: " + err.message);
    }
};

// ========================================================
// 12. WHATSAPP WEB & CENTRAL MULTI-CANAL DE ATENDIMENTO
// ========================================================

let activeChatLead = null;
let activeChatChannel = 'whatsapp';
let chatConversations = [];
let currentChatFilter = 'all';
let chatSearchQuery = '';
let chatPollingInterval = null;

function formatChatTime(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr.replace(' ', 'T'));
        if (isNaN(d.getTime())) return dateStr.split(' ')[1] || dateStr;
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        if (isToday) return `${hours}:${mins}`;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${day}/${month} ${hours}:${mins}`;
    } catch {
        return dateStr;
    }
}

function formatMessageText(text) {
    if (!text) return '';
    let escaped = escapeHtml(text);
    // Links clicáveis
    escaped = escaped.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:var(--neon-cyan); text-decoration:underline;">$1</a>');
    // Negrito estilo WhatsApp: *palavra*
    escaped = escaped.replace(/\*([^\*]+)\*/g, '<strong>$1</strong>');
    // Itálico estilo WhatsApp: _palavra_
    escaped = escaped.replace(/_([^_]+)_/g, '<em>$1</em>');
    // Quebra de linha
    return escaped.replace(/\n/g, '<br>');
}

function getLeadInitials(name) {
    if (!name) return '??';
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

window.loadChatConversations = async function(autoSelectId = null) {
    const listEl = document.getElementById('chat-conversation-list');
    try {
        let url = `/api/chat/conversations?`;
        if (chatSearchQuery) url += `search=${encodeURIComponent(chatSearchQuery)}&`;
        if (currentChatFilter && currentChatFilter !== 'all') url += `filter=${encodeURIComponent(currentChatFilter)}&`;

        const res = await fetch(url);
        const data = await res.json();
        
        if (data.success) {
            chatConversations = data.conversations || [];
            
            // Atualiza contadores
            const allCount = chatConversations.length;
            const withMsgCount = chatConversations.filter(c => c.message_count > 0).length;
            if (document.getElementById('chat-count-all')) document.getElementById('chat-count-all').textContent = allCount;
            if (document.getElementById('chat-count-messages')) document.getElementById('chat-count-messages').textContent = withMsgCount;

            renderChatConversationsList();

            // Auto-seleciona lead se solicitado ou se já havia um ativo
            if (autoSelectId) {
                selectChatLead(autoSelectId);
            } else if (activeChatLead) {
                const refreshed = chatConversations.find(c => c.id === activeChatLead.id);
                if (refreshed) {
                    activeChatLead = refreshed;
                    updateChatHeader(refreshed);
                }
            }
        }
    } catch (err) {
        console.error("Erro ao carregar conversas do chat:", err);
        if (listEl && chatConversations.length === 0) {
            listEl.innerHTML = `<div style="text-align:center; padding:30px 10px; color:#ff5b73;">Falha ao carregar conversas do CRM.</div>`;
        }
    }
};

window.renderChatConversationsList = function() {
    const listEl = document.getElementById('chat-conversation-list');
    if (!listEl) return;

    if (chatConversations.length === 0) {
        listEl.innerHTML = `
            <div style="text-align:center; padding:40px 16px; color:var(--text-secondary);">
                <i class="fas fa-search" style="font-size:24px; opacity:0.3; margin-bottom:10px; display:block;"></i>
                <div style="font-weight:600; font-size:13px;">Nenhuma conversa localizada</div>
                <small style="opacity:0.7; font-size:11.5px; margin-top:4px; display:block;">Tente outro filtro ou faça uma nova varredura de leads.</small>
            </div>
        `;
        return;
    }

    const crmColors = {
        'novo': { bg: 'rgba(0, 210, 255, 0.15)', text: 'var(--neon-cyan)', border: 'rgba(0, 210, 255, 0.3)' },
        'contatado': { bg: 'rgba(157, 78, 221, 0.2)', text: 'var(--purple-light)', border: 'rgba(157, 78, 221, 0.4)' },
        'proposta': { bg: 'rgba(255, 183, 3, 0.15)', text: '#ffb703', border: 'rgba(255, 183, 3, 0.4)' },
        'fechado': { bg: 'rgba(0, 255, 136, 0.15)', text: 'var(--neon-green)', border: 'rgba(0, 255, 136, 0.4)' }
    };

    const channelIcons = {
        'whatsapp': '<i class="fab fa-whatsapp" style="color:var(--neon-green); font-size:11px;"></i>',
        'email': '<i class="fas fa-envelope" style="color:var(--neon-cyan); font-size:11px;"></i>',
        'site': '<i class="fas fa-globe" style="color:#ffb703; font-size:11px;"></i>'
    };

    listEl.innerHTML = chatConversations.map(c => {
        const isActive = activeChatLead && activeChatLead.id === c.id;
        const initials = getLeadInitials(c.name);
        const st = c.campaign_status || 'novo';
        const colorCfg = crmColors[st] || crmColors['novo'];
        const phoneDisplay = c.whatsapp || c.phone || 'Sem telefone';
        
        // Preview da última mensagem
        let previewText = 'Clique para iniciar conversa...';
        let channelIcon = '<i class="fab fa-whatsapp" style="color:rgba(255,255,255,0.3); font-size:11px;"></i>';
        let checkmark = '';
        
        if (c.last_message_body) {
            previewText = escapeHtml(c.last_message_body);
            if (c.last_message_channel && channelIcons[c.last_message_channel]) {
                channelIcon = channelIcons[c.last_message_channel];
            }
            if (c.last_message_direction === 'outgoing') {
                checkmark = '<i class="fas fa-check-double chat-bubble-check" style="font-size:10px; margin-right:3px;"></i>';
            }
        }

        const timeDisplay = formatChatTime(c.last_message_time);

        return `
            <div class="chat-item ${isActive ? 'active' : ''}" onclick="selectChatLead(${c.id})">
                <div class="chat-item-avatar">
                    ${initials}
                </div>
                <div class="chat-item-content">
                    <div class="chat-item-top">
                        <span class="chat-item-name" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>
                        <span class="chat-item-time">${timeDisplay}</span>
                    </div>
                    <div class="chat-item-bottom">
                        <span class="chat-item-preview">
                            ${channelIcon} ${checkmark} ${previewText}
                        </span>
                        <span class="chat-item-badge" style="background:${colorCfg.bg}; color:${colorCfg.text}; border:1px solid ${colorCfg.border};">
                            ${st}
                        </span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

window.setChatFilter = function(filterType, btnEl) {
    currentChatFilter = filterType;
    document.querySelectorAll('.chat-filter-pill').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    loadChatConversations();
};

window.handleChatSearch = function(val) {
    chatSearchQuery = val.trim();
    const clearBtn = document.getElementById('chat-search-clear');
    if (clearBtn) clearBtn.style.display = chatSearchQuery ? 'block' : 'none';
    loadChatConversations();
};

window.clearChatSearch = function() {
    const input = document.getElementById('chat-search-input');
    if (input) input.value = '';
    chatSearchQuery = '';
    const clearBtn = document.getElementById('chat-search-clear');
    if (clearBtn) clearBtn.style.display = 'none';
    loadChatConversations();
};

window.selectChatLead = async function(leadId) {
    const lead = chatConversations.find(c => c.id === leadId);
    if (!lead) return;

    activeChatLead = lead;

    // Atualiza classes ativas na lista
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    renderChatConversationsList();

    // Alterna visualização para painel ativo
    const emptyState = document.getElementById('chat-empty-state');
    const activePanel = document.getElementById('chat-active-panel');
    if (emptyState) emptyState.style.display = 'none';
    if (activePanel) activePanel.style.display = 'flex';

    updateChatHeader(lead);
    updateChatComposerFields(lead);

    // Carrega mensagens
    await loadChatMessages(lead.id);

    // Foca o input de acordo com o canal ativo
    focusActiveComposerInput();
};

function updateChatHeader(lead) {
    if (!lead) return;
    const nameEl = document.getElementById('chat-lead-name');
    const phoneEl = document.getElementById('chat-lead-phone');
    const catEl = document.getElementById('chat-lead-category');
    const avatarEl = document.getElementById('chat-lead-avatar');
    const badgeEl = document.getElementById('chat-lead-crm-badge');
    const dealEl = document.getElementById('chat-lead-deal');

    if (nameEl) nameEl.textContent = lead.name;
    if (phoneEl) {
        const p = lead.whatsapp || lead.phone || 'Sem telefone';
        phoneEl.innerHTML = `<i class="fab fa-whatsapp"></i> ${escapeHtml(p)}`;
    }
    if (catEl) catEl.textContent = lead.category || lead.address || '';
    if (avatarEl) avatarEl.textContent = getLeadInitials(lead.name);

    if (badgeEl) {
        badgeEl.textContent = lead.campaign_status || 'novo';
        badgeEl.className = `chat-crm-badge status-${lead.campaign_status || 'novo'}`;
    }

    if (dealEl) {
        const val = parseFloat(lead.deal_value || 0);
        if (val > 0) {
            dealEl.style.display = 'inline-flex';
            dealEl.innerHTML = `<i class="fas fa-coins"></i> R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        } else {
            dealEl.style.display = 'none';
        }
    }
}

function updateChatComposerFields(lead) {
    if (!lead) return;
    // Preenche campos de E-mail
    const emailRecip = document.getElementById('chat-email-recipient');
    const emailSubj = document.getElementById('chat-email-subject');
    const emailBody = document.getElementById('chat-email-body');

    if (emailRecip) emailRecip.value = lead.email || '';
    if (emailSubj && !emailSubj.value) {
        emailSubj.value = `Oportunidade Comercial: Presença Digital para ${lead.name}`;
    }

    // Preenche campo do Site
    const siteUrlText = document.getElementById('chat-site-url-text');
    const siteLink = document.getElementById('chat-site-external-link');
    if (siteUrlText) {
        siteUrlText.textContent = lead.website || 'Sem site oficial cadastrado';
    }
    if (siteLink) {
        if (lead.website) {
            siteLink.style.display = 'inline-flex';
            siteLink.href = lead.website.startsWith('http') ? lead.website : `https://${lead.website}`;
        } else {
            siteLink.style.display = 'none';
        }
    }

    // Se o textarea de WhatsApp estiver vazio, pré-carrega o pitch inicial
    const waInput = document.getElementById('chat-wa-input');
    if (waInput && !waInput.value.trim()) {
        const initialPitch = getPitchMessage(lead, 'contato');
        waInput.value = initialPitch;
    }
    if (emailBody && !emailBody.value.trim()) {
        emailBody.value = `Olá equipe da ${lead.name},\n\nNotamos grande oportunidade de novos clientes na sua região através de um site moderno de alta conversão.\n\nGostaria de receber uma proposta comercial sem compromisso?`;
    }
    const siteBody = document.getElementById('chat-site-body');
    if (siteBody && !siteBody.value.trim()) {
        siteBody.value = `Olá! Gostaria de falar com o responsável comercial da ${lead.name} sobre desenvolvimento web e atração de novos clientes.`;
    }
}

window.loadChatMessages = async function(leadId) {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    try {
        const res = await fetch(`/api/chat/messages?lead_id=${leadId}`);
        const data = await res.json();
        
        if (data.success) {
            renderChatMessages(data.messages || []);
        }
    } catch (err) {
        console.error("Erro ao carregar mensagens:", err);
    }
};

window.renderChatMessages = function(messages) {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    if (messages.length === 0) {
        container.innerHTML = `
            <div style="margin:auto; text-align:center; padding:24px; max-width:380px; background:rgba(18, 14, 38, 0.7); border:1px solid rgba(157, 78, 221, 0.25); border-radius:12px;">
                <div style="font-size:28px; margin-bottom:8px;">👋</div>
                <h4 style="font-size:14px; font-weight:700; color:#fff; margin-bottom:6px;">Inicie o Atendimento</h4>
                <p style="font-size:12px; color:var(--text-secondary); line-height:1.45; margin:0;">
                    Nenhuma mensagem registrada ainda. Escolha o canal desejado na barra superior e envie sua abordagem abaixo!
                </p>
            </div>
        `;
        return;
    }

    const channelNames = {
        'whatsapp': 'WhatsApp',
        'email': 'E-mail SMTP',
        'site': 'Formulário Site'
    };

    const channelIcons = {
        'whatsapp': '<i class="fab fa-whatsapp" style="color:var(--neon-green);"></i>',
        'email': '<i class="fas fa-envelope" style="color:var(--neon-cyan);"></i>',
        'site': '<i class="fas fa-globe" style="color:#ffb703;"></i>'
    };

    container.innerHTML = messages.map(m => {
        const isOutgoing = m.direction === 'outgoing';
        const ch = m.channel || 'whatsapp';
        const chLabel = channelNames[ch] || ch;
        const chIcon = channelIcons[ch] || '';
        const timeDisplay = formatChatTime(m.created_at);

        const channelTag = `
            <span class="chat-bubble-channel-tag">
                ${chIcon} ${chLabel}
            </span>
        `;

        const subjectRow = m.subject ? `<div style="font-weight:700; font-size:12px; margin-bottom:4px; color:var(--neon-cyan);"><i class="fas fa-heading"></i> ${escapeHtml(m.subject)}</div>` : '';

        const checkmarks = isOutgoing ? `<i class="fas fa-check-double chat-bubble-check"></i>` : '';

        return `
            <div class="chat-message-row ${isOutgoing ? 'outgoing' : 'incoming'}">
                <div class="chat-bubble ${isOutgoing ? 'outgoing' : 'incoming'} channel-${ch}">
                    ${channelTag}
                    ${subjectRow}
                    <div style="word-break:break-word;">${formatMessageText(m.body)}</div>
                    <div class="chat-bubble-footer">
                        <span>${timeDisplay}</span>
                        ${checkmarks}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Rola para a mensagem mais recente
    const wrapper = document.getElementById('chat-thread-wrapper');
    if (wrapper) {
        wrapper.scrollTop = wrapper.scrollHeight;
    }
};

window.setChatChannel = function(channel) {
    activeChatChannel = channel;

    // Atualiza botões da barra seletora
    document.querySelectorAll('.channel-tab-btn').forEach(b => b.classList.remove('active'));
    const targetBtn = document.getElementById(`channel-btn-${channel}`);
    if (targetBtn) targetBtn.classList.add('active');

    // Alterna visualização dos compositores
    document.querySelectorAll('.composer-channel-view').forEach(v => v.style.display = 'none');
    const targetComposer = document.getElementById(`composer-${channel}`);
    if (targetComposer) targetComposer.style.display = 'block';

    // Atualiza status pill
    const pill = document.getElementById('chat-channel-status-pill');
    if (pill) {
        if (channel === 'whatsapp') {
            pill.innerHTML = `<i class="fab fa-whatsapp" style="color:var(--neon-green);"></i> WAHA Ativo`;
            pill.style.color = 'var(--neon-green)';
        } else if (channel === 'email') {
            pill.innerHTML = `<i class="fas fa-envelope" style="color:var(--neon-cyan);"></i> Servidor SMTP`;
            pill.style.color = 'var(--neon-cyan)';
        } else if (channel === 'site') {
            pill.innerHTML = `<i class="fas fa-globe" style="color:#ffb703;"></i> Formulário Web`;
            pill.style.color = '#ffb703';
        }
    }

    focusActiveComposerInput();
};

function focusActiveComposerInput() {
    if (activeChatChannel === 'whatsapp') {
        const wa = document.getElementById('chat-wa-input');
        if (wa) wa.focus();
    } else if (activeChatChannel === 'email') {
        const em = document.getElementById('chat-email-body');
        if (em) em.focus();
    } else if (activeChatChannel === 'site') {
        const si = document.getElementById('chat-site-body');
        if (si) si.focus();
    }
}

window.handleChatInputKey = function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
    }
};

window.sendChatMessage = async function() {
    if (!activeChatLead) {
        alert("Selecione um lead antes de enviar.");
        return;
    }

    let text = '';
    let subject = '';
    let recipient = '';

    if (activeChatChannel === 'whatsapp') {
        const waInput = document.getElementById('chat-wa-input');
        text = waInput ? waInput.value.trim() : '';
        if (!text) {
            alert("Digite a mensagem do WhatsApp antes de enviar.");
            return;
        }
    } else if (activeChatChannel === 'email') {
        const emailBody = document.getElementById('chat-email-body');
        const emailSubj = document.getElementById('chat-email-subject');
        const emailRecip = document.getElementById('chat-email-recipient');
        text = emailBody ? emailBody.value.trim() : '';
        subject = emailSubj ? emailSubj.value.trim() : '';
        recipient = emailRecip ? emailRecip.value.trim() : '';
        if (!text) {
            alert("Digite o corpo do e-mail antes de enviar.");
            return;
        }
        if (!recipient) {
            alert("Informe o e-mail de destino.");
            return;
        }
    } else if (activeChatChannel === 'site') {
        const siteBody = document.getElementById('chat-site-body');
        text = siteBody ? siteBody.value.trim() : '';
        if (!text) {
            alert("Digite o texto da mensagem enviada no formulário do site.");
            return;
        }
    }

    // Desativa botão temporariamente
    const btnMap = {
        'whatsapp': document.getElementById('btn-send-wa'),
        'email': document.getElementById('btn-send-email'),
        'site': document.getElementById('btn-send-site')
    };
    const activeBtn = btnMap[activeChatChannel];
    const originalHtml = activeBtn ? activeBtn.innerHTML : '';
    if (activeBtn) {
        activeBtn.disabled = true;
        activeBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Enviando...`;
    }

    try {
        const payload = {
            lead_id: activeChatLead.id,
            channel: activeChatChannel,
            text: text,
            subject: subject,
            recipient: recipient,
            phone: activeChatLead.whatsapp || activeChatLead.phone || ''
        };

        const res = await fetch('/api/chat/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
            if (typeof showToast === 'function') {
                showToast(data.message || "Mensagem enviada com sucesso!", "success");
            } else {
                alert("✅ " + (data.message || "Mensagem enviada com sucesso!"));
            }

            // Limpa textarea
            if (activeChatChannel === 'whatsapp') {
                const waInput = document.getElementById('chat-wa-input');
                if (waInput) waInput.value = '';
            } else if (activeChatChannel === 'email') {
                const emailBody = document.getElementById('chat-email-body');
                if (emailBody) emailBody.value = '';
            }

            // Atualiza mensagens e lista de conversas
            await loadChatMessages(activeChatLead.id);
            await loadChatConversations(activeChatLead.id);
        } else {
            alert("❌ " + (data.error || "Falha ao enviar mensagem."));
        }
    } catch (err) {
        alert("Erro na conexão: " + err.message);
    } finally {
        if (activeBtn) {
            activeBtn.disabled = false;
            activeBtn.innerHTML = originalHtml;
        }
    }
};

window.insertChatVar = function(varName) {
    let target = null;
    if (activeChatChannel === 'whatsapp') target = document.getElementById('chat-wa-input');
    else if (activeChatChannel === 'email') target = document.getElementById('chat-email-body');
    else if (activeChatChannel === 'site') target = document.getElementById('chat-site-body');

    if (!target) return;

    let replacement = varName;
    if (activeChatLead) {
        if (varName === '{nome}') replacement = activeChatLead.name ? activeChatLead.name.split(' ')[0] : 'Cliente';
        else if (varName === '{empresa}') replacement = activeChatLead.name || 'Empresa';
        else if (varName === '{localizacao}') replacement = activeChatLead.address || 'sua cidade';
        else if (varName === '{nicho}') replacement = activeChatLead.category || 'sua área';
    }

    const start = target.selectionStart || target.value.length;
    const end = target.selectionEnd || target.value.length;
    target.value = target.value.substring(0, start) + replacement + target.value.substring(end);
    target.focus();
    target.selectionStart = target.selectionEnd = start + replacement.length;
};

window.applyChatTemplate = function(templateType) {
    if (!activeChatLead) {
        alert("Selecione um lead antes de aplicar um script.");
        return;
    }
    const pitch = getPitchMessage(activeChatLead, templateType);

    if (activeChatChannel === 'whatsapp') {
        const wa = document.getElementById('chat-wa-input');
        if (wa) { wa.value = pitch; wa.focus(); }
    } else if (activeChatChannel === 'email') {
        const em = document.getElementById('chat-email-body');
        if (em) { em.value = pitch; em.focus(); }
    } else if (activeChatChannel === 'site') {
        const si = document.getElementById('chat-site-body');
        if (si) { si.value = pitch; si.focus(); }
    }
};

window.openNewChatModal = function() {
    const modal = document.getElementById('new-chat-modal');
    if (modal) {
        modal.classList.add('active');
        const nameInput = document.getElementById('new-chat-name');
        if (nameInput) {
            nameInput.value = '';
            setTimeout(() => nameInput.focus(), 150);
        }
        const phoneInput = document.getElementById('new-chat-phone');
        if (phoneInput) phoneInput.value = '';
        const msgInput = document.getElementById('new-chat-message');
        if (msgInput) msgInput.value = '';
    }
};

window.closeNewChatModal = function() {
    const modal = document.getElementById('new-chat-modal');
    if (modal) modal.classList.remove('active');
};

window.fillOperatorTestNumber = async function() {
    try {
        const res = await fetch('/api/waha/status');
        const data = await res.json();
        const meId = data.details && data.details.me ? data.details.me.id : null;
        if (meId) {
            const cleanDigits = meId.split('@')[0];
            const phoneInput = document.getElementById('new-chat-phone');
            const nameInput = document.getElementById('new-chat-name');
            if (phoneInput) {
                phoneInput.value = cleanDigits;
                formatPhoneInput(phoneInput);
            }
            if (nameInput && !nameInput.value) {
                nameInput.value = `Meu WhatsApp (${data.details.me.pushName || 'Conectado'})`;
            }
        } else {
            const phoneInput = document.getElementById('new-chat-phone');
            if (phoneInput) phoneInput.value = '12988801327';
        }
    } catch {
        const phoneInput = document.getElementById('new-chat-phone');
        if (phoneInput) phoneInput.value = '12988801327';
    }
};

window.setNewChatMessagePreset = function(type) {
    const msgInput = document.getElementById('new-chat-message');
    if (!msgInput) return;
    if (type === 'teste') {
        msgInput.value = 'Olá! Este é um teste de envio do sistema KAPTADOR via WhatsApp Web integrado.';
    } else if (type === 'pitch') {
        msgInput.value = 'Olá! Tudo bem? Identifiquei grande oportunidade de captação de clientes na sua região com um site moderno de alta conversão. Gostaria de ver uma prévia sem compromisso?';
    }
    msgInput.focus();
};

window.formatPhoneInput = function(input) {
    if (!input) return;
    let v = input.value.replace(/\D/g, '');
    if (v.startsWith('55') && v.length > 11) {
        v = v.substring(2);
    }
    if (v.length > 11) v = v.substring(0, 11);
    if (v.length > 10) {
        input.value = `(${v.substring(0, 2)}) ${v.substring(2, 7)}-${v.substring(7)}`;
    } else if (v.length > 6) {
        input.value = `(${v.substring(0, 2)}) ${v.substring(2, 6)}-${v.substring(6)}`;
    } else if (v.length > 2) {
        input.value = `(${v.substring(0, 2)}) ${v.substring(2)}`;
    } else {
        input.value = v;
    }
};

window.submitCreateChat = async function(sendNow = false) {
    const nameInput = document.getElementById('new-chat-name');
    const phoneInput = document.getElementById('new-chat-phone');
    const emailInput = document.getElementById('new-chat-email');
    const channelSelect = document.getElementById('new-chat-channel');
    const msgInput = document.getElementById('new-chat-message');
    const sendBtn = document.getElementById('btn-submit-new-chat-send');

    const name = nameInput ? nameInput.value.trim() : '';
    const rawPhone = phoneInput ? phoneInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim() : '';
    const channel = channelSelect ? channelSelect.value : 'whatsapp';
    const message = msgInput ? msgInput.value.trim() : '';

    if (!name) {
        alert("Por favor, informe o nome do contato ou empresa.");
        if (nameInput) nameInput.focus();
        return;
    }

    const digits = rawPhone.replace(/\D/g, '');
    if (digits.length < 8) {
        alert("Por favor, digite um número de WhatsApp válido com DDD (ex: 12988801327 ou 11999998888).");
        if (phoneInput) phoneInput.focus();
        return;
    }

    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processando...`;
    }

    try {
        const res = await fetch('/api/chat/contacts/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                phone: rawPhone,
                email: email,
                initial_message: message,
                send_now: sendNow,
                channel: channel
            })
        });
        const data = await res.json();

        if (data.success && data.lead) {
            closeNewChatModal();
            if (typeof switchTab === 'function') switchTab('chat');
            
            // Recarrega conversas e seleciona o lead criado
            await loadChatConversations(data.lead.id);

            if (sendNow && message) {
                if (data.send_result && data.send_result.success) {
                    showToast(`Mensagem enviada com sucesso para ${name}!`, "success");
                } else if (data.send_result && data.send_result.error) {
                    alert(`⚠️ Contato criado, mas o envio retornou: ${data.send_result.error}`);
                }
            } else {
                showToast(`Conversa com ${name} iniciada! Digite sua mensagem.`, "success");
            }
        } else {
            alert("❌ " + (data.error || "Falha ao criar contato para chat."));
        }
    } catch (err) {
        alert("Erro na requisição: " + err.message);
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = `<i class="fab fa-whatsapp"></i> Iniciar e Enviar Agora`;
        }
    }
};

window.openNewChatPrompt = function() {
    openNewChatModal();
};

window.focusFirstChat = function() {
    if (chatConversations.length > 0) {
        selectChatLead(chatConversations[0].id);
    } else {
        alert("Nenhum lead disponível no momento. Faça uma varredura primeiro.");
    }
};

window.openLeadModalFromChat = function() {
    if (activeChatLead && typeof openLeadModal === 'function') {
        openLeadModal(activeChatLead.id);
    }
};

window.openChatFromModal = function() {
    if (activeLeadForModal) {
        const modal = document.getElementById('lead-details-modal');
        if (modal) modal.classList.remove('active');
        if (typeof switchTab === 'function') switchTab('chat');
        selectChatLead(activeLeadForModal.id);
    }
};

window.openMailtoClient = function() {
    if (!activeChatLead) return;
    const email = document.getElementById('chat-email-recipient') ? document.getElementById('chat-email-recipient').value.trim() : (activeChatLead.email || '');
    const subject = document.getElementById('chat-email-subject') ? document.getElementById('chat-email-subject').value.trim() : '';
    const body = document.getElementById('chat-email-body') ? document.getElementById('chat-email-body').value.trim() : '';

    if (!email) {
        alert("Informe o e-mail do destinatário.");
        return;
    }

    const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, '_blank');
};

window.simulateClientReply = async function() {
    if (!activeChatLead) return;
    const replies = [
        "Olá! Quanto custa para fazer um site moderno para a nossa empresa?",
        "Boa tarde! Gostei da mensagem. Como funciona o desenvolvimento?",
        "Olá, temos interesse sim! Vocês fazem com botão de agendamento no WhatsApp?",
        "Pode me mandar uma prévia ou apresentação da agência?",
        "Recebi seu e-mail! Gostaria de agendar uma reunião online para conversar."
    ];
    const randomReply = replies[Math.floor(Math.random() * replies.length)];
    const text = prompt("Digite o texto da resposta do cliente para simular no chat:", randomReply);
    if (!text) return;

    try {
        const res = await fetch('/api/chat/simulate-reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lead_id: activeChatLead.id,
                channel: activeChatChannel,
                text: text
            })
        });
        const data = await res.json();
        if (data.success) {
            await loadChatMessages(activeChatLead.id);
            await loadChatConversations(activeChatLead.id);
            if (typeof showToast === 'function') {
                showToast("Resposta do cliente recebida no chat!", "success");
            }
        }
    } catch (err) {
        alert("Erro ao simular resposta: " + err.message);
    }
};

window.startChatPolling = function() {
    if (chatPollingInterval) clearInterval(chatPollingInterval);
    chatPollingInterval = setInterval(() => {
        if (activeChatLead) {
            loadChatMessages(activeChatLead.id);
        }
        loadChatConversations();
    }, 4000);
};

window.stopChatPolling = function() {
    if (chatPollingInterval) {
        clearInterval(chatPollingInterval);
        chatPollingInterval = null;
    }
};


