# Agentic Data Connection Layer (DCL)

## Overview
An intelligent system that autonomously discovers data sources from multiple enterprise systems, uses AI to map them to a predefined ontology, validates mappings with quality checks, and automatically publishes DuckDB views. Features a real-time web dashboard with interactive data flow graphs and AI-powered schema inference.

## Recent Changes (October 2, 2025)
- ✅ **Schema Inference UI Integration**: Added "Invent Schema (Demo Mode)" section to dashboard allowing users to create custom fields and get AI-powered ontology mappings
- ✅ **API Proxy Layer**: Created `/api/infer` proxy endpoint in FastAPI to forward inference requests from browser to Node.js inference server
- ✅ **Dual-Server Architecture**: Python FastAPI (port 5000) for dashboard + Node.js Express (port 3000) for Gemini inference
- ✅ **Fixed Gemini Integration**: Updated to `gemini-2.5-pro` model with markdown code block stripping

## Project Architecture

### Backend Services
1. **FastAPI Server** (`app.py`, port 5000)
   - Main web dashboard with Cytoscape.js graph visualization
   - Ontology mapping engine with LLM-enhanced heuristics
   - DuckDB view management and data preview
   - Proxy endpoint for schema inference API

2. **Inference Server** (`inference-server.js`, port 3000)
   - Node.js Express server with Gemini 2.5 Pro integration
   - Intelligent schema-to-ontology mapping via `/api/infer` endpoint
   - Handles markdown-wrapped JSON responses from Gemini

### Data Sources
- **schemas/** directory contains sample schemas from:
  - Dynamics CRM
  - Salesforce
  - SAP ERP
  - NetSuite
  - Legacy SQL Server
  - Snowflake

### Ontology
- **ontology/catalog.yml** - Predefined enterprise ontology with entity definitions

## User Preferences
- **AI Provider**: Gemini API (GEMINI_API_KEY environment variable)
- **Model**: `gemini-2.5-pro` (not `gemini-pro` which is retired)
- **Design Constraint**: Preserve existing GUI, add new features as separate sections

## Technical Details
- **Gemini Response Handling**: Strip markdown code blocks with `.replace(/```json\n?|\n?```/g, '')`
- **ES Modules**: package.json configured with `"type": "module"` for Node.js
- **Join Edges**: Filtered from visualization (type='join') but tracked internally
- **Auto-Ingest Mode**: Toggle between Strict Mode (curated only) and Inclusive Mode (auto-connect unmapped sources to gray "Unclassified" node)

## Environment Variables
- `GEMINI_API_KEY` - Required for AI-powered schema inference
- `GITHUB_TOKEN` - Stored in Replit secrets for repository access

## Repository
https://github.com/ilyacantor/AgenticDataConnect.git

## Known Issues
- Git operations may occasionally fail due to Replit background process locks (.git/config.lock)
