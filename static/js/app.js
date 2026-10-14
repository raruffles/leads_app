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
        'settings': 'Configurações do Sistema',
        'email': 'E-mail da Empresa (Gmail)',
        'radar': 'Radar de Risco & Churn Prevention',
        'agenda': 'Agenda & Compromissos',
        'quick-replies': 'Respostas Rápidas & Templates',
        'crm-hub': 'CRM — Ver Tudo em CRM',
        'contacts': 'Contatos (Customer 360)',
        'tasks': 'Tarefas & Compromissos',
        'comandas': 'Comandas & Ordens de Venda',
        'products': 'Catálogo de Produtos & Serviços',
        'pricing': 'Calculadora de Precificação Inteligente',
        'ai-agents': 'Agentes de IA & Atendimento',
        'follow-ups': 'Follow-ups & Automações',
        'knowledge': 'Cofre de Conhecimento & RAG',
        'ai-hub': 'Agente de IA — Ver Tudo em IA',
        'analytics': 'Métricas & Auditoria',
        'disparador': 'Disparador Automático de Abordagem Comercial'
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

        // Novos módulos do CRM
        if (tabId === 'disparador' && typeof loadDisparadorView === 'function') loadDisparadorView();
        if (tabId === 'email' && typeof loadCompanyEmails === 'function') loadCompanyEmails();
        if (tabId === 'radar' && typeof loadRiskRadar === 'function') loadRiskRadar();
        if (tabId === 'agenda' && typeof loadAgendaCalendar === 'function') loadAgendaCalendar();
        if (tabId === 'quick-replies' && typeof loadQuickReplies === 'function') loadQuickReplies();
        if (tabId === 'contacts' && typeof loadContacts360 === 'function') loadContacts360();
        if (tabId === 'tasks' && typeof loadTasksView === 'function') loadTasksView();
        if (tabId === 'comandas' && typeof loadComandasView === 'function') loadComandasView();
        if (tabId === 'products' && typeof loadProductsView === 'function') loadProductsView();
        if (tabId === 'ai-agents' && typeof loadAIAgentsView === 'function') loadAIAgentsView();
        if (tabId === 'follow-ups' && typeof loadFollowupsView === 'function') loadFollowupsView();
        if (tabId === 'knowledge' && typeof loadKnowledgeVault === 'function') loadKnowledgeVault();
        if (tabId === 'analytics' && typeof loadAnalyticsView === 'function') loadAnalyticsView();
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

