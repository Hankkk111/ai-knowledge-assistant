"""
Integration tests against a live deployment of the AI Knowledge Assistant.
Run against either the Lambda/API Gateway deployment or the EC2 deployment
by setting the BASE_URL environment variable.
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("BASE_URL", "http://3.80.63.201:3000")
TIMEOUT_SECONDS = 10


def test_health_endpoint_returns_ok():
    """The /health endpoint should respond quickly with a healthy status."""
    response = requests.get(f"{BASE_URL}/health", timeout=TIMEOUT_SECONDS)
    assert response.status_code == 200
    body = response.json()
    assert body.get("status") == "ok"


def test_health_endpoint_response_time():
    """The /health endpoint should respond within an acceptable latency budget."""
    start = time.time()
    response = requests.get(f"{BASE_URL}/health", timeout=TIMEOUT_SECONDS)
    elapsed_ms = (time.time() - start) * 1000
    assert response.status_code == 200
    assert elapsed_ms < 2000, f"Health check took {elapsed_ms:.0f}ms, expected < 2000ms"


def test_chat_endpoint_rejects_empty_query():
    """The /chat endpoint should reject a request with no query field."""
    response = requests.post(f"{BASE_URL}/chat", json={}, timeout=TIMEOUT_SECONDS)
    assert response.status_code == 400


def test_chat_endpoint_rejects_non_string_query():
    """The /chat endpoint should reject a query that isn't a string."""
    response = requests.post(f"{BASE_URL}/chat", json={"query": 12345}, timeout=TIMEOUT_SECONDS)
    assert response.status_code == 400


def test_unknown_route_returns_404():
    """Requesting a route that doesn't exist should return 404, not a crash."""
    response = requests.get(f"{BASE_URL}/this-route-does-not-exist", timeout=TIMEOUT_SECONDS)
    assert response.status_code == 404
