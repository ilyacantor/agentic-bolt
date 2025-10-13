#!/usr/bin/env python3
"""
Generate enhanced FinOps mock data with production-realistic fields.
Constraint: <20 records per source to minimize deployment footprint.
Focus: Demonstrate DCL capability with rich field coverage.
"""

import csv
import random
from datetime import datetime, timedelta
from pathlib import Path

# Configuration
NUM_RESOURCES = 15  # <20 per constraint
NUM_METRICS = 18    # <20 per constraint  
NUM_COSTS = 18      # <20 per constraint

# AWS instance types and configurations
INSTANCE_TYPES = [
    ('t3.micro', 2, 1, 8, 0.0104),
    ('t3.small', 2, 2, 16, 0.0208),
    ('m5.large', 2, 8, 32, 0.096),
    ('m5.xlarge', 4, 16, 64, 0.192),
    ('m5.2xlarge', 8, 32, 128, 0.384),
    ('c5.xlarge', 4, 8, 32, 0.17),
    ('r5.xlarge', 4, 32, 64, 0.252),
]

RDS_CONFIGS = [
    ('mysql', '8.0.35', 'db.t3.medium', 100, 3000),
    ('postgres', '15.4', 'db.m5.large', 200, 12000),
    ('aurora-mysql', '8.0.mysql_aurora.3.04.0', 'db.r5.xlarge', 500, 16000),
]

S3_CLASSES = ['STANDARD', 'INTELLIGENT_TIERING', 'GLACIER', 'DEEP_ARCHIVE']

REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1']
ENVIRONMENTS = ['prod', 'staging', 'dev']
TEAMS = ['platform', 'data', 'ml', 'api']

