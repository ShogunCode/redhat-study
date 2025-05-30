def test_sequence_wraps_after_last(client):
    first = client.get("/question").json()["id"]
    # Iterate through whole bank:
    ids = [first]
    for _ in range(1, len(client.get("/questions").json())):
        ids.append(client.get("/question", params={"prev_id": ids[-1]}).json()["id"])
    assert len(set(ids)) == len(ids)          # unique
    # One more call → wrap:
    wrapped = client.get("/question", params={"prev_id": ids[-1]}).json()["id"]
    assert wrapped == first
    
def test_post_answer_validation(client):
    q = client.get("/question").json()
    # Intentionally wrong answer:
    r = client.post("/answer", json={"id": q["id"], "cmd": "foo"}).json()
    assert r == {"correct": False, "feedback": "❌ Not quite—try again."}
