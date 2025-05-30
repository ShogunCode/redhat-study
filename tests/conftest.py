import pytest
from fastapi.testclient import TestClient
from app.main import app         # FastAPI instance

@pytest.fixture(scope="session")
def client():
    return TestClient(app)       # auto-runs startup hook
