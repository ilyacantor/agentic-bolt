# AutonomOS UI — Replit Prototype

**Stack:** React 18 (UMD) + Tailwind (Play CDN) + Hash Router (no build step).  
Drop this folder into Replit as a static site and hit Run.

## Pages
- `#/dcl` — Data Connectivity Layer (graph placeholder + connectors + status)
- `#/ontology` — Ontology Mapping Workspace (two-pane mapping)
- `#/agents` — Agent Orchestration Console (live progress updates)
- `#/pipeline` — Insight-to-Action Pipeline (stages + recent actions)
- `#/command` — Executive Command Center (metrics + alerts + feed)

## Dev Notes
- Replace graph/map placeholders with D3/Cytoscape or DeckGL as you evolve.
- Data seeds live in `src/data/*.json`.
- Styles rely on Tailwind classes; a few utility classes in `styles.css`.
