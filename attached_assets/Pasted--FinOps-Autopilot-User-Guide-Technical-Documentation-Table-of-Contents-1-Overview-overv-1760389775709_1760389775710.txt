# FinOps Autopilot - User Guide & Technical Documentation

## Table of Contents
1. [Overview](#overview)
2. [Data Sources](#data-sources)
3. [Getting Started](#getting-started)
4. [Dashboard Features](#dashboard-features)
5. [Cost Analysis](#cost-analysis)
6. [Managing Recommendations](#managing-recommendations)
7. [Approval Workflows](#approval-workflows)
8. [Automation & Governance](#automation--governance)
9. [Real-Time Monitoring](#real-time-monitoring)
10. [API Reference](#api-reference)
11. [Troubleshooting](#troubleshooting)

## Overview

FinOps Autopilot is an enterprise cloud cost optimization platform that automatically analyzes your AWS infrastructure, identifies cost-saving opportunities, and provides actionable recommendations to reduce cloud spending. The platform combines intelligent resource analysis with financial operations (FinOps) best practices, offering both automated insights and human oversight for cost optimization decisions.

### Key Benefits
- **Automated Cost Analysis**: Continuous monitoring of AWS resources and spending patterns
- **Intelligent Recommendations**: AI-driven suggestions for cost optimization with risk assessment
- **Enterprise Workflows**: Multi-stage approval processes for governance and compliance
- **Real-Time Insights**: Live dashboards showing cost trends, savings opportunities, and optimization progress
- **Slack Integration**: Automated notifications for team collaboration

## Data Sources

### Primary AWS Data Sources

#### 1. AWS Cost Explorer API
**Purpose**: Provides detailed cost and usage data for comprehensive spend analysis.

**Data Collected**:
- Daily cost breakdowns by service (EC2, RDS, S3, etc.)
- Usage quantities and pricing metrics
- Cost trends and projections
- Service-level spending patterns

**How It Works**:
```javascript
// Example API call structure
const costData = await costExplorer.getCostAndUsage({
  TimePeriod: { Start: '2025-01-01', End: '2025-01-31' },
  Granularity: 'DAILY',
  Metrics: ['BlendedCost', 'UsageQuantity'],
  GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }]
});
```

**Update Frequency**: Daily (automated via scheduler)

#### 2. AWS CloudWatch Metrics
**Purpose**: Resource utilization monitoring for optimization recommendations.

**Data Collected**:
- CPU utilization percentages
- Memory usage statistics
- Network I/O metrics
- Storage performance data
- Custom application metrics

**Key Metrics Monitored**:
- EC2: CPU, Memory, Network, Disk I/O
- RDS: CPU, Connections, Read/Write IOPS
- Redshift: CPU, Connection count, Query performance
- S3: Request metrics, Transfer rates

**Update Frequency**: Hourly collection, analyzed daily

#### 3. AWS Trusted Advisor
**Purpose**: AWS-native cost optimization recommendations and security insights.

**Data Collected**:
- Low utilization EC2 instances
- Unattached EBS volumes
- Idle load balancers
- Reserved Instance optimization opportunities
- Security group violations

**Integration Method**: 
- Requires AWS Business or Enterprise Support plan
- Automated checks run weekly
- Results integrated with platform recommendations

#### 4. AWS Resource APIs
**Purpose**: Current configuration and state information for all monitored resources.

**Resources Monitored**:

| Resource Type | API Source | Configuration Data |
|---------------|------------|-------------------|
| EC2 Instances | EC2 API | Instance type, region, tags, security groups |
| RDS Databases | RDS API | Engine, instance class, storage, backup settings |
| Redshift Clusters | Redshift API | Node type, cluster size, encryption |
| S3 Buckets | S3 API | Storage class, lifecycle policies, versioning |
| Load Balancers | ELB API | Type, targets, health checks |

### Data Storage Schema

#### AWS Resources Table
```sql
CREATE TABLE aws_resources (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id TEXT NOT NULL UNIQUE,        -- AWS resource identifier
  resource_type TEXT NOT NULL,             -- EC2, RDS, S3, etc.
  region TEXT NOT NULL,                    -- AWS region
  current_config JSONB NOT NULL,          -- Current resource configuration
  utilization_metrics JSONB,              -- Performance metrics
  monthly_cost DECIMAL(10,2),             -- Current monthly cost
  last_analyzed TIMESTAMP DEFAULT NOW(),   -- Last analysis timestamp
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Cost Reports Table
```sql
CREATE TABLE cost_reports (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date TIMESTAMP NOT NULL,         -- Cost report date
  service_category TEXT NOT NULL,         -- AWS service (EC2, RDS, etc.)
  resource_id TEXT,                       -- Specific resource (optional)
  cost DECIMAL(12,2) NOT NULL,           -- Daily cost amount
  usage DECIMAL(12,6),                   -- Usage quantity
  usage_type TEXT,                       -- Usage type (hours, GB, etc.)
  region TEXT,                           -- AWS region
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Recommendations Table
```sql
CREATE TABLE recommendations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id TEXT NOT NULL,             -- Target AWS resource
  type TEXT NOT NULL,                    -- resize, terminate, storage-class, etc.
  priority TEXT NOT NULL,               -- critical, high, medium, low
  title TEXT NOT NULL,                  -- Recommendation title
  description TEXT NOT NULL,            -- Detailed description
  current_config JSONB NOT NULL,       -- Current resource state
  recommended_config JSONB NOT NULL,   -- Proposed new configuration
  projected_monthly_savings DECIMAL(10,2), -- Expected monthly savings
  projected_annual_savings DECIMAL(10,2),  -- Expected annual savings
  risk_level DECIMAL(5,2),             -- Risk percentage (0-100)
  status TEXT DEFAULT 'pending',       -- pending, approved, rejected, executed
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Data Update Schedule

| Data Source | Frequency | Method | Purpose |
|-------------|-----------|---------|----------|
| Cost Explorer | Daily at 6 AM UTC | Automated | Cost trend analysis |
| CloudWatch Metrics | Every hour | Automated | Utilization monitoring |
| Trusted Advisor | Weekly | Automated | AWS-native recommendations |
| Resource Configuration | Daily at 8 AM UTC | API polling | Configuration drift detection |
| Recommendations Generation | Daily at 10 AM UTC | Analysis engine | New optimization opportunities |

## Getting Started

### Initial Setup

1. **Access the Platform**
   - Navigate to your FinOps Autopilot dashboard
   - Log in with your enterprise credentials
   - Verify your user role (User, Admin, or CFO)

2. **Generate Sample Data** (Development/Testing)
   ```bash
   # Navigate to dashboard and use the data generation endpoint
   curl -X POST /api/generate-aws-data
   ```

3. **Verify Data Integration**
   - Check the "Resources Analyzed" metric on the dashboard
   - Ensure cost data is populated for the current month
   - Verify recommendations are being generated

### Dashboard Overview

Your dashboard provides a real-time view of your cloud cost optimization status:

**Key Metrics Displayed**:
- **Monthly Spend**: Current month's AWS costs
- **Identified Savings**: Total potential monthly savings from pending recommendations
- **Realized Savings**: Actual savings from approved optimizations
- **Resources Analyzed**: Number of AWS resources under management
- **Waste Percentage**: Percentage of spend that could be optimized

## Dashboard Features

### Real-Time Metrics Cards

#### Monthly Spend Tracking
**Purpose**: Monitor current month's AWS expenditure against projections.

**How to Use**:
1. View the large dollar amount for current month spend
2. Compare against last month's total (shown as trend)
3. Check the percentage change indicator (green = decrease, red = increase)

**What to Watch For**:
- Sudden spikes in daily spending
- Consistent month-over-month increases
- Spending approaching budget thresholds

#### Cost Optimization Opportunities
**Purpose**: Track potential and realized savings from recommendations.

**Metrics Explained**:
- **Identified Savings**: Total monthly savings available from pending recommendations
- **Realized Savings**: Actual savings achieved from approved optimizations
- **Conversion Rate**: Percentage of identified savings that have been realized

**Best Practices**:
- Aim for 80%+ conversion rate of identified to realized savings
- Focus on high-impact, low-risk recommendations first
- Regular review of pending recommendations

### Resource Utilization Overview

**Purpose**: Understand the distribution and efficiency of your AWS resources.

**Resource Categories**:
- **EC2 Instances**: Compute resources and their utilization
- **RDS Databases**: Database instances and performance metrics
- **S3 Storage**: Storage usage and lifecycle optimization
- **Other Services**: Load balancers, Redshift, additional services

**Utilization Indicators**:
- **Green**: Optimal utilization (70-90%)
- **Yellow**: Moderate efficiency opportunities (50-70%)
- **Red**: Significant optimization needed (<50%)

### Activity Feed

**Purpose**: Track recent optimization activities and their outcomes.

**Activity Types**:
- **New Recommendations**: Recently identified optimization opportunities
- **Approvals**: Recommendations approved for implementation
- **Optimizations Executed**: Completed cost-saving actions
- **Cost Impact**: Realized savings from completed optimizations

**How to Use**:
1. Monitor the feed for new recommendations requiring attention
2. Track the progress of approved optimizations
3. Verify successful completion of cost-saving measures

## Cost Analysis

### Monthly Cost Trends

#### Viewing Cost Trends
1. **Navigate to Cost Analysis** page from the main navigation
2. **Review the trend chart** showing 6 months of historical data
3. **Analyze patterns** for seasonal trends or unusual spikes

#### Understanding the Metrics

**Chart Components**:
- **Blue Line**: Historical monthly costs
- **Orange Line**: Projected costs with current optimizations
- **Green Areas**: Potential savings periods
- **Red Areas**: Cost increase periods

**Key Indicators**:
- **Trend Direction**: Overall cost trajectory (increasing/decreasing)
- **Volatility**: Month-to-month variance in spending
- **Optimization Impact**: Difference between actual and projected costs

#### Cost Breakdown Analysis

**Service-Level Analysis**:
```javascript
// Example cost breakdown by service
{
  "EC2": "$12,450.23",
  "RDS": "$3,240.18", 
  "S3": "$1,890.45",
  "Redshift": "$2,156.78"
}
```

**Regional Distribution**:
- Monitor costs across different AWS regions
- Identify opportunities for regional optimization
- Consider data transfer costs between regions

### Savings Tracking

#### Potential vs. Realized Savings

**Potential Savings**:
- Total monthly savings from all pending recommendations
- Calculated based on current resource utilization
- Updated daily as new recommendations are generated

**Realized Savings**:
- Actual cost reductions from approved and executed optimizations
- Verified against monthly billing data
- Tracked over time to measure optimization program success

#### Savings Categories

| Category | Typical Savings | Implementation Risk | Time to Realize |
|----------|-----------------|-------------------|-----------------|
| EC2 Rightsizing | 20-40% | Low | Immediate |
| Reserved Instances | 30-60% | Low | 1-3 years |
| Storage Optimization | 50-80% | Very Low | Immediate |
| Unused Resources | 100% | Medium | Immediate |

## Managing Recommendations

### Understanding Recommendation Types

#### 1. Resource Rightsizing
**Purpose**: Optimize instance sizes based on actual utilization.

**Common Scenarios**:
- **Downsize EC2 instances** with consistently low CPU usage
- **Upgrade under-performing instances** causing bottlenecks
- **Switch instance families** for better price/performance ratio

**Example Recommendation**:
```json
{
  "type": "resize",
  "priority": "high",
  "title": "Downsize Over-Provisioned EC2 Instance",
  "currentConfig": {
    "instanceType": "m5.2xlarge",
    "vcpus": 8,
    "memory": "32 GiB"
  },
  "recommendedConfig": {
    "instanceType": "m5.large", 
    "vcpus": 2,
    "memory": "8 GiB"
  },
  "projectedMonthlySavings": "185.50",
  "riskLevel": "12.0"
}
```

#### 2. Reserved Instance Optimization
**Purpose**: Reduce costs through AWS Reserved Instance commitments.

**Best For**:
- Stable, predictable workloads running 24/7
- Production environments with consistent usage
- Long-term projects (1-3 years)

**Savings Potential**: 30-60% compared to On-Demand pricing

#### 3. Storage Class Optimization
**Purpose**: Move infrequently accessed data to cheaper storage classes.

**S3 Storage Classes**:
- **Standard**: Frequently accessed data
- **Standard-IA**: Infrequently accessed (30+ days)
- **Glacier**: Long-term archival (90+ days)
- **Deep Archive**: Rarely accessed (180+ days)

#### 4. Resource Termination
**Purpose**: Eliminate unused or idle resources.

**Common Targets**:
- Development instances running outside business hours
- Unattached EBS volumes
- Idle load balancers
- Unused NAT gateways

### Recommendation Priority Levels

#### Critical Priority
- **Risk Level**: Very low (0-5%)
- **Impact**: High cost savings with minimal business risk
- **Action Required**: Should be implemented immediately
- **Examples**: Terminate unused resources, fix misconfigurations

#### High Priority  
- **Risk Level**: Low (5-15%)
- **Impact**: Significant savings with manageable risk
- **Action Required**: Review and implement within 1 week
- **Examples**: Rightsize over-provisioned instances, storage optimization

#### Medium Priority
- **Risk Level**: Medium (15-25%)
- **Impact**: Moderate savings requiring careful evaluation
- **Action Required**: Assess impact and plan implementation
- **Examples**: Instance family changes, reserved instance purchases

#### Low Priority
- **Risk Level**: Higher (25%+)
- **Impact**: Potential savings but requires extensive testing
- **Action Required**: Consider for future optimization cycles
- **Examples**: Major architectural changes, multi-region optimizations

### Bulk Approval Process

#### Using the "Approve All" Feature
1. **Navigate to the Dashboard** recommendations panel
2. **Review pending recommendations** to ensure they align with your policies
3. **Click "Approve All (X)"** where X is the number of pending recommendations
4. **Monitor the progress** as the system processes all approvals
5. **Verify completion** through the success notification showing total savings

#### What Happens During Bulk Approval
```javascript
// Bulk approval process
for (const recommendation of pendingRecommendations) {
  // Create approval request
  await createApprovalRequest({
    recommendationId: recommendation.id,
    status: 'approved',
    approvedBy: currentUser,
    comments: 'Bulk approved with X other recommendations'
  });
  
  // Update recommendation status
  await updateRecommendationStatus(recommendation.id, 'approved');
  
  // Log optimization history
  await createOptimizationHistory({
    recommendationId: recommendation.id,
    executedBy: currentUser,
    executionDate: new Date(),
    actualSavings: recommendation.projectedMonthlySavings,
    status: 'approved'
  });
}
```

#### Post-Approval Actions
- **Real-time notifications** sent to Slack channels
- **Dashboard metrics updated** with new realized savings
- **Activity feed updated** with approval records
- **Optimization history created** for audit trails

## Approval Workflows

### Enterprise Approval Process

#### 1. Recommendation Generation
- System analyzes AWS resources daily
- Recommendations created with risk assessment
- Initial status set to "pending"

#### 2. Review and Assessment
**Who**: Cloud platform team, DevOps engineers, resource owners
**Timeline**: 24-48 hours for review
**Process**:
1. Evaluate business impact of proposed changes
2. Assess risk level and mitigation strategies
3. Coordinate with affected teams
4. Schedule implementation window if needed

#### 3. Approval Request Submission
**Required Information**:
- Recommendation details and justification
- Requested by (engineer submitting for approval)
- Approver role (typically "Head of Cloud Platform")
- Implementation comments and special instructions

**Example Approval Request**:
```json
{
  "recommendationId": "rec-abc123",
  "requestedBy": "john.doe@company.com",
  "approverRole": "Head of Cloud Platform",
  "comments": "Low-risk optimization for development environment. Implementation planned during maintenance window.",
  "urgency": "normal"
}
```

#### 4. Executive Approval
**Approver Roles**:
- **Head of Cloud Platform**: Technical optimizations under $10k annual savings
- **Engineering Director**: Medium-impact changes $10k-$50k annual savings  
- **CFO**: High-impact optimizations over $50k annual savings

**Approval Criteria**:
- Business impact assessment
- Risk mitigation plans
- ROI calculation and timeline
- Compliance with governance policies

#### 5. Implementation and Monitoring
- Automated execution of approved optimizations
- Real-time monitoring of implementation success
- Rollback procedures for failed optimizations
- Post-implementation validation and reporting

### Approval Request Statuses

| Status | Description | Next Actions |
|--------|-------------|--------------|
| **pending** | Awaiting approval decision | Review required |
| **approved** | Ready for implementation | Execute optimization |
| **rejected** | Not approved for implementation | Document reasoning, consider alternatives |
| **executed** | Successfully implemented | Monitor performance, validate savings |
| **failed** | Implementation unsuccessful | Investigate failure, plan retry |

### Governance Integration

#### Policy Compliance
- All approvals tracked for audit purposes
- Approval chains enforce spending authority limits
- Automated policy checks before implementation

#### Audit Trail
```sql
-- Example optimization history record
SELECT 
  r.title,
  oh.executed_by,
  oh.execution_date,
  oh.actual_savings,
  oh.status,
  ar.approver_role,
  ar.approval_date
FROM optimization_history oh
JOIN recommendations r ON oh.recommendation_id = r.id
JOIN approval_requests ar ON ar.recommendation_id = r.id
WHERE oh.execution_date >= '2025-01-01';
```

## Automation & Governance

### Automated Analysis Scheduling

#### Daily Analysis Tasks
**Time**: 6:00 AM UTC
**Tasks**:
1. **Cost Data Sync**: Import previous day's cost data from AWS Cost Explorer
2. **Resource Discovery**: Scan for new AWS resources across all monitored regions
3. **Utilization Analysis**: Process CloudWatch metrics for optimization opportunities
4. **Recommendation Generation**: Create new cost optimization recommendations

#### Weekly Analysis Tasks  
**Time**: Sunday 8:00 AM UTC
**Tasks**:
1. **Trusted Advisor Sync**: Import AWS Trusted Advisor findings
2. **Trend Analysis**: Analyze weekly cost and usage patterns
3. **Recommendation Prioritization**: Update recommendation priorities based on utilization trends
4. **Governance Report Generation**: Create weekly governance and compliance reports

#### Monthly Analysis Tasks
**Time**: 1st of month, 10:00 AM UTC  
**Tasks**:
1. **Monthly Cost Report**: Generate comprehensive cost analysis
2. **Savings Validation**: Verify actual savings against projections
3. **ROI Calculation**: Calculate return on investment for optimization program
4. **Capacity Planning**: Forecast future resource and cost requirements

### Governance Policies

#### Automated Policy Enforcement

**Resource Tagging Compliance**:
```javascript
// Example policy check
const requiredTags = ['Environment', 'Team', 'Project', 'CostCenter'];
const untaggedResources = resources.filter(resource => {
  const tags = JSON.parse(resource.tags || '{}');
  return !requiredTags.every(tag => tags[tag]);
});
```

**Cost Threshold Monitoring**:
- Alert when monthly costs exceed budget by 10%
- Automatic approval required for optimizations over $5k annual savings
- CFO approval mandatory for changes affecting production resources

**Security and Compliance**:
- All optimization activities logged for audit
- Approval chains enforce separation of duties
- Automated checks for PCI/SOX compliance requirements

### Notification and Alerting

#### Slack Integration
**Setup Requirements**:
- Slack workspace with bot permissions
- Channel designated for FinOps notifications
- Integration token configured in environment variables

**Notification Types**:
```javascript
// New high-priority recommendation
{
  "type": "new_recommendation",
  "priority": "critical", 
  "title": "Urgent: Idle EC2 instance costing $500/month",
  "potential_savings": "$500.00/month",
  "action_required": "Review and approve termination"
}

// Optimization completed
{
  "type": "optimization_completed",
  "title": "Successfully downsized RDS instance",
  "actual_savings": "$245.67/month",
  "status": "success"
}

// Monthly summary
{
  "type": "monthly_summary",
  "total_savings": "$12,450.32",
  "recommendations_processed": 15,
  "success_rate": "93%"
}
```

#### Email Alerts
- Daily digest of new recommendations
- Weekly optimization summary
- Monthly cost and savings report
- Critical alerts for budget threshold breaches

## Real-Time Monitoring

### WebSocket Integration

#### Live Dashboard Updates
The platform uses WebSocket connections to provide real-time updates without page refreshes.

**Connection Setup**:
```javascript
// Client-side WebSocket connection
const ws = new WebSocket('wss://your-domain/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  handleRealtimeUpdate(data);
};
```

**Update Types**:
- **new_recommendation**: New optimization opportunity identified
- **approval_request**: Recommendation submitted for approval  
- **optimization_executed**: Optimization implementation completed
- **bulk_approval**: Multiple recommendations approved simultaneously
- **cost_alert**: Spending threshold exceeded

#### Automatic Data Refresh
**Query Invalidation**: When real-time events occur, the frontend automatically refreshes related data:

```javascript
// Example: After bulk approval, refresh all related queries
queryClient.invalidateQueries({ queryKey: ['/api/recommendations'] });
queryClient.invalidateQueries({ queryKey: ['/api/dashboard/metrics'] });
queryClient.invalidateQueries({ queryKey: ['/api/optimization-history'] });
```

### Performance Monitoring

#### System Health Metrics
- **API Response Times**: Monitor for degradation in API performance
- **Database Query Performance**: Track slow queries and optimization opportunities
- **WebSocket Connection Health**: Monitor real-time connection stability
- **AWS API Rate Limits**: Ensure compliance with AWS API throttling

#### Cost Optimization Metrics
- **Recommendation Accuracy**: Track how often projections match actual results
- **Implementation Success Rate**: Monitor failed optimization attempts
- **Time to Value**: Measure time from recommendation to realized savings

## API Reference

### Authentication
All API endpoints require valid session authentication. Ensure you're logged in before making API calls.

### Core Endpoints

#### Dashboard Metrics
```http
GET /api/dashboard/metrics
```
**Response**:
```json
{
  "monthlySpend": 18501.68,
  "identifiedSavings": 3245.67,
  "realizedSavings": 12456.89,
  "resourcesAnalyzed": 234,
  "wastePercentage": 17.5,
  "trendsData": {
    "currentMonth": 18501.68,
    "lastMonth": 19234.12,
    "changePercentage": -3.8
  }
}
```

#### Cost Trends
```http
GET /api/dashboard/cost-trends
```
**Response**:
```json
[
  {
    "month": "2025-01",
    "totalCost": 18501.68,
    "projectedCost": 15234.12,
    "potentialSavings": 3267.56
  }
]
```

#### Recommendations
```http
GET /api/recommendations?status=pending
```
**Parameters**:
- `status` (optional): Filter by status (pending, approved, rejected, executed)

**Response**:
```json
[
  {
    "id": "rec-abc123",
    "resourceId": "i-1234567890abcdef0",
    "type": "resize",
    "priority": "high",
    "title": "Downsize Over-Provisioned EC2 Instance",
    "description": "Instance shows consistently low utilization...",
    "currentConfig": {
      "instanceType": "m5.2xlarge",
      "vcpus": 8,
      "memory": "32 GiB"
    },
    "recommendedConfig": {
      "instanceType": "m5.large",
      "vcpus": 2, 
      "memory": "8 GiB"
    },
    "projectedMonthlySavings": "185.50",
    "projectedAnnualSavings": "2226.00",
    "riskLevel": "12.0",
    "status": "pending",
    "createdAt": "2025-09-13T10:30:00Z"
  }
]
```

#### Create Approval Request
```http
POST /api/approval-requests
```
**Request Body**:
```json
{
  "recommendationId": "rec-abc123",
  "requestedBy": "john.doe@company.com",
  "approverRole": "Head of Cloud Platform",
  "comments": "Low-risk optimization for development environment"
}
```

#### Bulk Approve Recommendations
```http
POST /api/approve-all-recommendations
```
**Request Body**:
```json
{
  "approvedBy": "jane.smith@company.com",
  "comments": "Quarterly bulk approval of low-risk optimizations"
}
```

**Response**:
```json
{
  "message": "Successfully approved 4 of 4 pending recommendations",
  "approvedCount": 4,
  "totalAttempted": 4,
  "totalAnnualSavings": 4855.56,
  "recommendations": [
    {
      "id": "rec-abc123",
      "title": "Downsize Development Database Instance", 
      "projectedAnnualSavings": "758.16"
    }
  ],
  "errors": []
}
```

#### AWS Resources
```http
GET /api/aws-resources
```
**Response**:
```json
[
  {
    "id": "res-xyz789",
    "resourceId": "i-1234567890abcdef0",
    "resourceType": "EC2",
    "region": "us-east-1",
    "currentConfig": {
      "instanceType": "m5.2xlarge",
      "state": "running"
    },
    "utilizationMetrics": {
      "cpuUtilization": 25.5,
      "memoryUtilization": 40.2
    },
    "monthlyCost": "245.76",
    "lastAnalyzed": "2025-09-13T10:00:00Z"
  }
]
```

#### Optimization History
```http
GET /api/optimization-history?limit=50
```
**Parameters**:
- `limit` (optional): Number of records to return (default: 50)

**Response**:
```json
[
  {
    "id": "hist-def456",
    "recommendationId": "rec-abc123",
    "executedBy": "john.doe@company.com",
    "executionDate": "2025-09-13T14:30:00Z",
    "beforeConfig": {
      "instanceType": "m5.2xlarge"
    },
    "afterConfig": {
      "instanceType": "m5.large"
    },
    "actualSavings": "185.50",
    "status": "success"
  }
]
```

### Data Management Endpoints

#### Generate Test Data
```http
POST /api/generate-aws-data
```
**Response**:
```json
{
  "resourcesCount": 8,
  "recommendationsCount": 4,
  "message": "AWS simulation data generated successfully"
}
```

#### Clear Test Data
```http
POST /api/clear-simulation-data
```
**Response**:
```json
{
  "message": "All simulation data cleared successfully"
}
```

## Troubleshooting

### Common Issues

#### 1. No Recommendations Appearing

**Symptoms**: Dashboard shows 0 recommendations despite having AWS resources.

**Possible Causes**:
- AWS credentials not configured correctly
- Resources haven't been analyzed yet (wait for daily analysis cycle)
- All resources are optimally configured

**Solutions**:
1. **Check AWS Integration**:
   ```bash
   # Verify AWS credentials
   curl GET /api/aws-resources
   ```

2. **Trigger Manual Analysis**:
   ```bash
   # Generate fresh recommendations
   curl -X POST /api/generate-aws-data
   ```

3. **Review Resource Utilization**:
   - Ensure CloudWatch metrics are being collected
   - Verify resources have sufficient historical data (7+ days)

#### 2. Cost Data Not Updating

**Symptoms**: Cost trends showing stale data or $0 costs.

**Possible Causes**:
- AWS Cost Explorer API permissions missing
- Cost data not yet available from AWS (24-48 hour delay)
- Analysis scheduler not running

**Solutions**:
1. **Verify Cost Explorer Access**:
   - Ensure IAM role has `ce:GetCostAndUsage` permission
   - Check AWS Cost Explorer is enabled in your account

2. **Check Analysis Schedule**:
   - Verify daily cost sync is running at 6 AM UTC
   - Review server logs for cost data import errors

3. **Manual Cost Data Import**:
   ```bash
   # Trigger cost data sync
   curl -X POST /api/sync-cost-data
   ```

#### 3. Approval Workflow Issues

**Symptoms**: Approved recommendations not executing or stuck in pending state.

**Possible Causes**:
- Missing execution permissions
- AWS API rate limiting
- Resource dependencies preventing changes

**Solutions**:
1. **Check Approval Status**:
   ```bash
   # Review approval request details
   curl GET /api/approval-requests/{request-id}
   ```

2. **Review Execution Logs**:
   - Check optimization history for error messages
   - Verify AWS permissions for resource modifications

3. **Manual Retry**:
   ```bash
   # Retry failed optimization
   curl -X PATCH /api/approval-requests/{request-id} 
   -d '{"status": "approved"}'
   ```

#### 4. Real-Time Updates Not Working

**Symptoms**: Dashboard not updating automatically, manual refresh required.

**Possible Causes**:
- WebSocket connection failure
- Browser blocking WebSocket connections
- Server WebSocket configuration issues

**Solutions**:
1. **Check WebSocket Connection**:
   - Open browser developer tools
   - Look for WebSocket connection errors in Console tab

2. **Network Configuration**:
   - Verify firewall allows WebSocket connections
   - Check proxy settings aren't blocking WebSocket traffic

3. **Browser Compatibility**:
   - Try different browser or incognito mode
   - Clear browser cache and cookies

### Performance Optimization

#### Dashboard Loading Slowly

**Optimization Steps**:
1. **Enable Query Caching**: Ensure React Query cache is working properly
2. **Optimize Database Queries**: Review slow query logs
3. **Resource Cleanup**: Remove old optimization history records
4. **Database Indexing**: Ensure proper indexes on frequently queried columns

#### High Memory Usage

**Monitoring and Fixes**:
1. **Monitor Node.js Memory**: Use `process.memoryUsage()` to track heap usage
2. **Database Connection Pooling**: Verify connection pool limits
3. **Resource Cleanup**: Implement proper cleanup for large data processing

### Getting Help

#### Support Channels
1. **Internal Documentation**: Check company wiki for AWS-specific configurations
2. **Technical Support**: Contact DevOps team for infrastructure issues
3. **Business Questions**: Reach out to FinOps team for policy and process questions

#### Log Files and Debugging
```bash
# Server logs
tail -f /var/log/finops-autopilot/server.log

# Database query logs  
tail -f /var/log/postgresql/postgresql.log

# Application metrics
curl GET /api/health
```

#### Diagnostic API
```http
GET /api/diagnostics
```
**Response includes**:
- System health status
- Database connection status
- AWS API connectivity
- Last successful data sync timestamps
- Current recommendation counts by status

---

*This documentation is maintained by the Platform Engineering team. For updates or corrections, please submit a pull request or contact the maintainers.*