// 2.5 AUTOCOMPLETE DE CIDADES BRASILEIRAS (IBGE)
function initCityAutocomplete(inputId, dropdownId, onSelect) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    let debounceTimer = null;
    let activeIndex = -1;
    let currentResults = [];

    const closeDropdown = () => {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
        activeIndex = -1;
        currentResults = [];
    };

    const renderItems = (items) => {
        currentResults = items || [];
        activeIndex = -1;
        if (!currentResults.length) {
            dropdown.innerHTML = '<div class="city-autocomplete-empty"><i class="fas fa-search" style="margin-right:6px;"></i>Nenhuma cidade encontrada</div>';
            dropdown.style.display = 'block';
            return;
        }

        dropdown.innerHTML = currentResults.map((c, idx) => `
            <div class="city-autocomplete-item" data-index="${idx}" data-label="${c.label}">
                <div class="city-name">
                    <i class="fas fa-city"></i>
                    <span>${c.name}</span>
                </div>
                <span class="city-uf-badge">${c.uf}</span>
            </div>
        `).join('');
        dropdown.style.display = 'block';
    };

    // Event delegation on dropdown for both mouse and touch/click
    const handleItemPick = (e) => {
        const itemEl = e.target.closest('.city-autocomplete-item');
        if (!itemEl) return;
        e.preventDefault();
        e.stopPropagation();
        const label = itemEl.getAttribute('data-label');
        if (label) selectCity(label);
    };

    dropdown.addEventListener('mousedown', handleItemPick);
    dropdown.addEventListener('click', handleItemPick);

    let isSelecting = false;

    const selectCity = (label) => {
        isSelecting = true;
        clearTimeout(debounceTimer);
        input.value = label;
        closeDropdown();
        input.dispatchEvent(new Event('change', { bubbles: true }));
        setTimeout(() => { isSelecting = false; }, 300);
        if (typeof onSelect === 'function') {
            onSelect(label);
        }
    };

    const updateActiveItem = () => {
        const items = dropdown.querySelectorAll('.city-autocomplete-item');
        items.forEach((item, idx) => {
            if (idx === activeIndex) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    };

    input.addEventListener('input', (e) => {
        if (isSelecting) return;
        const query = e.target.value.trim();
        clearTimeout(debounceTimer);

        if (query.length < 1) {
            closeDropdown();
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/cities?q=${encodeURIComponent(query)}`);
                if (!res.ok) return;
                const data = await res.json();
                renderItems(data);
            } catch (err) {
                console.error('Erro ao buscar cidades:', err);
            }
        }, 120);
    });

    input.addEventListener('keydown', (e) => {
        if (dropdown.style.display === 'none') {
            if (e.key === 'ArrowDown' && input.value.trim().length >= 1) {
                input.dispatchEvent(new Event('input'));
            }
            return;
        }

        const items = dropdown.querySelectorAll('.city-autocomplete-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = (activeIndex + 1) % items.length;
            updateActiveItem();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = (activeIndex - 1 + items.length) % items.length;
            updateActiveItem();
        } else if (e.key === 'Enter') {
            if (activeIndex >= 0 && activeIndex < currentResults.length) {
                e.preventDefault();
                selectCity(currentResults[activeIndex].label);
            }
        } else if (e.key === 'Escape') {
            closeDropdown();
        }
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            closeDropdown();
        }
    });

    input.addEventListener('focus', () => {
        if (input.value.trim().length >= 1 && dropdown.style.display === 'none') {
            input.dispatchEvent(new Event('input'));
        }
    });
}

// 3. EVENT LISTENERS
function setupEventListeners() {
    // Formulário de Varredura
    const form = document.getElementById('scan-form');
    if (form) {
        form.addEventListener('submit', handleScanSubmit);
    }

    // Autocomplete Inteligente de Cidades Brasileiras (IBGE)
    initCityAutocomplete('location-input', 'location-autocomplete-dropdown', (selected) => {
        const badge = document.getElementById('cep-resolved-badge');
        if (badge) badge.style.display = 'none';
    });
    initCityAutocomplete('import-location', 'import-location-autocomplete-dropdown');
    initCityAutocomplete('pricing-city', 'pricing-city-autocomplete-dropdown', (selected) => {
        const ufSelect = document.getElementById('pricing-uf');
        const pCityInput = document.getElementById('pricing-city');
        if (selected && selected.includes(' - ')) {
            const parts = selected.split(' - ');
            if (pCityInput) pCityInput.value = parts[0].trim();
            if (ufSelect) {
                const uf = parts[1].trim();
                const option = Array.from(ufSelect.options).find(o => o.value.toUpperCase() === uf.toUpperCase());
                if (option) {
                    ufSelect.value = option.value;
                } else {
                    ufSelect.value = 'Outro';
                }
            }
        }
    });

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
    const primeiroNome = typeof extractLeadFirstName === 'function' ? extractLeadFirstName(lead) : (lead.name ? lead.name.split(' ')[0] : 'amigo');

    if (type === 'contato') {
        return `Olá ${primeiroNome}, tudo bem? Vi o perfil de vocês no Google Maps e achei excelente o projeto da ${name}!

Trabalho ajudando empresas da região a atraírem mais clientes com presença digital profissional e sites modernos no Google. Quem costuma cuidar dessa parte comercial ou de marketing por aí?`;
    } else if (type === 'follow1') {
        return `Olá ${primeiroNome}, tudo bem?

Passando para compartilhar uma proposta prática: analisamos o posicionamento da ${name} e preparamos um estudo com informações de estrutura para um site moderno, rápido e otimizado para o Google.

O melhor de tudo: esse diagnóstico e a prévia do projeto são 100% sem custo e sem compromisso nenhum! Posso te enviar os detalhes aqui por WhatsApp?`;
    } else if (type === 'follow2') {
        return `Oi ${primeiroNome}, tudo bom?

Passando rapidinho só para saber se você conseguiu ver minha mensagem anterior sobre a proposta para a ${name}.

Posso te enviar uma prévia visual de como ficaria a presença digital de vocês no celular e no Google? Leva menos de 2 minutos para dar uma olhada e você já consegue ver na prática! Me avisa se fizer sentido.`;
    } else if (type === 'proposta') {
        return `Olá ${primeiroNome}, tudo bem?

Conforme conversamos, estruturei os detalhes da proposta para a modernização e desenvolvimento do site profissional da ${name}, otimizado para o Google e com captação direta de clientes no WhatsApp.

Ficou alguma dúvida sobre o escopo ou condições para iniciarmos a criação?`;
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
    let payload = {};
    
    if (window.kanbanViewMode === 'stages') {
        if (colKey === 'novo') {
            payload = { status: 'novo', follow_stage: 'contato' };
        } else if (colKey === 'contato') {
            payload = { status: 'contatado', follow_stage: 'contato' };
        } else if (colKey === 'follow1') {
            payload = { status: 'contatado', follow_stage: 'follow1' };
        } else if (colKey === 'follow2') {
            payload = { status: 'contatado', follow_stage: 'follow2' };
        } else if (colKey === 'proposta') {
            payload = { status: 'proposta', follow_stage: 'proposta' };
        } else if (colKey === 'fechado') {
            payload = { status: 'fechado', follow_stage: 'fechado' };
        } else if (colKey === 'perdido') {
            payload = { status: 'perdido', follow_stage: 'perdido' };
        } else {
            payload = { status: colKey };
        }
    } else {
        payload = { status: colKey };
    }
    
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
            if (payload.status) lead.campaign_status = payload.status;
            if (payload.follow_stage) lead.follow_stage = payload.follow_stage;
            if (payload.deal_value !== undefined) lead.deal_value = payload.deal_value;
        }
        loadCampaignsView();
        loadDashboardStats();
        applyFiltersAndRender();
        if (typeof showToast === 'function') {
            const colNames = { 
                novo: 'Novos Leads', 
                contato: '1º Contato', 
                follow1: 'Follow-up 1', 
                follow2: 'Follow-up 2', 
                proposta: 'Proposta Enviada', 
                fechado: 'Fechados / Clientes', 
                perdido: 'Sem Interesse / Desqualificado',
                contatado: 'Em Contato'
            };
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

// Modo de visualização do Kanban: 'stages' (Etapas de Contato / Cadência) ou 'pipeline' (Funil Geral)
window.kanbanViewMode = 'stages';

window.setKanbanViewMode = function(mode) {
    window.kanbanViewMode = mode;
    const btnStages = document.getElementById('btn-kanban-mode-stages');
    const btnPipeline = document.getElementById('btn-kanban-mode-pipeline');
    if (btnStages && btnPipeline) {
        if (mode === 'stages') {
            btnStages.classList.add('active');
            btnStages.classList.remove('btn-secondary');
            btnPipeline.classList.remove('active');
            btnPipeline.classList.add('btn-secondary');
        } else {
            btnPipeline.classList.add('active');
            btnPipeline.classList.remove('btn-secondary');
            btnStages.classList.remove('active');
            btnStages.classList.add('btn-secondary');
        }
    }
    loadCampaignsView();
};

window.triggerKanbanColumnDisparo = function(e, groupKey) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!groupKey) return;
    
    // Alterna para a aba do Disparador Automático
    const tabItem = document.querySelector('.nav-item[data-tab="disparador"]');
    if (tabItem) tabItem.click();
    
    setTimeout(() => {
        const groupSelect = document.getElementById('disparador-target-group');
        if (groupSelect) {
            groupSelect.value = groupKey;
            if (typeof updateDisparadorAudienceCount === 'function') updateDisparadorAudienceCount();
            if (typeof updateDisparadorPreview === 'function') updateDisparadorPreview();
        }
        if (typeof showToast === 'function') {
            showToast(`Audiência do disparador selecionada: "${groupKey}"!`, 'info');
        }
    }, 150);
};

window.openLeadChatQuick = function(e, leadId) {
    if (e && e.stopPropagation) e.stopPropagation();
    const lead = currentLeads.find(l => l.id === leadId);
    if (!lead) return;
    
    // Abre a aba do WhatsApp Web / Chat
    const chatTab = document.querySelector('.nav-item[data-tab="chat"]');
    if (chatTab) chatTab.click();
    
    setTimeout(() => {
        if (typeof selectLeadForChat === 'function') {
            selectLeadForChat(leadId);
        }
    }, 150);
};

async function loadCampaignsView() {
    const container = document.getElementById('kanban-container');
    if (!container) return;

    try {
        const res = await fetch('/api/leads');
        const leads = await res.json();
        currentLeads = leads;
        
        // Definição das colunas com base no modo selecionado
        let cols = {};
        if (window.kanbanViewMode === 'stages') {
            cols = {
                'novo': { 
                    title: 'Novos Leads', 
                    icon: 'fa-inbox', 
                    color: 'var(--neon-cyan)', 
                    dotColor: '#00d2ff', 
                    shootGroup: 'novos', 
                    items: [] 
                },
                'contato': { 
                    title: '1º Contato', 
                    icon: 'fa-phone-alt', 
                    color: 'var(--purple-light)', 
                    dotColor: '#a855f7', 
                    shootGroup: 'stage-contato', 
                    items: [] 
                },
                'follow1': { 
                    title: 'Follow-up 1', 
                    icon: 'fa-redo', 
                    color: '#fbbf24', 
                    dotColor: '#f59e0b', 
                    shootGroup: 'stage-follow1', 
                    items: [] 
                },
                'follow2': { 
                    title: 'Follow-up 2', 
                    icon: 'fa-clock', 
                    color: 'var(--alert-orange)', 
                    dotColor: '#ff7b00', 
                    shootGroup: 'stage-follow2', 
                    items: [] 
                },
                'proposta': { 
                    title: 'Proposta / Negociação', 
                    icon: 'fa-file-invoice-dollar', 
                    color: '#38bdf8', 
                    dotColor: '#0284c7', 
                    shootGroup: 'stage-proposta', 
                    items: [] 
                },
                'fechado': { 
                    title: 'Fechados / Clientes', 
                    icon: 'fa-trophy', 
                    color: 'var(--neon-green)', 
                    dotColor: '#00ff88', 
                    shootGroup: 'all-whatsapp', 
                    items: [] 
                },
                'perdido': { 
                    title: 'Sem Interesse / Perdido', 
                    icon: 'fa-ban', 
                    color: 'var(--text-secondary)', 
                    dotColor: '#64748b', 
                    shootGroup: '', 
                    items: [] 
                }
            };
        } else {
            cols = {
                'novo': { title: 'Novos Leads', icon: 'fa-inbox', color: 'var(--neon-cyan)', dotColor: '#00d2ff', shootGroup: 'novos', items: [] },
                'contatado': { title: 'Em Contato', icon: 'fa-comments', color: 'var(--purple-light)', dotColor: '#a855f7', shootGroup: 'stage-contato', items: [] },
                'proposta': { title: 'Proposta Enviada', icon: 'fa-file-invoice-dollar', color: 'var(--alert-orange)', dotColor: '#ff7b00', shootGroup: 'stage-proposta', items: [] },
                'fechado': { title: 'Fechados / Clientes', icon: 'fa-trophy', color: 'var(--neon-green)', dotColor: '#00ff88', shootGroup: 'all-whatsapp', items: [] }
            };
        }

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

        // Distribuição dos leads nas colunas
        if (window.kanbanViewMode === 'stages') {
            filteredLeads.forEach(l => {
                const st = (l.campaign_status || 'novo').toLowerCase();
                const fstage = (l.follow_stage || '').toLowerCase();
                
                if (st === 'fechado') cols['fechado'].items.push(l);
                else if (st === 'perdido') cols['perdido'].items.push(l);
                else if (st === 'proposta' || fstage === 'proposta') cols['proposta'].items.push(l);
                else if (fstage === 'follow2') cols['follow2'].items.push(l);
                else if (fstage === 'follow1') cols['follow1'].items.push(l);
                else if (st === 'contatado' || fstage === 'contato') cols['contato'].items.push(l);
                else cols['novo'].items.push(l);
            });
        } else {
            filteredLeads.forEach((l, index) => {
                let st = (l.campaign_status || 'novo').toLowerCase();
                if (st === 'contato') st = 'contatado';
                if (cols[st]) cols[st].items.push(l);
                else cols['novo'].items.push(l);
            });
        }

        container.innerHTML = Object.keys(cols).map(key => {
            const col = cols[key];
            const colVal = col.items.reduce((sum, item) => sum + parseFloat(item.deal_value || 0), 0);
            const colValHtml = colVal > 0 ? `<span class="badge-col-total-deal" title="Valor acumulado nesta etapa">${formatBRL(colVal)}</span>` : '';
            const shootBtnHtml = col.shootGroup ? `
                <button type="button" 
                        class="btn-kanban-shoot" 
                        onclick="triggerKanbanColumnDisparo(event, '${col.shootGroup}')" 
                        title="Disparar abordagem comercial via WhatsApp para leads desta etapa">
                    <i class="fab fa-whatsapp"></i> Disparar
                </button>
            ` : '';

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

                const phoneDisplay = lead.phone ? `
                    <div style="font-size:11px; color:var(--text-secondary); margin-bottom:4px; display:flex; align-items:center; gap:5px;">
                        <i class="fas fa-phone-alt" style="font-size:10px; color:var(--neon-cyan);"></i> ${escapeHtml(lead.phone)}
                    </div>
                ` : '';

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
                                ${(lead.whatsapp || lead.phone) ? `
                                    <button type="button" 
                                            class="kanban-wa-quick-btn" 
                                            onclick="openLeadChatQuick(event, ${lead.id})" 
                                            title="Abrir WhatsApp Web para ${escapeHtml(lead.name)}">
                                        <i class="fab fa-whatsapp"></i>
                                    </button>
                                ` : ''}
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

                        ${phoneDisplay}

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
                                ? `<span style="font-size:11px; color:var(--neon-green);"><i class="fab fa-whatsapp"></i> ${escapeHtml(lead.whatsapp)}</span>` 
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
                    <div class="kanban-col-header" style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                        <span class="kanban-col-title" style="color:${col.color}; font-size:13px;">
                            <i class="fas ${col.icon || 'fa-circle'}" style="font-size:11px; color:${col.dotColor};"></i> ${col.title}
                        </span>
                        <div style="display:flex; align-items:center; gap:5px;">
                            ${colValHtml}
                            <span class="kanban-count">${col.items.length}</span>
                            ${shootBtnHtml}
                        </div>
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

        // Campos do Disparador Automático
        if (document.getElementById('cfg-disp-company')) document.getElementById('cfg-disp-company').value = settings.disparador_empresa_nome || 'Kaptador';
        if (document.getElementById('cfg-disp-solution')) document.getElementById('cfg-disp-solution').value = settings.disparador_solucao || 'modernização de sites e captação de clientes';
        if (document.getElementById('cfg-disp-audience')) document.getElementById('cfg-disp-audience').value = settings.disparador_publico_alvo || '';
        if (document.getElementById('cfg-disp-benefit')) document.getElementById('cfg-disp-benefit').value = settings.disparador_beneficio || 'aumentar o faturamento através de contatos qualificados';
        if (document.getElementById('cfg-disp-template')) document.getElementById('cfg-disp-template').value = settings.disparador_template || '';
        if (document.getElementById('cfg-disp-optout')) document.getElementById('cfg-disp-optout').checked = (settings.disparador_opt_out !== 'false');

        // Sincroniza inputs no painel dedicado do Disparador Automático
        if (document.getElementById('disp-my-company') && settings.disparador_empresa_nome) {
            document.getElementById('disp-my-company').value = settings.disparador_empresa_nome;
        }
        if (document.getElementById('disp-solution') && settings.disparador_solucao) {
            document.getElementById('disp-solution').value = settings.disparador_solucao;
        }
        if (document.getElementById('disp-target-audience') && settings.disparador_publico_alvo) {
            document.getElementById('disp-target-audience').value = settings.disparador_publico_alvo;
        }
        if (document.getElementById('disp-benefit') && settings.disparador_beneficio) {
            document.getElementById('disp-benefit').value = settings.disparador_beneficio;
        }
        if (document.getElementById('disparador-template') && settings.disparador_template) {
            document.getElementById('disparador-template').value = settings.disparador_template;
        }
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
        site_default_message: document.getElementById('cfg-site-message') ? document.getElementById('cfg-site-message').value : '',
        disparador_empresa_nome: document.getElementById('cfg-disp-company') ? document.getElementById('cfg-disp-company').value : 'Kaptador',
        disparador_solucao: document.getElementById('cfg-disp-solution') ? document.getElementById('cfg-disp-solution').value : '',
        disparador_publico_alvo: document.getElementById('cfg-disp-audience') ? document.getElementById('cfg-disp-audience').value : '',
        disparador_beneficio: document.getElementById('cfg-disp-benefit') ? document.getElementById('cfg-disp-benefit').value : '',
        disparador_template: document.getElementById('cfg-disp-template') ? document.getElementById('cfg-disp-template').value : '',
        disparador_opt_out: document.getElementById('cfg-disp-optout') ? (document.getElementById('cfg-disp-optout').checked ? 'true' : 'false') : 'true'
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

function extractLeadFirstName(lead) {
    if (!lead) return 'amigo(a)';
    const raw = lead.contact_name || lead.person_name || lead.name || '';
    if (!raw) return 'amigo(a)';
    let clean = raw.replace(/^(Dr\.|Dra\.|Sr\.|Sra\.|Prof\.|Adv\.|Eng\.)\s+/i, '').trim();
    const genericPrefixes = /^(Clínica|Clinica|Consultório|Consultorio|Escritório|Escritorio|Oficina|Auto\s+Mecânica|Auto\s+Mecanica|Auto|Centro|Instituto|Restaurante|Pizzaria|Padaria|Bar|Hotel|Pousada|Academia|Studio|Espaço|Espaco|Loja|Boutique|Laboratório|Laboratorio|Farmácia|Farmacia|Hospital|Mercado|Supermercado)\s+/i;
    if (genericPrefixes.test(clean)) {
        clean = clean.replace(genericPrefixes, '').trim();
    }
    const parts = clean.split(/\s+/);
    return parts[0] || 'amigo(a)';
}

function getSaudacaoHorario() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
}

/**
 * Monta mensagem dinâmica personalizada com suporte total a:
 * [{saudacao}], [{primeiro_nome}], [NOME_DA_EMPRESA], [SOLUCAO_CONFIRMADA], [PUBLICO_ALVO], [BENEFICIO_CONFIRMADO],
 * {empresa}, {cidade}, {status}, {telefone} e Spintax {Opção 1|Opção 2}.
 */
function buildPersonalizedMessage(lead, customTemplate = null, options = {}) {
    if (!lead) lead = {};
    const empresa = lead.name || 'Empresa';
    const cidade = extractCity(lead.address) || 'sua região';
    const semSite = !lead.has_website || !lead.website;
    const statusText = semSite ? 'Sem Site Oficial' : 'Site precisando de otimização mobile';
    const primeiroNome = extractLeadFirstName(lead);
    const saudacao = getSaudacaoHorario();

    // Valores padrão das tags globais da campanha
    const myCompany = options.myCompany || 
                      (document.getElementById('disp-my-company') ? document.getElementById('disp-my-company').value.trim() : '') || 
                      'Kaptador';
    const solucao = options.solution || 
                    (document.getElementById('disp-solution') ? document.getElementById('disp-solution').value.trim() : '') || 
                    'modernização de sites e captação de clientes';
    const publicoAlvo = options.targetAudience || 
                        (document.getElementById('disp-target-audience') ? document.getElementById('disp-target-audience').value.trim() : '') || 
                        lead.category || lead.niche || 'empresas do seu segmento';
    const beneficio = options.benefit || 
                      (document.getElementById('disp-benefit') ? document.getElementById('disp-benefit').value.trim() : '') || 
                      'aumentar o faturamento através de contatos qualificados';

    let template = customTemplate;
    if (!template) {
        template = `[{saudacao}], [{primeiro_nome}]! Sou da [NOME_DA_EMPRESA]. Trabalhamos com [SOLUCAO_CONFIRMADA] para [PUBLICO_ALVO]. Gostaria de saber se faz sentido conversar sobre [BENEFICIO_CONFIRMADO]. Posso fazer uma pergunta rápida?\n\nSe preferir não receber mensagens, é só me avisar.`;
    }

    // 1. Processa Spintax primeiro: {Opção 1|Opção 2}
    let res = parseSpintax(template);

    // 2. Substituições com suporte aos múltiplos formatos da interface e do usuário
    // [{saudacao}]
    res = res.replace(/\[\{\s*saudacao\s*\}\]/gi, saudacao)
             .replace(/\{\{\s*saudacao\s*\}\}/gi, saudacao)
             .replace(/\{\s*saudacao\s*\}/gi, saudacao)
             .replace(/\[\s*saudacao\s*\]/gi, saudacao);

    // [{primeiro_nome}]
    res = res.replace(/\[\{\s*primeiro_nome\s*\}\]/gi, primeiroNome)
             .replace(/\{\{\s*primeiro_nome\s*\}\}/gi, primeiroNome)
             .replace(/\{\s*primeiro_nome\s*\}/gi, primeiroNome)
             .replace(/\[\s*primeiro_nome\s*\]/gi, primeiroNome);

    // [NOME_DA_EMPRESA]
    res = res.replace(/\[\s*NOME_DA_EMPRESA\s*\]/gi, myCompany)
             .replace(/\[\{\s*nome_da_empresa\s*\}\]/gi, myCompany)
             .replace(/\{\{\s*nome_da_empresa\s*\}\}/gi, myCompany)
             .replace(/\{\s*minha_empresa\s*\}/gi, myCompany);

    // [SOLUCAO_CONFIRMADA]
    res = res.replace(/\[\s*SOLUCAO_CONFIRMADA\s*\]/gi, solucao)
             .replace(/\[\{\s*solucao_confirmada\s*\}\]/gi, solucao)
             .replace(/\{\{\s*solucao_confirmada\s*\}\}/gi, solucao)
             .replace(/\{\s*solucao\s*\}/gi, solucao);

    // [PUBLICO_ALVO]
    res = res.replace(/\[\s*PUBLICO_ALVO\s*\]/gi, publicoAlvo)
             .replace(/\[\{\s*publico_alvo\s*\}\]/gi, publicoAlvo)
             .replace(/\{\{\s*publico_alvo\s*\}\}/gi, publicoAlvo)
             .replace(/\{\s*nicho\s*\}/gi, publicoAlvo);

    // [BENEFICIO_CONFIRMADO]
    res = res.replace(/\[\s*BENEFICIO_CONFIRMADO\s*\]/gi, beneficio)
             .replace(/\[\{\s*beneficio_confirmada?\s*\}\]/gi, beneficio)
             .replace(/\{\{\s*beneficio_confirmado\s*\}\}/gi, beneficio)
             .replace(/\{\s*beneficio\s*\}/gi, beneficio);

    // Tags legadas e diretas
    res = res.replace(/\[\{\s*empresa\s*\}\]/gi, empresa)
             .replace(/\{\s*empresa\s*\}/gi, empresa)
             .replace(/\[\{\s*cidade\s*\}\]/gi, cidade)
             .replace(/\{\s*cidade\s*\}/gi, cidade)
             .replace(/\[\{\s*status\s*\}\]/gi, statusText)
             .replace(/\{\s*status\s*\}/gi, statusText)
             .replace(/\{\s*telefone\s*\}/gi, lead.whatsapp || lead.phone || '');

    // 3. Garantia do rodapé anti-bloqueio / LGPD se a opção estiver marcada
    const optOutCheckbox = document.getElementById('disp-opt-out-cb');
    const wantsOptOut = options.includeOptOut !== undefined ? options.includeOptOut : (optOutCheckbox ? optOutCheckbox.checked : true);
    if (wantsOptOut) {
        const lower = res.toLowerCase();
        if (!lower.includes('não receber mensagens') && !lower.includes('nao receber mensagens') && !lower.includes('sair da lista')) {
            res = res.trim() + '\n\nSe preferir não receber mensagens, é só me avisar.';
        }
    }

    return res;
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
            window.wahaCurrentStatus = st;
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
                if (typeof closeWahaQrModal === 'function') {
                    closeWahaQrModal();
                }

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

            // Atualiza indicadores do WhatsApp Web (Chat)
            const chatIndicator = document.getElementById('chat-waha-indicator');
            const chatBanner = document.getElementById('chat-waha-qr-banner');
            const wahaModal = document.getElementById('waha-qr-modal');

            if (st === 'WORKING') {
                if (chatIndicator) chatIndicator.innerHTML = `<span style="color:var(--neon-green); font-weight:700;"><i class="fab fa-whatsapp"></i> WA Conectado</span>`;
                if (chatBanner) chatBanner.style.display = 'none';
                if (wahaModal && wahaModal.classList.contains('active')) {
                    closeWahaQrModal();
                    showToast('🎉 WhatsApp Pareado e Conectado com Sucesso!', 'success');
                }
            } else if (st === 'SCAN_QR_CODE') {
                if (chatIndicator) chatIndicator.innerHTML = `<span style="color:var(--alert-orange); font-weight:700;"><i class="fas fa-qrcode"></i> Ler QR Code</span>`;
                if (chatBanner) chatBanner.style.display = 'flex';
            } else {
                if (chatIndicator) chatIndicator.innerHTML = `<span style="color:var(--alert-red); font-weight:700;"><i class="fas fa-power-off"></i> Reconectar</span>`;
                if (chatBanner) chatBanner.style.display = 'flex';
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

let modalQrCountdownTimer = null;

window.openWahaQrModal = function() {
    const modal = document.getElementById('waha-qr-modal');
    if (!modal) return;
    modal.classList.add('active');
    refreshModalQrCode();
};

window.closeWahaQrModal = function() {
    const modal = document.getElementById('waha-qr-modal');
    if (modal) modal.classList.remove('active');
    if (modalQrCountdownTimer) {
        clearInterval(modalQrCountdownTimer);
        modalQrCountdownTimer = null;
    }
};

window.refreshModalQrCode = async function() {
    const img = document.getElementById('waha-modal-qr-img');
    const timerEl = document.getElementById('waha-modal-secs');
    if (!img) return;

    try {
        const resp = await fetch(`/api/waha/qr?t=${Date.now()}`);
        const cType = resp.headers.get("content-type") || "";
        if (resp.ok && (cType.includes("image") || cType.includes("octet-stream"))) {
            const blob = await resp.blob();
            img.src = URL.createObjectURL(blob);
            img.style.display = 'block';
        } else {
            const data = await resp.json().catch(() => ({}));
            if (data.authenticated) {
                checkWahaStatus(false);
                closeWahaQrModal();
                return;
            }
        }
    } catch (e) {
        console.warn("Erro ao buscar QR:", e);
    }

    checkWahaStatus(false);

    if (modalQrCountdownTimer) clearInterval(modalQrCountdownTimer);
    let secs = 20;
    if (timerEl) timerEl.textContent = secs;
    modalQrCountdownTimer = setInterval(() => {
        secs--;
        if (timerEl) timerEl.textContent = secs;
        if (secs <= 0) {
            refreshModalQrCode();
        }
    }, 1000);
};

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
async function sendSingleWhatsApp(lead, customMessage = null, nextStage = null) {
    if (window.wahaCurrentStatus && window.wahaCurrentStatus !== 'WORKING') {
        showToast("WhatsApp não conectado. Aponte a câmera no QR Code para conectar antes de disparar.", "warning");
        if (typeof openWahaQrModal === 'function') openWahaQrModal();
        return false;
    }

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
        lead_id: lead.id || null,
        follow_stage: nextStage || lead.follow_stage || 'contato'
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
            if (data.qr_required && typeof openWahaQrModal === 'function') {
                openWahaQrModal();
            }
            const errDesc = data.error || `Erro HTTP ${res.status}`;
            throw new Error(errDesc);
        }

        showToast(`Mensagem enviada com sucesso para ${lead.name}!`, 'success');
        appendWahaLog(`✅ Mensagem entregue com sucesso para ${lead.name} (${chatId})`, 'success');

        // Atualiza status local do lead para 'contatado' e nova etapa do funil
        lead.campaign_status = 'contatado';
        if (nextStage) {
            lead.follow_stage = nextStage;
            appendWahaLog(`📌 Lead "${lead.name}" avançado para a etapa: ${nextStage}`, 'info');
        }
        if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();
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

// FUNÇÃO CENTRALIZADA DE FILTRAGEM POR GRUPO DE DISPARO
window.getLeadsForAudienceGroup = function(group) {
    if (!Array.isArray(currentLeads)) return [];
    
    if (group === 'selection') {
        const selectedIds = Array.from(document.querySelectorAll('.lead-select-checkbox:checked'))
                                 .map(cb => parseInt(cb.value));
        return currentLeads.filter(l => selectedIds.includes(l.id) && (l.whatsapp || l.phone));
    } else if (group === 'novos') {
        // Apenas leads nunca abordados (status novo)
        return currentLeads.filter(l => ((l.campaign_status || 'novo').toLowerCase() === 'novo') && (l.whatsapp || l.phone));
    } else if (group === 'no-site') {
        return currentLeads.filter(l => (!l.has_website || !l.website) && (l.whatsapp || l.phone));
    } else if (group === 'with-site') {
        return currentLeads.filter(l => (l.has_website || l.website) && (l.whatsapp || l.phone));
    } else if (group === 'stage-contato') {
        return currentLeads.filter(l => (l.follow_stage === 'contato' || ((l.campaign_status || '').toLowerCase() === 'contatado' && !l.follow_stage)) && (l.whatsapp || l.phone) && l.campaign_status !== 'fechado' && l.campaign_status !== 'perdido');
    } else if (group === 'stage-follow1') {
        return currentLeads.filter(l => l.follow_stage === 'follow1' && (l.whatsapp || l.phone) && l.campaign_status !== 'fechado' && l.campaign_status !== 'perdido');
    } else if (group === 'stage-follow2') {
        return currentLeads.filter(l => l.follow_stage === 'follow2' && (l.whatsapp || l.phone) && l.campaign_status !== 'fechado' && l.campaign_status !== 'perdido');
    } else if (group === 'stage-follow-todos') {
        return currentLeads.filter(l => (l.follow_stage === 'follow1' || l.follow_stage === 'follow2') && (l.whatsapp || l.phone) && l.campaign_status !== 'fechado' && l.campaign_status !== 'perdido');
    } else if (group === 'stage-proposta') {
        return currentLeads.filter(l => ((l.campaign_status || '').toLowerCase() === 'proposta' || l.follow_stage === 'proposta') && (l.whatsapp || l.phone));
    } else {
        // all-whatsapp ou padrão
        return currentLeads.filter(l => l.whatsapp || l.phone);
    }
};

window.updateBulkAudienceCount = function() {
    const groupSelect = document.getElementById('bulk-target-group');
    const summary = document.getElementById('bulk-audience-summary');
    if (!groupSelect || !summary) return;

    const group = groupSelect.value;
    const leadsToCount = window.getLeadsForAudienceGroup(group);

    const descriptions = {
        'novos': `📥 <strong>${leadsToCount.length} novo(s) lead(s)</strong> (nunca abordados) prontos para primeiro disparo.`,
        'stage-contato': `📞 <strong>${leadsToCount.length} lead(s)</strong> na etapa '1º Contato'.`,
        'stage-follow1': `🔄 <strong>${leadsToCount.length} lead(s)</strong> na etapa 'Follow-up 1' (aguardando retorno).`,
        'stage-follow2': `⏰ <strong>${leadsToCount.length} lead(s)</strong> na etapa 'Follow-up 2' (cobrança final).`,
        'stage-follow-todos': `🔁 <strong>${leadsToCount.length} lead(s)</strong> em Follow-up (Follow 1 + Follow 2).`,
        'stage-proposta': `📑 <strong>${leadsToCount.length} lead(s)</strong> com proposta em negociação.`,
        'no-site': `🔥 <strong>${leadsToCount.length} lead(s) SEM SITE</strong> (oportunidades quentes).`,
        'with-site': `🌐 <strong>${leadsToCount.length} lead(s) COM SITE</strong> (reforma/otimização).`,
        'selection': `🎯 <strong>${leadsToCount.length} lead(s)</strong> marcados na tabela com telefone/WhatsApp.`,
        'all-whatsapp': `📱 <strong>${leadsToCount.length} lead(s)</strong> cadastrados com número telefônico.`
    };

    summary.innerHTML = descriptions[group] || `📱 <strong>${leadsToCount.length} lead(s)</strong> prontos para disparo.`;
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

    if (window.switchTab) {
        window.switchTab('disparador');
    } else {
        const dTab = document.querySelector('[data-tab="disparador"]');
        if (dTab) dTab.click();
    }

    const targetGroup = document.getElementById('disparador-target-group');
    if (targetGroup) {
        targetGroup.value = 'selection';
        if (typeof updateDisparadorAudienceCount === 'function') updateDisparadorAudienceCount();
    }
};

window.handleStartBulkCampaign = function() {
    const group = document.getElementById('bulk-target-group').value;
    const targetLeads = window.getLeadsForAudienceGroup(group);

    if (targetLeads.length === 0) {
        showToast("Nenhum lead com telefone/WhatsApp encontrado para o grupo selecionado.", "warning");
        return;
    }

    const minSec = parseInt(document.getElementById('bulk-delay-min').value) || 15;
    const maxSec = parseInt(document.getElementById('bulk-delay-max').value) || 35;

    if (confirm(`Iniciar disparo em massa para ${targetLeads.length} leads do grupo selecionado com delay humano entre ${minSec}s e ${maxSec}s?`)) {
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
        const rawDigits = chatSearchQuery.replace(/\D/g, '');
        if (rawDigits.length >= 8) {
            listEl.innerHTML = `
                <div style="text-align:center; padding:24px 14px; background:rgba(0, 255, 136, 0.06); border:1px dashed rgba(0, 255, 136, 0.35); border-radius:12px; margin:16px;">
                    <i class="fab fa-whatsapp" style="font-size:30px; color:var(--neon-green); margin-bottom:10px; display:inline-block;"></i>
                    <div style="font-weight:700; font-size:13.5px; color:#fff;">Número não cadastrado</div>
                    <div style="color:var(--neon-green); font-size:13px; font-weight:700; margin:6px 0 14px; letter-spacing:0.5px;">${escapeHtml(chatSearchQuery)}</div>
                    <button type="button" class="btn btn-whatsapp btn-sm" onclick="quickStartChatWithPhone('${escapeHtml(rawDigits)}')" style="width:100%; justify-content:center; padding:9px 12px; font-weight:700; font-size:12px;">
                        <i class="fas fa-comment-dots"></i> Iniciar Conversa com este Número
                    </button>
                </div>
            `;
            return;
        }

        listEl.innerHTML = `
            <div style="text-align:center; padding:40px 16px; color:var(--text-secondary);">
                <i class="fas fa-search" style="font-size:24px; opacity:0.3; margin-bottom:10px; display:block;"></i>
                <div style="font-weight:600; font-size:13px;">Nenhuma conversa localizada</div>
                <small style="opacity:0.7; font-size:11.5px; margin-top:4px; display:block;">Tente outro filtro ou clique no botão "+ Nova Conversa" acima.</small>
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

window.quickStartChatWithPhone = function(rawPhone) {
    openNewChatModal();
    const phoneInput = document.getElementById('new-chat-phone');
    const nameInput = document.getElementById('new-chat-name');
    if (phoneInput) {
        phoneInput.value = rawPhone;
        formatPhoneInput(phoneInput);
    }
    if (nameInput && !nameInput.value) {
        nameInput.value = `Contato (${phoneInput ? phoneInput.value : rawPhone})`;
    }
    const msgInput = document.getElementById('new-chat-message');
    if (msgInput) {
        setTimeout(() => msgInput.focus(), 200);
    }
};

window.handleChatSearchKeyDown = function(e, val) {
    if (e.key === 'Enter') {
        const rawDigits = (val || '').replace(/\D/g, '');
        if (rawDigits.length >= 8 && chatConversations.length === 0) {
            quickStartChatWithPhone(rawDigits);
        }
    }
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
        if (window.wahaCurrentStatus && window.wahaCurrentStatus !== 'WORKING') {
            if (typeof showToast === 'function') {
                showToast("WhatsApp não conectado. Aponte a câmera no QR Code para conectar antes de enviar.", "warning");
            } else {
                alert("WhatsApp não conectado. Aponte a câmera no QR Code para conectar antes de enviar.");
            }
            if (typeof openWahaQrModal === 'function') openWahaQrModal();
            return;
        }
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
            if (data.qr_required && typeof openWahaQrModal === 'function') {
                openWahaQrModal();
            }
            if (typeof showToast === 'function') {
                showToast("❌ " + (data.error || "Falha ao enviar mensagem."), "error");
            } else {
                alert("❌ " + (data.error || "Falha ao enviar mensagem."));
            }
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

window.applyImageTemplateInChat = function() {
    if (!activeChatLead) {
        showToast("Selecione um lead antes de aplicar o template.", "warning");
        return;
    }
    const resolved = buildPersonalizedMessage(activeChatLead);
    if (activeChatChannel === 'whatsapp') {
        const wa = document.getElementById('chat-wa-input');
        if (wa) { wa.value = resolved; wa.focus(); }
    } else if (activeChatChannel === 'email') {
        const em = document.getElementById('chat-email-body');
        if (em) { em.value = resolved; em.focus(); }
    } else if (activeChatChannel === 'site') {
        const si = document.getElementById('chat-site-body');
        if (si) { si.value = resolved; si.focus(); }
    }
    showToast("Template da imagem aplicado!", "success");
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

/* ========================================================
   NOVAS FUNÇÕES DO CRM (CORTEX EXTENSION MODULES)
   ======================================================== */

// Utilitário genérico de fechamento de modais
window.closeModal = function(modalId) {
    const m = document.getElementById(modalId);
    if (m) m.classList.remove('active');
};

// ----------------- 1. E-MAIL DA EMPRESA (GMAIL) -----------------
window.loadCompanyEmails = async function(folder = 'inbox') {
    try {
        const res = await fetch(`/api/email/inbox?folder=${folder}`);
        const data = await res.json();
        
        const accountLabel = document.getElementById('gmail-account-label');
        const btnText = document.getElementById('gmail-btn-text');
        if (accountLabel) {
            accountLabel.textContent = data.account || 'Nenhuma conta conectada';
            accountLabel.style.color = data.connected ? 'var(--neon-green)' : '#fff';
        }
        if (btnText) {
            btnText.textContent = data.connected ? 'Gmail Conectado' : 'Conectar Gmail';
        }

        const listEl = document.getElementById('company-email-list');
        if (!listEl) return;

        if (!data.emails || data.emails.length === 0) {
            listEl.innerHTML = `
                <div style="text-align:center; padding:35px 20px; color:var(--text-muted); font-size:13px;">
                    <i class="fas fa-inbox" style="font-size:28px; margin-bottom:10px; display:block; opacity:0.4;"></i>
                    Nenhum e-mail no histórico. Conecte sua conta e sincronize a caixa para começar.
                </div>
            `;
            return;
        }

        listEl.innerHTML = data.emails.map(e => `
            <div style="background:#110e24; border:1px solid ${e.is_read ? 'rgba(157,78,221,0.2)' : 'var(--neon-cyan)'}; border-radius:8px; padding:12px; cursor:pointer; transition:all 0.2s;" onclick="openEmailDetail(${e.id}, '${encodeURIComponent(e.subject)}', '${encodeURIComponent(e.from_email)}', '${encodeURIComponent(e.body)}')">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <strong style="font-size:13px; color:#fff;">${e.from_email || 'Remetente'}</strong>
                    <span style="font-size:11px; color:var(--text-muted);">${e.date_str || ''}</span>
                </div>
                <div style="font-size:12.5px; font-weight:600; color:var(--neon-cyan); margin-bottom:2px;">${e.subject || 'Sem assunto'}</div>
                <div style="font-size:11.5px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${e.snippet || e.body || ''}</div>
            </div>
        `).join('');
    } catch (err) {
        console.error("Erro ao carregar e-mails:", err);
    }
};

window.connectGmailAccount = async function() {
    const email = prompt("Informe o e-mail do Gmail para conectar ao CRM:", "contato.empresa@gmail.com");
    if (!email) return;
    try {
        const res = await fetch('/api/email/connect-google', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.success) {
            if (typeof showToast === 'function') showToast(data.message, "success");
            loadCompanyEmails();
        }
    } catch (err) {
        alert("Erro ao conectar Gmail: " + err.message);
    }
};

window.applyEmailTemplate = function(type) {
    const toInput = document.getElementById('email-compose-to');
    const subjInput = document.getElementById('email-compose-subject');
    const bodyInput = document.getElementById('email-compose-body');
    if (!subjInput || !bodyInput) return;

    if (type === 'apresentacao') {
        subjInput.value = "Oportunidade Comercial: Modernização Digital para sua empresa";
        bodyInput.value = "Olá!\n\nAcompanhamos o crescimento da sua empresa e identificamos um excelente potencial para atração de novos clientes através de um site institucional de alta conversão.\n\nPodemos enviar uma prévia exclusiva sem compromisso?\n\nAtenciosamente,\nEquipe Comercial";
    } else if (type === 'retorno') {
        subjInput.value = "Retorno sobre a proposta de modernização digital";
        bodyInput.value = "Olá!\n\nPassando para saber se você conseguiu analisar a prévia do projeto que conversamos anteriormente. Ficou alguma dúvida sobre o escopo ou prazos de entrega?\n\nSeguimos à disposição!";
    } else if (type === 'proximo_passo') {
        subjInput.value = "Próximo passo: Início do desenvolvimento e alinhamento";
        bodyInput.value = "Olá!\n\nEstamos prontos para formalizar a comanda e iniciar o desenvolvimento da sua presença digital. Seguem os dados para alinhamento da reunião inicial.\n\nQual horário fica melhor para você nesta semana?";
    }
};

window.handleSendCompanyEmail = async function(e) {
    e.preventDefault();
    const to = document.getElementById('email-compose-to').value.trim();
    const subject = document.getElementById('email-compose-subject').value.trim();
    const body = document.getElementById('email-compose-body').value.trim();
    if (!to || !subject || !body) return;

    try {
        const res = await fetch('/api/email/inbox', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ to_email: to, subject, body })
        });
        const data = await res.json();
        if (data.success) {
            if (typeof showToast === 'function') showToast("E-mail enviado com sucesso!", "success");
            document.getElementById('form-send-company-email').reset();
            loadCompanyEmails('inbox');
        }
    } catch (err) {
        alert("Erro ao enviar e-mail: " + err.message);
    }
};

window.openEmailDetail = function(id, subjEnc, fromEnc, bodyEnc) {
    const subject = decodeURIComponent(subjEnc);
    const from = decodeURIComponent(fromEnc);
    const body = decodeURIComponent(bodyEnc);
    fetch(`/api/email/${id}/read`, { method: 'POST' });
    alert(`De: ${from}\nAssunto: ${subject}\n\n${body}`);
};

// ----------------- 2. RADAR DE RISCO -----------------
let currentRadarTier = 'critico';
let radarDataCache = null;

window.loadRiskRadar = async function() {
    try {
        const res = await fetch('/api/radar');
        const data = await res.json();
        radarDataCache = data;

        const countCrit = document.getElementById('radar-count-critico');
        const countRisc = document.getElementById('radar-count-risco');
        const countVoo = document.getElementById('radar-count-voo');
        if (countCrit) countCrit.textContent = data.critical_count || 0;
        if (countRisc) countRisc.textContent = data.at_risk_count || 0;
        if (countVoo) countVoo.textContent = data.in_flight_count || 0;

        renderRadarLeads();
    } catch (err) {
        console.error("Erro ao carregar radar:", err);
    }
};

window.filterRadarTab = function(tier) {
    currentRadarTier = tier;
    ['critico', 'risco', 'voo'].forEach(t => {
        const chip = document.getElementById(`chip-radar-${t}`);
        if (chip) {
            if (t === tier) chip.classList.add('active');
            else chip.classList.remove('active');
        }
    });
    renderRadarLeads();
};

function renderRadarLeads() {
    const container = document.getElementById('radar-leads-container');
    if (!container || !radarDataCache) return;

    let leads = [];
    let badgeClass = 'critico';
    let badgeLabel = 'Crítico';

    if (currentRadarTier === 'critico') {
        leads = radarDataCache.critical_leads || [];
        badgeClass = 'critico';
        badgeLabel = 'Crítico';
    } else if (currentRadarTier === 'risco') {
        leads = radarDataCache.at_risk_leads || [];
        badgeClass = 'em_risco';
        badgeLabel = 'Em risco';
    } else {
        leads = radarDataCache.in_flight_leads || [];
        badgeClass = 'em_voo';
        badgeLabel = 'Em voo';
    }

    if (leads.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:35px; color:var(--text-muted); font-size:13.5px;">
                <i class="fas fa-check-circle" style="color:var(--neon-green); font-size:26px; margin-bottom:10px; display:block;"></i>
                Nenhum lead nessa categoria de risco no momento. Tudo sob controle!
            </div>
        `;
        return;
    }

    container.innerHTML = leads.map(l => `
        <div class="radar-card">
            <div style="display:flex; align-items:center; gap:16px;">
                <span class="radar-badge ${badgeClass}">${badgeLabel}</span>
                <div>
                    <strong style="font-size:15px; color:#fff; display:block; margin-bottom:3px;">${l.name}</strong>
                    <div style="display:flex; align-items:center; gap:12px; font-size:12px; color:var(--text-secondary); flex-wrap:wrap;">
                        <span><i class="far fa-clock"></i> parado há ${l.days_stale || 9}d</span>
                        <span><i class="far fa-user"></i> ${l.assigned_to || 'Sem dono'}</span>
                        <span style="color:${currentRadarTier === 'voo' ? 'var(--neon-cyan)' : 'var(--alert-orange)'};">
                            <i class="fas ${currentRadarTier === 'voo' ? 'fa-plane' : 'fa-exclamation-triangle'}"></i> ${l.next_step}
                        </span>
                    </div>
                </div>
            </div>
            <div>
                <button type="button" class="btn btn-secondary btn-sm" onclick="assumeRiskLead(${l.id})">
                    Assumir <i class="fas fa-arrow-right" style="font-size:11px; margin-left:4px;"></i>
                </button>
            </div>
        </div>
    `).join('');
}

window.assumeRiskLead = async function(leadId) {
    try {
        const res = await fetch(`/api/radar/assume/${leadId}`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            if (typeof showToast === 'function') showToast(data.message, "success");
            loadRiskRadar();
        }
    } catch (err) {
        alert("Erro ao assumir lead: " + err.message);
    }
};

// ----------------- 3. AGENDA & COMPROMISSOS -----------------
let agendaWeekOffset = 0;

window.loadAgendaCalendar = async function() {
    try {
        const res = await fetch('/api/calendar/events');
        const data = await res.json();
        const events = data.events || [];

        const grid = document.getElementById('agenda-calendar-grid');
        if (!grid) return;

        // Renderiza cabeçalho de dias da semana
        const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay() + (agendaWeekOffset * 7));

        let headerHtml = `<div class="agenda-header-cell" style="background:#0c0a1a;">Horário</div>`;
        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek);
            d.setDate(startOfWeek.getDate() + i);
            const isToday = d.toDateString() === today.toDateString();
            headerHtml += `
                <div class="agenda-header-cell ${isToday ? 'today' : ''}">
                    <div>${days[i]}</div>
                    <div style="font-size:15px; font-weight:800;">${d.getDate()}</div>
                </div>
            `;
        }

        // Intervalo de horas das 08h às 18h
        let bodyHtml = '';
        for (let h = 8; h <= 18; h++) {
            const hourStr = h < 10 ? `0${h}:00` : `${h}:00`;
            bodyHtml += `<div class="agenda-cell" style="background:#0c0a1a; font-weight:700; color:var(--text-muted); text-align:center;">${hourStr}</div>`;
            
            for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
                const dayDate = new Date(startOfWeek);
                dayDate.setDate(startOfWeek.getDate() + dayIdx);
                const dateKey = dayDate.toISOString().split('T')[0];

                const dayEvents = events.filter(e => {
                    return (e.event_date === dateKey || !e.event_date) && e.start_time.startsWith(h < 10 ? `0${h}` : `${h}`);
                });

                let eventPills = dayEvents.map(ev => `
                    <div class="agenda-event-pill ${ev.event_type || 'atendimento'}" onclick="alert('Compromisso: ${ev.title}\\nHorário: ${ev.start_time} - ${ev.end_time}\\nContato: ${ev.contact_name || ''}')">
                        <i class="fas fa-clock" style="font-size:9px;"></i>
                        <span>${ev.title}</span>
                    </div>
                `).join('');

                bodyHtml += `<div class="agenda-cell">${eventPills}</div>`;
            }
        }

        grid.innerHTML = headerHtml + bodyHtml;

        // Atualiza label da semana
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        const labelEl = document.getElementById('agenda-week-label');
        if (labelEl) {
            labelEl.textContent = `${startOfWeek.getDate()} de ${startOfWeek.toLocaleString('pt-BR', { month: 'short' })} — ${endOfWeek.getDate()} de ${endOfWeek.toLocaleString('pt-BR', { month: 'short' })}`;
        }
    } catch (err) {
        console.error("Erro ao carregar agenda:", err);
    }
};

window.shiftAgendaWeek = function(delta) {
    agendaWeekOffset += delta;
    loadAgendaCalendar();
};

window.resetAgendaToday = function() {
    agendaWeekOffset = 0;
    loadAgendaCalendar();
};

window.openNewEventModal = function() {
    const d = document.getElementById('ev-create-date');
    if (d) d.value = new Date().toISOString().split('T')[0];
    const m = document.getElementById('modal-new-calendar-event');
    if (m) m.classList.add('active');
};

window.handleCreateCalendarEvent = async function(e) {
    e.preventDefault();
    const title = document.getElementById('ev-create-title').value.trim();
    const event_type = document.getElementById('ev-create-type').value;
    const event_date = document.getElementById('ev-create-date').value;
    const start_time = document.getElementById('ev-create-start').value;
    const end_time = document.getElementById('ev-create-end').value;
    const contact_name = document.getElementById('ev-create-contact').value.trim();
    const contact_phone = document.getElementById('ev-create-phone').value.trim();

    try {
        const res = await fetch('/api/calendar/events', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ title, event_type, event_date, start_time, end_time, contact_name, contact_phone })
        });
        const data = await res.json();
        if (data.success) {
            closeModal('modal-new-calendar-event');
            if (typeof showToast === 'function') showToast("Compromisso agendado com sucesso!", "success");
            loadAgendaCalendar();
        }
    } catch (err) {
        alert("Erro ao criar compromisso: " + err.message);
    }
};

window.connectGoogleCalendar = async function() {
    const email = prompt("Informe o e-mail Google para sincronização de agenda:", "agenda.empresa@gmail.com");
    if (!email) return;
    try {
        const res = await fetch('/api/calendar/connect-google', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.success) {
            const accLabel = document.getElementById('agenda-account-label');
            if (accLabel) accLabel.textContent = email;
            if (typeof showToast === 'function') showToast(data.message, "success");
        }
    } catch (err) {
        alert("Erro: " + err.message);
    }
};

// ----------------- 4. RESPOSTAS RÁPIDAS -----------------
window.loadQuickReplies = async function() {
    try {
        const res = await fetch('/api/quick-replies');
        const data = await res.json();
        const list = document.getElementById('quick-replies-list');
        if (!list) return;

        if (!data.quick_replies || data.quick_replies.length === 0) {
            list.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-muted);">Nenhum template cadastrado ainda.</div>`;
            return;
        }

        list.innerHTML = data.quick_replies.map(qr => `
            <div style="background:#110e24; border:1px solid var(--border-color); border-radius:10px; padding:16px; display:flex; flex-direction:column; justify-content:space-between; gap:12px;">
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-size:12px; font-family:var(--font-mono); font-weight:700; color:var(--neon-green); background:rgba(0,255,136,0.1); border:1px solid rgba(0,255,136,0.3); padding:2px 8px; border-radius:4px;">${qr.shortcut}</span>
                        <span style="font-size:11px; color:var(--text-muted);">${qr.category}</span>
                    </div>
                    <strong style="font-size:14px; color:#fff; display:block; margin-bottom:6px;">${qr.title}</strong>
                    <p style="font-size:12.5px; color:var(--text-secondary); line-height:1.45; margin:0; white-space:pre-wrap;">${qr.content}</p>
                </div>
                <div style="display:flex; gap:8px; border-top:1px solid rgba(157,78,221,0.15); padding-top:10px;">
                    <button type="button" class="btn btn-secondary btn-sm" style="flex:1;" onclick="copyQuickReply('${encodeURIComponent(qr.content)}')">
                        <i class="far fa-copy"></i> Copiar
                    </button>
                    <button type="button" class="btn btn-neon btn-sm" style="flex:1;" onclick="useQuickReplyInChat('${encodeURIComponent(qr.content)}')">
                        <i class="fab fa-whatsapp"></i> No Chat
                    </button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error("Erro ao carregar respostas rápidas:", err);
    }
};

window.openNewQuickReplyModal = function() {
    const m = document.getElementById('modal-new-quick-reply');
    if (m) m.classList.add('active');
};

window.handleCreateQuickReply = async function(e) {
    e.preventDefault();
    const title = document.getElementById('qr-create-title').value.trim();
    const shortcut = document.getElementById('qr-create-sc').value.trim();
    const category = document.getElementById('qr-create-cat').value.trim() || 'Geral';
    const content = document.getElementById('qr-create-content').value.trim();

    try {
        const res = await fetch('/api/quick-replies', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ title, shortcut, category, content })
        });
        const data = await res.json();
        if (data.success) {
            closeModal('modal-new-quick-reply');
            if (typeof showToast === 'function') showToast("Template salvo com sucesso!", "success");
            loadQuickReplies();
        }
    } catch (err) {
        alert("Erro ao criar resposta rápida: " + err.message);
    }
};

window.copyQuickReply = function(enc) {
    const text = decodeURIComponent(enc);
    navigator.clipboard.writeText(text);
    if (typeof showToast === 'function') showToast("Texto copiado para a área de transferência!", "success");
};

window.useQuickReplyInChat = function(enc) {
    const text = decodeURIComponent(enc);
    switchTab('chat');
    const input = document.getElementById('chat-message-input');
    if (input) {
        input.value = text;
        input.focus();
    }
};

// ----------------- 5. CONTATOS (CUSTOMER 360) -----------------
let contactsCache = [];

window.loadContacts360 = async function() {
    try {
        const res = await fetch('/api/leads');
        const data = await res.json();
        contactsCache = data.leads || [];
        renderContactsTable(contactsCache);
    } catch (err) {
        console.error("Erro ao carregar contatos:", err);
    }
};

function renderContactsTable(list) {
    const tbody = document.getElementById('contacts-table-body');
    if (!tbody) return;

    if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">Nenhum contato encontrado.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.slice(0, 50).map(c => `
        <tr>
            <td>
                <strong style="color:#fff; font-size:13.5px;">${c.name}</strong>
                ${c.address ? `<div style="font-size:11px; color:var(--text-muted);">${c.address}</div>` : ''}
            </td>
            <td><span style="font-size:12.5px; color:var(--text-secondary);">${c.email || '—'}</span></td>
            <td><code style="color:var(--neon-green); font-size:12px;">${c.whatsapp || c.phone || '—'}</code></td>
            <td><span class="badge" style="background:#110e24; border:1px solid var(--border-color);">${c.category || 'Lead B2B'}</span></td>
            <td><span class="badge" style="background:rgba(0,255,136,0.12); color:var(--neon-green); border:1px solid var(--neon-green);">${c.campaign_status || 'Ativo'}</span></td>
            <td>
                <div style="display:flex; gap:6px;">
                    ${c.whatsapp ? `<a href="https://wa.me/${c.whatsapp}" target="_blank" class="btn btn-secondary btn-sm" title="Abrir WhatsApp"><i class="fab fa-whatsapp" style="color:var(--neon-green);"></i></a>` : ''}
                    <button type="button" class="btn btn-secondary btn-sm" title="Abrir no Chat Kaptador" onclick="openChatWithLead(${c.id})"><i class="fas fa-comment-dots" style="color:var(--neon-cyan);"></i></button>
                    <button type="button" class="btn btn-secondary btn-sm" title="Ver Detalhes" onclick="openLeadModal(${c.id})"><i class="fas fa-eye"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

window.filterContactsNiche = function(niche) {
    if (!niche) {
        renderContactsTable(contactsCache);
    } else {
        const filtered = contactsCache.filter(c => {
            const cat = (c.category || '').toLowerCase();
            const name = (c.name || '').toLowerCase();
            return cat.includes(niche.toLowerCase()) || name.includes(niche.toLowerCase());
        });
        renderContactsTable(filtered);
    }
};

window.debounceContactsSearch = function() {
    const query = document.getElementById('contacts-search-input').value.toLowerCase().trim();
    if (!query) {
        renderContactsTable(contactsCache);
        return;
    }
    const filtered = contactsCache.filter(c => {
        return (c.name && c.name.toLowerCase().includes(query)) ||
               (c.phone && c.phone.includes(query)) ||
               (c.whatsapp && c.whatsapp.includes(query)) ||
               (c.email && c.email.toLowerCase().includes(query));
    });
    renderContactsTable(filtered);
};

window.checkContactDuplicates = async function() {
    try {
        const res = await fetch('/api/contacts/duplicates');
        const data = await res.json();
        if (data.duplicates_count === 0) {
            alert("Nenhum contato duplicado encontrado na base!");
        } else {
            alert(`Foram identificados ${data.duplicates_count} contatos com telefones repetidos na base.`);
        }
    } catch (err) {
        alert("Erro ao verificar duplicados: " + err.message);
    }
};

window.openChatWithLead = function(leadId) {
    switchTab('chat');
    if (typeof loadChatConversations === 'function') {
        loadChatConversations(leadId);
    }
};

// ----------------- 6. TAREFAS -----------------
window.loadTasksView = async function() {
    try {
        const status = document.getElementById('tasks-filter-status')?.value || 'pendente';
        const res = await fetch(`/api/tasks?status=${status}`);
        const data = await res.json();
        const tasks = data.tasks || [];

        const container = document.getElementById('tasks-list-container');
        if (!container) return;

        if (tasks.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:35px; color:var(--text-muted);">
                    <i class="fas fa-clipboard-check" style="font-size:28px; color:var(--neon-green); margin-bottom:10px; display:block;"></i>
                    Nenhuma tarefa pendente! Tudo em dia.
                </div>
            `;
            return;
        }

        // Agrupa tarefas
        const semPrazo = tasks.filter(t => t.due_date === 'sem_prazo' || !t.due_date);
        const hoje = tasks.filter(t => t.due_date === 'hoje');
        const estaSemana = tasks.filter(t => t.due_date === 'esta_semana');
        const concluidas = tasks.filter(t => t.status === 'concluida');

        let html = '';

        const renderTaskItem = (t) => `
            <div class="task-card ${t.status === 'concluida' ? 'completed' : ''}">
                <input type="checkbox" style="width:18px; height:18px; margin-top:2px; accent-color:var(--neon-green); cursor:pointer;" ${t.status === 'concluida' ? 'checked' : ''} onchange="toggleTaskStatus(${t.id}, '${t.status}')">
                <div style="flex:1;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                        <strong style="font-size:14px; color:#fff;">${t.title}</strong>
                        <span class="badge" style="background:${t.priority === 'alta' ? 'rgba(255,77,109,0.2)' : t.priority === 'media' ? 'rgba(255,159,28,0.2)' : 'rgba(0,210,255,0.2)'}; color:${t.priority === 'alta' ? 'var(--alert-red)' : t.priority === 'media' ? 'var(--alert-orange)' : 'var(--neon-cyan)'}; border:1px solid currentColor;">
                            ${t.priority.toUpperCase()}
                        </span>
                        ${t.due_date ? `<span style="font-size:11px; color:var(--text-muted);">${t.due_date.replace('_', ' ')}</span>` : ''}
                    </div>
                    ${t.description ? `<p style="font-size:12.5px; color:var(--text-secondary); margin:0 0 4px 0; line-height:1.4;">${t.description}</p>` : ''}
                    ${t.assigned_to ? `<span style="font-size:11px; color:var(--neon-cyan);"><i class="far fa-user"></i> ${t.assigned_to}</span>` : ''}
                </div>
                <button type="button" class="btn btn-secondary btn-sm" style="color:var(--alert-red); border:none; background:transparent;" onclick="deleteTaskItem(${t.id})">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;

        if (hoje.length > 0) {
            html += `<div class="task-group-title"><i class="fas fa-calendar-day" style="color:var(--neon-green); margin-right:6px;"></i> Hoje</div>`;
            html += hoje.map(renderTaskItem).join('');
        }
        if (estaSemana.length > 0) {
            html += `<div class="task-group-title"><i class="fas fa-calendar-week" style="color:var(--neon-cyan); margin-right:6px;"></i> Esta Semana</div>`;
            html += estaSemana.map(renderTaskItem).join('');
        }
        if (semPrazo.length > 0) {
            html += `<div class="task-group-title"><i class="fas fa-inbox" style="margin-right:6px;"></i> Sem Prazo Definido</div>`;
            html += semPrazo.map(renderTaskItem).join('');
        }
        if (status === 'todos' && concluidas.length > 0) {
            html += `<div class="task-group-title"><i class="fas fa-check-double" style="color:var(--neon-green); margin-right:6px;"></i> Concluídas</div>`;
            html += concluidas.map(renderTaskItem).join('');
        }

        container.innerHTML = html;
    } catch (err) {
        console.error("Erro ao carregar tarefas:", err);
    }
};

window.openNewTaskModal = function() {
    const m = document.getElementById('modal-new-task');
    if (m) m.classList.add('active');
};

window.handleCreateTask = async function(e) {
    e.preventDefault();
    const title = document.getElementById('task-create-title').value.trim();
    const description = document.getElementById('task-create-desc').value.trim();
    const priority = document.getElementById('task-create-prio').value;
    const due_date = document.getElementById('task-create-due').value;
    const assigned_to = document.getElementById('task-create-assignee').value.trim();

    try {
        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ title, description, priority, due_date, assigned_to })
        });
        const data = await res.json();
        if (data.success) {
            closeModal('modal-new-task');
            if (typeof showToast === 'function') showToast("Tarefa criada com sucesso!", "success");
            loadTasksView();
        }
    } catch (err) {
        alert("Erro ao criar tarefa: " + err.message);
    }
};

window.toggleTaskStatus = async function(taskId, currentStatus) {
    const newStatus = currentStatus === 'concluida' ? 'pendente' : 'concluida';
    try {
        await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ status: newStatus })
        });
        loadTasksView();
    } catch (err) {
        console.error("Erro ao atualizar tarefa:", err);
    }
};

