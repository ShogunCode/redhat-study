"""
FastAPI bootstrapper — launches the RHCSA practice API and
serves the tiny static front‑end in /static.
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .api import router  # noqa: E402 (after FastAPI import for clarity)

app = FastAPI(
    title="RHCSA Practice",
    version="0.1.0",
    summary="Ultra‑light RHCSA command drill web service",
)

app.include_router(router)

# --------------------------------------------------------------------------- #
# Static front‑end                                                            #
# --------------------------------------------------------------------------- #

STATIC_DIR = Path(__file__).parent.parent / "static"
if STATIC_DIR.is_dir():
    # `html=True` means index.html becomes the default document.
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
else:
    # Running without the front‑end present is still OK (e.g. tests).
    import logging

    logging.warning("`static/` directory not found — API only mode enabled.")


# --------------------------------------------------------------------------- #
# CLI entry‑point                                                             #
# --------------------------------------------------------------------------- #

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
