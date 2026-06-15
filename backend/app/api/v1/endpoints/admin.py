"""
Admin CRUD endpoints.
All routes require ADMIN role.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.deps.dependencies import require_admin, get_current_user, get_timetable_service
from app.db.database import get_db, SessionLocal
from app.db.repositories.repositories import (
    DepartmentRepository, SectionRepository, TeacherRepository,
    StudentRepository, ClassroomRepository
)
from app.models.models import (
    AcademicYear, Batch, ConstraintConfig, Department, LectureFrequency,
    Section, Student, Subject, Teacher, TeacherSubjectAssignment,
    TeacherClassroomAssignment, TimetableSettings, User, UserRole
)
from app.models.models import (
    TimetableVersion, TimetableEntry, Timeslot, Classroom, MLFeedback
)
from app.models.models import LabSlotPreference
from app.core.security import hash_password
from app.schemas.schemas import (
    AcademicYearCreate, AcademicYearOut,
    BatchCreate, BatchUpdate, BatchOut,
    ClassroomCreate, ClassroomUpdate, ClassroomOut,
    ConstraintConfigOut, ConstraintConfigUpdate,
    DepartmentCreate, DepartmentUpdate, DepartmentOut,
    LectureFrequencyCreate, LectureFrequencyOut,
    SectionCreate, SectionUpdate, SectionOut,
    StudentCreate, StudentUpdate, StudentOut,
    SubjectCreate, SubjectUpdate, SubjectOut,
    TeacherCreate, TeacherUpdate, TeacherOut,
    TeacherSubjectAssignmentCreate,
    TimetableSettingsCreate, TimetableSettingsOut,
    TeacherClassroomAssignmentCreate, TeacherClassroomAssignmentOut,
)
from app.services.realtime import RealtimeService, get_realtime_service
import uuid

router = APIRouter(prefix="/admin", tags=["Admin"])


# ════════════════════════════════════════════════════════════════════════════════
# DEPARTMENTS
# ════════════════════════════════════════════════════════════════════════════════

@router.get("/departments", response_model=List[DepartmentOut])
def list_departments(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return DepartmentRepository(db).get_all()


@router.post("/departments", response_model=DepartmentOut, status_code=201)
def create_department(
    payload: DepartmentCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
    rt: RealtimeService = Depends(get_realtime_service),
):
    repo = DepartmentRepository(db)
    if repo.get_by_code(payload.code):
        raise HTTPException(400, "Department code already exists")
    dept = Department(id=str(uuid.uuid4()), **payload.model_dump())
    repo.create(dept)
    rt.emit("DEPARTMENT_UPDATED", {"department_id": dept.id, "action": "create"})
    return dept


@router.patch("/departments/{dept_id}", response_model=DepartmentOut)
def update_department(
    dept_id: str, payload: DepartmentUpdate,
    db: Session = Depends(get_db), _: User = Depends(require_admin),
    rt: RealtimeService = Depends(get_realtime_service),
):
    repo = DepartmentRepository(db)
    dept = repo.get(dept_id)
    if not dept:
        raise HTTPException(404, "Department not found")
    dept = repo.update(dept, payload.model_dump(exclude_none=True))
    rt.emit("DEPARTMENT_UPDATED", {"department_id": dept_id, "action": "update"})
    return dept


@router.delete("/departments/{dept_id}", status_code=204)
def delete_department(
    dept_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin),
):
    repo = DepartmentRepository(db)
    dept = repo.get(dept_id)
    if not dept:
        raise HTTPException(404, "Department not found")
    repo.delete(dept)


# ════════════════════════════════════════════════════════════════════════════════
# ACADEMIC YEARS
# ════════════════════════════════════════════════════════════════════════════════

@router.post("/academic-years", response_model=AcademicYearOut, status_code=201)
def create_academic_year(
    payload: AcademicYearCreate,
    db: Session = Depends(get_db), _: User = Depends(require_admin),
):
    ay = AcademicYear(id=str(uuid.uuid4()), **payload.model_dump())
    db.add(ay); db.commit(); db.refresh(ay)
    return ay


@router.get("/academic-years/{dept_id}", response_model=List[AcademicYearOut])
def list_academic_years(
    dept_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.ADMIN:
        return db.query(AcademicYear).filter(AcademicYear.department_id == dept_id).all()

    if current_user.role == UserRole.TEACHER and current_user.teacher:
        if current_user.teacher.department_id != dept_id:
            raise HTTPException(status_code=403, detail="Access denied")
        return db.query(AcademicYear).filter(AcademicYear.department_id == dept_id).all()

    if current_user.role == UserRole.STUDENT and current_user.student:
        if current_user.student.section.academic_year.department_id != dept_id:
            raise HTTPException(status_code=403, detail="Access denied")
        return db.query(AcademicYear).filter(AcademicYear.department_id == dept_id).all()

    raise HTTPException(status_code=403, detail="Access denied")


# ════════════════════════════════════════════════════════════════════════════════
# SECTIONS
# ════════════════════════════════════════════════════════════════════════════════

@router.post("/sections", response_model=SectionOut, status_code=201)
def create_section(
    payload: SectionCreate,
    db: Session = Depends(get_db), _: User = Depends(require_admin),
    rt: RealtimeService = Depends(get_realtime_service),
):
    section = Section(id=str(uuid.uuid4()), **payload.model_dump())
    db.add(section); db.commit(); db.refresh(section)
    rt.emit("SECTION_UPDATED", {"section_id": section.id, "action": "create"})
    return section


@router.get("/sections/{academic_year_id}", response_model=List[SectionOut])
def list_sections(academic_year_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return SectionRepository(db).get_by_academic_year(academic_year_id)


@router.patch("/sections/{section_id}", response_model=SectionOut)
def update_section(
    section_id: str, payload: SectionUpdate,
    db: Session = Depends(get_db), _: User = Depends(require_admin),
    rt: RealtimeService = Depends(get_realtime_service),
):
    repo = SectionRepository(db)
    section = repo.get(section_id)
    if not section:
        raise HTTPException(404, "Section not found")
    section = repo.update(section, payload.model_dump(exclude_none=True))
    rt.emit("SECTION_UPDATED", {"section_id": section_id, "action": "update"})
    return section


@router.delete("/sections/{section_id}", status_code=204)
def delete_section(section_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    repo = SectionRepository(db)
    s = repo.get(section_id)
    if not s: raise HTTPException(404, "Section not found")
    repo.delete(s)


# ════════════════════════════════════════════════════════════════════════════════
# BATCHES
# ════════════════════════════════════════════════════════════════════════════════

@router.post("/batches", response_model=BatchOut, status_code=201)
def create_batch(payload: BatchCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    batch = Batch(id=str(uuid.uuid4()), **payload.model_dump())
    db.add(batch); db.commit(); db.refresh(batch)
    return batch


@router.get("/batches/{section_id}", response_model=List[BatchOut])
def list_batches(section_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(Batch).filter(Batch.section_id == section_id).all()


@router.patch("/batches/{batch_id}", response_model=BatchOut)
def update_batch(batch_id: str, payload: BatchUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch: raise HTTPException(404, "Batch not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(batch, k, v)
    db.commit(); db.refresh(batch)
    return batch


@router.delete("/batches/{batch_id}", status_code=204)
def delete_batch(batch_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch: raise HTTPException(404, "Batch not found")
    db.delete(batch); db.commit()


# ════════════════════════════════════════════════════════════════════════════════
# SUBJECTS
# ════════════════════════════════════════════════════════════════════════════════

@router.post("/subjects", response_model=SubjectOut, status_code=201)
def create_subject(payload: SubjectCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    subj = Subject(id=str(uuid.uuid4()), **payload.model_dump())
    db.add(subj); db.commit(); db.refresh(subj)
    return subj


@router.get("/subjects", response_model=List[SubjectOut])
def list_subjects(
    department_id: Optional[str] = None,
    academic_year_id: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = db.query(Subject)
    if department_id:    q = q.filter(Subject.department_id == department_id)
    if academic_year_id: q = q.filter(Subject.academic_year_id == academic_year_id)
    return q.all()


@router.patch("/subjects/{subject_id}", response_model=SubjectOut)
def update_subject(subject_id: str, payload: SubjectUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    subj = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subj: raise HTTPException(404, "Subject not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(subj, k, v)
    db.commit(); db.refresh(subj)
    return subj


@router.delete("/subjects/{subject_id}", status_code=204)
def delete_subject(subject_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    subj = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subj: raise HTTPException(404, "Subject not found")
    db.delete(subj); db.commit()


# ════════════════════════════════════════════════════════════════════════════════
# LECTURE FREQUENCIES
# ════════════════════════════════════════════════════════════════════════════════

@router.post("/lecture-frequencies", response_model=LectureFrequencyOut, status_code=201)
def create_frequency(payload: LectureFrequencyCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if not payload.subject_id or not payload.section_id:
        raise HTTPException(status_code=400, detail="Subject and section must both be provided.")

    existing = db.query(LectureFrequency).filter(
        LectureFrequency.subject_id == payload.subject_id,
        LectureFrequency.section_id == payload.section_id,
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Lecture frequency already exists for subject_id={payload.subject_id} "
                f"and section_id={payload.section_id} (existing id={existing.id})."
            ),
        )

    freq = LectureFrequency(id=str(uuid.uuid4()), **payload.model_dump())
    db.add(freq)
    try:
        db.commit()
        db.refresh(freq)
        return freq
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="A lecture frequency already exists for this subject and section.",
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create frequency: {str(e)}")


@router.get("/lecture-frequencies/{subject_id}", response_model=List[LectureFrequencyOut])
def list_frequencies(subject_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(LectureFrequency).filter(LectureFrequency.subject_id == subject_id).all()


@router.patch("/lecture-frequencies/{freq_id}", response_model=LectureFrequencyOut)
def update_frequency(freq_id: str, payload: LectureFrequencyCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    freq = db.query(LectureFrequency).filter(LectureFrequency.id == freq_id).first()
    if not freq:
        raise HTTPException(404, "Frequency not found")

    for k, v in payload.model_dump().items():
        setattr(freq, k, v)

    try:
        db.commit()
        db.refresh(freq)
        return freq
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="A lecture frequency already exists for this subject and section.",
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update frequency: {str(e)}")


@router.delete("/lecture-frequencies/{freq_id}", status_code=204)
def delete_frequency(freq_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    freq = db.query(LectureFrequency).filter(LectureFrequency.id == freq_id).first()
    if not freq:
        raise HTTPException(404, "Frequency not found")
    db.delete(freq)
    db.commit()


# ════════════════════════════════════════════════════════════════════════════════
# TEACHERS
# ════════════════════════════════════════════════════════════════════════════════

@router.post("/teachers", response_model=TeacherOut, status_code=201)
def create_teacher(
    payload: TeacherCreate,
    db: Session = Depends(get_db), _: User = Depends(require_admin),
    rt: RealtimeService = Depends(get_realtime_service),
):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(400, "Email already exists")

    user = User(id=str(uuid.uuid4()), email=payload.email,
                password_hash=hash_password(payload.password), role=UserRole.TEACHER)
    db.add(user); db.flush()

    teacher = Teacher(
        id=str(uuid.uuid4()), user_id=user.id,
        department_id=payload.department_id, employee_id=payload.employee_id,
        first_name=payload.first_name, last_name=payload.last_name,
        designation=payload.designation, specialization=payload.specialization,
        phone=payload.phone,
        max_lectures_per_day=payload.max_lectures_per_day,
        max_lectures_per_week=payload.max_lectures_per_week,
    )
    db.add(teacher); db.commit(); db.refresh(teacher)
    rt.emit("TEACHER_UPDATED", {"teacher_id": teacher.id, "action": "create"})
    return teacher


@router.get("/teachers", response_model=List[TeacherOut])
def list_teachers(
    department_id: Optional[str] = None,
    db: Session = Depends(get_db), _: User = Depends(require_admin),
):
    repo = TeacherRepository(db)
    return repo.get_by_department(department_id) if department_id else repo.get_active()


@router.patch("/teachers/{teacher_id}", response_model=TeacherOut)
def update_teacher(
    teacher_id: str, payload: TeacherUpdate,
    db: Session = Depends(get_db), _: User = Depends(require_admin),
    rt: RealtimeService = Depends(get_realtime_service),
):
    repo = TeacherRepository(db)
    teacher = repo.get(teacher_id)
    if not teacher: raise HTTPException(404, "Teacher not found")
    teacher = repo.update(teacher, payload.model_dump(exclude_none=True))
    rt.emit("TEACHER_UPDATED", {"teacher_id": teacher_id, "action": "update"})
    return teacher


@router.delete("/teachers/{teacher_id}", status_code=204)
def delete_teacher(teacher_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    repo = TeacherRepository(db)
    teacher = repo.get(teacher_id)
    if not teacher: raise HTTPException(404, "Teacher not found")
    repo.delete(teacher)


@router.post("/teachers/assign-subject", status_code=201)
def assign_subject_to_teacher(
    payload: TeacherSubjectAssignmentCreate,
    db: Session = Depends(get_db), _: User = Depends(require_admin),
):
    existing = db.query(TeacherSubjectAssignment).filter(
        TeacherSubjectAssignment.teacher_id == payload.teacher_id,
        TeacherSubjectAssignment.subject_id == payload.subject_id,
        TeacherSubjectAssignment.section_id == payload.section_id,
        TeacherSubjectAssignment.lecture_type == payload.lecture_type,
    ).first()
    if existing:
        raise HTTPException(400, "Assignment already exists")

    assign = TeacherSubjectAssignment(id=str(uuid.uuid4()), **payload.model_dump())
    db.add(assign); db.commit()
    return {"message": "Subject assigned successfully"}


@router.post("/teachers/classroom-compatibility", response_model=TeacherClassroomAssignmentOut, status_code=201)
def assign_classroom_to_teacher(
    payload: TeacherClassroomAssignmentCreate,
    db: Session = Depends(get_db), _: User = Depends(require_admin),
):
    existing = db.query(TeacherClassroomAssignment).filter(
        TeacherClassroomAssignment.teacher_id == payload.teacher_id,
        TeacherClassroomAssignment.classroom_id == payload.classroom_id,
    ).first()
    if existing:
        raise HTTPException(400, "Teacher is already compatible with this classroom")

    assign = TeacherClassroomAssignment(id=str(uuid.uuid4()), **payload.model_dump())
    db.add(assign); db.commit(); db.refresh(assign)
    return assign


@router.get("/teachers/{teacher_id}/classroom-compatibility", response_model=List[TeacherClassroomAssignmentOut])
def list_teacher_classroom_compatibility(
    teacher_id: str,
    db: Session = Depends(get_db), _: User = Depends(require_admin),
):
    return db.query(TeacherClassroomAssignment).filter(
        TeacherClassroomAssignment.teacher_id == teacher_id
    ).all()


# ════════════════════════════════════════════════════════════════════════════════
# STUDENTS
# ════════════════════════════════════════════════════════════════════════════════

@router.post("/students", response_model=StudentOut, status_code=201)
def create_student(payload: StudentCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(400, "Email already exists")

    user = User(id=str(uuid.uuid4()), email=payload.email,
                password_hash=hash_password(payload.password), role=UserRole.STUDENT)
    db.add(user); db.flush()

    student = Student(
        id=str(uuid.uuid4()), user_id=user.id,
        section_id=payload.section_id, batch_id=payload.batch_id,
        student_id=payload.student_id,
        first_name=payload.first_name, last_name=payload.last_name,
        phone=payload.phone,
    )
    db.add(student); db.commit(); db.refresh(student)
    return student


@router.get("/students", response_model=List[StudentOut])
def list_students(
    section_id: Optional[str] = None, batch_id: Optional[str] = None,
    db: Session = Depends(get_db), _: User = Depends(require_admin),
):
    repo = StudentRepository(db)
    if batch_id: return repo.get_by_batch(batch_id)
    if section_id: return repo.get_by_section(section_id)
    return repo.get_all()


@router.patch("/students/{student_id}", response_model=StudentOut)
def update_student(student_id: str, payload: StudentUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student: raise HTTPException(404, "Student not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(student, k, v)
    db.commit(); db.refresh(student)
    return student


@router.delete("/students/{student_id}", status_code=204)
def delete_student(student_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student: raise HTTPException(404, "Student not found")
    db.delete(student); db.commit()


# ════════════════════════════════════════════════════════════════════════════════
# CLASSROOMS
# ════════════════════════════════════════════════════════════════════════════════

@router.post("/classrooms", response_model=ClassroomOut, status_code=201)
def create_classroom(
    payload: ClassroomCreate, db: Session = Depends(get_db), _: User = Depends(require_admin),
    rt: RealtimeService = Depends(get_realtime_service),
):
    from app.models.models import Classroom
    room = Classroom(id=str(uuid.uuid4()), **payload.model_dump())
    db.add(room); db.commit(); db.refresh(room)
    rt.emit("CLASSROOM_UPDATED", {"classroom_id": room.id, "action": "create"})
    return room


@router.get("/classrooms", response_model=List[ClassroomOut])
def list_classrooms(
    room_type: Optional[str] = None,
    db: Session = Depends(get_db), _: User = Depends(require_admin),
):
    from app.models.models import RoomType
    rt = RoomType(room_type) if room_type else None
    return ClassroomRepository(db).get_active(rt)


@router.patch("/classrooms/{room_id}", response_model=ClassroomOut)
def update_classroom(
    room_id: str, payload: ClassroomUpdate,
    db: Session = Depends(get_db), _: User = Depends(require_admin),
    rt: RealtimeService = Depends(get_realtime_service),
):
    repo = ClassroomRepository(db)
    room = repo.get(room_id)
    if not room: raise HTTPException(404, "Classroom not found")
    room = repo.update(room, payload.model_dump(exclude_none=True))
    rt.emit("CLASSROOM_UPDATED", {"classroom_id": room_id, "action": "update"})
    return room


@router.delete("/classrooms/{room_id}", status_code=204)
def delete_classroom(room_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    repo = ClassroomRepository(db)
    room = repo.get(room_id)
    if not room: raise HTTPException(404, "Classroom not found")
    repo.delete(room)


# ════════════════════════════════════════════════════════════════════════════════
# TIMETABLE SETTINGS
# ════════════════════════════════════════════════════════════════════════════════

@router.post("/timetable-settings", response_model=TimetableSettingsOut, status_code=201)
def create_timetable_settings(
    payload: TimetableSettingsCreate,
    db: Session = Depends(get_db), _: User = Depends(require_admin),
    svc=Depends(get_timetable_service),
):
    existing = db.query(TimetableSettings).filter(
        TimetableSettings.department_id == payload.department_id
    ).first()
    if existing:
        raise HTTPException(400, "Settings already exist for this department. Use PATCH to update.")

    ts = TimetableSettings(id=str(uuid.uuid4()), **payload.model_dump())
    db.add(ts); db.commit(); db.refresh(ts)

    # Auto-generate timeslots
    svc.generate_timeslots(ts.id)
    return ts


@router.get("/timetable-settings/{dept_id}", response_model=TimetableSettingsOut)
def get_timetable_settings(dept_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    ts = db.query(TimetableSettings).filter(TimetableSettings.department_id == dept_id).first()
    if not ts: raise HTTPException(404, "Settings not found")
    return ts


# ════════════════════════════════════════════════════════════════════════════════
# CONSTRAINT CONFIGURATION
# ════════════════════════════════════════════════════════════════════════════════

@router.get("/constraints/{dept_id}", response_model=ConstraintConfigOut)
def get_constraints(dept_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    cfg = db.query(ConstraintConfig).filter(ConstraintConfig.department_id == dept_id).first()
    if not cfg:
        # Auto-create with defaults
        cfg = ConstraintConfig(id=str(uuid.uuid4()), department_id=dept_id)
        db.add(cfg); db.commit(); db.refresh(cfg)
    return cfg


@router.patch("/constraints/{dept_id}", response_model=ConstraintConfigOut)
def update_constraints(
    dept_id: str, payload: ConstraintConfigUpdate,
    db: Session = Depends(get_db), _: User = Depends(require_admin),
):
    cfg = db.query(ConstraintConfig).filter(ConstraintConfig.department_id == dept_id).first()
    if not cfg:
        cfg = ConstraintConfig(id=str(uuid.uuid4()), department_id=dept_id)
        db.add(cfg); db.flush()
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(cfg, k, v)
    db.commit(); db.refresh(cfg)
    return cfg


# ──────────────────────────────────────────────────────────────────────────────
# TRAIN XGBOOST SCORER
# ──────────────────────────────────────────────────────────────────────────────


@router.post("/train-scorer", status_code=202)
def train_scorer(
    background_tasks: BackgroundTasks,
    department_id: Optional[str] = None,
    current_user: User = Depends(require_admin),
):
    """Schedule scorer training as a background task and return 202 Accepted.

    The background worker will open its own DB session and perform training.
    """
    from app.services.ai.scorer import TimetableScorer, FEATURE_NAMES
    from app.models.models import TimetableSettings, Department, ConstraintConfig, Teacher

    def _background_train(dept_id: Optional[str], requested_by: str | None = None):
        db = SessionLocal()
        try:
            q = db.query(MLFeedback)
            if dept_id:
                q = q.join(TimetableVersion, MLFeedback.version_id == TimetableVersion.id).filter(
                    TimetableVersion.department_id == dept_id
                )
            feedback_rows = q.all()

            feature_rows = []
            labels = []

            for fb in feedback_rows:
                version = db.query(TimetableVersion).filter(TimetableVersion.id == fb.version_id).first()
                if not version:
                    continue

                ts_settings = db.query(TimetableSettings).filter(TimetableSettings.department_id == version.department_id).first()
                if not ts_settings:
                    continue
                timeslots = db.query(Timeslot).filter(
                    Timeslot.settings_id == ts_settings.id,
                    Timeslot.is_break == False,
                    Timeslot.is_lunch == False,
                ).all()

                entries = db.query(TimetableEntry).filter(TimetableEntry.version_id == version.id).all()
                if not entries:
                    continue

                # reuse repository to get classrooms
                from app.db.repositories.repositories import ClassroomRepository
                classrooms = ClassroomRepository(db).get_active()
                teachers = db.query(Teacher).filter(Teacher.is_active == True).all()

                dep = db.query(Department).filter(Department.id == version.department_id).first()
                lab_preferred_slots = []
                if dep:
                    if dep.lab_slot_preference == LabSlotPreference.MORNING:
                        day_slot_counts = {}
                        for sl in timeslots:
                            day_slot_counts.setdefault(sl.day_of_week, []).append(sl.slot_index)
                        for day, indices in day_slot_counts.items():
                            indices.sort()
                            half = len(indices) // 2
                            lab_preferred_slots.extend(indices[:half])
                    elif dep.lab_slot_preference == LabSlotPreference.AFTERNOON:
                        day_slot_counts = {}
                        for sl in timeslots:
                            day_slot_counts.setdefault(sl.day_of_week, []).append(sl.slot_index)
                        for day, indices in day_slot_counts.items():
                            indices.sort()
                            half = len(indices) // 2
                            lab_preferred_slots.extend(indices[half:])
                    elif dep.lab_slot_preference == LabSlotPreference.ADMIN_CONFIGURED:
                        if dep.lab_preferred_slot_indices:
                            lab_preferred_slots = [int(x) for x in dep.lab_preferred_slot_indices.split(",") if x.strip()]

                constraint_cfg = db.query(ConstraintConfig).filter(ConstraintConfig.department_id == version.department_id).first()
                weights = {}
                if constraint_cfg:
                    weights = {
                        "weight_minimize_gaps": constraint_cfg.weight_minimize_gaps,
                        "weight_teacher_comfort": constraint_cfg.weight_teacher_comfort,
                        "weight_room_switch_penalty": constraint_cfg.weight_room_switch_penalty,
                        "weight_consecutive_workload": constraint_cfg.weight_consecutive_workload,
                        "weight_lab_morning_pref": constraint_cfg.weight_lab_morning_pref,
                    }

                timeslot_map = {sl.id: sl for sl in timeslots}
                classroom_map = {c.id: c for c in classrooms}
                teacher_map = {t.id: t for t in teachers}

                scorer = TimetableScorer(
                    timeslot_map=timeslot_map,
                    classroom_map=classroom_map,
                    teacher_map=teacher_map,
                    constraint_weights=weights,
                    lab_preferred_slots=lab_preferred_slots,
                )

                try:
                    feats = scorer._extract_features(entries)
                except Exception:
                    continue

                row = {n: float(feats.get(n, 0.0)) for n in FEATURE_NAMES}
                feature_rows.append(row)
                labels.append(float(fb.overall_rating))

            from app.services.realtime import get_realtime_service

            rt = get_realtime_service()
            # Notify start
            try:
                rt.emit("TRAINING_STARTED", {"department_id": dept_id, "user_id": requested_by})
            except Exception:
                pass

            if feature_rows:
                trainer = TimetableScorer(timeslot_map={}, classroom_map={}, teacher_map={})
                trainer.train(feature_rows, labels)

            try:
                rt.emit("TRAINING_COMPLETED", {"department_id": dept_id, "user_id": requested_by, "samples": len(feature_rows)})
            except Exception:
                pass
        finally:
            db.close()
    # schedule background task with requesting user id
    background_tasks.add_task(_background_train, department_id, current_user.id)
    return {"message": "Training scheduled"}