window.deleteTaskItem = async function(taskId) {
    if (!confirm("Deseja realmente remover esta tarefa?")) return;
    try {
        await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
        loadTasksView();
    } catch (err) {
        console.error("Erro ao deletar tarefa:", err);
    }
};

// ----------------- 7. COMANDAS -----------------
let activeComanda = null;

window.loadComandasView = async function() {
    try {
        const res = await fetch('/api/comandas');
        const data = await res.json();
        const comandas = data.comandas || [];

        const sidebarList = document.getElementById('comandas-sidebar-list');
        if (!sidebarList) return;

        if (comandas.length === 0) {
            sidebarList.innerHTML = `<div style="padding:20px; color:var(--text-muted); font-size:13px;">Nenhuma comanda aberta.</div>`;
            return;
        }

        sidebarList.innerHTML = comandas.map(c => `
            <div class="comanda-card-item ${activeComanda && activeComanda.id === c.id ? 'active' : ''}" onclick="selectComanda(${c.id})">
                <div>
                    <strong style="color:#fff; font-size:13.5px;">${c.comanda_number}</strong>
                    <div style="font-size:12px; color:var(--text-muted);">${c.customer_name}</div>
                    <span class="badge" style="font-size:10px; background:${c.status === 'aberta' ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.05)'}; color:${c.status === 'aberta' ? 'var(--neon-green)' : 'var(--text-muted)'};">
                        ${c.status.toUpperCase()}
                    </span>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:14px; font-weight:700; color:var(--neon-green); font-family:var(--font-mono);">
                        R$ ${parseFloat(c.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                </div>
            </div>
        `).join('');

        if (!activeComanda && comandas.length > 0) {
            selectComanda(comandas[0].id);
        }
    } catch (err) {
        console.error("Erro ao carregar comandas:", err);
    }
};