def generate_snowflake_resources():
    """Generate AWS_RESOURCES with 40+ fields"""
    resources = []
    
    # Define all possible fields (unified schema)
    all_fields = [
        'RESOURCE_ID', 'RESOURCE_TYPE', 'SERVICE', 'AWS_REGION', 'ACCOUNT_NUM', 
        'ENVIRONMENT', 'COST_CENTER', 'INSTANCE_TYPE', 'VCPUS', 'MEMORY_GB',
        'STORAGE_TYPE', 'STORAGE_SIZE_GB', 'NETWORK_PERFORMANCE', 'EBS_OPTIMIZED',
        'TENANCY', 'PLACEMENT_GROUP', 'AMI_ID', 'LAUNCH_TIME', 'INSTANCE_STATE',
        'AVAILABILITY_ZONE', 'SUBNET_ID', 'VPC_ID', 'SECURITY_GROUPS', 'PUBLIC_IP',
        'PRIVATE_IP', 'IAM_ROLE', 'MONITORING_ENABLED', 'TAGS', 'OWNER', 'PROJECT',
        'COMPLIANCE_LEVEL', 'BACKUP_ENABLED', 'PATCH_GROUP', 'AUTO_SCALING_GROUP',
        'DB_ENGINE', 'ENGINE_VERSION', 'INSTANCE_CLASS', 'ALLOCATED_STORAGE_GB', 'IOPS',
        'MULTI_AZ', 'BACKUP_RETENTION_DAYS', 'PREFERRED_BACKUP_WINDOW', 'READ_REPLICAS',
        'ENCRYPTION_ENABLED', 'PERFORMANCE_INSIGHTS', 'AUTO_MINOR_VERSION_UPGRADE',
        'DB_SUBNET_GROUP', 'PARAMETER_GROUP', 'OPTION_GROUP', 'PUBLICLY_ACCESSIBLE',
        'VPC_SECURITY_GROUPS', 'DELETION_PROTECTION', 'STORAGE_CLASS', 'OBJECT_COUNT', 'SIZE_GB',
        'VERSIONING_ENABLED', 'LIFECYCLE_POLICY', 'ENCRYPTION_TYPE', 'REPLICATION_STATUS',
        'ACCESS_LOGGING', 'INTELLIGENT_TIERING', 'PUBLIC_ACCESS_BLOCKED', 'SCHEME',
        'IP_ADDRESS_TYPE', 'AVAILABILITY_ZONES', 'HTTP2_ENABLED'
    ]
    
    for i in range(NUM_RESOURCES):
        resource_type = random.choice(['ec2', 'rds', 's3', 'alb'])
        region = random.choice(REGIONS)
        env = random.choice(ENVIRONMENTS)
        team = random.choice(TEAMS)
        
        # Initialize with empty values
        resource = {field: '' for field in all_fields}
        
        # Set common fields
        resource.update({
            'AWS_REGION': region,
            'ACCOUNT_NUM': '123456789012',
            'ENVIRONMENT': env,
            'COST_CENTER': team,
            'TAGS': f'env:{env}|team:{team}|managed:terraform',
            'OWNER': f'{team}@company.com',
            'PROJECT': f'project-{random.choice(["alpha", "beta", "gamma"])}',
            'COMPLIANCE_LEVEL': random.choice(['pci', 'hipaa', 'sox', 'none']),
        })
        
        if resource_type == 'ec2':
            inst = random.choice(INSTANCE_TYPES)
            resource.update({
                'RESOURCE_ID': f'i-{random.randint(10000, 99999)}',
                'RESOURCE_TYPE': 'ec2-instance',
                'SERVICE': 'EC2',
                'INSTANCE_TYPE': inst[0],
                'VCPUS': str(inst[1]),
                'MEMORY_GB': str(inst[2]),
                'STORAGE_TYPE': random.choice(['gp3', 'gp2', 'io2']),
                'STORAGE_SIZE_GB': str(inst[3]),
                'NETWORK_PERFORMANCE': random.choice(['Low', 'Moderate', 'High', 'Up to 10 Gigabit']),
                'EBS_OPTIMIZED': random.choice(['true', 'false']),
                'TENANCY': random.choice(['default', 'dedicated']),
                'PLACEMENT_GROUP': random.choice(['', 'cluster-pg-1', 'partition-pg-1']),
                'AMI_ID': f'ami-{random.randint(100000, 999999)}',
                'LAUNCH_TIME': (datetime.now() - timedelta(days=random.randint(1, 365))).strftime('%Y-%m-%d %H:%M:%S'),
                'INSTANCE_STATE': random.choice(['running', 'stopped']),
                'AVAILABILITY_ZONE': f'{region}{random.choice(["a", "b", "c"])}',
                'SUBNET_ID': f'subnet-{random.randint(10000, 99999)}',
                'VPC_ID': f'vpc-{random.randint(10000, 99999)}',
                'SECURITY_GROUPS': f'sg-{random.randint(10000, 99999)}',
                'PUBLIC_IP': f'54.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}',
                'PRIVATE_IP': f'10.0.{random.randint(1,255)}.{random.randint(1,255)}',
                'IAM_ROLE': f'role-{team}-{env}',
                'MONITORING_ENABLED': random.choice(['true', 'false']),
                'BACKUP_ENABLED': random.choice(['true', 'false']),
                'PATCH_GROUP': random.choice(['group-a', 'group-b', 'none']),
                'AUTO_SCALING_GROUP': random.choice(['', f'asg-{team}-{env}']),
            })
        elif resource_type == 'rds':
            rds = random.choice(RDS_CONFIGS)
            resource.update({
                'RESOURCE_ID': f'db-{random.randint(10000, 99999)}',
                'RESOURCE_TYPE': 'rds-instance',
                'SERVICE': 'RDS',
                'DB_ENGINE': rds[0],
                'ENGINE_VERSION': rds[1],
                'INSTANCE_CLASS': rds[2],
                'ALLOCATED_STORAGE_GB': str(rds[3]),
                'IOPS': str(rds[4]),
                'STORAGE_TYPE': random.choice(['gp3', 'io2']),
                'MULTI_AZ': random.choice(['true', 'false']),
                'BACKUP_RETENTION_DAYS': str(random.choice([7, 14, 30])),
                'PREFERRED_BACKUP_WINDOW': random.choice(['03:00-04:00', '04:00-05:00']),
                'READ_REPLICAS': str(random.randint(0, 3)),
                'ENCRYPTION_ENABLED': 'true',
                'PERFORMANCE_INSIGHTS': random.choice(['true', 'false']),
                'AUTO_MINOR_VERSION_UPGRADE': random.choice(['true', 'false']),
                'DB_SUBNET_GROUP': f'subnet-group-{env}',
                'PARAMETER_GROUP': f'pg-{rds[0]}-{env}',
                'OPTION_GROUP': f'og-{rds[0]}-{env}',
                'PUBLICLY_ACCESSIBLE': 'false',
                'VPC_SECURITY_GROUPS': f'sg-{random.randint(10000, 99999)}',
                'AVAILABILITY_ZONE': f'{region}{random.choice(["a", "b"])}',
                'DELETION_PROTECTION': 'true',
            })
        elif resource_type == 's3':
            resource.update({
                'RESOURCE_ID': f'bucket-{team}-{env}-{random.randint(100, 999)}',
                'RESOURCE_TYPE': 's3-bucket',
                'SERVICE': 'S3',
                'STORAGE_CLASS': random.choice(S3_CLASSES),
                'OBJECT_COUNT': str(random.randint(1000, 1000000)),
                'SIZE_GB': str(random.randint(10, 10000)),
                'VERSIONING_ENABLED': random.choice(['true', 'false']),
                'LIFECYCLE_POLICY': random.choice(['enabled', 'disabled']),
                'ENCRYPTION_TYPE': random.choice(['AES256', 'aws:kms']),
                'REPLICATION_STATUS': random.choice(['enabled', 'disabled']),
                'ACCESS_LOGGING': random.choice(['enabled', 'disabled']),
                'INTELLIGENT_TIERING': random.choice(['enabled', 'disabled']),
                'PUBLIC_ACCESS_BLOCKED': 'true',
            })
        else:  # alb
            resource.update({
                'RESOURCE_ID': f'alb-{random.randint(10000, 99999)}',
                'RESOURCE_TYPE': 'application-load-balancer',
                'SERVICE': 'ELB',
                'SCHEME': random.choice(['internet-facing', 'internal']),
                'IP_ADDRESS_TYPE': random.choice(['ipv4', 'dualstack']),
                'AVAILABILITY_ZONES': f'{region}a,{region}b',
                'VPC_ID': f'vpc-{random.randint(10000, 99999)}',
                'SECURITY_GROUPS': f'sg-{random.randint(10000, 99999)}',
                'DELETION_PROTECTION': random.choice(['true', 'false']),
                'HTTP2_ENABLED': 'true',
            })
        
        resources.append(resource)
    
    return resources

