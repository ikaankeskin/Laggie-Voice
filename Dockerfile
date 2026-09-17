FROM python:3.11-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY frontend ./frontend

ENV HF_HOME=/app/.cache/huggingface \
    XDG_DATA_HOME=/app/.cache/xdg-data \
    XDG_CACHE_HOME=/app/.cache/xdg-cache \
    XDG_CONFIG_HOME=/app/.cache/xdg-config \
    ARGOS_DEVICE_TYPE=cpu

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