window.selectComanda = async function(comandaId) {
    try {
        const res = await fetch('/api/comandas');
        const data = await res.json();
        const c = (data.comandas || []).find(x => x.id === comandaId);
        if (!c) return;
        activeComanda = c;

        // Atualiza seleção visual na lista
        document.querySelectorAll('.comanda-card-item').forEach(el => el.classList.remove('active'));

        const detailArea = document.getElementById('comanda-detail-area');
        if (!detailArea) return;

        let items = [];
        try {
            items = typeof c.items_json === 'string' ? JSON.parse(c.items_json) : (c.items_json || []);
        } catch (e) { items = []; }

        detailArea.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(157,78,221,0.2); padding-bottom:14px; margin-bottom:16px;">
                <div>
                    <h3 style="font-size:20px; font-weight:800; color:#fff;">Comanda ${c.comanda_number} — ${c.customer_name}</h3>
                    <span style="font-size:12px; color:var(--text-muted);">Status: <strong style="color:var(--neon-green);">${c.status.toUpperCase()}</strong></span>
                </div>
                <div style="font-size:22px; font-weight:900; color:var(--neon-green); font-family:var(--font-mono);">
                    R$ ${parseFloat(c.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
            </div>

            <!-- Formulário para Incluir Item -->
            ${c.status === 'aberta' ? `
                <div style="background:#110e24; border:1px solid var(--border-color); border-radius:10px; padding:16px; margin-bottom:18px;">
                    <span style="font-size:12px; font-weight:700; color:var(--neon-cyan); text-transform:uppercase; display:block; margin-bottom:10px;">Incluir Serviço na Comanda</span>
                    <div style="display:grid; grid-template-columns:140px 1fr 110px auto; gap:10px; align-items:flex-end;">
                        <div>
                            <label class="form-label" style="font-size:11px;">Serviço</label>
                            <select id="comanda-add-service" class="form-control" style="font-size:12.5px; padding:6px 10px;">
                                <option value="Redesign">Redesign</option>
                                <option value="Hospedagem">Hospedagem</option>
                                <option value="Manutenção">Manutenção</option>
                                <option value="Tráfego">Tráfego Pago</option>
                                <option value="Avulso">Avulso</option>
                            </select>
                        </div>
                        <div>
                            <label class="form-label" style="font-size:11px;">Descrição do Item</label>
                            <input type="text" id="comanda-add-desc" class="form-control" style="font-size:12.5px; padding:6px 10px;" placeholder="Ex: Criação de 5 banners">
                        </div>
                        <div>
                            <label class="form-label" style="font-size:11px;">Valor (R$)</label>
                            <input type="number" step="0.01" id="comanda-add-val" class="form-control" style="font-size:12.5px; padding:6px 10px;" placeholder="0,00">
                        </div>
                        <button type="button" class="btn btn-secondary btn-sm" style="height:35px;" onclick="addComandaItem(${c.id})">
                            <i class="fas fa-plus"></i> Incluir
                        </button>
                    </div>
                </div>
            ` : ''}

            <!-- Tabela de Itens da Comanda -->
            <div style="margin-bottom:20px;">
                <table style="width:100%; border-collapse:collapse; font-size:13px;">
                    <thead>
                        <tr style="border-bottom:1px solid var(--border-color); color:var(--text-muted); text-align:left;">
                            <th style="padding:8px;">Serviço</th>
                            <th style="padding:8px;">Descrição</th>
                            <th style="padding:8px; text-align:right;">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(it => `
                            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                                <td style="padding:10px 8px; color:var(--neon-cyan); font-weight:600;">${it.service || 'Item'}</td>
                                <td style="padding:10px 8px; color:var(--text-secondary);">${it.description || '—'}</td>
                                <td style="padding:10px 8px; text-align:right; font-family:var(--font-mono); color:#fff;">R$ ${parseFloat(it.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Forma de Pagamento e Finalização -->
            ${c.status === 'aberta' ? `
                <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(157,78,221,0.2); padding-top:16px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:12.5px; color:var(--text-muted);">Forma de pagamento:</span>
                        <select id="comanda-final-payment" class="form-control" style="width:auto; font-size:12.5px; padding:6px 10px;">
                            <option value="pix" ${c.payment_method === 'pix' ? 'selected' : ''}>Pix</option>
                            <option value="cartao" ${c.payment_method === 'cartao' ? 'selected' : ''}>Cartão de Crédito</option>
                            <option value="boleto" ${c.payment_method === 'boleto' ? 'selected' : ''}>Boleto</option>
                        </select>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button type="button" class="btn btn-secondary btn-sm" onclick="cancelComanda(${c.id})">Cancelar Comanda</button>
                        <button type="button" class="btn btn-neon btn-sm" onclick="finalizeComanda(${c.id})"><i class="fas fa-check"></i> Finalizar Comanda</button>
                    </div>
                </div>
            ` : `
                <div style="padding:12px; background:rgba(0,255,136,0.1); border:1px solid var(--neon-green); border-radius:8px; color:var(--neon-green); font-size:13px;">
                    <i class="fas fa-check-circle"></i> Comanda finalizada em ${c.closed_at || 'data recente'}.
                </div>
            `}
        `;
    } catch (err) {
        console.error("Erro ao selecionar comanda:", err);
    }
};

window.openNewComandaModal = function() {
    const m = document.getElementById('modal-new-comanda');
    if (m) m.classList.add('active');
};

window.handleCreateComanda = async function(e) {
    e.preventDefault();
    const customer_name = document.getElementById('comanda-create-cust').value.trim();
    const service = document.getElementById('comanda-create-serv').value;
    const value = parseFloat(document.getElementById('comanda-create-val').value) || 0;
    const payment_method = document.getElementById('comanda-create-payment').value;

    const items = [{ service, description: `${service} contratado`, value }];

    try {
        const res = await fetch('/api/comandas', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ customer_name, payment_method, items, total: value })
        });
        const data = await res.json();
        if (data.success) {
            closeModal('modal-new-comanda');
            if (typeof showToast === 'function') showToast("Comanda aberta com sucesso!", "success");
            loadComandasView();
        }
    } catch (err) {
        alert("Erro ao criar comanda: " + err.message);
    }
};