def generate_resource_metrics(resources):
    """Generate RESOURCE_METRICS with CloudWatch-style metrics"""
    metrics = []
    
    # Define all possible metric fields (unified schema)
    all_metric_fields = [
        'METRIC_ID', 'RESOURCE_ID', 'TIMESTAMP',
        'CPU_UTILIZATION', 'MEMORY_UTILIZATION', 'DISK_READ_OPS', 'DISK_WRITE_OPS',
        'NETWORK_IN_MB', 'NETWORK_OUT_MB', 'NETWORK_PACKETS_IN', 'NETWORK_PACKETS_OUT',
        'STATUS_CHECK_FAILED', 'DB_CONNECTIONS', 'READ_LATENCY_MS', 'WRITE_LATENCY_MS',
        'READ_THROUGHPUT_MB', 'WRITE_THROUGHPUT_MB', 'DISK_QUEUE_DEPTH', 'FREE_STORAGE_GB',
        'BUCKET_SIZE_BYTES', 'NUMBER_OF_OBJECTS', 'GET_REQUESTS', 'PUT_REQUESTS',
        'DELETE_REQUESTS', 'LIST_REQUESTS', 'BYTES_DOWNLOADED', 'BYTES_UPLOADED',
        'ACTIVE_CONNECTIONS', 'NEW_CONNECTIONS', 'REQUEST_COUNT', 'TARGET_RESPONSE_TIME_MS',
        'HTTP_2XX_COUNT', 'HTTP_4XX_COUNT', 'HTTP_5XX_COUNT', 'PROCESSED_BYTES'
    ]
    
    # Select subset of resources for metrics
    for resource in resources[:NUM_METRICS]:
        timestamp = datetime.now() - timedelta(hours=random.randint(1, 24))
        
        # Initialize with empty values
        metric = {field: '' for field in all_metric_fields}
        metric.update({
            'METRIC_ID': f'metric-{random.randint(100000, 999999)}',
            'RESOURCE_ID': resource['RESOURCE_ID'],
            'TIMESTAMP': timestamp.strftime('%Y-%m-%d %H:%M:%S'),
        })
        
        if resource['RESOURCE_TYPE'] == 'ec2-instance':
            metric.update({
                'CPU_UTILIZATION': str(round(random.uniform(10, 95), 2)),
                'MEMORY_UTILIZATION': str(round(random.uniform(20, 85), 2)),
                'DISK_READ_OPS': str(random.randint(100, 10000)),
                'DISK_WRITE_OPS': str(random.randint(50, 5000)),
                'NETWORK_IN_MB': str(round(random.uniform(10, 500), 2)),
                'NETWORK_OUT_MB': str(round(random.uniform(5, 300), 2)),
                'NETWORK_PACKETS_IN': str(random.randint(1000, 100000)),
                'NETWORK_PACKETS_OUT': str(random.randint(800, 80000)),
                'STATUS_CHECK_FAILED': str(random.randint(0, 1)),
            })
        elif resource['RESOURCE_TYPE'] == 'rds-instance':
            metric.update({
                'CPU_UTILIZATION': str(round(random.uniform(5, 80), 2)),
                'MEMORY_UTILIZATION': str(round(random.uniform(30, 75), 2)),
                'DB_CONNECTIONS': str(random.randint(5, 200)),
                'READ_LATENCY_MS': str(round(random.uniform(1, 50), 2)),
                'WRITE_LATENCY_MS': str(round(random.uniform(2, 80), 2)),
                'READ_THROUGHPUT_MB': str(round(random.uniform(5, 100), 2)),
                'WRITE_THROUGHPUT_MB': str(round(random.uniform(2, 50), 2)),
                'DISK_QUEUE_DEPTH': str(random.randint(0, 10)),
                'FREE_STORAGE_GB': str(random.randint(10, 200)),
            })
        elif resource['RESOURCE_TYPE'] == 's3-bucket':
            metric.update({
                'BUCKET_SIZE_BYTES': str(random.randint(1000000, 10000000000)),
                'NUMBER_OF_OBJECTS': str(random.randint(100, 1000000)),
                'GET_REQUESTS': str(random.randint(100, 100000)),
                'PUT_REQUESTS': str(random.randint(10, 10000)),
                'DELETE_REQUESTS': str(random.randint(0, 1000)),
                'LIST_REQUESTS': str(random.randint(5, 500)),
                'BYTES_DOWNLOADED': str(random.randint(1000000, 1000000000)),
                'BYTES_UPLOADED': str(random.randint(100000, 100000000)),
            })
        else:  # alb
            metric.update({
                'ACTIVE_CONNECTIONS': str(random.randint(10, 5000)),
                'NEW_CONNECTIONS': str(random.randint(100, 10000)),
                'REQUEST_COUNT': str(random.randint(1000, 100000)),
                'TARGET_RESPONSE_TIME_MS': str(round(random.uniform(50, 500), 2)),
                'HTTP_2XX_COUNT': str(random.randint(900, 95000)),
                'HTTP_4XX_COUNT': str(random.randint(10, 3000)),
                'HTTP_5XX_COUNT': str(random.randint(0, 1000)),
                'PROCESSED_BYTES': str(random.randint(1000000, 100000000)),
            })
        
        metrics.append(metric)
    
    return metrics

