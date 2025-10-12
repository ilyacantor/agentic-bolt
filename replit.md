# Agentic Data Connection Layer (DCL)

## Overview
An intelligent system that autonomously discovers data sources from multiple enterprise systems, uses AI to map them to a predefined ontology, validates mappings with quality checks, and automatically publishes DuckDB views. Features a real-time web dashboard with interactive data flow graphs and AI-powered schema inference.

## Recent Changes (October 12, 2025)
- ✅ **Reserved VM Deployment**: Switched to Reserved VM for sufficient disk space with ML dependencies
  - Removed duplicate dependencies from requirements.txt (chromadb, sentence-transformers, langchain-community were listed twice)
  - Removed unused sift-stack-py dependency
  - Configured build step with `--no-cache-dir` flag and cache purging to prevent disk quota exceeded errors
  - Switched to CPU-only torch installation (saves ~10GB over CUDA version - 184MB vs 888MB+594MB CUDA libs)
  - Build command: `pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu && rm -rf ~/.cache/pip && pip install --no-cache-dir -r requirements.txt && rm -rf ~/.cache/pip`
  - Run command: `uvicorn app:app --host 0.0.0.0 --port 5000`
  - Deployment target: `vm` (Reserved VM - suitable for stateful apps with persistent ChromaDB vector store)
  - All dependencies installed successfully with CPU-only torch
  - RAG Engine, ChromaDB, and sentence-transformers working correctly in development and production

- ✅ **Layout Reorganization**: Improved dashboard flow and visual consistency
  - Progress indicator always visible at top of right sidebar (shows idle/active state)
  - Narration moved to right sidebar with bounding box and scroll bar
  - Source/Unified Previews relocated to "Notes" section below graph in compact format
  - RAG Learning Engine visual identity updated with teal/cyan color scheme

- ✅ **Processing Progress Indicator**: Staged progress bar with persistence
  - Shows clear stages: Connecting (20%) → Analyzing (40%) → Mapping (70%) → Validating (90%) → Complete (100%)
  - Persists after completion with green checkmark
  - Always visible with "No active processing" when idle
  - Clean design without heavy borders, matching visual identity

- ✅ **RAG Engine Implementation**: Added context-aware, learning-based schema mapping with historical memory
  - Uses ChromaDB + Sentence Transformers (all-MiniLM-L6-v2, 384-dim embeddings)
  - Retrieves top 5 similar mappings as context for LLM inference
  - Automatically stores successful mappings for future reference
  - Persists to ./chroma_db directory with cosine similarity search
  - Fixed critical prompt construction bug that broke LLM workflow when RAG context existed
  - Visual RAG panel in left sidebar shows retrieved mappings with similarity scores

## Previous Changes (October 2, 2025)
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
   - RAG Engine integration for context-aware schema mapping
   - Python-only architecture (no Node.js dependencies)

2. **RAG Engine** (`rag_engine.py`)
   - ChromaDB vector store with persistent storage
   - Sentence Transformers embeddings (all-MiniLM-L6-v2, 384 dimensions)
   - Stores field-level mapping history with metadata
   - Retrieves top 5 similar mappings via cosine similarity
   - Provides historical context to LLM for improved accuracy
   - Works with CPU-only torch for reduced disk footprint

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

### RAG Workflow
1. **Field Embedding**: For each source field, generate 384-dim embedding using Sentence Transformers
2. **Context Retrieval**: Search ChromaDB for top 5 most similar historical mappings (cosine similarity)
3. **Enhanced Prompting**: Inject retrieved mappings as context into LLM prompt
4. **Mapping Inference**: LLM generates ontology mappings with improved accuracy
5. **Storage**: Successful mappings stored in vector database for future reference
6. **API Endpoint**: `/rag/stats` shows total mappings, collection info, and embedding model

### Other Technical Details
- **Gemini Response Handling**: Strip markdown code blocks with `.replace(/```json\n?|\n?```/g, '')`
- **ES Modules**: package.json configured with `"type": "module"` for Node.js
- **Join Edges**: Filtered from visualization (type='join') but tracked internally
- **Auto-Ingest Mode**: Toggle between Strict Mode (curated only) and Inclusive Mode (auto-connect unmapped sources to gray "Unclassified" node)
- **Persistent Vector Store**: ChromaDB data stored in ./chroma_db directory (gitignored)

## Environment Variables
- `GEMINI_API_KEY` - Required for AI-powered schema inference
- `GITHUB_TOKEN` - Stored in Replit secrets for repository access

## Repository
https://github.com/ilyacantor/AgenticDataConnect.git

## Known Issues
- Git operations may occasionally fail due to Replit background process locks (.git/config.lock)
