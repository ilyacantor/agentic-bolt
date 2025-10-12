"""
RAG Engine for DCL Schema Mapping
Uses ChromaDB + Sentence Transformers for context retrieval
"""

import os
import json
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Any, Optional
from datetime import datetime

class RAGEngine:
    """
    Retrieval-Augmented Generation engine for schema mapping.
    Stores historical mappings and retrieves similar examples to guide LLM.
    """
    
    def __init__(self, persist_dir: str = "./chroma_db"):
        """Initialize RAG engine with ChromaDB and embedding model."""
        self.persist_dir = persist_dir
        
        # Initialize ChromaDB client
        self.client = chromadb.Client(Settings(
            persist_directory=persist_dir,
            anonymized_telemetry=False
        ))
        
        # Get or create collection for schema mappings
        self.collection = self.client.get_or_create_collection(
            name="schema_mappings",
            metadata={"description": "Historical schema-to-ontology mappings"}
        )
        
        # Load embedding model (384-dim, fast, lightweight)
        print("🔄 Loading embedding model (all-MiniLM-L6-v2)...")
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        print("✅ RAG Engine initialized")
    
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
            Document ID of stored mapping
        """
        # Create unique ID
        doc_id = f"{source_system}_{source_field}_{int(datetime.now().timestamp())}"
        
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
        
        # Add to ChromaDB
        self.collection.add(
            ids=[doc_id],
            documents=[document],
            metadatas=[mapping]
        )
        
        print(f"📝 Stored mapping: {source_field} → {ontology_entity}")
        return doc_id
    
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
        if self.collection.count() == 0:
            print("ℹ️  No historical mappings in vector store yet")
            return []
        
        # Query ChromaDB
        results = self.collection.query(
            query_texts=[query],
            n_results=min(top_k, self.collection.count()),
            where={"confidence": {"$gte": min_confidence}} if min_confidence > 0 else None
        )
        
        # Format results
        similar_mappings = []
        if results['metadatas'] and results['metadatas'][0]:
            for i, metadata in enumerate(results['metadatas'][0]):
                similarity = 1 - results['distances'][0][i]  # Convert distance to similarity
                similar_mappings.append({
                    **metadata,
                    "similarity": round(similarity, 3)
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
        return {
            "total_mappings": self.collection.count(),
            "collection_name": self.collection.name,
            "embedding_model": "all-MiniLM-L6-v2",
            "embedding_dimension": 384
        }
