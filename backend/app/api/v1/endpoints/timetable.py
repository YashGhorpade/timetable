"""
Timetable endpoints — generation, views (teacher/student/section/classroom), moves.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.deps.dependencies import (
    get_current_user, require_admin, require_teacher,
    get_timetable_service
)
from app.db.database import get_db
from app.db.repositories.repositories import (
    ClassroomRepository, StudentRepository, TimetableRepository, TeacherRepository
)
from app.models.models import (
    RoomType, TimetableVersion, Timeslot, User, UserRole
)
from app.schemas.schemas import (
    ClassroomAvailabilityQuery, ClassroomAvailabilityResult, ClassroomOut,
    GenerateTimetableRequest, TimetableEntryMove,
    TimetableEntryOut, TimetableVersionOut, TimeslotOut,
)
from app.services.timetable_service import ConflictError, TimetableService

router = APIRouter(prefix="/timetable", tags=["Timetable"])


# ─── Helper: enrich entry with display names ─────────────────────────────────

def _enrich(entry, db: Session) -> TimetableEntryOut:
    out = TimetableEntryOut.model_validate(entry)
    if entry.timeslot:
        out.timeslot = TimeslotOut.model_validate(entry.timeslot)
    if entry.subject:
        out.subject_name = entry.subject.name
        out.subject_code = entry.subject.code
    if entry.teacher:
        out.teacher_name = entry.teacher.full_name
    if entry.classroom:
        out.classroom_name = entry.classroom.name
        out.classroom_room_number = entry.classroom.room_number
    if entry.section:
        out.section_name = entry.section.name
        if getattr(entry.section, 'academic_year', None) and getattr(entry.section.academic_year, 'department', None):
            out.department_name = entry.section.academic_year.department.name
    if entry.batch:
        out.batch_name = entry.batch.name
    return out


# ════════════════════════════════════════════════════════════════════════════════
# GENERATION & VERSION MANAGEMENT (ADMIN)
# ════════════════════════════════════════════════════════════════════════════════

@router.post("/generate", response_model=TimetableVersionOut)
def generate_timetable(
    payload: GenerateTimetableRequest,
    current_user: User = Depends(require_admin),
    svc: TimetableService = Depends(get_timetable_service),
):
    try:
        version = svc.generate(payload, triggered_by_user_id=current_user.id)
        return TimetableVersionOut.model_validate(version)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/versions/{version_id}/publish", response_model=TimetableVersionOut)
def publish_version(
    version_id: str,
    current_user: User = Depends(require_admin),
    svc: TimetableService = Depends(get_timetable_service),
):
    try:
        version = svc.publish_version(version_id, current_user.id)
        return TimetableVersionOut.model_validate(version)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/versions", response_model=List[TimetableVersionOut])
def list_versions(
    department_id: str,
    academic_year_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.ADMIN:
        pass
    elif current_user.role == UserRole.TEACHER and current_user.teacher:
        if current_user.teacher.department_id != department_id:
            raise HTTPException(status_code=403, detail="Access denied")
    elif current_user.role == UserRole.STUDENT and current_user.student:
        if not current_user.student.section or not current_user.student.section.academic_year:
            raise HTTPException(status_code=403, detail="Access denied")
        if current_user.student.section.academic_year.department_id != department_id:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        raise HTTPException(status_code=403, detail="Access denied")

    versions = db.query(TimetableVersion).filter(
        TimetableVersion.department_id == department_id,
        TimetableVersion.academic_year_id == academic_year_id,
    ).order_by(TimetableVersion.created_at.desc()).all()
    return [TimetableVersionOut.model_validate(v) for v in versions]


@router.get("/versions/{version_id}/timeslots", response_model=List[TimeslotOut])
def get_timeslots(version_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    version = db.query(TimetableVersion).filter(TimetableVersion.id == version_id).first()
    if not version: raise HTTPException(404, "Version not found")

    from app.models.models import TimetableSettings
    ts_settings = db.query(TimetableSettings).filter(
        TimetableSettings.department_id == version.department_id
    ).first()
    if not ts_settings: raise HTTPException(404, "No timetable settings")

    slots = db.query(Timeslot).filter(Timeslot.settings_id == ts_settings.id).order_by(
        Timeslot.day_of_week, Timeslot.slot_index
    ).all()
    return [TimeslotOut.model_validate(s) for s in slots]


# ════════════════════════════════════════════════════════════════════════════════
# TIMETABLE VIEWS (FILTERED — all read from central table)
# ════════════════════════════════════════════════════════════════════════════════

@router.get("/versions/{version_id}/all", response_model=List[TimetableEntryOut])
def get_all_entries(
    version_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Admin: full unfiltered timetable."""
    repo = TimetableRepository(db)
    entries = repo.get_all_entries(version_id)
    return [_enrich(e, db) for e in entries]


