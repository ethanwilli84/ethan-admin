FROM python:3.11-slim

# Lean image for DO App Platform Cron Job. No GTK / WeasyPrint — HTML-only.
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app/

CMD ["python", "/app/run.py"]
