let Graph3D;
let linkAnimations = [];

function renderGraph3D() {
  const nodes = state.graph.nodes.map(n => ({
    id: n.id,
    name: n.label,
    type: n.type
  }));

  const links = state.graph.edges.map(e => ({
    source: e.source,
    target: e.target,
    label: e.label || "",
    confidence: e.confidence || 0,
    type: e.type
  }));

  if (!Graph3D) {
    Graph3D = ForceGraph3D()(document.getElementById("graph3d"))
      .graphData({ nodes, links })
      .nodeThreeObject(node => {
        const sprite = new SpriteText(node.name);
        sprite.material.depthWrite = false;
        sprite.color =
          node.type === "source" ? "#2563eb" :
          node.type === "ontology" ? "#16a34a" :
          node.type === "agent" ? "#9333ea" :
          "#475569";
        sprite.textHeight = 8;
        return sprite;
      })
      .linkDirectionalArrowLength(3)
      .linkDirectionalArrowRelPos(1)
      .linkCurvature(0.25)
      .onNodeClick(node => {
        fetch("/preview?node=" + encodeURIComponent(node.id))
          .then(r => r.json())
          .then(data => {
            renderTable("preview_sources", data.sources);
            renderTable("preview_ontology", data.ontology);
          });
      });

    // Confidence-based edge color
    Graph3D.linkColor(l => {
      const c = l.confidence;
      if (c >= 0.8) return "#16a34a";
      if (c >= 0.6) return "#facc15";
      return "#dc2626";
    });

    // Add animated particles
    Graph3D.linkThreeObjectExtend(true).linkThreeObject((link) => {
      const group = new THREE.Group();
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.6),
        new THREE.MeshBasicMaterial({ color: "#facc15" })
      );
      group.add(particle);
      linkAnimations.push({ particle, link, progress: 0 });
      return group;
    });

    Graph3D.onEngineTick(() => {
      linkAnimations.forEach(anim => {
        const { particle, link } = anim;
        anim.progress = (anim.progress + 0.01) % 1;
        const src = Graph3D.graphData().nodes.find(n => n.id === link.source);
        const tgt = Graph3D.graphData().nodes.find(n => n.id === link.target);
        if (!src || !tgt) return;
        const x = src.x + (tgt.x - src.x) * anim.progress;
        const y = src.y + (tgt.y - src.y) * anim.progress;
        const z = src.z + (tgt.z - src.z) * anim.progress;
        particle.position.set(x, y, z);
      });
    });
  } else {
    Graph3D.graphData({ nodes, links });
  }
}

function show3D() {
  document.getElementById("cy").style.display = "none";
  document.getElementById("graph3d").style.display = "block";
  renderGraph3D();
}
