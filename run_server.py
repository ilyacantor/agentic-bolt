#!/usr/bin/env python3
import subprocess
import sys

# Install dependencies
subprocess.call([sys.executable, "-m", "pip", "install", "--break-system-packages", "--quiet",
                 "uvicorn", "fastapi", "pyyaml", "duckdb", "pandas", "google-generativeai",
                 "python-dotenv", "pinecone", "rapidfuzz"])

# Run uvicorn
subprocess.call([sys.executable, "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000"])
