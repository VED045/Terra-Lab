FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/services/api OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
WORKDIR /app
COPY services/api/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home --uid 10001 terralab
COPY services/api /app/services/api
USER terralab
EXPOSE 8000
CMD ["sh","-c","exec uvicorn terralab.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --limit-concurrency 32 --timeout-keep-alive 5"]
