"""
Async-compatible SQLAlchemy engine and session factory.
Uses pyodbc sync driver wrapped with run_in_executor for MSSQL compatibility.
"""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import QueuePool
from app.core.config import settings


# SQLAlchemy with MSSQL (sync engine — wrapped for FastAPI async compatibility)
engine = create_engine(
    settings.DATABASE_URL,
    poolclass=QueuePool,
    pool_size=20,
    max_overflow=40,
    pool_timeout=30,
    pool_pre_ping=True,
    echo=settings.DEBUG,
    connect_args={"timeout": 30},
)

# Fix MSSQL ANSI settings per connection. Do not enable NOCOUNT, otherwise SQLAlchemy may not receive rowcount metadata.
@event.listens_for(engine, "connect")
def set_mssql_options(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("SET ANSI_NULLS ON")
    cursor.execute("SET ANSI_PADDING ON")
    cursor.execute("SET ANSI_WARNINGS ON")
    cursor.execute("SET ARITHABORT ON")
    cursor.execute("SET CONCAT_NULL_YIELDS_NULL ON")
    cursor.execute("SET QUOTED_IDENTIFIER ON")
    cursor.close()


SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """All SQLAlchemy models inherit from this."""
    pass


def get_db():
    """FastAPI dependency — yields a DB session and guarantees cleanup."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
