FROM python:3.12-slim

WORKDIR /app

# System deps kept minimal; psycopg2-binary ships its own libpq
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