window.addComandaItem = async function(comandaId) {
    const service = document.getElementById('comanda-add-service').value;
    const desc = document.getElementById('comanda-add-desc').value.trim();
    const val = parseFloat(document.getElementById('comanda-add-val').value) || 0;
    if (val <= 0) return alert("Informe um valor válido.");

    let items = [];
    try {
        items = typeof activeComanda.items_json === 'string' ? JSON.parse(activeComanda.items_json) : (activeComanda.items_json || []);
    } catch(e) { items = []; }

    items.push({ service, description: desc || service, value: val });
    const newTotal = items.reduce((acc, it) => acc + (parseFloat(it.value) || 0), 0);

    try {
        await fetch(`/api/comandas/${comandaId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ items, total: newTotal })
        });
        selectComanda(comandaId);
    } catch (err) {
        alert("Erro ao adicionar item: " + err.message);
    }
};

window.finalizeComanda = async function(comandaId) {
    const payment = document.getElementById('comanda-final-payment')?.value || 'pix';
    if (!confirm("Confirmar a finalização e recebimento desta comanda?")) return;
    try {
        await fetch(`/api/comandas/${comandaId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ status: 'finalizada', payment_method: payment })
        });
        if (typeof showToast === 'function') showToast("Comanda finalizada com sucesso!", "success");
        loadComandasView();
    } catch (err) {
        alert("Erro ao finalizar comanda: " + err.message);
    }
};

