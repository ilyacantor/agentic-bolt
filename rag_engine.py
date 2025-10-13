"""
RAG Engine for DCL Schema Mapping
Uses Pinecone + Sentence Transformers for context retrieval
"""

import os
import json
from pinecone import Pinecone, ServerlessSpec
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Any, Optional
from datetime import datetime
import hashlib

class RAGEngine:
    """
    Retrieval-Augmented Generation engine for schema mapping.
    Stores historical mappings in Pinecone and retrieves similar examples to guide LLM.
    """
    
    def __init__(self, pinecone_api_key: Optional[str] = None):
        """Initialize RAG engine with Pinecone and embedding model."""
        # Get Pinecone API key from environment if not provided
        self.pinecone_api_key = pinecone_api_key or os.environ.get("PINECONE_API_KEY")
        
        if not self.pinecone_api_key:
            raise ValueError(
                "Pinecone API key not found. Please set PINECONE_API_KEY environment variable."
            )
        
        # Initialize Pinecone client
        self.pc = Pinecone(api_key=self.pinecone_api_key)
        
        # Index name
        self.index_name = "schema-mappings"
        
        # Load embedding model (384-dim, fast, lightweight)
        print("🔄 Loading embedding model (all-MiniLM-L6-v2)...")
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.embedding_dim = 384
        print("✅ RAG Engine initialized")
        
        # Create or connect to index
        self._ensure_index()
    
    def _ensure_index(self):
        """Create index if it doesn't exist."""
        try:
            # Check if index exists
            if self.index_name not in self.pc.list_indexes().names():
                # Create index with serverless spec (free tier)
                self.pc.create_index(
                    name=self.index_name,
                    dimension=self.embedding_dim,
                    metric='cosine',
                    spec=ServerlessSpec(
                        cloud='aws',
                        region='us-east-1'
                    )
                )
                print(f"✅ Created new index: {self.index_name}")
            else:
                print(f"✅ Connected to existing index: {self.index_name}")
            
            # Get index
            self.index = self.pc.Index(self.index_name)
        except Exception as e:
            print(f"⚠️  Error with index: {e}")
            # If index exists but had error, try to connect anyway
            self.index = self.pc.Index(self.index_name)
    
    def _create_field_signature(self, field_name: str, field_type: str, 
                                 source_system: str = "") -> str:
        """
        Create a text signature for a field that captures its semantic meaning.
        This will be embedded and used for similarity search.
        """
        signature = f"{field_name} ({field_type})"
        if source_system:
            signature = f"{source_system}: {signature}"
        return signature
    
    def _create_mapping_document(self, mapping: Dict[str, Any]) -> str:
        """
        Create a rich text document from a mapping for better retrieval.
        """
        doc = f"""
Source: {mapping.get('source_system', 'Unknown')}
Field: {mapping['source_field']}
Type: {mapping.get('source_type', 'string')}
Mapped To: {mapping['ontology_entity']}
Transformation: {mapping.get('transformation', 'direct')}
Confidence: {mapping.get('confidence', 0.0)}
        """.strip()
        return doc
    
    def _create_vector_id(self, source_system: str, source_field: str) -> str:
        """Create a unique vector ID from source system and field."""
        text = f"{source_system}_{source_field}_{int(datetime.now().timestamp())}"
        # Create hash for unique ID
        return hashlib.md5(text.encode()).hexdigest()[:16]
    
    def store_mapping(self, 
                     source_field: str,
                     source_type: str,
                     ontology_entity: str,
                     source_system: str = "Unknown",
                     transformation: str = "direct",
                     confidence: float = 1.0,
                     validated: bool = False) -> str:
        """
        Store a successful mapping in the vector database.
        
        Returns:
            Vector ID of stored mapping
        """
        # Create unique ID
        vector_id = self._create_vector_id(source_system, source_field)
        
        # Create mapping data
        mapping = {
            "source_field": source_field,
            "source_type": source_type,
            "source_system": source_system,
            "ontology_entity": ontology_entity,
            "transformation": transformation,
            "confidence": confidence,
            "validated": validated,
            "timestamp": datetime.now().isoformat()
        }
        
        # Create document for embedding
        document = self._create_mapping_document(mapping)
        
        # Generate embedding
        embedding = self.model.encode(document).tolist()
        
        # Upsert to Pinecone
        self.index.upsert(
            vectors=[{
                "id": vector_id,
                "values": embedding,
                "metadata": mapping
            }]
        )
        
        print(f"📝 Stored mapping: {source_field} → {ontology_entity}")
        return vector_id
    
    def retrieve_similar_mappings(self,
                                   field_name: str,
                                   field_type: str,
                                   source_system: str = "",
                                   top_k: int = 5,
                                   min_confidence: float = 0.7) -> List[Dict[str, Any]]:
        """
        Retrieve similar historical mappings from vector store.
        
        Args:
            field_name: Name of field to map
            field_type: Data type of field
            source_system: Optional source system name
            top_k: Number of similar examples to retrieve
            min_confidence: Minimum confidence threshold
        
        Returns:
            List of similar mapping examples with metadata
        """
        # Create query
        query = self._create_field_signature(field_name, field_type, source_system)
        
        # Check if index has any vectors
        stats = self.index.describe_index_stats()
        if stats.total_vector_count == 0:
            print("ℹ️  No historical mappings in vector store yet")
            return []
        
        # Generate query embedding
        query_embedding = self.model.encode(query).tolist()
        
        # Build filter for minimum confidence
        query_filter = None
        if min_confidence > 0:
            query_filter = {"confidence": {"$gte": min_confidence}}
        
        # Query Pinecone
        results = self.index.query(
            vector=query_embedding,
            top_k=top_k,
            include_metadata=True,
            filter=query_filter
        )
        
        # Format results
        similar_mappings = []
        for match in results.matches:
            similar_mappings.append({
                **match.metadata,
                "similarity": round(match.score, 3)
            })
        
        print(f"🔍 Found {len(similar_mappings)} similar mappings for '{field_name}'")
        return similar_mappings
    
    def build_context_for_llm(self, similar_mappings: List[Dict[str, Any]]) -> str:
        """
        Build context string from similar mappings to include in LLM prompt.
        
        Args:
            similar_mappings: List of similar mapping dictionaries
        
        Returns:
            Formatted context string for LLM prompt
        """
        if not similar_mappings:
            return ""
        
        context = "SIMILAR SUCCESSFUL MAPPINGS FROM HISTORY:\n\n"
        
        for i, mapping in enumerate(similar_mappings, 1):
            context += f"{i}. Source: {mapping.get('source_system', 'Unknown')}\n"
            context += f"   Field: {mapping['source_field']} ({mapping.get('source_type', 'unknown')})\n"
            context += f"   Mapped To: {mapping['ontology_entity']}\n"
            context += f"   Transformation: {mapping.get('transformation', 'direct')}\n"
            context += f"   Similarity: {mapping.get('similarity', 0.0):.1%}\n"
            context += f"   Confidence: {mapping.get('confidence', 0.0):.1%}\n"
            context += "\n"
        
        context += "Use these examples to guide your mapping decisions for similar fields.\n"
        context += "Maintain consistency with historical mappings when appropriate.\n"
        
        return context
    
    def seed_from_schema(self, source_system: str, tables: Dict[str, Any], 
                        ontology_mappings: Dict[str, Any]):
        """
        Seed the vector store with mappings from an existing schema.
        Useful for bootstrapping the RAG engine with known-good mappings.
        
        Args:
            source_system: Name of source system (e.g., "Salesforce")
            tables: Table schemas with field information
            ontology_mappings: Known mappings to ontology entities
        """
        count = 0
        for table_name, table_info in tables.items():
            schema = table_info.get('schema', {})
            
            for field_name, field_type in schema.items():
                # Check if we have a mapping for this field
                mapping_key = f"{table_name}.{field_name}"
                if mapping_key in ontology_mappings:
                    mapping = ontology_mappings[mapping_key]
                    
                    self.store_mapping(
                        source_field=field_name,
                        source_type=field_type,
                        ontology_entity=mapping['entity'],
                        source_system=source_system,
                        transformation=mapping.get('transform', 'direct'),
                        confidence=mapping.get('confidence', 0.9),
                        validated=True
                    )
                    count += 1
        
        print(f"🌱 Seeded {count} mappings from {source_system}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics about the vector store."""
        stats = self.index.describe_index_stats()
        return {
            "total_mappings": stats.total_vector_count,
            "index_name": self.index_name,
            "embedding_model": "all-MiniLM-L6-v2",
            "embedding_dimension": self.embedding_dim,
            "vector_db": "Pinecone"
        }
