import pytest
from app.api import _load_questions

def test_load_questions_returns_compiled():
    qs = _load_questions()               # uses test data under app/data
    assert qs                           # non-empty
    assert "compiled" in qs[0]
    assert all(hasattr(p, "fullmatch") for p in qs[0]["compiled"])