@router.get("/versions/{version_id}/teacher/{teacher_id}", response_model=List[TimetableEntryOut])
def get_teacher_timetable(
    version_id: str, teacher_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Teacher's personal timetable.
    Teachers can only see their own; admins can see any.
    """
    if current_user.role == UserRole.TEACHER:
        if not current_user.teacher or current_user.teacher.id != teacher_id:
            raise HTTPException(403, "Teachers can only view their own timetable")

    repo = TimetableRepository(db)
    entries = repo.get_entries_for_teacher(version_id, teacher_id)
    return [_enrich(e, db) for e in entries]


@router.get("/versions/{version_id}/section/{section_id}", response_model=List[TimetableEntryOut])
def get_section_timetable(
    version_id: str, section_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Section timetable — all lecture types for all batches."""
    repo = TimetableRepository(db)
    entries = repo.get_entries_for_section(version_id, section_id)
    return [_enrich(e, db) for e in entries]


@router.get("/versions/{version_id}/student", response_model=List[TimetableEntryOut])
def get_student_timetable(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Student's personalized timetable:
    - All theory lectures (section-wide)
    - ONLY their own batch tutorials and labs
    """
    if not current_user.student:
        raise HTTPException(403, "Only students can access this endpoint")

    student = current_user.student
    repo = TimetableRepository(db)
    entries = repo.get_entries_for_student(
        version_id, student.section_id, student.batch_id
    )
    return [_enrich(e, db) for e in entries]


@router.get("/versions/{version_id}/batch/{batch_id}", response_model=List[TimetableEntryOut])
def get_batch_timetable(
    version_id: str, batch_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Batch timetable — tutorials + labs for this batch + section theory."""
    repo = TimetableRepository(db)
    from app.models.models import Batch
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch: raise HTTPException(404, "Batch not found")
    entries = repo.get_entries_for_student(version_id, batch.section_id, batch_id)
    return [_enrich(e, db) for e in entries]


@router.get("/versions/{version_id}/classroom/{classroom_id}", response_model=List[TimetableEntryOut])
def get_classroom_timetable(
    version_id: str, classroom_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Classroom occupancy timetable."""
    repo = TimetableRepository(db)
    entries = repo.get_entries_for_classroom(version_id, classroom_id)
    return [_enrich(e, db) for e in entries]


# ════════════════════════════════════════════════════════════════════════════════
# ME — auto-detected timetable for logged-in user
# ════════════════════════════════════════════════════════════════════════════════

@router.get("/me/{version_id}", response_model=List[TimetableEntryOut])
def get_my_timetable(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Auto-detected timetable:
    - Teacher → their lectures
    - Student → section theory + own batch tutorials/labs
    - Admin → all entries
    """
    repo = TimetableRepository(db)

    if current_user.role == UserRole.TEACHER and current_user.teacher:
        entries = repo.get_entries_for_teacher(version_id, current_user.teacher.id)
    elif current_user.role == UserRole.STUDENT and current_user.student:
        entries = repo.get_entries_for_student(
            version_id, current_user.student.section_id, current_user.student.batch_id
        )
    else:
        entries = repo.get_all_entries(version_id)

    return [_enrich(e, db) for e in entries]


# ════════════════════════════════════════════════════════════════════════════════
# DRAG-DROP / MOVE
# ════════════════════════════════════════════════════════════════════════════════

@router.post("/move", response_model=TimetableEntryOut)
def move_entry(
    payload: TimetableEntryMove,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
    svc: TimetableService = Depends(get_timetable_service),
):
    try:
        entry = svc.move_entry(payload, current_user.id)
        return _enrich(entry, db)
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ════════════════════════════════════════════════════════════════════════════════
# CLASSROOM AVAILABILITY
# ════════════════════════════════════════════════════════════════════════════════

@router.post("/classroom-availability", response_model=List[ClassroomAvailabilityResult])
def find_available_classrooms(
    payload: ClassroomAvailabilityQuery,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Find free classrooms for a given version + day + slot.
    Supports filtering by room type and minimum capacity.
    """
    # Find the timeslot ID for the given day + slot_index
    version = db.query(TimetableVersion).filter(TimetableVersion.id == payload.version_id).first()
    if not version: raise HTTPException(404, "Version not found")

    from app.models.models import TimetableSettings
    ts_settings = db.query(TimetableSettings).filter(
        TimetableSettings.department_id == version.department_id
    ).first()

    timeslot = db.query(Timeslot).filter(
        Timeslot.settings_id == ts_settings.id,
        Timeslot.day_of_week == payload.day_of_week,
        Timeslot.slot_index == payload.slot_index,
    ).first()

    if not timeslot: raise HTTPException(404, "Timeslot not found")

    repo = ClassroomRepository(db)

    # Available classrooms
    available = repo.get_available_for_slot(
        payload.version_id, timeslot.id, payload.room_type, payload.min_capacity
    )

    # All active classrooms of the requested type (to show occupied ones too)
    all_rooms = repo.get_active(payload.room_type)

    available_ids = {r.id for r in available}
    results = []
    for room in all_rooms:
        if payload.min_capacity and room.capacity < payload.min_capacity:
            continue
        results.append(ClassroomAvailabilityResult(
            classroom=ClassroomOut.model_validate(room),
            is_available=room.id in available_ids,
        ))

    return results


# ════════════════════════════════════════════════════════════════════════════════
# LOCK / UNLOCK ENTRY (ADMIN)
# ════════════════════════════════════════════════════════════════════════════════

@router.post("/entries/{entry_id}/lock", status_code=200)
def lock_entry(entry_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    from app.models.models import TimetableEntry
    entry = db.query(TimetableEntry).filter(TimetableEntry.id == entry_id).first()
    if not entry: raise HTTPException(404, "Entry not found")
    entry.is_locked = True
    db.commit()
    return {"message": "Entry locked"}


@router.post("/entries/{entry_id}/unlock", status_code=200)
def unlock_entry(entry_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    from app.models.models import TimetableEntry
    entry = db.query(TimetableEntry).filter(TimetableEntry.id == entry_id).first()
    if not entry: raise HTTPException(404, "Entry not found")
    entry.is_locked = False
    db.commit()
    return {"message": "Entry unlocked"}


@router.delete("/entries/{entry_id}", status_code=200)
def delete_entry(entry_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_admin), svc: TimetableService = Depends(get_timetable_service)):
    try:
        svc.delete_entry(entry_id, current_user.id)
        return {"message": "Entry deleted"}
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/versions/{version_id}/save", response_model=TimetableVersionOut)
def save_version_draft(version_id: str, current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    # Saving a draft is effectively ensuring it's still DRAFT and emitting an update.
    version = db.query(TimetableVersion).filter(TimetableVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    # Ensure version remains DRAFT
    db.query(TimetableVersion).filter(TimetableVersion.id == version_id).update({"status": version.status})
    db.commit()
    from app.services.realtime import RealtimeService
    realtime = RealtimeService()
    realtime.emit("TIMETABLE_UPDATED", {"version_id": version_id, "action": "saved"})
    return TimetableVersionOut.model_validate(version)


@router.delete("/versions/{version_id}", status_code=200)
def delete_version(version_id: str, current_user: User = Depends(require_admin), svc: TimetableService = Depends(get_timetable_service)):
    try:
        svc.delete_version(version_id, current_user.id)
        return {"message": "Version deleted"}
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
