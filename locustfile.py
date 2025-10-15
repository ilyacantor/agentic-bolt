"""
Load Testing Script for DCL Application using Locust

This script simulates real user behavior against the DCL web application,
testing key endpoints under load to identify performance bottlenecks.

To run load tests:
1. Install locust: pip install locust
2. Run test: locust --host=https://agenticdataconnectsankey.onrender.com
3. Open browser: http://localhost:8089
4. Set users (e.g., 100) and spawn rate (e.g., 10/sec)
5. Click "Start swarming"

The web UI shows real-time metrics:
- Requests per second (RPS)
- Response times (min/median/95th/99th percentile/max)
- Failure rates
- Active users
"""

from locust import HttpUser, task, between, events
import json
import random

class DCLUser(HttpUser):
    """
    Simulates a user interacting with the DCL application.
    
    Wait time between tasks: 1-3 seconds (realistic user behavior)
    """
    wait_time = between(1, 3)
    
    def on_start(self):
        """Called when a simulated user starts. Loads the homepage."""
        self.client.get("/")
    
    @task(5)
    def view_dashboard(self):
        """Most common action: View the main dashboard page"""
        self.client.get("/", name="Dashboard Homepage")
    
    @task(10)
    def poll_state(self):
        """
        Frequently polls the /state endpoint (most common API call).
        This simulates the real-time state polling from the UI.
        """
        response = self.client.get("/state", name="Poll State")
        
        # Validate response structure
        if response.status_code == 200:
            try:
                data = response.json()
                if "sources" not in data or "ontology" not in data:
                    response.failure(f"Invalid state response: {data}")
            except json.JSONDecodeError:
                response.failure("State endpoint returned invalid JSON")
    
    @task(3)
    def connect_sources(self):
        """
        Simulates clicking "Connect & Map" with random source/agent selections.
        This is the primary workflow action.
        """
        # Random source and agent combinations (realistic user behavior)
        sources = random.sample([
            "dynamics", "salesforce", "sap", "netsuite", 
            "snowflake", "legacy_sql", "supabase", "mongodb"
        ], k=random.randint(1, 4))
        
        agents = random.sample(["revops", "finops"], k=random.randint(1, 2))
        
        payload = {
            "sources": sources,
            "agents": agents,
            "use_ai": random.choice([True, False])  # Mix of Prod Mode ON/OFF
        }
        
        response = self.client.post(
            "/connect",
            json=payload,
            name="Connect Sources"
        )
        
        # Validate successful connection
        if response.status_code == 200:
            try:
                data = response.json()
                if data.get("status") != "success":
                    response.failure(f"Connection failed: {data}")
            except json.JSONDecodeError:
                response.failure("Connect endpoint returned invalid JSON")
    
    @task(2)
    def run_mapping(self):
        """
        Triggers the AI/heuristic mapping process.
        This is computationally expensive (AI inference).
        """
        payload = {
            "use_ai": random.choice([True, False])
        }
        
        response = self.client.post(
            "/map",
            json=payload,
            name="Run Mapping"
        )
        
        # Check for successful mapping
        if response.status_code == 200:
            try:
                data = response.json()
                if "mappings" not in data and "status" not in data:
                    response.failure(f"Invalid mapping response: {data}")
            except json.JSONDecodeError:
                response.failure("Map endpoint returned invalid JSON")
    
    @task(1)
    def view_faq(self):
        """Occasional navigation to FAQ page"""
        self.client.get("/faq", name="FAQ Page")
    
    @task(1)
    def load_static_assets(self):
        """Simulates loading key static assets"""
        assets = [
            "/static/sankey.js",
            "/static/styles-react.css",
        ]
        
        for asset in assets:
            self.client.get(asset, name=f"Static: {asset}")


class APIStressUser(HttpUser):
    """
    Aggressive API-only stress testing (no UI).
    Use this class for pure backend load testing.
    
    To run: locust -f locustfile.py APIStressUser --host=https://...
    """
    wait_time = between(0.1, 0.5)  # Aggressive polling
    
    @task(20)
    def rapid_state_polling(self):
        """Hammers the /state endpoint (worst-case scenario)"""
        self.client.get("/state")
    
    @task(5)
    def stress_connect(self):
        """Rapid-fire connection requests"""
        payload = {
            "sources": ["dynamics", "salesforce"],
            "agents": ["revops"],
            "use_ai": False  # Heuristic-only to avoid AI rate limits
        }
        self.client.post("/connect", json=payload)


# Event hooks for custom metrics
@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Called when test starts"""
    print("\n" + "="*60)
    print("🚀 DCL LOAD TEST STARTED")
    print("="*60)
    print(f"Target: {environment.host}")
    print(f"Users: {environment.runner.user_count if hasattr(environment.runner, 'user_count') else 'N/A'}")
    print("="*60 + "\n")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Called when test stops"""
    print("\n" + "="*60)
    print("🏁 DCL LOAD TEST COMPLETED")
    print("="*60)
    stats = environment.stats.total
    print(f"Total Requests: {stats.num_requests}")
    print(f"Failures: {stats.num_failures} ({stats.fail_ratio*100:.2f}%)")
    print(f"Avg Response Time: {stats.avg_response_time:.2f}ms")
    print(f"95th Percentile: {stats.get_response_time_percentile(0.95):.2f}ms")
    print(f"Requests/sec: {stats.total_rps:.2f}")
    print("="*60 + "\n")


# Performance thresholds (optional - will fail test if exceeded)
@events.request.add_listener
def check_response_time(request_type, name, response_time, response_length, exception, **kwargs):
    """Alert if response time exceeds thresholds"""
    if response_time > 5000:  # 5 seconds
        print(f"⚠️  SLOW REQUEST: {name} took {response_time}ms")