def generate_aws_costs(resources):
    """Generate AWS_COSTS with 25+ billing fields"""
    costs = []
    
    for resource in resources[:NUM_COSTS]:
        date = datetime.now() - timedelta(days=random.randint(0, 30))
        
        # Base pricing
        if resource['RESOURCE_TYPE'] == 'ec2-instance':
            hourly_rate = next((r[4] for r in INSTANCE_TYPES if r[0] == resource.get('INSTANCE_TYPE')), 0.10)
            daily_cost = hourly_rate * 24
        elif resource['RESOURCE_TYPE'] == 'rds-instance':
            daily_cost = random.uniform(5, 50)
        elif resource['RESOURCE_TYPE'] == 's3-bucket':
            daily_cost = random.uniform(1, 20)
        else:  # alb
            daily_cost = random.uniform(0.5, 10)
        
        cost = {
            'COST_ID': f'cost-{random.randint(100000, 999999)}',
            'RESOURCE_ID': resource['RESOURCE_ID'],
            'DATE': date.strftime('%Y-%m-%d'),
            'BILLING_PERIOD': date.strftime('%Y-%m'),
            'AWS_ACCOUNT': '123456789012',
            'SERVICE_CATEGORY': resource['SERVICE'],
            'USAGE_TYPE': f"{resource['AWS_REGION']}-{resource['RESOURCE_TYPE']}-usage",
            'OPERATION': random.choice(['RunInstances', 'CreateDBInstance', 'PutObject', 'ProcessBytes']),
            'PRICING_TERM': random.choice(['OnDemand', 'Reserved', 'Spot']),
            'ON_DEMAND_COST': round(daily_cost, 2),
            'RESERVED_COST': round(daily_cost * 0.7, 2) if random.random() > 0.5 else 0,
            'SAVINGS_PLAN_COST': round(daily_cost * 0.75, 2) if random.random() > 0.7 else 0,
            'SPOT_COST': round(daily_cost * 0.3, 2) if random.random() > 0.8 else 0,
            'MONTHLY_COST': round(daily_cost * 30, 2),
            'DATA_TRANSFER_COST': round(random.uniform(0, 50), 2),
            'SUPPORT_COST': round(daily_cost * 0.1, 2),
            'TAX_AMOUNT': round(daily_cost * 0.08, 2),
            'USAGE_QUANTITY': random.randint(1, 1000),
            'UNIT_PRICE': round(daily_cost / 24, 4),
            'CURRENCY': 'USD',
            'AMORTIZED_COST': round(daily_cost * 0.95, 2),
            'BLENDED_COST': round(daily_cost * 0.92, 2),
            'UNBLENDED_COST': round(daily_cost, 2),
            'REGION': resource['AWS_REGION'],
            'AVAILABILITY_ZONE': resource.get('AVAILABILITY_ZONE', ''),
            'PURCHASE_OPTION': random.choice(['OnDemand', 'Reserved', 'Spot', 'SavingsPlan']),
        }
        
        costs.append(cost)
    
    return costs

