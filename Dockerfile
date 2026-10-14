# Dockerfile para Hospedagem Online - Leads Harvester & CRM B2B
FROM python:3.11-slim

# Evita buffers no log e arquivos .pyc
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

WORKDIR /app

# Instala dependências de compilação mínimas e utilitários
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copia e instala requirements primeiro (para cache do Docker)
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copia todo o código-fonte da aplicação
COPY . /app/

# Garante pasta de dados/banco com permissões corretas
RUN mkdir -p /app/data /app/waha-sessions

# Expõe porta padrão (pode ser sobrescrita pela variável $PORT no Render/Railway/Fly)
EXPOSE 8000

# Executa o servidor ASGI Uvicorn vinculando à porta dinâmica de nuvem
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
