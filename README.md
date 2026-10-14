# 🚀 ANTIGRAVITY — B2B Lead Harvester & Web Sales Engine

Aplicação web completa, moderna e responsiva voltada para a busca, raspagem profunda (deep scraping) e organização de leads B2B para prospecção de vendas de sites.

---

## 🎨 Design & Interface
- **Tema Cyberpunk High-Tech (Dark Theme):** Paleta inspirada em interfaces futuristas com roxo escuro (`#0d081e`), azul-marinho (`#0c1328`), acentos verde-neon (`#00ff88`) e ciano (`#00d2ff`).
- **Cards Glassmorphism & Micro-interações:** Bordas sutis com iluminação neon, blur e transições fluidas.
- **Barra Lateral com Navegação Completa:**
  1. **Dashboard:** Métricas chave, indicadores de oportunidades, histórico de buscas recentes e dicas de abordagem.
  2. **Varredura de Leads:** Formulário com Nicho e Localização, barra de progresso em tempo real (Server-Sent Events) e tabela interativa de leads.
  3. **Campanhas & CRM:** Pipeline Kanban para gerenciar os contatos (Novos Leads ➔ Em Contato ➔ Proposta Enviada ➔ Fechados).
  4. **Configurações:** Delays anti-bloqueio, limites de busca, rotação de User-Agents, chaves opcionais de API e personalização de scripts de abordagem.

---

## ⚡ Recursos Funcionais

### 1. Varredura com Progresso em Tempo Real (SSE)
- Barra de carregamento dinâmica exibindo a porcentagem exata (0% a 100%).
- Terminal/Console de logs estilo hacker exibindo cada etapa em tempo real.

### 2. Deep Scraping de Contatos
- **WhatsApp:** Extração por links (`wa.me`, `api.whatsapp.com`) e padrões de celulares brasileiros com 9 dígitos e DDD.
- **E-mails:** Captura de e-mails corporativos e de contato (`contato@...`, `comercial@...`, etc.) com exclusão de arquivos de imagem e assets.
- **Destaque Alerta "Sem Site / Precisa de Site":** Alerta pulsante em vermelho/laranja destacando os leads que não possuem site cadastrado ou com site inacessível (principal público-alvo para venda de desenvolvimento web!).

### 3. Tabela Interativa de Resultados
- **Filtros Instantâneos:** "Todos", "Sem Site (Oportunidades)", "Com WhatsApp", "Com E-mail".
- **Busca em tempo real:** Filtragem por nome, telefone ou endereço.
- **Ações Rápidas:** Botão para abrir conversa no WhatsApp com script de vendas pronto e botão "Detalhes" para análise completa do lead.

### 4. Gerador de Pitch de Vendas B2B
- No modal de detalhes de cada lead, o sistema gera automaticamente um script persuasivo de abordagem adaptado à situação da empresa (se não tem site ou se precisa de modernização).

### 5. Exportação de Dados
- **CSV:** Download estruturado compatível com Excel, Google Planilhas e CRMs.
- **Excel (.xlsx):** Planilha nativa formatada e organizada.

---

## 🛠️ Como Executar

### Opção 1: Iniciar com o script pronto (Windows)
Basta dar um duplo clique no arquivo:
```
start.bat
```

### Opção 2: Via Terminal
```powershell
# Ativar ambiente virtual
.venv\Scripts\activate

# Executar a aplicação
uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

Acesse no navegador:
👉 **http://127.0.0.1:8000**
