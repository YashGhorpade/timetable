"""
Authentication endpoints.
POST /api/v1/auth/signup
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
"""
import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload

from app.api.v1.deps.dependencies import get_current_user
from app.core.security import (
    create_access_token, create_refresh_token,
    hash_password, verify_password, verify_refresh_token,
)
from app.db.database import get_db
from app.db.repositories.repositories import UserRepository, TeacherRepository, StudentRepository
from app.models.models import Department, AcademicYear, Section, Batch, Student, Teacher, User, UserRole
from app.schemas.schemas import (
    LoginRequest, RefreshRequest, SignupRequest, TokenResponse,
    SignupDepartmentOut,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    repo = UserRepository(db)

    if repo.get_by_email(payload.email):
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.flush()  # get user.id without committing

    name = "Admin"

    if payload.role == UserRole.TEACHER:
        if not all([payload.first_name, payload.last_name, payload.employee_id, payload.department_id]):
            raise HTTPException(status_code=400, detail="Teacher requires: first_name, last_name, employee_id, department_id")
        teacher = Teacher(
            user_id=user.id,
            department_id=payload.department_id,
            employee_id=payload.employee_id,
            first_name=payload.first_name,
            last_name=payload.last_name,
        )
        db.add(teacher)
        name = f"{payload.first_name} {payload.last_name}"

    elif payload.role == UserRole.STUDENT:
        if not all([payload.first_name, payload.last_name, payload.student_id, payload.section_id, payload.batch_id]):
            raise HTTPException(status_code=400, detail="Student requires: first_name, last_name, student_id, section_id, batch_id")
        student = Student(
            user_id=user.id,
            section_id=payload.section_id,
            batch_id=payload.batch_id,
            student_id=payload.student_id,
            first_name=payload.first_name,
            last_name=payload.last_name,
        )
        db.add(student)
        name = f"{payload.first_name} {payload.last_name}"

    db.commit()
    db.refresh(user)

    access  = create_access_token(user.id, extra={"role": user.role, "name": name})
    refresh = create_refresh_token(user.id)
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    repo.store_refresh_token(user.id, _token_hash(refresh), expires)

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user_id=user.id,
        role=user.role,
        name=name,
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    repo = UserRepository(db)
    user = repo.get_by_email(payload.email)

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")

    # Determine display name
    name = user.email
    if user.teacher:
        name = user.teacher.full_name
    elif user.student:
        name = user.student.full_name

    # Update last login
    user.last_login = datetime.now(timezone.utc)
    db.commit()

    access  = create_access_token(user.id, extra={"role": user.role, "name": name})
    refresh = create_refresh_token(user.id)
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    repo.store_refresh_token(user.id, _token_hash(refresh), expires)

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user_id=user.id,
        role=user.role,
        name=name,
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(payload: RefreshRequest, db: Session = Depends(get_db)):
    user_id = verify_refresh_token(payload.refresh_token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    repo = UserRepository(db)
    stored = repo.get_refresh_token(_token_hash(payload.refresh_token))
    if not stored:
        raise HTTPException(status_code=401, detail="Refresh token not found or revoked")

    user = repo.get_with_profile(user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # Rotate tokens
    repo.revoke_refresh_token(_token_hash(payload.refresh_token))

    name = user.email
    if user.teacher:
        name = user.teacher.full_name
    elif user.student:
        name = user.student.full_name

    access  = create_access_token(user.id, extra={"role": user.role, "name": name})
    new_ref = create_refresh_token(user.id)
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    repo.store_refresh_token(user.id, _token_hash(new_ref), expires)

    return TokenResponse(
        access_token=access,
        refresh_token=new_ref,
        user_id=user.id,
        role=user.role,
        name=name,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: RefreshRequest, db: Session = Depends(get_db)):
    repo = UserRepository(db)
    repo.revoke_refresh_token(_token_hash(payload.refresh_token))


@router.get("/signup-data", response_model=list[SignupDepartmentOut])
def signup_data(db: Session = Depends(get_db)):
    departments = (
        db.query(Department)
        .options(
            joinedload(Department.academic_years)
            .joinedload(AcademicYear.sections)
            .joinedload(Section.batches)
        )
        .filter(Department.is_active == True)
        .all()
    )

    return [
        {
            "id": dept.id,
            "name": dept.name,
            "code": dept.code,
            "academic_years": [
                {
                    "id": ay.id,
                    "year_name": ay.year_name,
                    "year_number": ay.year_number,
                    "sections": [
                        {
                            "id": section.id,
                            "academic_year_id": section.academic_year_id,
                            "name": section.name,
                            "batches": [
                                {
                                    "id": batch.id,
                                    "section_id": batch.section_id,
                                    "name": batch.name,
                                    "strength": batch.strength,
                                    "is_active": batch.is_active,
                                }
                                for batch in section.batches
                            ],
                        }
                        for section in ay.sections
                    ],
                }
                for ay in dept.academic_years
            ],
        }
        for dept in departments
    ]


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    name = current_user.email
    extra = {}
    if current_user.teacher:
        name = current_user.teacher.full_name
        extra = {
            "teacher_id": current_user.teacher.id,
            "department_id": current_user.teacher.department_id,
            "employee_id": current_user.teacher.employee_id,
        }
    elif current_user.student:
        name = current_user.student.full_name
        student_department_id = None
        if current_user.student.section and current_user.student.section.academic_year and current_user.student.section.academic_year.department:
            student_department_id = current_user.student.section.academic_year.department.id

        extra = {
            "student_id": current_user.student.id,
            "section_id": current_user.student.section_id,
            "batch_id": current_user.student.batch_id,
            "department_id": student_department_id,
        }

    return {
        "user_id": current_user.id,
        "email": current_user.email,
        "role": current_user.role,
        "name": name,
        "is_active": current_user.is_active,
        **extra,
    }


@router.get("/activity")
def my_activity(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return recent activity related to the authenticated user.

    Includes: audit logs, timetable history (changes by user), ML feedback submitted, and solver runs triggered.
    """
    from app.models.models import AuditLog, TimetableHistory, MLFeedback, SolverRun

    audit_logs = (
        db.query(AuditLog)
        .filter(AuditLog.user_id == current_user.id)
        .order_by(AuditLog.timestamp.desc())
        .limit(50)
        .all()
    )

    history = (
        db.query(TimetableHistory)
        .filter(TimetableHistory.changed_by == current_user.id)
        .order_by(TimetableHistory.changed_at.desc())
        .limit(50)
        .all()
    )

    feedbacks = (
        db.query(MLFeedback)
        .filter(MLFeedback.rated_by == current_user.id)
        .order_by(MLFeedback.created_at.desc())
        .limit(50)
        .all()
    )

    solver_runs = (
        db.query(SolverRun)
        .filter(SolverRun.triggered_by == current_user.id)
        .order_by(SolverRun.created_at.desc())
        .limit(50)
        .all()
    )

    def _serialize(obj):
        # Lightweight serializer for relevant fields
        if isinstance(obj, AuditLog):
            return {"type": "audit", "action": obj.action, "entity_type": obj.entity_type, "entity_id": obj.entity_id, "detail": obj.detail, "timestamp": obj.timestamp.isoformat()}
        if isinstance(obj, TimetableHistory):
            return {"type": "history", "action": obj.action, "entry_id": obj.entry_id, "version_id": obj.version_id, "changed_at": obj.changed_at.isoformat(), "reason": obj.reason}
        if isinstance(obj, MLFeedback):
            return {"type": "ml_feedback", "version_id": obj.version_id, "overall_rating": obj.overall_rating, "comment": obj.comment, "created_at": obj.created_at.isoformat()}
        if isinstance(obj, SolverRun):
            return {"type": "solver_run", "id": obj.id, "status": obj.status, "num_candidates": obj.num_candidates, "best_score": obj.best_score, "created_at": obj.created_at.isoformat()}
        return {"type": "unknown"}

    items = [ _serialize(x) for x in (audit_logs + history + feedbacks + solver_runs) ]
    # sort by timestamp-like field where possible
    items.sort(key=lambda i: i.get("timestamp") or i.get("changed_at") or i.get("created_at") or "", reverse=True)

    return {"items": items}
