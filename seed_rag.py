"""
Seed script to populate RAG Engine with initial schema mappings.
Run this to bootstrap the RAG with known-good mappings from existing schemas.
"""

from rag_engine import RAGEngine

def seed_common_mappings():
    """Seed RAG with common field mappings across enterprise systems."""
    
    rag = RAGEngine(persist_dir="./chroma_db")
    
    print("🌱 Seeding RAG with common enterprise schema mappings...")
    
    # Salesforce common mappings
    salesforce_mappings = [
        ("Id", "string", "Customer.customer_id", "Salesforce", "direct", 0.95),
        ("AccountId", "string", "Customer.customer_id", "Salesforce", "direct", 0.92),
        ("Name", "string", "Customer.company_name", "Salesforce", "direct", 0.90),
        ("Email", "string", "Customer.email", "Salesforce", "lower_trim", 0.88),
        ("EmailAddress1", "string", "Customer.email", "Salesforce", "lower_trim", 0.88),
        ("Phone", "string", "Customer.phone", "Salesforce", "direct", 0.85),
        ("Amount", "numeric", "Transaction.amount", "Salesforce", "cast_double", 0.90),
        ("TotalAmount", "numeric", "Transaction.amount", "Salesforce", "cast_double", 0.90),
        ("EstimatedValue", "numeric", "Transaction.amount", "Salesforce", "cast_double", 0.85),
        ("CreatedDate", "datetime", "Transaction.order_date", "Salesforce", "parse_timestamp", 0.88),
        ("CloseDate", "datetime", "Transaction.order_date", "Salesforce", "parse_timestamp", 0.85),
    ]
    
    # Dynamics CRM mappings
    dynamics_mappings = [
        ("accountid", "string", "Customer.customer_id", "Dynamics", "direct", 0.95),
        ("parentcustomerid", "string", "Customer.parent_id", "Dynamics", "direct", 0.90),
        ("name", "string", "Customer.company_name", "Dynamics", "direct", 0.90),
        ("emailaddress1", "string", "Customer.email", "Dynamics", "lower_trim", 0.88),
        ("telephone1", "string", "Customer.phone", "Dynamics", "direct", 0.85),
        ("createdon", "datetime", "Transaction.order_date", "Dynamics", "parse_timestamp", 0.88),
    ]
    
    # SAP mappings
    sap_mappings = [
        ("KUNNR", "string", "Customer.customer_id", "SAP", "direct", 0.92),
        ("NAME1", "string", "Customer.company_name", "SAP", "direct", 0.90),
        ("SMTP_ADDR", "string", "Customer.email", "SAP", "lower_trim", 0.85),
        ("NETWR", "numeric", "Transaction.amount", "SAP", "cast_double", 0.90),
        ("ERDAT", "datetime", "Transaction.order_date", "SAP", "parse_timestamp", 0.88),
        ("VBELN", "string", "Transaction.transaction_id", "SAP", "direct", 0.90),
    ]
    
    # NetSuite mappings  
    netsuite_mappings = [
        ("CustomerID", "integer", "Customer.customer_id", "NetSuite", "direct", 0.95),
        ("CompanyName", "string", "Customer.company_name", "NetSuite", "direct", 0.92),
        ("Email", "string", "Customer.email", "NetSuite", "lower_trim", 0.88),
        ("tranId", "string", "Transaction.transaction_id", "NetSuite", "direct", 0.90),
        ("tranDate", "datetime", "Transaction.order_date", "NetSuite", "parse_timestamp", 0.88),
    ]
    
    # Legacy SQL Server mappings
    legacy_sql_mappings = [
        ("CUST_ID", "integer", "Customer.customer_id", "Legacy_SQL", "direct", 0.95),
        ("CustomerID", "integer", "Customer.customer_id", "Legacy_SQL", "direct", 0.95),
        ("EMAIL", "string", "Customer.email", "Legacy_SQL", "lower_trim", 0.88),
        ("ORDER_DATE", "datetime", "Transaction.order_date", "Legacy_SQL", "parse_timestamp", 0.88),
        ("AMOUNT", "numeric", "Transaction.amount", "Legacy_SQL", "cast_double", 0.90),
        ("OrderDate", "datetime", "Transaction.order_date", "Legacy_SQL", "parse_timestamp", 0.88),
    ]
    
    # Snowflake mappings
    snowflake_mappings = [
        ("CUSTOMER_ID", "integer", "Customer.customer_id", "Snowflake", "direct", 0.95),
        ("EMAIL", "string", "Customer.email", "Snowflake", "lower_trim", 0.88),
        ("ORDER_DATE", "datetime", "Transaction.order_date", "Snowflake", "parse_timestamp", 0.88),
        ("TOTAL_AMOUNT", "numeric", "Transaction.amount", "Snowflake", "cast_double", 0.90),
        ("CREATED_AT", "datetime", "Transaction.created_at", "Snowflake", "parse_timestamp", 0.88),
    ]
    
    # Combine all mappings
    all_mappings = (
        salesforce_mappings +
        dynamics_mappings +
        sap_mappings +
        netsuite_mappings +
        legacy_sql_mappings +
        snowflake_mappings
    )
    
    # Store each mapping
    count = 0
    for field, ftype, entity, system, transform, conf in all_mappings:
        rag.store_mapping(
            source_field=field,
            source_type=ftype,
            ontology_entity=entity,
            source_system=system,
            transformation=transform,
            confidence=conf,
            validated=True  # These are curated/validated mappings
        )
        count += 1
    
    stats = rag.get_stats()
    print(f"\n✅ Seeded {count} mappings")
    print(f"📊 Total mappings in store: {stats['total_mappings']}")
    print(f"🧠 Embedding model: {stats['embedding_model']}")
    print(f"📐 Dimension: {stats['embedding_dimension']}")
    
    # Test retrieval
    print("\n🔍 Testing retrieval...")
    test_fields = [
        ("AccountId", "string", "Salesforce"),
        ("EMAIL", "string", "Legacy_SQL"),
        ("KUNNR", "string", "SAP")
    ]
    
    for field, ftype, system in test_fields:
        similar = rag.retrieve_similar_mappings(field, ftype, system, top_k=3)
        print(f"\n  Query: {field} ({system})")
        for s in similar[:2]:
            print(f"    → {s['ontology_entity']} (similarity: {s['similarity']:.2f}, conf: {s['confidence']:.2f})")

if __name__ == "__main__":
    seed_common_mappings()
