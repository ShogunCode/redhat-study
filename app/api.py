"""
API router: /question  and  /answer
"""

from __future__ import annotations
from types import SimpleNamespace

import random
import re
from pathlib import Path
from typing import Dict, List

import yaml
from fastapi import APIRouter, HTTPException, Query
from starlette.requests import Request

from .grading import grade
from .models import AnswerIn, AnswerOut, QuestionOut, QuestionMeta

router = APIRouter()

# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #


def _load_questions() -> List[Dict]:
    """
    Scan every *.yaml file under app/data/questions/, build one in-memory list,
    and enrich each dict with

      • compiled   – list[re.Pattern] objects, ready for fast matching  
      • topic      – the stem of the YAML filename (e.g. “storage”)  

    The function is intended to be called once at application startup; the
    resulting list can then be attached to FastAPI's router.state or any other
    singleton you prefer.
    """
    question_dir = Path(__file__).parent / "data" / "questions"
    if not question_dir.is_dir():
        raise RuntimeError(f"No questions found inside {question_dir}")

    questions: List[Dict] = []

    for yml in sorted(question_dir.glob("*.yaml")):
        topic = yml.stem                                   # NEW — derive topic
        with yml.open("r", encoding="utf-8") as fp:
            for raw in yaml.safe_load(fp) or []:           # tolerate empty files
                raw["topic"]     = topic                   # NEW
                raw["compiled"]  = [re.compile(p) for p in raw["patterns"]]
                questions.append(raw)

                # Optional debug trace
                print(f"[DEBUG] {topic}:{raw['id']} patterns → {raw['compiled']}")

    if not questions:
        raise RuntimeError("Question bank is empty!")

    return questions



# --------------------------------------------------------------------------- #
# Startup hook                                                                #
# --------------------------------------------------------------------------- #


@router.on_event("startup")
def _warm_cache() -> None:
    # APIRouter doesn’t have .state by default → create it once.
    if not hasattr(router, "state"):
        router.state = SimpleNamespace()  # type: ignore

    router.state.questions = _load_questions()  # type: ignore
    # Deterministic order; we can shuffle later if desired.
    router.state.id_map = {q["id"]: q for q in router.state.questions}  # type: ignore


# --------------------------------------------------------------------------- #
# Routes                                                                      #
# --------------------------------------------------------------------------- #

@router.get("/question", response_model=QuestionOut)
def get_question(
    request: Request,
    prev_id: int | None = Query(
        default=None,
        description="ID of the *previous* question. "
        "Omit for the very first call or pass an ID to fetch the next one.",
    ),
) -> QuestionOut:
    """
    Basic sequential iterator with wrap-around.

    * When `prev_id` is omitted → return the first question.
    * If `prev_id` is the last known ID → wrap to first.
    * If unknown → 404.
    """
    questions: list = router.state.questions  # type: ignore[attr-defined]
    id_map: dict = router.state.id_map  # type: ignore[attr-defined]

    if prev_id is None:
        q = questions[0]
    else:
        if prev_id not in id_map:
            raise HTTPException(404, f"No question with id={prev_id}")
        # Next sequential (wrap):
        idx = questions.index(id_map[prev_id])
        q = questions[(idx + 1) % len(questions)]

    return QuestionOut(id=q["id"], objective=q["objective"])


@router.post("/answer", response_model=AnswerOut)
def post_answer(payload: AnswerIn, request: Request) -> AnswerOut:
    """Run the regex grader and return verdict."""
    id_map   = router.state.id_map                     # type: ignore[attr-defined]
    question = id_map.get(payload.id)
    if not question:
        raise HTTPException(404, f"No question with id={payload.id}")

    correct, feedback = grade(payload.cmd, question)

    # ⬇️ If the answer was WRONG, show the learner a clean solution
    if not correct:
        # Prefer the explicit solution; else prettify the first pattern
        solution = question.get("solution") or _humanise(question["patterns"][0])
        feedback  = f"{feedback}\n\n{solution}"

    return AnswerOut(correct=correct, feedback=feedback)

@router.get("/questions", response_model=List[QuestionMeta])
def get_all_questions() -> list[QuestionMeta]:
    """A one-shot dump the front-end can cache."""
    return [QuestionMeta(id=q["id"],
                         objective=q["objective"],
                         topic=q["topic"])
            for q in router.state.questions]            # type: ignore[attr-defined]

@router.get("/random", response_model=List[int])
def ten_random_ids() -> list[int]:
    """Return up to 10 unique IDs, drawn across the whole bank."""
    import random
    universe = [q["id"] for q in router.state.questions]  # type: ignore[attr-defined]
    return random.sample(universe, k=min(10, len(universe)))

def _humanise(pattern: str) -> str:
    """
    Best-effort conversion of a grading regex into a plain-text command.
    Handles the most common tokens we use: ^…$, \s+, \s*, \s?, and escaped dots.
    """
    cmd = pattern.lstrip("^").rstrip("$")         # drop anchors
    cmd = re.sub(r"\\s[+*?]", " ", cmd)           # \s+, \s*, \s?  → single space
    cmd = re.sub(r"\\([./-])", r"\1", cmd)        # de-escape ./-
    cmd = cmd.replace("\\", "")                  # drop any stray \
    return " ".join(cmd.split())                  # collapse doubles

@router.get("/solution/{question_id}", response_model=str)
def get_solution(question_id: int) -> str:
    id_map = router.state.id_map                 # type: ignore[attr-defined]
    q      = id_map.get(question_id)
    if not q:
        raise HTTPException(404, f"question {question_id} not found")

    # Prefer explicit solution → fall back to a prettified regex
    return q.get("solution") or _humanise(q["patterns"][0])


# --------------------------------------------------------------------------- #
# Ensure question cache is populated even if startup events do not run
# --------------------------------------------------------------------------- #

_warm_cache()
