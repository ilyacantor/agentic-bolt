function FAQ() {
  const glossary = [
    {
      term: "Node",
      definition: "A fundamental element in graph visualization representing an entity or data point. In the DCL, nodes can be data sources (blue), ontology entities (green), or agents (purple)."
    },
    {
      term: "Edge",
      definition: "A connection or relationship between two nodes in the graph. Edges show how data flows from sources through the ontology to agents. They can be colored to indicate the source system or relationship type."
    },
    {
      term: "Table",
      definition: "A structured dataset from a source system (like Snowflake, SAP, or NetSuite) containing rows and columns of data. Each table becomes a source node in the data flow graph."
    },
    {
      term: "Ontology",
      definition: "A unified data model that standardizes fields and entities across different source systems. The ontology acts as a translation layer, mapping diverse source schemas to a consistent structure."
    },
    {
      term: "Entity",
      definition: "A conceptual object or data category within the ontology that represents a business concept (like aws_resource, cloud_cost, customer, or transaction). Entities contain standardized fields that are populated from various source systems, allowing agents to work with consistent data regardless of the original source."
    },
    {
      term: "Agent",
      definition: "An AI-powered domain expert that consumes data from the unified ontology. Agents like RevOps Pilot and FinOps Pilot use the standardized data to provide insights and automation for their specific domains."
    },
    {
      term: "DCL (Data Connection Layer)",
      definition: "An intelligent system that automatically discovers data sources, maps them to a unified ontology using AI, and makes the data available to domain-specific agents. The DCL handles the complexity of integrating multiple enterprise systems."
    },
    {
      term: "RAG (Retrieval Augmented Generation)",
      definition: "In this context, a learning system that stores historical field mappings and retrieves similar examples to improve future mapping accuracy. The RAG engine uses vector similarity to find relevant past mappings and provide context to the AI."
    },
    {
      term: "LLM Call",
      definition: "A request to a Large Language Model (like Gemini) to analyze schemas and propose field mappings. Each call consumes tokens and helps the system intelligently map source fields to the ontology."
    },
    {
      term: "RevOps Pilot",
      definition: "A domain agent focused on Revenue Operations, consuming customer and transaction data to provide insights on sales pipelines, customer relationships, and revenue forecasting."
    },
    {
      term: "FinOps Pilot",
      definition: "A domain agent focused on Financial Operations and cloud cost optimization, consuming AWS resource, usage, and cost data to provide insights on cloud spending and resource efficiency."
    },
    {
      term: "Graph",
      definition: "A network visualization showing nodes and edges in a force-directed layout. The graph view allows you to see the complete data flow topology and relationships between all entities."
    },
    {
      term: "Sankey",
      definition: "A flow diagram where the width of connections represents the volume or importance of data flowing between sources, ontology entities, and agents. Sankey diagrams make it easy to see the complete data pipeline."
    },
    {
      term: "Data Source",
      definition: "An enterprise system containing business data, such as Snowflake (data warehouse), SAP (ERP), NetSuite (accounting), Salesforce (CRM), or Legacy SQL databases. The DCL connects to these sources to extract and map their data."
    },
    {
      term: "Token",
      definition: "A unit of text processed by the LLM, roughly equivalent to 3-4 characters. Token count indicates how much data has been sent to the AI for analysis. Higher token usage means more comprehensive schema analysis."
    },
    {
      term: "Confidence",
      definition: "A percentage score (0-100%) indicating how certain the system is about its field mappings. Higher confidence means the AI has found strong pattern matches between source fields and ontology entities. Confidence below 80% may indicate ambiguous or complex schemas."
    }
  ];

  return (
    <div className="p-5 w-full">
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Frequently Asked Questions</h1>
          <p className="text-slate-400">Learn about key concepts and terminology used in the Data Connection Layer</p>
        </div>

        <div className="card">
          <div className="card-title mb-4">Glossary of Terms</div>
          <div className="space-y-6">
            {glossary.map((item, index) => (
              <div key={index} className="border-l-4 border-cyan-500 pl-4 py-2">
                <h3 className="text-lg font-bold text-cyan-400 mb-2">{item.term}</h3>
                <p className="text-slate-300 leading-relaxed">{item.definition}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card mt-6">
          <div className="card-title mb-4">Common Questions</div>
          <div className="space-y-4">
            <div>
              <h3 className="text-md font-semibold text-white mb-2">What happens when I connect a data source?</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                The DCL analyzes the source schema, uses AI to map fields to the unified ontology, validates the mappings, 
                and creates views that agents can consume. The RAG engine learns from each mapping to improve future accuracy.
              </p>
            </div>
            <div>
              <h3 className="text-md font-semibold text-white mb-2">How does the system choose which fields to map?</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                The system only maps fields to ontology entities that are consumed by the selected agents. This ensures 
                efficient processing and avoids creating unnecessary data transformations.
              </p>
            </div>
            <div>
              <h3 className="text-md font-semibold text-white mb-2">What's the difference between Graph and Sankey views?</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                The Graph view shows all nodes and connections in a network layout, useful for exploring relationships. 
                The Sankey view shows the data flow pipeline from left to right (sources → ontology → agents), making it 
                easier to understand the complete data transformation journey.
              </p>
            </div>
            <div>
              <h3 className="text-md font-semibold text-white mb-2">Why do some mappings have higher confidence than others?</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Confidence depends on how well source field names and patterns match the ontology. Clear, descriptive field 
                names like "customer_id" or "monthly_cost" yield higher confidence. Ambiguous or cryptic field names may 
                result in lower confidence scores.
              </p>
            </div>
            <div>
              <h3 className="text-md font-semibold text-white mb-2">What does the Prod Mode toggle do?</h3>
              <p className="text-slate-300 text-sm leading-relaxed mb-2">
                The Prod Mode toggle controls how the DCL maps data sources to the ontology:
              </p>
              <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
                <div>
                  <span className="inline-block px-2 py-0.5 bg-green-600 text-white text-xs font-semibold rounded mr-2">ON</span>
                  <span className="text-slate-300 text-sm">Uses AI/RAG mapping with Gemini API and Pinecone for intelligent, context-aware schema mapping. 
                  Learns from historical mappings for higher accuracy but requires API keys.</span>
                </div>
                <div>
                  <span className="inline-block px-2 py-0.5 bg-slate-600 text-white text-xs font-semibold rounded mr-2">OFF</span>
                  <span className="text-slate-300 text-sm">Uses heuristic-only mapping with deterministic rules. 
                  Faster, no external API dependencies, good for production environments where you want predictable behavior without AI costs.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
