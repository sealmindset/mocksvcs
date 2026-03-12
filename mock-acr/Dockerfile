FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY mock_acr/ ./mock_acr/

RUN mkdir -p /data

EXPOSE 5100

CMD ["uvicorn", "mock_acr.main:app", "--host", "0.0.0.0", "--port", "5100"]