def generate_netsuite_cloudspend():
    """Generate NetSuite CloudSpend with 15+ fields"""
    spends = []
    
    for i in range(15):
        date = datetime.now() - timedelta(days=random.randint(0, 90))
        service = random.choice(['EC2-Instance', 'RDS-Database', 'S3-Storage', 'ALB-LoadBalancer'])
        
        spend = {
            'TransactionID': f'NS-CS-{1000 + i}',
            'VendorName': 'AWS',
            'VendorID': 'VND-AWS-001',
            'ServiceCategory': service,
            'Monthly_Cost': round(random.uniform(5000, 50000), 2),
            'Currency': 'USD',
            'PurchaseDate': date.strftime('%Y-%m-%d'),
            'CostCenter': random.choice(['Engineering', 'DataScience', 'Infrastructure']),
            'UsageType': random.choice(['Instance-Hours', 'GB-Month', 'Requests', 'ProcessedBytes']),
            'Region': random.choice(REGIONS),
            'PaymentTerms': random.choice(['NET30', 'NET60', 'Prepaid']),
            'InvoiceNumber': f'INV-{random.randint(10000, 99999)}',
            'PurchaseOrderNumber': f'PO-{random.randint(10000, 99999)}',
            'ApprovalStatus': random.choice(['Approved', 'Pending', 'Paid']),
            'Department': random.choice(['IT', 'R&D', 'Operations']),
        }
        
        spends.append(spend)
    
    return spends

