FROM python:3.11-slim

ENV LANG=C.UTF-8
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install MSSQL ODBC driver
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl gnupg2 apt-transport-https unixodbc-dev gcc g++ \
    && curl -sSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor | tee /usr/share/keyrings/microsoft-prod.gpg > /dev/null \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/11/prod bullseye main" > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18 mssql-tools18 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
RUN python -m venv "$VIRTUAL_ENV"
RUN "$VIRTUAL_ENV/bin/pip" install --no-cache-dir -r requirements.txt

COPY backend/create_db.py ./
COPY backend/create_schema.py ./
COPY backend/drop_schema.py ./
COPY backend/list_tables.py ./
COPY backend/entrypoint.sh /entrypoint.sh
COPY backend/alembic ./alembic
COPY backend/app ./app
RUN chmod +x /entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
