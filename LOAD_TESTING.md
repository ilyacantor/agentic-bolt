# Load Testing Guide for DCL Application

## Overview
This guide shows you how to load test your DCL application to ensure it can handle enterprise-level traffic. Load testing simulates hundreds or thousands of users to identify performance bottlenecks before they impact real users.

## What You'll Test
- **API Performance**: How fast the backend responds under load
- **Concurrent Users**: Maximum simultaneous users the system can handle
- **Resource Limits**: CPU, memory, and database bottlenecks
- **Response Times**: 95th/99th percentile latencies
- **Error Rates**: How the system behaves when overwhelmed

## Setup (5 minutes)

### Option 1: Run from Your Computer (Recommended)

```bash
# 1. Install Python (if not already installed)
# Download from python.org

# 2. Install Locust
pip install locust

# 3. Download the test file
# Save locustfile.py from your Replit to your computer

# 4. Start load test
locust --host=https://agenticdataconnectsankey.onrender.com

# 5. Open your browser
# Go to http://localhost:8089
```

### Option 2: Run from a Cloud Server (For Serious Testing)

```bash
# Deploy on AWS EC2, DigitalOcean, or any Linux server

# 1. SSH into server
ssh user@your-server-ip

# 2. Install dependencies
sudo apt update
sudo apt install python3-pip -y
pip3 install locust

# 3. Upload test file
# Use scp or git clone

# 4. Run headless test (no web UI)
locust --host=https://agenticdataconnectsankey.onrender.com \
       --headless \
       --users 500 \
       --spawn-rate 50 \
       --run-time 5m \
       --html report.html
```

## Running Tests

### Basic Load Test (100 Users)

1. **Start Locust**:
   ```bash
   locust --host=https://agenticdataconnectsankey.onrender.com
   ```

2. **Open Web UI**: Navigate to `http://localhost:8089`

3. **Configure Test**:
   - **Number of users**: `100` (simulates 100 concurrent users)
   - **Spawn rate**: `10` (adds 10 users per second)
   - **Host**: Pre-filled from command line

4. **Click "Start Swarming"**

5. **Watch Real-Time Metrics**:
   - **RPS** (Requests per second): Should be 50-200 for healthy app
   - **Response Time**: 
     - Good: < 500ms average
     - Acceptable: 500-1000ms
     - Poor: > 1000ms
   - **Failure Rate**: Should be < 1%

### Stress Test (Find Breaking Point)

```bash
# Start with 1000 users, aggressive spawn rate
locust --host=https://agenticdataconnectsankey.onrender.com
```

In the web UI:
- Users: `1000`
- Spawn rate: `100`

**What to watch for**:
- When does response time spike? (This is your capacity limit)
- When do errors start appearing? (System overload point)
- Does it recover or crash?

### API-Only Stress Test (No UI Simulation)

```bash
# Use the APIStressUser class for pure backend hammering
locust -f locustfile.py APIStressUser \
       --host=https://agenticdataconnectsankey.onrender.com \
       --headless \
       --users 200 \
       --spawn-rate 20 \
       --run-time 3m
```

## Understanding Results

### Key Metrics Explained

| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| **Avg Response Time** | < 500ms | 500-1000ms | > 1000ms |
| **95th Percentile** | < 1000ms | 1000-2000ms | > 2000ms |
| **99th Percentile** | < 2000ms | 2000-5000ms | > 5000ms |
| **Failure Rate** | < 1% | 1-5% | > 5% |
| **RPS** | High (>100) | Medium (50-100) | Low (<50) |

### Common Bottlenecks

1. **Database Connections**
   - Symptom: Slow `/state` and `/connect` endpoints
   - Fix: Increase connection pool size, add caching

2. **AI API Rate Limits**
   - Symptom: 429 errors on `/map` with Prod Mode ON
   - Fix: Implement request queuing, use heuristic fallback

3. **Memory Leaks**
   - Symptom: Response times increase over time
   - Fix: Review Python memory usage, restart services periodically

4. **Render Free Tier Limits**
   - Symptom: 502/503 errors, slow cold starts
   - Fix: Upgrade to paid tier, enable auto-scaling

## Test Scenarios

### Scenario 1: Normal Business Hours (Realistic)
```python
# 50 concurrent users, mixed behavior
locust --host=https://agenticdataconnectsankey.onrender.com \
       --users 50 \
       --spawn-rate 5 \
       --run-time 10m
```

