# 🚀 Guia de Deploy & Upload — Kaptador B2B Leads App

Este documento orienta como subir o projeto para o **GitHub**, hospedá-lo na **Vercel** ou plataformas de serviços contínuos (**Render / Railway**), e integrar ao **Supabase**.

---

## 1. 🐙 GitHub (Passo a Passo)

O repositório local já está inicializado e commitado na branch `main`. Para subir no seu GitHub:

1. Acesse [github.com/new](https://github.com/new) e crie um novo repositório (exemplo: `leads_app` ou `kaptador-leads`).
2. **Não** marque para inicializar com README ou .gitignore (já temos tudo pronto localmente).
3. No seu terminal na pasta do projeto, execute:
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
   git branch -M main
   git push -u origin main
   ```

---

## 2. ⚡ Vercel (Hospedagem Web Serverless)

O projeto já contém o arquivo [`vercel.json`](file:///d:/sites-vibe-code/leads_app/vercel.json) configurado para FastAPI via `@vercel/python`.

1. Acesse [vercel.com](https://vercel.com) e conecte sua conta do GitHub.
2. Clique em **"Add New"** > **"Project"** e selecione o repositório `leads_app`.
3. Em **Environment Variables**, adicione (opcionalmente):
   - `AUTH_REQUIRED`: `false` (ou `true` se quiser tela de login)
   - `SECRET_KEY`: uma chave aleatória para segurança de sessões
   - `APIFY_TOKEN`: seu token Apify (se utilizar)
   - `GOOGLE_PLACES_API_KEY`: sua chave Google Places (se utilizar)
4. Clique em **Deploy**.

> ⚠️ **Nota Importante sobre a Vercel:** Como a Vercel funciona com funções serverless efêmeras com tempo limite (timeout de 10-60s) e sistema de arquivos somente-leitura, operações de scraping muito longas ou o SQLite local são reiniciados a cada ciclo. Para rodar com persistência total ou integrar o container WAHA (WhatsApp), recomendamos **Render** ou **Railway**.

---

## 3. 🐘 Supabase (Banco de Dados em Nuvem)

Se quiser usar banco de dados PostgreSQL na nuvem:

1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. Acesse o menu **SQL Editor** no painel do Supabase.
3. Abra e copie todo o conteúdo do arquivo [`supabase_schema.sql`](file:///d:/sites-vibe-code/leads_app/supabase_schema.sql) do projeto.
4. Cole no editor e clique em **Run**.
5. Todas as tabelas (`scans`, `leads`, `users`, `sessions`, `messages`, `settings`) e índices serão criados instantaneamente.

---

## 4. 🚢 Render ou Railway (Recomendado para FastAPI + WAHA WhatsApp)

Essas plataformas suportam instâncias contínuas (sem timeout de serverless) e Docker Compose:

### Opção A: Render.com
1. O arquivo [`render.yaml`](file:///d:/sites-vibe-code/leads_app/render.yaml) e o [`Dockerfile`](file:///d:/sites-vibe-code/leads_app/Dockerfile) já estão prontos.
2. No [render.com](https://render.com), crie um **Web Service** conectado ao seu GitHub.
3. Runtime: **Python 3** ou **Docker**.
4. Start Command: `uvicorn app:app --host 0.0.0.0 --port $PORT`

### Opção B: Railway.app / Docker
1. Conecte o repositório no Railway. Ele detectará automaticamente o [`Dockerfile`](file:///d:/sites-vibe-code/leads_app/Dockerfile) e o [`docker-compose.yml`](file:///d:/sites-vibe-code/leads_app/docker-compose.yml).
2. O serviço WAHA e o Leads App sobem juntos com um clique.
