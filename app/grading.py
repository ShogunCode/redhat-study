import re
from typing import Tuple


def grade(answer: str, question: dict) -> Tuple[bool, str]:
    """
    Return (is_correct, feedback) for a given CLI answer.

    Normalisation trims superfluous whitespace so users aren’t
    penalised for e.g. double‑spaces between flags.
    """
    normalised = " ".join(answer.split())          # collapse runs of whitespace
    
    print(f"[DEBUG] Normalised input: '{normalised}'")

    for regex in question["compiled"]:
        if regex.fullmatch(normalised):
            return True, "✅ Correct!"
    return False, "❌ Not quite—try again."
