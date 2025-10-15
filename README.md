# Agentic Data Connection Layer (DCL)

## Overview
The Agentic Data Connection Layer (DCL) is an intelligent system that autonomously discovers and maps data sources from various enterprise systems to a predefined ontology using AI. It validates these mappings through quality checks and automatically publishes them as DuckDB views.

🔗 **Live Demo**: [agenticdataconnectsankey.onrender.com](https://agenticdataconnectsankey.onrender.com)

## Features

### 🎯 Core Capabilities
- **Multi-Source Integration**: Connects Dynamics, Salesforce, SAP, NetSuite, Snowflake, Legacy SQL, Supabase, MongoDB
- **AI-Powered Mapping**: Gemini 2.5 Pro for intelligent schema inference and field mapping
- **RAG Engine**: Learning-based mapping with Pinecone vector storage for historical context
- **Domain-Specific Agents**: RevOps Pilot and FinOps Pilot with tailored ontologies
- **Real-Time Visualization**: Interactive Sankey diagrams showing complete data flows

### 🎨 User Experience
- **Prod Mode Toggle**: Default OFF for cost-efficient heuristic mapping; ON for AI/RAG precision
- **Smart Graph Layout**: Collapsible panels with dynamic graph expansion
- **Professional Icons**: Heroicons-based data source visualization
- **Progress Tracking**: 5-stage process indicator (Connecting → Analyzing → Mapping → Validating → Complete)
- **FAQ Section**: Built-in "How to Use" guide for non-technical users

### 📊 Analytics
- **Google Analytics GA4**: Full event tracking (ID: G-Z92T5M98WP)
- **Custom Events**: Source/agent selections, Connect & Map actions
- **Server-Side Logging**: API call tracking (excluding /state polling)

## Quick Start

### Prerequisites
- Python 3.10+
- Gemini API key (sign up at [ai.google.dev](https://ai.google.dev))
- Pinecone API key (optional, for RAG features)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/dcl-application.git
cd dcl-application

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set environment variables
export GEMINI_API_KEY="your-gemini-api-key"
export PINECONE_API_KEY="your-pinecone-api-key"  # Optional

# 4. Run the application
uvicorn app:app --host 0.0.0.0 --port 5000 --reload

# 5. Open browser
# Navigate to http://localhost:5000
```

## Usage

### Basic Workflow
1. **Select Data Sources**: Choose from 8 enterprise systems (Dynamics, Salesforce, SAP, etc.)
2. **Select Agents**: Pick RevOps Pilot, FinOps Pilot, or both
3. **Choose Mapping Mode**: 
   - **Prod Mode OFF** (default): Fast heuristic mapping, no AI costs
   - **Prod Mode ON**: AI-powered mapping with RAG learning
4. **Click "Connect & Map"**: Watch the real-time Sankey visualization build
5. **Review Data Flow**: Explore mappings, preview data, validate quality

### Advanced Features
- **Custom Field Creation**: Click ontology fields to add custom mappings
- **Data Preview**: Hover over nodes to see sample data
- **Quality Metrics**: View mapping confidence scores and validation results
- **Export Views**: Access mapped data via DuckDB views

## Architecture

### Tech Stack
- **Backend**: FastAPI (Python)
- **AI**: Google Gemini 2.5 Pro
- **Vector DB**: Pinecone (embeddings: multilingual-e5-large)
- **Database**: DuckDB
- **Frontend**: React + Tailwind CSS
- **Visualization**: D3.js + Cytoscape.js
- **Deployment**: Render

### Key Components
- **Multi-Agent System**: Dynamic ontology filtering based on selected agents
- **Smart Edge Filtering**: Only displays active data flows (no orphaned connections)
- **Heuristic Planner**: Rule-based mapping when Prod Mode is OFF
- **RAG Engine**: Learning from historical mappings for improved accuracy
- **FinOps Alignment**: Ontology synced with FinOps Autopilot agent schema

## Performance & Load Testing

### Enterprise Readiness
This application is designed for enterprise-grade performance and includes comprehensive load testing capabilities.

📖 **[Load Testing Guide](LOAD_TESTING.md)** - Complete documentation on:
- Running load tests from your computer or cloud servers
- Test scenarios (normal load, peak traffic, stress testing)
- Performance metrics and thresholds
- Troubleshooting and optimization tips
- Production readiness checklist

### Quick Load Test

```bash
# Install Locust
pip install locust

# Run load test
locust --host=https://agenticdataconnectsankey.onrender.com

# Open browser to http://localhost:8089
# Configure: 100 users, 10 spawn rate, Start Swarming
```

**Performance Targets**:
- Avg Response Time: < 500ms
- 95th Percentile: < 2000ms
- Failure Rate: < 1%
- Concurrent Users: 100+

⚠️ **Important**: When load testing production, disable Prod Mode (set `use_ai=false`) to avoid unintended AI API costs.

## Configuration

### Environment Variables
- `GEMINI_API_KEY`: Google Gemini API key (required)
- `PINECONE_API_KEY`: Pinecone API key (optional, for RAG)
- `GITHUB_TOKEN`: GitHub token (for deployment automation)

### Data Sources Configuration
Data source schemas are defined in `app.py`. To add new sources, extend the `SAMPLE_DATA` dictionary.

### Ontology Configuration
Domain ontologies (RevOps, FinOps) are defined in `app.py`. Modify the `ONTOLOGY_DEFINITIONS` to add/update fields.

## Deployment

### Render Deployment
This application is optimized for Render deployment:

```bash
# Configured in .replit:
# Build: pip install --no-cache-dir -r requirements.txt
# Start: ./start.sh
```

The app is live at: [agenticdataconnectsankey.onrender.com](https://agenticdataconnectsankey.onrender.com)

### Environment Setup
1. Add environment secrets in Render dashboard
2. Configure auto-scaling based on CPU/memory
3. Enable health checks on `/` endpoint
4. Set up monitoring alerts

## Development

### Project Structure
```
.
├── app.py                 # FastAPI backend
├── static/
│   ├── index.html        # React app entry point
│   ├── sankey.js         # Sankey diagram visualization
│   ├── styles-react.css  # Tailwind CSS styling
│   └── src/
│       ├── App.jsx       # React root component
│       └── pages/
│           ├── DCLDashboard.jsx  # Main dashboard
│           └── FAQ.jsx           # FAQ section
├── locustfile.py         # Load testing script
├── LOAD_TESTING.md       # Load testing documentation
└── requirements.txt      # Python dependencies
```

### Running Locally
```bash
# Start development server with hot reload
uvicorn app:app --host 0.0.0.0 --port 5000 --reload
```

### Making Changes
1. Edit frontend code in `static/src/`
2. Backend changes in `app.py`
3. Test changes locally
4. Commit and push to GitHub
5. Render auto-deploys from main branch

## Analytics & Monitoring

### Google Analytics
- **Property ID**: G-Z92T5M98WP
- **Tracked Events**:
  - Page views (Dashboard, FAQ)
  - Source selections
  - Agent selections
  - Connect & Map button clicks
  - Prod Mode toggles

### Server-Side Logging
All API calls are logged (excluding `/state` polling for performance). View logs in Render dashboard.

## FAQ

**Q: What's the difference between Prod Mode ON vs OFF?**  
A: Prod Mode OFF uses fast heuristic mapping (no AI costs). Prod Mode ON uses Gemini AI with RAG for more accurate, learning-based mappings.

**Q: How do I add a new data source?**  
A: Update `SAMPLE_DATA` in `app.py` with your source schema, then add the source to the UI source list.

**Q: Why aren't all ontology fields showing?**  
A: The system only displays fields that selected agents actually consume. This prevents clutter and shows actual data flows.

**Q: How do I export mapped data?**  
A: Mapped data is available as DuckDB views. Query them directly or export via DuckDB CLI.

**Q: Can I run this on-premise?**  
A: Yes! Just ensure you have Python 3.10+, set environment variables, and run uvicorn. No cloud dependencies required (except AI APIs).

## Roadmap

- [ ] User authentication & SSO integration
- [ ] Role-based access controls
- [ ] Audit logging for compliance
- [ ] Real-time collaboration features
- [ ] Advanced caching for /state endpoint
- [ ] Webhook support for real-time data sync
- [ ] Additional domain agents (DataOps, SecOps)
- [ ] Custom ontology builder UI

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run load tests to verify performance
5. Submit a pull request

## License

[Your License Here]

## Support

For issues, questions, or feature requests:
- GitHub Issues: [Your Repo Issues]
- Email: [Your Email]
- Documentation: [Your Docs Site]

---

**Built with ❤️ for enterprise data teams**
