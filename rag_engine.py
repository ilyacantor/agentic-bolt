"""
RAG Engine for DCL Schema Mapping
Uses Qdrant Cloud + Sentence Transformers for context retrieval
"""

import os
import json
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue, Range
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Any, Optional
from datetime import datetime
import hashlib

class RAGEngine:
    """
    Retrieval-Augmented Generation engine for schema mapping.
    Stores historical mappings in Qdrant Cloud and retrieves similar examples to guide LLM.
    """
    
    def __init__(self, qdrant_url: Optional[str] = None, qdrant_api_key: Optional[str] = None):
        """Initialize RAG engine with Qdrant Cloud and embedding model."""
        # Get Qdrant credentials from environment if not provided
        self.qdrant_url = qdrant_url or os.environ.get("QDRANT_URL")
        self.qdrant_api_key = qdrant_api_key or os.environ.get("QDRANT_API_KEY")
        
        if not self.qdrant_url or not self.qdrant_api_key:
            raise ValueError(
                "Qdrant credentials not found. Please set QDRANT_URL and QDRANT_API_KEY environment variables."
            )
        
        # Initialize Qdrant client
        self.client = QdrantClient(
            url=self.qdrant_url,
            api_key=self.qdrant_api_key,
        )
        
        # Collection name
        self.collection_name = "schema_mappings"
        
        # Load embedding model (384-dim, fast, lightweight)
        print("🔄 Loading embedding model (all-MiniLM-L6-v2)...")
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.embedding_dim = 384
        print("✅ RAG Engine initialized")
        
        # Create collection if it doesn't exist
        self._ensure_collection()
    
    def _ensure_collection(self):
        """Create collection if it doesn't exist."""
        try:
            # Try to get collection info
            self.client.get_collection(self.collection_name)
            print(f"✅ Connected to existing collection: {self.collection_name}")
        except:
            # Collection doesn't exist, create it
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=self.embedding_dim,
                    distance=Distance.COSINE
                )
            )
            print(f"✅ Created new collection: {self.collection_name}")
    
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
    
    def _create_point_id(self, source_system: str, source_field: str) -> str:
        """Create a unique point ID from source system and field."""
        # Use hash to create numeric ID for Qdrant
        text = f"{source_system}_{source_field}_{int(datetime.now().timestamp())}"
        # Convert to integer hash
        return str(abs(hash(text)) % (10 ** 10))
    
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
            Point ID of stored mapping
        """
        # Create unique ID
        point_id = self._create_point_id(source_system, source_field)
        
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
        
        # Create point for Qdrant
        point = PointStruct(
            id=point_id,
            vector=embedding,
            payload=mapping
        )
        
        # Upsert to Qdrant
        self.client.upsert(
            collection_name=self.collection_name,
            points=[point]
        )
        
        print(f"📝 Stored mapping: {source_field} → {ontology_entity}")
        return point_id
    
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
        
        # Check if collection has any documents
        collection_info = self.client.get_collection(self.collection_name)
        if collection_info.points_count == 0:
            print("ℹ️  No historical mappings in vector store yet")
            return []
        
        # Generate query embedding
        query_embedding = self.model.encode(query).tolist()
        
        # Build filter for minimum confidence
        query_filter = None
        if min_confidence > 0:
            query_filter = Filter(
                must=[
                    FieldCondition(
                        key="confidence",
                        range=Range(gte=min_confidence)
                    )
                ]
            )
        
        # Search Qdrant
        results = self.client.search(
            collection_name=self.collection_name,
            query_vector=query_embedding,
            limit=top_k,
            query_filter=query_filter
        )
        
        # Format results
        similar_mappings = []
        for result in results:
            similar_mappings.append({
                **result.payload,
                "similarity": round(result.score, 3)
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
        collection_info = self.client.get_collection(self.collection_name)
        return {
            "total_mappings": collection_info.points_count,
            "collection_name": self.collection_name,
            "embedding_model": "all-MiniLM-L6-v2",
            "embedding_dimension": self.embedding_dim,
            "vector_db": "Qdrant Cloud"
        }
