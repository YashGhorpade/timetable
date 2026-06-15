"""
FastAPI dependency injection functions.
Used with Depends() in route handlers.
"""
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import verify_access_token
from app.db.database import get_db
from app.db.repositories.repositories import UserRepository
from app.models.models import User, UserRole
from app.services.realtime import RealtimeService, get_realtime_service

bearer_scheme = HTTPBearer(auto_error=False)


# ─── Current user ─────────────────────────────────────────────────────────────

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = verify_access_token(credentials.credentials)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    repo = UserRepository(db)
    user = repo.get_with_profile(user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    return user


# ─── Role guards ──────────────────────────────────────────────────────────────

async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


async def require_teacher(user: User = Depends(get_current_user)) -> User:
    if user.role not in (UserRole.ADMIN, UserRole.TEACHER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher access required")
    return user


async def require_student(user: User = Depends(get_current_user)) -> User:
    if user.role not in (UserRole.ADMIN, UserRole.STUDENT):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student access required")
    return user


# ─── Service factory ──────────────────────────────────────────────────────────

def get_timetable_service(
    db: Session = Depends(get_db),
    realtime: RealtimeService = Depends(get_realtime_service),
):
    from app.services.timetable_service import TimetableService
    return TimetableService(db=db, realtime=realtime)