def generate_sap_invoices():
    """Generate SAP CLOUD_INVOICES with 15+ fields"""
    invoices = []
    
    for i in range(15):
        date = datetime.now() - timedelta(days=random.randint(0, 120))
        service = random.choice(['EC2-Instance', 'RDS-Database', 'S3-Storage', 'DataTransfer'])
        
        invoice = {
            'INVOICE_NUM': f'INV-2024-{1000 + i}',
            'VENDOR_CODE': 'AWS-GLOBAL',
            'INVOICE_DATE': date.strftime('%Y-%m-%d'),
            'Monthly_Cost': round(random.uniform(10000, 100000), 2),
            'CURRENCY': 'USD',
            'ServiceCategory': service,
            'UsageType': random.choice(['Instance-Hours', 'GB-Month', 'GB-Transfer', 'API-Requests']),
            'PAYMENT_TERM': random.choice(['NET30', 'NET45', 'NET60']),
            'STATUS': random.choice(['PAID', 'PENDING', 'OVERDUE']),
            'DUE_DATE': (date + timedelta(days=30)).strftime('%Y-%m-%d'),
            'PAID_DATE': (date + timedelta(days=random.randint(20, 40))).strftime('%Y-%m-%d') if random.random() > 0.3 else '',
            'COMPANY_CODE': f'CC-{random.randint(1000, 9999)}',
            'COST_CENTER': random.choice(['CC-ENG', 'CC-OPS', 'CC-DATA']),
            'GL_ACCOUNT': f'GL-{random.randint(100000, 999999)}',
            'FISCAL_YEAR': '2024',
            'FISCAL_PERIOD': date.strftime('%m'),
        }
        
        invoices.append(invoice)
    
    return invoices

def write_csv(filename, data):
    """Write data to CSV file"""
    if not data:
        return
    
    filepath = Path(__file__).parent.parent / filename
    filepath.parent.mkdir(parents=True, exist_ok=True)
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)
    
    print(f"✓ Generated {filepath} with {len(data)} records, {len(data[0])} fields")

def main():
    print("Generating enhanced FinOps mock data...")
    print(f"Constraint: <20 records per source\n")
    
    # Generate Snowflake data
    resources = generate_snowflake_resources()
    write_csv('schemas/snowflake/AWS_RESOURCES.csv', resources)
    
    metrics = generate_resource_metrics(resources)
    write_csv('schemas/snowflake/RESOURCE_METRICS.csv', metrics)
    
    costs = generate_aws_costs(resources)
    write_csv('schemas/snowflake/AWS_COSTS.csv', costs)
    
    # Generate NetSuite data
    cloudspend = generate_netsuite_cloudspend()
    write_csv('schemas/netsuite/CloudSpend.csv', cloudspend)
    
    # Generate SAP data
    invoices = generate_sap_invoices()
    write_csv('schemas/sap/CLOUD_INVOICES.csv', invoices)
    
    print(f"\n✓ Complete! Total CSV footprint: ~150-200 KB")
    print(f"✓ Field coverage: 40+ fields for AWS_RESOURCES, 25+ for AWS_COSTS")
    print(f"✓ New RESOURCE_METRICS table adds cloud_usage entity data")

if __name__ == '__main__':
    main()