window.cancelComanda = async function(comandaId) {
    if (!confirm("Deseja realmente cancelar esta comanda?")) return;
    try {
        await fetch(`/api/comandas/${comandaId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ status: 'cancelada' })
        });
        loadComandasView();
    } catch (err) {
        alert("Erro ao cancelar comanda: " + err.message);
    }
};

// ----------------- 8. PRODUTOS & CATÁLOGO -----------------
let productsCache = [];

window.loadProductsView = async function() {
    try {
        const res = await fetch('/api/products');
        const data = await res.json();
        productsCache = data.products || [];
        renderProductsGrid(productsCache);
    } catch (err) {
        console.error("Erro ao carregar produtos:", err);
    }
};

function renderProductsGrid(list) {
    const grid = document.getElementById('products-grid-container');
    if (!grid) return;

    if (!list || list.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:50px 20px; color:var(--text-muted);">
                <i class="fas fa-box-open" style="font-size:32px; opacity:0.4; margin-bottom:12px; display:block;"></i>
                <h4 style="font-size:16px; color:#fff; margin-bottom:4px;">Nenhum produto cadastrado ainda</h4>
                <p style="font-size:13px; max-width:400px; margin:0 auto;">Enquanto o catálogo estiver vazio, o atendente de IA responde que não encontrou o produto.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = list.map(p => `
        <div class="product-card">
            <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-size:11px; font-family:var(--font-mono); font-weight:700; color:var(--neon-cyan); background:rgba(0,210,255,0.1); border:1px solid rgba(0,210,255,0.25); padding:2px 8px; border-radius:4px;">${p.code}</span>
                    <span style="font-size:11.5px; color:var(--text-muted);">${p.category}</span>
                </div>
                <h4 style="font-size:16px; font-weight:800; color:#fff; margin-bottom:8px;">${p.name}</h4>
                <p style="font-size:12px; color:var(--text-secondary); line-height:1.45; margin-bottom:14px;">${p.prompt_description || 'Sem descrição cadastrada.'}</p>
            </div>
            <div>
                <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:12px;">
                    <span style="font-size:20px; font-weight:900; color:var(--neon-green); font-family:var(--font-mono);">
                        R$ ${parseFloat(p.promo_price || p.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    ${p.promo_price && p.promo_price < p.price ? `<span style="font-size:12.5px; color:var(--text-muted); text-decoration:line-through;">R$ ${parseFloat(p.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>` : ''}
                </div>
                <div style="display:flex; gap:8px;">
                    <button type="button" class="btn btn-secondary btn-sm" style="flex:1;" onclick="deleteProductItem(${p.id})">Excluir</button>
                    <button type="button" class="btn btn-neon btn-sm" style="flex:1;" onclick="alert('Código do produto copiado!')">Copiar</button>
                </div>
            </div>
        </div>
    `).join('');
}

window.openNewProductModal = function() {
    const m = document.getElementById('modal-new-product');
    if (m) m.classList.add('active');
};

window.handleCreateProduct = async function(e) {
    e.preventDefault();
    const code = document.getElementById('prod-create-code').value.trim();
    const name = document.getElementById('prod-create-name').value.trim();
    const category = document.getElementById('prod-create-cat').value.trim() || 'Serviço';
    const price = parseFloat(document.getElementById('prod-create-price').value) || 0;
    const promo_price = parseFloat(document.getElementById('prod-create-promo').value) || price;
    const prompt_description = document.getElementById('prod-create-desc').value.trim();

    try {
        const res = await fetch('/api/products', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ code, name, category, price, promo_price, prompt_description })
        });
        const data = await res.json();
        if (data.success) {
            closeModal('modal-new-product');
            if (typeof showToast === 'function') showToast("Produto cadastrado com sucesso!", "success");
            loadProductsView();
        }
    } catch (err) {
        alert("Erro ao cadastrar produto: " + err.message);
    }
};

window.deleteProductItem = async function(productId) {
    if (!confirm("Deseja remover este produto do catálogo?")) return;
    try {
        await fetch(`/api/products/${productId}`, { method: 'DELETE' });
        loadProductsView();
    } catch (err) {
        alert("Erro ao deletar produto: " + err.message);
    }
};

window.debounceProductsSearch = function() {
    const query = document.getElementById('products-search-input').value.toLowerCase().trim();
    if (!query) {
        renderProductsGrid(productsCache);
        return;
    }
    const filtered = productsCache.filter(p => {
        return (p.name && p.name.toLowerCase().includes(query)) ||
               (p.code && p.code.toLowerCase().includes(query)) ||
               (p.category && p.category.toLowerCase().includes(query));
    });
    renderProductsGrid(filtered);
};

// ----------------- 9. CALCULADORA DE PRECIFICAÇÃO -----------------
let lastPricingProposal = '';

window.calculatePricing = async function() {
    const website_url = document.getElementById('pricing-url-input').value.trim();
    if (!website_url) return alert("Por favor, informe a URL do site (ex: https://empresa.com.br)");

    const client_name = document.getElementById('pricing-client-name').value.trim();
    const city = document.getElementById('pricing-city').value.trim();
    const uf = document.getElementById('pricing-uf').value;
    const segment = document.getElementById('pricing-segment').value.trim();
    const project_type = document.getElementById('pricing-project-type').value;
    const timeline = document.getElementById('pricing-timeline').value;
    const positioning = document.getElementById('pricing-positioning').value;
    const is_redesign = document.getElementById('pricing-mode-redesign').checked;
    const outsource = document.getElementById('pricing-outsource').checked;
    const urgency = document.getElementById('pricing-urgency').checked;

    const resultBox = document.getElementById('pricing-result-area');
    resultBox.style.display = 'block';
    resultBox.innerHTML = `
        <div style="text-align:center; padding:30px; color:var(--text-muted);">
            <i class="fas fa-spinner fa-spin" style="font-size:24px; color:var(--neon-green); margin-bottom:10px; display:block;"></i>
            Analisando parâmetros de mercado, posicionamento e escopo...
        </div>
    `;

    try {
        const res = await fetch('/api/pricing/calculate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                website_url, client_name, city, uf, segment, project_type, timeline,
                positioning, is_redesign, outsource, urgency
            })
        });
        const data = await res.json();
        lastPricingProposal = data.proposal_text;

        resultBox.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:18px;">
                <div>
                    <span style="font-size:11.5px; text-transform:uppercase; letter-spacing:1px; color:var(--neon-cyan); font-weight:700;">Diagnóstico Concluído</span>
                    <h3 style="font-size:22px; font-weight:800; color:#fff; margin:2px 0;">Investimento Recomendado</h3>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:28px; font-weight:900; color:var(--neon-green); font-family:var(--font-mono);">
                        R$ ${parseFloat(data.recommended_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <span style="font-size:12px; color:var(--text-muted);">Faixa aceitável: R$ ${parseFloat(data.min_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} — R$ ${parseFloat(data.max_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:20px; background:#0c0a1a; padding:14px; border-radius:8px; border:1px solid rgba(157,78,221,0.2);">
                <div>
                    <span style="font-size:11px; color:var(--text-muted); display:block;">Horas Estimadas</span>
                    <strong style="font-size:14px; color:#fff;">${data.estimated_hours}h de execução</strong>
                </div>
                <div>
                    <span style="font-size:11px; color:var(--text-muted); display:block;">Fator Regional</span>
                    <strong style="font-size:14px; color:var(--neon-cyan);">${data.breakdown.regional_factor}x (${uf})</strong>
                </div>
                <div>
                    <span style="font-size:11px; color:var(--text-muted); display:block;">Posicionamento</span>
                    <strong style="font-size:14px; color:#fff;">${data.breakdown.positioning_factor}x</strong>
                </div>
                <div>
                    <span style="font-size:11px; color:var(--text-muted); display:block;">Adicionais</span>
                    <strong style="font-size:14px; color:var(--neon-green);">${urgency ? '+25% Urgência ' : ''}${outsource ? '+30% Terceirização' : (urgency ? '' : 'Padrão')}</strong>
                </div>
            </div>

            <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="font-size:13px; color:#fff;"><i class="fab fa-markdown"></i> Proposta Comercial Gerada</strong>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="copyPricingProposal()">
                        <i class="far fa-copy"></i> Copiar Proposta
                    </button>
                </div>
                <textarea class="form-control" rows="8" readonly style="font-family:var(--font-mono); font-size:12px; background:#07060e;">${data.proposal_text}</textarea>
            </div>
        `;
    } catch (err) {
        resultBox.innerHTML = `<div style="color:var(--alert-red); padding:20px;">Erro ao calcular preço: ${err.message}</div>`;
    }
};

window.copyPricingProposal = function() {
    if (!lastPricingProposal) return;
    navigator.clipboard.writeText(lastPricingProposal);
    if (typeof showToast === 'function') showToast("Proposta comercial copiada com sucesso!", "success");
};

// ----------------- 10. AGENTES DE IA -----------------
window.loadAIAgentsView = async function() {
    try {
        const res = await fetch('/api/ai/agents');
        const data = await res.json();
        const grid = document.getElementById('ai-agents-grid');
        if (!grid) return;

        if (!data.agents || data.agents.length === 0) {
            grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-muted);">Nenhum agente cadastrado.</div>`;
            return;
        }

        grid.innerHTML = data.agents.map(a => `
            <div style="background:#110e24; border:1px solid var(--border-color); border-radius:12px; padding:18px; display:flex; flex-direction:column; justify-content:space-between; gap:14px;">
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-size:11px; background:rgba(121,40,202,0.25); color:var(--purple-light); border:1px solid rgba(192,132,252,0.3); padding:2px 8px; border-radius:4px; font-weight:700;">
                            ${a.provider} • ${a.model}
                        </span>
                        <span class="badge" style="background:${a.status === 'ativo' ? 'rgba(0,255,136,0.1)' : 'rgba(255,159,28,0.1)'}; color:${a.status === 'ativo' ? 'var(--neon-green)' : 'var(--alert-orange)'};">
                            ${a.status.toUpperCase()}
                        </span>
                    </div>
                    <strong style="font-size:16px; color:#fff; display:block; margin-bottom:4px;">${a.name}</strong>
                    <p style="font-size:12.5px; color:var(--text-secondary); line-height:1.45; margin-bottom:12px;">${a.system_prompt}</p>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(157,78,221,0.15); padding-top:10px;">
                    <div style="font-size:11.5px; color:var(--text-muted);">
                        Prioridade: <strong style="color:var(--neon-cyan);">${a.priority}</strong>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button type="button" class="btn btn-secondary btn-sm" onclick="alert('Prompt do agente:\\n\\n' + '${encodeURIComponent(a.system_prompt)}')">Ver Prompt</button>
                        <button type="button" class="btn btn-secondary btn-sm" style="color:var(--alert-red);" onclick="deleteAIAgentItem(${a.id})"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error("Erro ao carregar agentes:", err);
    }
};

window.openNewAgentModal = function() {
    const m = document.getElementById('modal-new-ai-agent');
    if (m) m.classList.add('active');
};

window.handleCreateAIAgent = async function(e) {
    e.preventDefault();
    const name = document.getElementById('agent-create-name').value.trim();
    const provider = document.getElementById('agent-create-provider').value;
    const model = document.getElementById('agent-create-model').value.trim();
    const system_prompt = document.getElementById('agent-create-prompt').value.trim();

    try {
        const res = await fetch('/api/ai/agents', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name, provider, model, system_prompt, priority: 50, status: 'ativo' })
        });
        const data = await res.json();
        if (data.success) {
            closeModal('modal-new-ai-agent');
            if (typeof showToast === 'function') showToast("Agente cadastrado com sucesso!", "success");
            loadAIAgentsView();
        }
    } catch (err) {
        alert("Erro ao criar agente: " + err.message);
    }
};

window.deleteAIAgentItem = async function(agentId) {
    if (!confirm("Deseja realmente excluir este agente?")) return;
    try {
        await fetch(`/api/ai/agents/${agentId}`, { method: 'DELETE' });
        loadAIAgentsView();
    } catch (err) {
        alert("Erro ao excluir agente: " + err.message);
    }
};

// ----------------- 11. FOLLOW-UPS -----------------
window.loadFollowupsView = async function() {
    try {
        const res = await fetch('/api/ai/followups');
        const data = await res.json();
        const container = document.getElementById('followups-list-container');
        if (!container) return;

        if (!data.followups || data.followups.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:35px; color:var(--text-muted);">
                    <i class="fas fa-project-diagram" style="font-size:28px; opacity:0.4; margin-bottom:10px; display:block;"></i>
                    Nenhum fluxo de follow-up cadastrado ainda.
                </div>
            `;
            return;
        }

        container.innerHTML = data.followups.map(f => `
            <div style="background:#110e24; border:1px solid var(--border-color); border-radius:10px; padding:16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                        <strong style="font-size:14.5px; color:#fff;">${f.name}</strong>
                        <span class="badge" style="background:rgba(0,210,255,0.15); color:var(--neon-cyan);">${f.trigger_type}</span>
                    </div>
                    <div style="font-size:12px; color:var(--text-secondary);">Gatilho automatizado ativo no WhatsApp e CRM</div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="alert('Fluxo ativo monitorando leads sem resposta!')">Testar Fluxo</button>
                    <button type="button" class="btn btn-secondary btn-sm" style="color:var(--alert-red);" onclick="deleteFollowupItem(${f.id})"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error("Erro ao carregar follow-ups:", err);
    }
};

window.applyFollowupTemplate = async function() {
    try {
        await fetch('/api/ai/followups', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name: "Reengajamento 48h com Oferta de Diagnóstico Gratuito",
                trigger_type: "silence_48h",
                conditions: { tempo: "48h" },
                steps: [{ step: 1, action: "whatsapp", message: "Oi {nome}, tudo bem? Temos uma condição especial para iniciar seu site ainda este mês." }]
            })
        });
        if (typeof showToast === 'function') showToast("Modelo de fluxo adicionado com sucesso!", "success");
        loadFollowupsView();
    } catch (err) {
        alert("Erro ao adicionar modelo: " + err.message);
    }
};

window.deleteFollowupItem = async function(flowId) {
    if (!confirm("Remover este fluxo?")) return;
    try {
        await fetch(`/api/ai/followups/${flowId}`, { method: 'DELETE' });
        loadFollowupsView();
    } catch (err) {
        alert("Erro ao deletar fluxo: " + err.message);
    }
};

// ----------------- 12. COFRE DE CONHECIMENTO -----------------
window.loadKnowledgeVault = async function() {
    try {
        const res = await fetch('/api/ai/knowledge');
        const data = await res.json();
        const container = document.getElementById('vault-materials-container');
        if (!container) return;

        if (!data.items || data.items.length === 0) {
            container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-muted);">Nenhum material no acervo.</div>`;
            return;
        }

        container.innerHTML = data.items.map(m => `
            <div class="vault-card">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-file-alt" style="color:var(--neon-cyan); font-size:16px;"></i>
                        <strong style="font-size:14px; color:#fff;">${m.title}</strong>
                    </div>
                    <span class="badge" style="background:rgba(0,255,136,0.1); color:var(--neon-green); font-size:10px;">O agente já sabe</span>
                </div>
                <p style="font-size:12px; color:var(--text-secondary); line-height:1.4; margin:0;">${m.summary || 'Documento preparado para consulta contextual.'}</p>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:11.5px; color:var(--text-muted); border-top:1px solid rgba(157,78,221,0.15); padding-top:8px;">
                    <span>Trechos: <strong style="color:#fff;">${m.chunks_count || 7}</strong></span>
                    <span>Preparado: <strong style="color:#fff;">${m.last_prepared || 'recentemente'}</strong></span>
                </div>
                <div style="display:flex; gap:6px;">
                    <button type="button" class="btn btn-secondary btn-sm" style="flex:1;" onclick="reprepareKnowledgeItem(${m.id})">
                        <i class="fas fa-sync-alt"></i> Preparar de novo
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" style="color:var(--alert-red);" onclick="deleteKnowledgeItem(${m.id})">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error("Erro ao carregar cofre:", err);
    }
};

window.openNewMaterialModal = function() {
    const m = document.getElementById('modal-new-material');
    if (m) m.classList.add('active');
};

window.handleCreateKnowledgeItem = async function(e) {
    e.preventDefault();
    const title = document.getElementById('vault-create-title').value.trim();
    const summary = document.getElementById('vault-create-summary').value.trim();

    try {
        const res = await fetch('/api/ai/knowledge', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ title, summary, source_type: 'document' })
        });
        const data = await res.json();
        if (data.success) {
            closeModal('modal-new-material');
            if (typeof showToast === 'function') showToast("Material indexado no cofre!", "success");
            loadKnowledgeVault();
        }
    } catch (err) {
        alert("Erro ao adicionar material: " + err.message);
    }
};

window.reprepareKnowledgeItem = async function(itemId) {
    try {
        const res = await fetch(`/api/ai/knowledge/${itemId}/reprepare`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            if (typeof showToast === 'function') showToast(data.message, "success");
            loadKnowledgeVault();
        }
    } catch (err) {
        alert("Erro ao reindexar: " + err.message);
    }
};

window.connectGoogleDrive = async function() {
    const folder = prompt("Informe o nome da pasta do Google Drive a ser sincronizada:", "Cofre CRM Comercial");
    if (!folder) return;
    try {
        const res = await fetch('/api/ai/knowledge/connect-drive', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ folder })
        });
        const data = await res.json();
        if (data.success) {
            if (typeof showToast === 'function') showToast(data.message, "success");
        }
    } catch (err) {
        alert("Erro ao conectar Google Drive: " + err.message);
    }
};

window.runCuratorAnalysis = async function() {
    try {
        const res = await fetch('/api/ai/knowledge/analyze-curator', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            const listStr = data.proposals.map(p => `• [${p.topic}]: ${p.suggestion}`).join('\n\n');
            alert(`Curadoria de IA Concluída!\n\nSugestões encontradas:\n\n${listStr}`);
        }
    } catch (err) {
        alert("Erro ao analisar acervo: " + err.message);
    }
};

// ----------------- 13. ANÁLISE & AUDITORIA -----------------
window.loadAnalyticsView = async function() {
    try {
        const [statsRes, auditRes] = await Promise.all([
            fetch('/api/analytics/extended'),
            fetch('/api/audit/logs')
        ]);
        const stats = await statsRes.json();
        const audit = await auditRes.json();

        const revEl = document.getElementById('analytics-revenue');
        const tickEl = document.getElementById('analytics-ticket');
        const comEl = document.getElementById('analytics-comandas-count');
        const taskEl = document.getElementById('analytics-tasks-count');

        if (revEl) revEl.textContent = `R$ ${parseFloat(stats.valor_ganho || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        if (tickEl) tickEl.textContent = `R$ ${parseFloat(stats.ticket_medio || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        if (comEl) comEl.textContent = stats.comandas_abertas || 0;
        if (taskEl) taskEl.textContent = stats.tarefas_pendentes || 0;

        const auditBox = document.getElementById('analytics-audit-log');
        if (auditBox) {
            const logs = audit.logs || [];
            if (logs.length === 0) {
                auditBox.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">Nenhum evento registrado ainda.</div>`;
            } else {
                auditBox.innerHTML = logs.map(l => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:12.5px;">
                        <div>
                            <span style="color:var(--neon-cyan); font-weight:700; margin-right:8px;">[${l.action}]</span>
                            <span style="color:#fff;">${l.details || l.entity_type}</span>
                            <span style="font-size:11px; color:var(--text-muted); margin-left:6px;">por ${l.user_name}</span>
                        </div>
                        <span style="font-size:11px; color:var(--text-muted);">${l.created_at}</span>
                    </div>
                `).join('');
            }
        }
    } catch (err) {
        console.error("Erro ao carregar análise:", err);
    }
};

// ========================================================
// 15. MÓDULO: DISPARADOR AUTOMÁTICO DE ABORDAGEM B2B
// ========================================================

let isDisparadorActive = false;

window.loadDisparadorView = async function() {
    // 1. Carregar métricas
    try {
        const res = await fetch('/api/disparador/stats');
        const data = await res.json();
        if (document.getElementById('disp-metric-ready')) {
            document.getElementById('disp-metric-ready').textContent = data.leads_with_phone || 0;
        }
        if (document.getElementById('disp-metric-contacted')) {
            document.getElementById('disp-metric-contacted').textContent = data.leads_contatados || 0;
        }
        if (document.getElementById('disp-metric-campaigns')) {
            document.getElementById('disp-metric-campaigns').textContent = data.total_campaigns || 0;
        }
    } catch (e) {
        console.warn("Falha ao carregar métricas do disparador:", e);
    }

    // 2. Atualizar status da conexão WAHA
    const wahaBadge = document.getElementById('disp-waha-badge');
    const wahaText = document.getElementById('disp-waha-status-text');
    if (wahaBadge && wahaText) {
        if (typeof wahaCurrentStatus !== 'undefined' && wahaCurrentStatus === 'WORKING') {
            wahaBadge.style.borderColor = 'var(--neon-green)';
            wahaBadge.style.color = 'var(--neon-green)';
            wahaBadge.style.background = 'rgba(0,255,136,0.12)';
            wahaText.textContent = 'ONLINE';
        } else if (typeof wahaCurrentStatus !== 'undefined' && wahaCurrentStatus === 'SCAN_QR_CODE') {
            wahaBadge.style.borderColor = 'var(--alert-orange)';
            wahaBadge.style.color = 'var(--alert-orange)';
            wahaBadge.style.background = 'rgba(255,179,0,0.12)';
            wahaText.textContent = 'AGUARDANDO QR CODE';
        } else {
            wahaBadge.style.borderColor = 'var(--alert-red)';
            wahaBadge.style.color = 'var(--alert-red)';
            wahaBadge.style.background = 'rgba(255,59,87,0.12)';
            wahaText.textContent = 'DESCONECTADO';
        }
    }

    // 3. Preencher seletor de lead de simulação
    const sampleSelect = document.getElementById('disp-sample-lead-select');
    if (sampleSelect && Array.isArray(currentLeads) && currentLeads.length > 0) {
        sampleSelect.innerHTML = currentLeads.slice(0, 15).map((l) => `
            <option value="${l.id}">${escapeHtml(l.name.substring(0, 22))}</option>
        `).join('');
    }

    if (typeof updateDisparadorAudienceCount === 'function') updateDisparadorAudienceCount();
    if (typeof updateDisparadorPreview === 'function') updateDisparadorPreview();
};

window.insertTagIntoDisparador = function(tag) {
    const textarea = document.getElementById('disparador-template');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    textarea.value = text.substring(0, start) + tag + text.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + tag.length;
    textarea.focus();
    updateDisparadorPreview();
};

window.currentDisparadorSection = 'contato';

window.disparadorSectionTemplates = {
    'contato': {
        name: '1º Contato (Google Maps)',
        badge: 'ETAPA 1',
        nextStage: 'follow1',
        targetGroup: 'stage-contato',
        template: `{Olá|Oi|Olá tudo bem?}, [{primeiro_nome}]! Tudo bem? Vi o perfil de vocês no Google Maps e gostei muito do projeto da [{empresa}]!\n\nTrabalho ajudando empresas da área de [PUBLICO_ALVO] a se destacarem e atraírem mais clientes pela internet. Quem costuma cuidar dessa parte comercial ou de presença digital por aí?\n\nSe preferir não receber mensagens, é só me avisar.`
    },
    'follow1': {
        name: 'Follow 1 (Proposta Sem Custo)',
        badge: 'ETAPA 2',
        nextStage: 'follow2',
        targetGroup: 'stage-follow1',
        template: `{Olá|Oi}, [{primeiro_nome}]! Tudo bem?\n\nPassando para compartilhar uma proposta prática: analisamos o posicionamento da [{empresa}] e preparamos um estudo com informações de estrutura para um site moderno, rápido e otimizado para o Google.\n\nO melhor de tudo: esse diagnóstico e a prévia do projeto são 100% sem custo e sem compromisso nenhum! Posso te enviar os detalhes aqui por WhatsApp?\n\nSe preferir não receber mensagens, é só me avisar.`
    },
    'follow2': {
        name: 'Follow 2 (Cobrança & Prévia)',
        badge: 'ETAPA 3',
        nextStage: 'proposta',
        targetGroup: 'stage-follow2',
        template: `{Oi|Olá}, [{primeiro_nome}]! Tudo bom?\n\nPassando rapidinho só para saber se você conseguiu ver minha mensagem anterior sobre a proposta para a [{empresa}].\n\nPosso te enviar uma prévia visual de como ficaria a presença digital de vocês no celular e no Google? Leva menos de 2 minutos para dar uma olhada e você já consegue ver na prática!\n\nMe avisa se fizer sentido. Um abraço!\n\nSe preferir não receber mensagens, é só me avisar.`
    }
};

window.selectDisparadorSection = function(sectionKey) {
    const section = window.disparadorSectionTemplates[sectionKey];
    if (!section) return;

    window.currentDisparadorSection = sectionKey;

    // Atualiza cards visuais da seção
    document.querySelectorAll('.disp-section-card').forEach(c => c.classList.remove('active'));
    const activeCard = document.getElementById(`sec-card-${sectionKey}`);
    if (activeCard) activeCard.classList.add('active');

    // Atualiza badge de seção ativa no topo
    const pill = document.getElementById('disp-active-section-pill');
    if (pill) {
        pill.textContent = `Seção Ativa: ${section.name}`;
    }

    // Carrega o template correspondente
    const templateInput = document.getElementById('disparador-template');
    if (templateInput) {
        templateInput.value = section.template;
    }

    // Atualiza o target group do disparador automaticamente para corresponder à etapa
    const targetSelect = document.getElementById('disparador-target-group');
    if (targetSelect) {
        targetSelect.value = section.targetGroup;
    }

    // Atualiza audiência e prévia no smartphone
    updateDisparadorAudienceCount();
    updateDisparadorPreview();

    if (typeof showToast === 'function') {
        showToast(`Seção ativa: "${section.name}". Script e audiência carregados!`, 'info');
    }
};

window.applyDisparadorPreset = function(type) {
    if (window.disparadorSectionTemplates && window.disparadorSectionTemplates[type]) {
        selectDisparadorSection(type);
        return;
    }

    const textarea = document.getElementById('disparador-template');
    if (!textarea) return;

    if (type === 'image' || type === 'contato') {
        selectDisparadorSection('contato');
        return;
    } else if (type === 'sem_site') {
        textarea.value = `[{saudacao}], [{primeiro_nome}]! Vi a [{empresa}] no Google Maps e gostei muito da estrutura de vocês.\n\nNotei que atualmente vocês não possuem um site oficial cadastrado no Google.\n\nTrabalhamos com modernização de presença digital para [PUBLICO_ALVO] e criamos páginas rápidas para celular com botão direto para WhatsApp.\n\nPosso enviar uma demonstração visual do site de vocês sem custo nenhum?\n\nSe preferir não receber mensagens, é só me avisar.`;
    } else if (type === 'redesign') {
        textarea.value = `[{saudacao}], [{primeiro_nome}]! Vi a [{empresa}] no Google Maps e estava analisando a presença digital de vocês em [{cidade}].\n\nIdentifiquei melhorias imediatas para acelerar o carregamento no celular e dobrar a captação de clientes no WhatsApp.\n\nGostaria de receber um diagnóstico rápido com informações de estrutura sem custo?\n\nSe preferir não receber mensagens, é só me avisar.`;
    }
    updateDisparadorPreview();
    showToast("Template carregado!", "info");
};

window.toggleDisparadorOptOut = function() {
    updateDisparadorPreview();
};

window.updateDisparadorPreview = function() {
    const template = document.getElementById('disparador-template') ? document.getElementById('disparador-template').value : '';
    const sampleSelect = document.getElementById('disp-sample-lead-select');
    let sampleLead = null;

    if (sampleSelect && sampleSelect.value && Array.isArray(currentLeads)) {
        const id = parseInt(sampleSelect.value);
        sampleLead = currentLeads.find(l => l.id === id);
    }
    if (!sampleLead && Array.isArray(currentLeads) && currentLeads.length > 0) {
        sampleLead = currentLeads[0];
    }
    if (!sampleLead) {
        sampleLead = {
            name: 'Clínica Odonto Prime',
            address: 'Av. Paulista, 1000 - São Paulo - SP',
            category: 'Odontologia & Saúde',
            has_website: 0,
            website: '',
            whatsapp: '11999998888',
            phone: '11999998888'
        };
    }

    const resolved = buildPersonalizedMessage(sampleLead, template);
    const mockupText = document.getElementById('disp-mockup-text');
    if (mockupText) {
        mockupText.textContent = resolved;
    }

    const contactName = document.getElementById('disp-mockup-contact-name');
    if (contactName) {
        contactName.textContent = sampleLead.name || 'Contato da Empresa';
    }

    const timeSpan = document.getElementById('disp-mockup-time');
    if (timeSpan) {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        timeSpan.textContent = `${hh}:${mm}`;
    }
};

window.updateDisparadorAudienceCount = function() {
    const groupSelect = document.getElementById('disparador-target-group');
    const summary = document.getElementById('disparador-audience-summary');
    if (!groupSelect || !summary) return;

    const group = groupSelect.value;
    const leadsToCount = window.getLeadsForAudienceGroup(group);

    const descriptions = {
        'novos': `📥 <strong>${leadsToCount.length} novo(s) lead(s)</strong> (nunca abordados) prontos para abordagem comercial.`,
        'stage-contato': `📞 <strong>${leadsToCount.length} lead(s)</strong> na etapa '1º Contato'.`,
        'stage-follow1': `🔄 <strong>${leadsToCount.length} lead(s)</strong> na etapa 'Follow-up 1' (reforço de valor).`,
        'stage-follow2': `⏰ <strong>${leadsToCount.length} lead(s)</strong> na etapa 'Follow-up 2' (cobrança & prévia).`,
        'stage-follow-todos': `🔁 <strong>${leadsToCount.length} lead(s)</strong> em Follow-up (Follow 1 + Follow 2).`,
        'stage-proposta': `📑 <strong>${leadsToCount.length} lead(s)</strong> com proposta em negociação.`,
        'no-site': `🔥 <strong>${leadsToCount.length} lead(s) SEM SITE</strong> (oportunidades quentes de venda).`,
        'with-site': `🌐 <strong>${leadsToCount.length} lead(s) COM SITE</strong> (proposta de modernização).`,
        'selection': `🎯 <strong>${leadsToCount.length} lead(s)</strong> marcados na tabela prontos para disparo.`,
        'all-whatsapp': `📱 <strong>${leadsToCount.length} lead(s)</strong> cadastrados com WhatsApp.`
    };

    summary.innerHTML = descriptions[group] || `📱 <strong>${leadsToCount.length} lead(s)</strong> prontos para disparo.`;
};

function appendDisparadorLog(msg, type = 'info') {
    const consoleBox = document.getElementById('disparador-console-logs');
    if (!consoleBox) return;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const entry = document.createElement('div');
    entry.className = `log-${type}`;
    entry.textContent = `[${timeStr}] ${msg}`;
    consoleBox.appendChild(entry);
    consoleBox.scrollTop = consoleBox.scrollHeight;
}

window.clearDisparadorLogs = function() {
    const consoleBox = document.getElementById('disparador-console-logs');
    if (consoleBox) consoleBox.innerHTML = '';
};

window.handleStartDisparador = async function() {
    const group = document.getElementById('disparador-target-group').value;
    const targetLeads = window.getLeadsForAudienceGroup(group);

    if (targetLeads.length === 0) {
        showToast("Nenhum lead com telefone/WhatsApp encontrado para o grupo selecionado.", "warning");
        return;
    }

    const minSec = parseInt(document.getElementById('disp-delay-min').value) || 15;
    const maxSec = parseInt(document.getElementById('disp-delay-max').value) || 35;

    // Define para qual etapa o lead vai avançar
    const activeSectionKey = window.currentDisparadorSection || 'contato';
    const sectionDef = window.disparadorSectionTemplates[activeSectionKey];
    let nextStage = sectionDef ? sectionDef.nextStage : 'follow1';
    if (group === 'novos') nextStage = 'contato';
    else if (group === 'stage-contato') nextStage = 'follow1';
    else if (group === 'stage-follow1') nextStage = 'follow2';
    else if (group === 'stage-follow2') nextStage = 'proposta';
    else if (group === 'stage-follow-todos') nextStage = 'follow2';
    else if (group === 'stage-proposta') nextStage = 'proposta';

    if (!confirm(`Iniciar disparo automático da seção "${sectionDef ? sectionDef.name : 'Geral'}" para ${targetLeads.length} leads?\n\nApós o envio bem-sucedido, os leads avançarão automaticamente para a etapa: "${nextStage}".\nDelay anti-banimento configurado: ${minSec}s a ${maxSec}s.`)) {
        return;
    }

    isDisparadorActive = true;
    const customTemplate = document.getElementById('disparador-template').value;
    const startBtn = document.getElementById('btn-start-disparador');
    const stopBtn = document.getElementById('btn-stop-disparador');
    const statusContainer = document.getElementById('disparador-status-container');
    const progressBar = document.getElementById('disparador-progress-bar');
    const progressText = document.getElementById('disparador-progress-text');
    const countdownText = document.getElementById('disparador-countdown-text');

    const origHtml = startBtn.innerHTML;
    startBtn.disabled = true;
    if (stopBtn) stopBtn.style.display = 'inline-flex';
    if (statusContainer) statusContainer.style.display = 'block';

    let successCount = 0;
    let failCount = 0;
    const total = targetLeads.length;

    appendDisparadorLog(`🚀 Iniciando campanha da seção "${sectionDef ? sectionDef.name : 'Geral'}" (${total} leads)...`, 'info');

    try {
        for (let i = 0; i < total; i++) {
            if (!isDisparadorActive) {
                appendDisparadorLog("🛑 Disparo interrompido pelo usuário.", "warn");
                break;
            }

            const lead = targetLeads[i];
            const currentIdx = i + 1;
            const pct = Math.round((currentIdx / total) * 100);

            if (progressBar) progressBar.style.width = `${pct}%`;
            if (progressText) progressText.textContent = `Progresso: ${currentIdx} de ${total} (${pct}%)`;
            if (countdownText) countdownText.textContent = `Enviando para ${lead.name}...`;

            startBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Enviando (${currentIdx}/${total})...`;

            const message = buildPersonalizedMessage(lead, customTemplate);
            const success = await sendSingleWhatsApp(lead, message, nextStage);

            if (success) {
                successCount++;
                appendDisparadorLog(`✅ Enviado para "${lead.name}" (${lead.whatsapp || lead.phone}) -> Avançado para [${nextStage}]`, 'success');
            } else {
                failCount++;
                appendDisparadorLog(`❌ Falha no envio para "${lead.name}"`, 'error');
            }

            // Aguarda delay humano se houver próximo
            if (i < total - 1 && isDisparadorActive) {
                const randomDelayMs = Math.floor(Math.random() * ((maxSec - minSec) * 1000 + 1)) + (minSec * 1000);
                const delaySecs = Math.round(randomDelayMs / 1000);

                appendDisparadorLog(`⏳ Aguardando delay anti-banimento de ${delaySecs}s antes do próximo contato...`, 'info');

                let remaining = delaySecs;
                while (remaining > 0 && isDisparadorActive) {
                    if (countdownText) countdownText.textContent = `Delay anti-ban: ${remaining}s...`;
                    startBtn.innerHTML = `<i class="fas fa-clock"></i> Aguardando ${remaining}s (${currentIdx}/${total})...`;
                    await new Promise(r => setTimeout(r, 1000));
                    remaining--;
                }
            }
        }

        // Salva histórico de campanha no banco
        try {
            const campName = sectionDef ? `Disparo Automático - ${sectionDef.name} (${new Date().toLocaleDateString('pt-BR')})` : `Campanha Automática ${new Date().toLocaleDateString('pt-BR')}`;
            await fetch('/api/disparador/campaign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: campName,
                    template: customTemplate,
                    target_group: group,
                    total_leads: total,
                    sent_count: successCount,
                    failed_count: failCount,
                    status: isDisparadorActive ? 'concluido' : 'pausado'
                })
            });
        } catch (e) {
            console.warn("Falha ao registrar log da campanha:", e);
        }

        showToast(`Disparos da seção finalizados! ${successCount} enviados com sucesso e avançados no funil.`, successCount > 0 ? 'success' : 'warning', 7000);
        appendDisparadorLog(`🏁 Campanha finalizada: ${successCount} entregues, ${failCount} falhas.`, 'success');

    } catch (err) {
        showToast(`Erro durante o disparo: ${err.message}`, 'error');
        appendDisparadorLog(`Erro crítico: ${err.message}`, 'error');
    } finally {
        isDisparadorActive = false;
        startBtn.disabled = false;
        startBtn.innerHTML = origHtml;
        if (stopBtn) stopBtn.style.display = 'none';
        if (countdownText) countdownText.textContent = 'Concluído';
        if (typeof loadDisparadorView === 'function') loadDisparadorView();
    }
};

window.handleStopDisparador = function() {
    isDisparadorActive = false;
    showToast("Interrupção solicitada. O envio será pausado no próximo ciclo.", "warning");
    appendDisparadorLog("Interrupção solicitada pelo usuário.", "warn");
};

window.handleDisparadorTestSend = async function() {
    if (window.wahaCurrentStatus && window.wahaCurrentStatus !== 'WORKING') {
        showToast("WhatsApp não conectado. Aponte a câmera no QR Code para conectar antes de testar.", "warning");
        if (typeof openWahaQrModal === 'function') openWahaQrModal();
        return;
    }

    const template = document.getElementById('disparador-template') ? document.getElementById('disparador-template').value : '';
    if (!template) {
        showToast("O template da abordagem não pode estar vazio.", "warning");
        return;
    }

    const sampleSelect = document.getElementById('disp-sample-lead-select');
    let sampleLead = null;
    if (sampleSelect && sampleSelect.value && Array.isArray(currentLeads)) {
        const id = parseInt(sampleSelect.value);
        sampleLead = currentLeads.find(l => l.id === id);
    }
    if (!sampleLead && Array.isArray(currentLeads) && currentLeads.length > 0) {
        sampleLead = currentLeads[0];
    }
    if (!sampleLead) {
        sampleLead = {
            name: 'Clínica Odonto Prime',
            address: 'Av. Paulista, 1000 - São Paulo - SP',
            category: 'Odontologia',
            has_website: 0,
            website: ''
        };
    }

    const text = buildPersonalizedMessage(sampleLead, template);

    let defaultNum = '12988801327';
    if (typeof activeChatLead !== 'undefined' && activeChatLead && (activeChatLead.whatsapp || activeChatLead.phone)) {
        defaultNum = activeChatLead.whatsapp || activeChatLead.phone;
    }
    const destPhone = prompt("Digite o número de WhatsApp (com DDD) para receber este disparo de teste agora:", defaultNum);
    if (!destPhone) return;

    const chatId = formatWhatsAppChatId(destPhone);
    if (!chatId) {
        showToast("Número inválido. Digite DDD + número (ex: 12988801327).", "error");
        return;
    }

    appendDisparadorLog(`📤 Disparando mensagem de teste para ${chatId}...`, 'info');
    showToast(`Enviando mensagem de teste para ${chatId}...`, 'info');

    try {
        const res = await fetch('/api/waha/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId: chatId,
                text: text,
                lead_id: sampleLead.id || null
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast("✅ Mensagem de teste entregue com sucesso no WhatsApp!", "success");
            appendDisparadorLog(`✅ Teste entregue com sucesso para ${chatId}!`, 'success');
        } else {
            if (data.qr_required && typeof openWahaQrModal === 'function') {
                openWahaQrModal();
            }
            showToast(`❌ Falha no envio: ${data.error || 'Erro desconhecido'}`, "error");
            appendDisparadorLog(`❌ Falha no teste para ${chatId}: ${data.error || 'Erro'}`, 'error');
        }
    } catch (err) {
        showToast(`Erro na requisição: ${err.message}`, "error");
        appendDisparadorLog(`Erro de conexão no teste: ${err.message}`, 'error');
    }
};





