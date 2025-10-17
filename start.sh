#!/bin/bash
# Deployment startup script - installs dependencies and starts the server
python3 -m pip install --break-system-packages --no-cache-dir -r requirements.txt 2>/dev/null
python3 -m uvicorn app:app --host 0.0.0.0 --port 5000
