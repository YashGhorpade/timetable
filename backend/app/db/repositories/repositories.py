"""
Repository layer — all database access goes through these classes.
Services call repositories; endpoints call services.
Pattern: repository → service → endpoint
"""
from typing import Generic, List, Optional, Type, TypeVar
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_
from app.db.database import Base
from app.models.models import (
    User, RefreshToken, Department, AcademicYear, Section, Batch,
    Subject, LectureFrequency, Teacher, TeacherSubjectAssignment,
    TeacherPreference, Student, Classroom, TimetableSettings, Timeslot,
    TimetableVersion, TimetableEntry, TimetableHistory, AuditLog,
    RoomReservation, SwapRequest, SolverRun, MLFeedback, ConstraintConfig,
    LectureType, RoomType, TimetableStatus, DayOfWeek
)

ModelType = TypeVar("ModelType", bound=Base)


# ════════════════════════════════════════════════════════════════════════════════
# GENERIC BASE REPOSITORY
# ════════════════════════════════════════════════════════════════════════════════

class BaseRepository(Generic[ModelType]):
    def __init__(self, model: Type[ModelType], db: Session):
        self.model = model
        self.db = db

    def get(self, id: str) -> Optional[ModelType]:
        return self.db.query(self.model).filter(self.model.id == id).first()

    def get_all(self, skip: int = 0, limit: int = 200) -> List[ModelType]:
        query = self.db.query(self.model)
        if skip or limit:
            query = query.order_by(self.model.id)
        return query.offset(skip).limit(limit).all()

    def create(self, obj: ModelType) -> ModelType:
        self.db.add(obj)
        self.db.commit()
        self.db.refresh(obj)
        return obj

    def update(self, obj: ModelType, data: dict) -> ModelType:
        for k, v in data.items():
            if v is not None:
                setattr(obj, k, v)
        self.db.commit()
        self.db.refresh(obj)
        return obj

    def delete(self, obj: ModelType) -> None:
        self.db.delete(obj)
        self.db.commit()

    def save(self) -> None:
        self.db.commit()


# ════════════════════════════════════════════════════════════════════════════════
# USER REPOSITORY
# ════════════════════════════════════════════════════════════════════════════════

class UserRepository(BaseRepository[User]):
    def __init__(self, db: Session):
        super().__init__(User, db)

    def get_by_email(self, email: str) -> Optional[User]:
        return self.db.query(User).filter(User.email == email).first()

    def get_with_profile(self, user_id: str) -> Optional[User]:
        return (
            self.db.query(User)
            .options(
                joinedload(User.teacher),
                joinedload(User.student)
                .joinedload(Student.section)
                .joinedload(Section.academic_year)
                .joinedload(AcademicYear.department),
            )
            .filter(User.id == user_id)
            .first()
        )

    def store_refresh_token(self, user_id: str, token_hash: str, expires_at) -> RefreshToken:
        rt = RefreshToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
        self.db.add(rt)
        self.db.commit()
        return rt

    def get_refresh_token(self, token_hash: str) -> Optional[RefreshToken]:
        from datetime import datetime, timezone
        return (
            self.db.query(RefreshToken)
            .filter(
                RefreshToken.token_hash == token_hash,
                RefreshToken.revoked == False,
                RefreshToken.expires_at > datetime.now(timezone.utc),
            )
            .first()
        )

    def revoke_refresh_token(self, token_hash: str) -> None:
        rt = self.db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
        if rt:
            rt.revoked = True
            self.db.commit()

    def revoke_all_user_tokens(self, user_id: str) -> None:
        self.db.query(RefreshToken).filter(
            RefreshToken.user_id == user_id
        ).update({"revoked": True})
        self.db.commit()


# ════════════════════════════════════════════════════════════════════════════════
# DEPARTMENT REPOSITORY
# ════════════════════════════════════════════════════════════════════════════════

