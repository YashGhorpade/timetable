#!/bin/bash
set -e

export PATH="/opt/venv/bin:${PATH}"
cd /app

echo "⏳  Waiting for MSSQL to be ready (using pyodbc)..."
# Try multiple times with longer intervals
for i in {1..30}; do
    if /opt/mssql-tools18/bin/sqlcmd -S mssql -U sa -P "$MSSQL_SA_PASSWORD" -Q "SELECT 1" -b -o /dev/null -C 2>/dev/null; then
        echo "✅  MSSQL is ready"
        break
    fi
    echo "   Attempt $i/30..."
    sleep 3
done

echo "⏳  Ensuring timetable_db exists..."
python /app/create_db.py

echo "⏳  Running Alembic migrations..."
alembic upgrade head

echo "⏳  Ensuring SQL schema exists..."
python /app/create_schema.py

echo "✅  Schema ensured"

echo "⏳  Seeding initial data..."
python -m app.db.seed

echo "✅  Seed complete"

echo "✅  Starting Uvicorn..."
exec "$@"
