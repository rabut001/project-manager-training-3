FROM mcr.microsoft.com/devcontainers/javascript-node:24-bookworm

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv tesseract-ocr tesseract-ocr-jpn poppler-utils \
    fonts-noto-cjk gh \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt /tmp/pm-requirements.txt
RUN python3 -m venv /opt/pm-python \
    && /opt/pm-python/bin/pip install --no-cache-dir -r /tmp/pm-requirements.txt
ENV PATH="/opt/pm-python/bin:${PATH}"
USER node
