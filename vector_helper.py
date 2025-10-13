"""
Simple vector storage helper using Pinecone RAG Engine
"""

from rag_engine import RAGEngine
from typing import List, Dict

# Global RAG engine instance
_rag_engine = None

def _get_engine():
    """Get or create the RAG engine singleton."""
    global _rag_engine
    if _rag_engine is None:
        _rag_engine = RAGEngine()
    return _rag_engine

def store_text(doc_id: str, text: str, metadata: Dict = None):
    """
    Store text in the vector database.
    
    Args:
        doc_id: Unique identifier for the document
        text: Text content to store
        metadata: Optional metadata dictionary
    """
    engine = _get_engine()
    
    # Store as a mapping (reusing RAG engine's store_mapping method)
    # We'll use doc_id as both source_field and source_system
    engine.store_mapping(
        source_field=doc_id,
        source_type="text",
        ontology_entity=text,
        source_system=metadata.get("source", "default") if metadata else "default",
        transformation="direct",
        confidence=1.0,
        validated=True
    )
    print(f"✅ Stored text with ID: {doc_id}")

def search_text(query: str, top_k: int = 5) -> List[Dict]:
    """
    Search for similar text in the vector database.
    
    Args:
        query: Search query text
        top_k: Number of results to return
        
    Returns:
        List of matching results with similarity scores
    """
    engine = _get_engine()
    
    # Use RAG engine's retrieve_similar_mappings method
    results = engine.retrieve_similar_mappings(
        field_name=query,
        field_type="text",
        source_system="search",
        top_k=top_k
    )
    
    return results
