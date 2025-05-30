# ---- base image -----------------------------------------------------------
FROM python:3.11-slim

# Never write .pyc files; stream stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install only what we need to compile any binary wheels (*very* small here)
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential gcc \
 && rm -rf /var/lib/apt/lists/*

# ---- install Python dependencies -----------------------------------------
WORKDIR /app
COPY requirements.txt .
RUN pip install --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt \
 && apt-get purge -y --auto-remove build-essential gcc \
 && rm -rf /root/.cache/pip

# ---- copy application code ------------------------------------------------
# copy only the folders you actually run; adjust if needed
COPY app ./app
COPY static ./static

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
