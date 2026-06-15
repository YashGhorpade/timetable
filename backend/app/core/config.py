"""
Central application configuration.
All values are loaded from environment variables / .env file.
"""
from functools import lru_cache
from typing import List
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ─── Application ────────────────────────────────────────────────────────────
    APP_NAME: str = "Timetable Management System"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # ─── Database ───────────────────────────────────────────────────────────────
    DATABASE_URL: str

    # ─── Redis ──────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379"

    # ─── JWT ────────────────────────────────────────────────────────────────────
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ─── CORS ───────────────────────────────────────────────────────────────────
    # Allow common local dev ports (Vite default 5173/4173/4174 and CRA 3000)
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:80",
        "http://localhost:4173",
        "http://localhost:4174",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors(cls, v):
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v

    # ─── Scheduling defaults ─────────────────────────────────────────────────────
    DEFAULT_LECTURES_PER_DAY: int = 7
    DEFAULT_LECTURE_DURATION_MINUTES: int = 60
    DEFAULT_LAB_DURATION_MINUTES: int = 120
    DEFAULT_BREAK_AFTER_LECTURES: int = 3  # break after N consecutive lectures
    OR_TOOLS_TIME_LIMIT_SECONDS: int = 60
    OR_TOOLS_NUM_WORKERS: int = 8
    XGBOOST_NUM_CANDIDATES: int = 5       # how many valid schedules to score


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
