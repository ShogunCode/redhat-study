import pytest
import re
from app.grading import grade

dummy_q = {
    "compiled": [re.compile(r"whoami -a?")],    
}

def test_normalisation_trims_whitespace():
    ok, _ = grade("whoami     -a", dummy_q)
    assert ok is True

def test_incorrect_command_fails():
    ok, fb = grade("echo hello", dummy_q)
    assert ok is False
    assert "Not quite" in fb