class DepartmentRepository(BaseRepository[Department]):
    def __init__(self, db: Session):
        super().__init__(Department, db)

    def get_active(self) -> List[Department]:
        return self.db.query(Department).filter(Department.is_active == True).all()

    def get_by_code(self, code: str) -> Optional[Department]:
        return self.db.query(Department).filter(Department.code == code).first()

    def get_with_years(self, dept_id: str) -> Optional[Department]:
        return (
            self.db.query(Department)
            .options(joinedload(Department.academic_years).joinedload(AcademicYear.sections).joinedload(Section.batches))
            .filter(Department.id == dept_id)
            .first()
        )


# ════════════════════════════════════════════════════════════════════════════════
# SECTION REPOSITORY
# ════════════════════════════════════════════════════════════════════════════════

class SectionRepository(BaseRepository[Section]):
    def __init__(self, db: Session):
        super().__init__(Section, db)

    def get_by_academic_year(self, academic_year_id: str) -> List[Section]:
        return (
            self.db.query(Section)
            .options(joinedload(Section.batches))
            .filter(Section.academic_year_id == academic_year_id)
            .all()
        )

    def get_with_batches(self, section_id: str) -> Optional[Section]:
        return (
            self.db.query(Section)
            .options(joinedload(Section.batches))
            .filter(Section.id == section_id)
            .first()
        )


# ════════════════════════════════════════════════════════════════════════════════
# TEACHER REPOSITORY
# ════════════════════════════════════════════════════════════════════════════════

class TeacherRepository(BaseRepository[Teacher]):
    def __init__(self, db: Session):
        super().__init__(Teacher, db)

    def get_by_user_id(self, user_id: str) -> Optional[Teacher]:
        return self.db.query(Teacher).filter(Teacher.user_id == user_id).first()

    def get_by_department(self, dept_id: str) -> List[Teacher]:
        return self.db.query(Teacher).filter(
            Teacher.department_id == dept_id,
            Teacher.is_active == True,
        ).all()

    def get_with_assignments(self, teacher_id: str) -> Optional[Teacher]:
        return (
            self.db.query(Teacher)
            .options(joinedload(Teacher.subject_assignments))
            .filter(Teacher.id == teacher_id)
            .first()
        )

    def get_active(self) -> List[Teacher]:
        return self.db.query(Teacher).filter(Teacher.is_active == True).all()


# ════════════════════════════════════════════════════════════════════════════════
# STUDENT REPOSITORY
# ════════════════════════════════════════════════════════════════════════════════

class StudentRepository(BaseRepository[Student]):
    def __init__(self, db: Session):
        super().__init__(Student, db)

    def get_by_user_id(self, user_id: str) -> Optional[Student]:
        return self.db.query(Student).filter(Student.user_id == user_id).first()

    def get_by_section(self, section_id: str) -> List[Student]:
        return self.db.query(Student).filter(Student.section_id == section_id).all()

    def get_by_batch(self, batch_id: str) -> List[Student]:
        return self.db.query(Student).filter(Student.batch_id == batch_id).all()


# ════════════════════════════════════════════════════════════════════════════════
# CLASSROOM REPOSITORY
# ════════════════════════════════════════════════════════════════════════════════

class ClassroomRepository(BaseRepository[Classroom]):
    def __init__(self, db: Session):
        super().__init__(Classroom, db)

    def get_active(self, room_type: Optional[RoomType] = None) -> List[Classroom]:
        q = self.db.query(Classroom).filter(Classroom.is_active == True)
        if room_type:
            q = q.filter(Classroom.room_type == room_type)
        return q.all()

    def get_available_for_slot(
        self, version_id: str, timeslot_id: str,
        room_type: Optional[RoomType] = None,
        min_capacity: Optional[int] = None,
    ) -> List[Classroom]:
        """Returns classrooms NOT occupied in the given version + timeslot."""
        occupied_ids = (
            self.db.query(TimetableEntry.classroom_id)
            .filter(
                TimetableEntry.version_id == version_id,
                TimetableEntry.timeslot_id == timeslot_id,
            )
            .subquery()
        )
        q = (
            self.db.query(Classroom)
            .filter(
                Classroom.is_active == True,
                ~Classroom.id.in_(occupied_ids),
            )
        )
        if room_type:
            q = q.filter(Classroom.room_type == room_type)
        if min_capacity:
            q = q.filter(Classroom.capacity >= min_capacity)
        return q.all()


