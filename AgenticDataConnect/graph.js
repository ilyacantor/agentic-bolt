let cy;

function buildElements() {
  const nodes = state.graph.nodes.map(n => ({
    data: { id: n.id, label: n.label, type: n.type }
  }));
  const edges = state.graph.edges.map(e => ({
    data: {
      source: e.source,
      target: e.target,
      label: e.label || "",
      type: e.type,
      confidence: e.confidence || 0
    }
  }));
  return [...nodes, ...edges];
}

function renderGraph() {
  const elements = buildElements();

  if (!cy) {
    cy = cytoscape({
      container: document.getElementById("cy"),
      elements,
      style: [
        {
          selector: "node[type='source']",
          style: {
            "background-color": "#2563eb",
            "shape": "round-rectangle",
            "color": "#fff",
            "label": "data(label)"
          }
        },
        {
          selector: "node[type='ontology']",
          style: {
            "background-color": "#16a34a",
            "shape": "round-rectangle",
            "color": "#fff",
            "label": "data(label)"
          }
        },
        {
          selector: "node[type='agent']",
          style: {
            "background-color": "#9333ea",
            "shape": "ellipse",
            "color": "#fff",
            "label": "data(label)"
          }
        },
        {
          selector: "node[type='consumer']",
          style: {
            "background-color": "#475569",
            "shape": "rectangle",
            "color": "#fff",
            "label": "data(label)"
          }
        },
        {
          selector: "edge",
          style: {
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
            "width": 2,
            "line-color": ele => {
              const c = ele.data("confidence") || 0;
              if (c >= 0.8) return "#16a34a";
              if (c >= 0.6) return "#facc15";
              return "#dc2626";
            },
            "target-arrow-color": ele => {
              const c = ele.data("confidence") || 0;
              if (c >= 0.8) return "#16a34a";
              if (c >= 0.6) return "#facc15";
              return "#dc2626";
            },
            "label": "data(label)",
            "font-size": 10
          }
        },
        {
          selector: "edge[type='mapping']",
          style: {
            "line-style": "dashed",
            "line-color": "#9333ea",
            "target-arrow-color": "#9333ea"
          }
        }
      ],
      layout: { name: "cose-bilkent", animate: true }
    });

    // Hover highlight
    cy.on("mouseover", "node", e => {
      e.target.style("border-color", "#facc15");
      e.target.style("border-width", 3);
    });
    cy.on("mouseout", "node", e => {
      e.target.style("border-width", 1);
      e.target.style("border-color", "#fff");
    });

    // Click preview
    cy.on("tap", "node", async e => {
      const id = e.target.id();
      const r = await fetch("/preview?node=" + encodeURIComponent(id));
      const data = await r.json();
      renderTable("preview_sources", data.sources);
      renderTable("preview_ontology", data.ontology);
    });
  } else {
    cy.elements().remove();
    cy.add(elements);
    cy.layout({ name: "cose-bilkent", animate: true }).run();
  }
}

function show2D() {
  document.getElementById("cy").style.display = "block";
  document.getElementById("graph3d").style.display = "none";
  renderGraph();
