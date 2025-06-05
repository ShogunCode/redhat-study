import pytest

def test_fill_blank_route(client):
    res = client.get("/fill_blank")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) == 15
    q = data[0]
    assert {"id", "question", "choices", "answer"} <= set(q.keys())
    assert len(q["choices"]) == 4