# ════════════════════════════════════════════════════════════════════════════════
# TIMETABLE REPOSITORY
# ════════════════════════════════════════════════════════════════════════════════

class TimetableRepository(BaseRepository[TimetableEntry]):
    def __init__(self, db: Session):
        super().__init__(TimetableEntry, db)

    # ── Version management ──────────────────────────────────────────────────────

    def get_version(self, version_id: str) -> Optional[TimetableVersion]:
        return self.db.query(TimetableVersion).filter(TimetableVersion.id == version_id).first()

    def get_published_version(self, department_id: str, academic_year_id: str) -> Optional[TimetableVersion]:
        return (
            self.db.query(TimetableVersion)
            .filter(
                TimetableVersion.department_id == department_id,
                TimetableVersion.academic_year_id == academic_year_id,
                TimetableVersion.status == TimetableStatus.PUBLISHED,
            )
            .first()
        )

    def create_version(self, version: TimetableVersion) -> TimetableVersion:
        self.db.add(version)
        self.db.commit()
        self.db.refresh(version)
        return version

    def publish_version(self, version_id: str, department_id: str, academic_year_id: str) -> None:
        """Unpublish any existing published version and publish new one."""
        self.db.query(TimetableVersion).filter(
            TimetableVersion.department_id == department_id,
            TimetableVersion.academic_year_id == academic_year_id,
            TimetableVersion.status == TimetableStatus.PUBLISHED,
        ).update({"status": TimetableStatus.ARCHIVED})
        self.db.query(TimetableVersion).filter(
            TimetableVersion.id == version_id
        ).update({"status": TimetableStatus.PUBLISHED})
        self.db.commit()

    # ── Entry queries (the central timetable filtered views) ────────────────────

    def get_entries_for_teacher(self, version_id: str, teacher_id: str) -> List[TimetableEntry]:
        return (
            self.db.query(TimetableEntry)
            .options(
                joinedload(TimetableEntry.timeslot),
                joinedload(TimetableEntry.subject),
                joinedload(TimetableEntry.classroom),
                joinedload(TimetableEntry.section).joinedload(Section.academic_year).joinedload(AcademicYear.department),
                joinedload(TimetableEntry.batch),
            )
            .filter(
                TimetableEntry.version_id == version_id,
                TimetableEntry.teacher_id == teacher_id,
            )
            .all()
        )

    def get_entries_for_section(self, version_id: str, section_id: str) -> List[TimetableEntry]:
        """All entries for a section — theory for all, tutorials/labs for all batches."""
        return (
            self.db.query(TimetableEntry)
            .options(
                joinedload(TimetableEntry.timeslot),
                joinedload(TimetableEntry.subject),
                joinedload(TimetableEntry.teacher),
                joinedload(TimetableEntry.classroom),
                joinedload(TimetableEntry.batch),
            )
            .filter(
                TimetableEntry.version_id == version_id,
                TimetableEntry.section_id == section_id,
            )
            .all()
        )

    def get_entries_for_student(
        self, version_id: str, section_id: str, batch_id: str
    ) -> List[TimetableEntry]:
        """Theory (batch_id is NULL for theory) + own batch tutorials/labs."""
        return (
            self.db.query(TimetableEntry)
            .options(
                joinedload(TimetableEntry.timeslot),
                joinedload(TimetableEntry.subject),
                joinedload(TimetableEntry.teacher),
                joinedload(TimetableEntry.classroom),
            )
            .filter(
                TimetableEntry.version_id == version_id,
                TimetableEntry.section_id == section_id,
                or_(
                    TimetableEntry.batch_id == None,      # theory — section-wide
                    TimetableEntry.batch_id == batch_id,  # own batch only
                ),
            )
            .all()
        )

    def get_entries_for_classroom(self, version_id: str, classroom_id: str) -> List[TimetableEntry]:
        return (
            self.db.query(TimetableEntry)
            .options(
                joinedload(TimetableEntry.timeslot),
                joinedload(TimetableEntry.subject),
                joinedload(TimetableEntry.teacher),
                joinedload(TimetableEntry.section),
            )
            .filter(
                TimetableEntry.version_id == version_id,
                TimetableEntry.classroom_id == classroom_id,
            )
            .all()
        )

    def get_all_entries(self, version_id: str) -> List[TimetableEntry]:
        return (
            self.db.query(TimetableEntry)
            .options(
                joinedload(TimetableEntry.timeslot),
                joinedload(TimetableEntry.subject),
                joinedload(TimetableEntry.teacher),
                joinedload(TimetableEntry.classroom),
                joinedload(TimetableEntry.section),
                joinedload(TimetableEntry.batch),
            )
            .filter(TimetableEntry.version_id == version_id)
            .all()
        )

    # ── Conflict detection ──────────────────────────────────────────────────────

    def check_teacher_conflict(
        self, version_id: str, teacher_id: str, timeslot_id: str, exclude_entry_id: Optional[str] = None
    ) -> bool:
        q = self.db.query(TimetableEntry).filter(
            TimetableEntry.version_id == version_id,
            TimetableEntry.teacher_id == teacher_id,
            TimetableEntry.timeslot_id == timeslot_id,
        )
        if exclude_entry_id:
            q = q.filter(TimetableEntry.id != exclude_entry_id)
        return q.first() is not None

    def check_classroom_conflict(
        self, version_id: str, classroom_id: str, timeslot_id: str, exclude_entry_id: Optional[str] = None
    ) -> bool:
        q = self.db.query(TimetableEntry).filter(
            TimetableEntry.version_id == version_id,
            TimetableEntry.classroom_id == classroom_id,
            TimetableEntry.timeslot_id == timeslot_id,
        )
        if exclude_entry_id:
            q = q.filter(TimetableEntry.id != exclude_entry_id)
        return q.first() is not None

    def check_section_theory_conflict(
        self, version_id: str, section_id: str, timeslot_id: str, exclude_entry_id: Optional[str] = None
    ) -> bool:
        q = self.db.query(TimetableEntry).filter(
            TimetableEntry.version_id == version_id,
            TimetableEntry.section_id == section_id,
            TimetableEntry.timeslot_id == timeslot_id,
            TimetableEntry.lecture_type == LectureType.THEORY,
        )
        if exclude_entry_id:
            q = q.filter(TimetableEntry.id != exclude_entry_id)
        return q.first() is not None

    def check_batch_conflict(
        self, version_id: str, batch_id: str, timeslot_id: str, exclude_entry_id: Optional[str] = None
    ) -> bool:
        q = self.db.query(TimetableEntry).filter(
            TimetableEntry.version_id == version_id,
            TimetableEntry.batch_id == batch_id,
            TimetableEntry.timeslot_id == timeslot_id,
        )
        if exclude_entry_id:
            q = q.filter(TimetableEntry.id != exclude_entry_id)
        return q.first() is not None

    # ── Bulk insert (used by solver) ─────────────────────────────────────────────

    def bulk_insert_entries(self, entries: List[TimetableEntry]) -> None:
        self.db.bulk_save_objects(entries)
        self.db.commit()

    def delete_version_entries(self, version_id: str) -> None:
        self.db.query(TimetableEntry).filter(
            TimetableEntry.version_id == version_id
        ).delete()
        self.db.commit()

    # ── History ─────────────────────────────────────────────────────────────────

    def log_history(self, history: TimetableHistory) -> None:
        self.db.add(history)
        self.db.commit()