**Expected Results**:
- Avg response: 200-500ms
- 95th percentile: < 1000ms
- Failure rate: < 0.5%

### Scenario 2: Peak Traffic Spike
```python
# 200 users, rapid spawn (e.g., demo day, product launch)
locust --host=https://agenticdataconnectsankey.onrender.com \
       --users 200 \
       --spawn-rate 50 \
       --run-time 5m
```

**Expected Results**:
- Avg response: 500-1000ms
- Some errors acceptable (< 2%)
- System should remain stable

### Scenario 3: Stress to Breaking Point
```python
# Keep increasing users until system fails
locust --host=https://agenticdataconnectsankey.onrender.com
```

In UI:
1. Start with 100 users
2. Every 2 minutes, add 100 more
3. Note when response times > 5 seconds
4. Note when error rate > 10%
5. **This is your capacity limit**

## Exporting Results

### Save HTML Report
```bash
# Run test with automatic HTML export
locust --host=https://agenticdataconnectsankey.onrender.com \
       --headless \
       --users 100 \
       --spawn-rate 10 \
       --run-time 5m \
       --html loadtest-report.html
```

### Save CSV Data (for analysis in Excel/Python)
```bash
locust --host=https://agenticdataconnectsankey.onrender.com \
       --headless \
       --users 100 \
       --run-time 5m \
       --csv loadtest-data
# Creates: loadtest-data_stats.csv, loadtest-data_failures.csv
```

## Production Readiness Checklist

After running load tests, verify:

- [ ] System handles **100 concurrent users** with < 1s avg response time
- [ ] **95th percentile** response time < 2 seconds under normal load
- [ ] **Failure rate < 1%** during 5-minute sustained load test
- [ ] System **recovers gracefully** from stress (no permanent errors after load stops)
- [ ] **No memory leaks** (response times stay consistent over 30+ minutes)
- [ ] **Database queries optimized** (no slow query warnings in logs)
- [ ] **AI API rate limits** handled gracefully (fallback to heuristics)
- [ ] **Monitoring alerts** configured for CPU/memory/response time thresholds

## Troubleshooting

### Issue: "Connection Refused" Error
**Cause**: Target server is down or URL is wrong  
**Fix**: Verify `--host` URL, check if app is running

### Issue: Very High Failure Rate (>50%)
**Cause**: Server is overwhelmed or crashed  
**Fix**: Reduce user count, check server logs, restart server

### Issue: Locust Uses Too Much CPU on Test Machine
**Cause**: Test machine underpowered for high user count  
**Fix**: Run distributed test across multiple machines:
```bash
# Master machine
locust --master --host=https://agenticdataconnectsankey.onrender.com

# Worker machines (run on separate computers)
locust --worker --master-host=<master-ip>
```

### Issue: Tests Seem Too Fast/Slow
**Cause**: `wait_time` in locustfile.py  
**Fix**: Edit `wait_time = between(1, 3)` to adjust user pacing

## Advanced: Distributed Load Testing

For testing with **thousands of users**:

1. **Launch Master**:
   ```bash
   locust --master --host=https://agenticdataconnectsankey.onrender.com
   ```

2. **Launch Workers** (on different machines):
   ```bash
   locust --worker --master-host=<master-machine-ip>
   ```

3. **Scale**: Each worker can handle ~1000-5000 users depending on hardware

## Next Steps

After load testing reveals bottlenecks:

1. **Optimize Database**: Add indexes, connection pooling, caching
2. **Implement CDN**: Serve static assets from Cloudflare/AWS CloudFront
3. **Enable Caching**: Redis/Memcached for `/state` endpoint responses
4. **Queue Heavy Tasks**: Use Celery/RQ for AI mapping jobs
5. **Auto-Scaling**: Configure Render auto-scale based on CPU/memory
6. **Rate Limiting**: Protect API from abuse (per-IP limits)

---

## Quick Start (TL;DR)

```bash
# 1. Install
pip install locust

# 2. Run test
locust --host=https://agenticdataconnectsankey.onrender.com

# 3. Open browser
# http://localhost:8089

# 4. Enter: 100 users, 10 spawn rate

# 5. Click "Start Swarming"
```

**That's it!** Watch the graphs and ensure response times stay low and failure rates near 0%.

---

## Resources

- **Locust Documentation**: https://docs.locust.io
- **Performance Best Practices**: https://fastapi.tiangolo.com/deployment/concepts/
- **Monitoring Tools**: Grafana, New Relic, Datadog (for production monitoring)
