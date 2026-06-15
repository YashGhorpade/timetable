"""
Pydantic v2 schemas for all API request/response payloads.
Organized by domain entity.
"""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, field_validator, model_validator
from app.models.models import (
    UserRole, LectureType, RoomType, DayOfWeek,
    TimetableStatus, LabSlotPreference, SwapStatus
)


# ════════════════════════════════════════════════════════════════════════════════
# SHARED BASE
# ════════════════════════════════════════════════════════════════════════════════

class OrmBase(BaseModel):
    model_config = {"from_attributes": True}


# ════════════════════════════════════════════════════════════════════════════════
# AUTH
# ════════════════════════════════════════════════════════════════════════════════

class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    role: UserRole
    # Required for teacher/student profiles
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    employee_id: Optional[str] = None    # teacher
    student_id: Optional[str] = None     # student
    department_id: Optional[str] = None  # teacher
    section_id: Optional[str] = None     # student
    batch_id: Optional[str] = None       # student

    @field_validator("password")
    @classmethod
    def strong_password(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str
    role: UserRole
    name: str


class SignupBatchOut(OrmBase):
    id: str
    section_id: str
    name: str
    strength: int
    is_active: bool


class SignupSectionOut(OrmBase):
    id: str
    academic_year_id: str
    name: str
    batches: List[SignupBatchOut] = []


class SignupAcademicYearOut(OrmBase):
    id: str
    year_name: str
    year_number: int
    sections: List[SignupSectionOut] = []


class SignupDepartmentOut(OrmBase):
    id: str
    name: str
    code: str
    academic_years: List[SignupAcademicYearOut] = []


class RefreshRequest(BaseModel):
    refresh_token: str


# ════════════════════════════════════════════════════════════════════════════════
# DEPARTMENT
# ════════════════════════════════════════════════════════════════════════════════

class DepartmentCreate(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    lab_slot_preference: LabSlotPreference = LabSlotPreference.NO_PREFERENCE
    lab_preferred_slot_indices: Optional[str] = None


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    lab_slot_preference: Optional[LabSlotPreference] = None
    lab_preferred_slot_indices: Optional[str] = None
    is_active: Optional[bool] = None


class DepartmentOut(OrmBase):
    id: str
    name: str
    code: str
    description: Optional[str]
    lab_slot_preference: LabSlotPreference
    lab_preferred_slot_indices: Optional[str]
    is_active: bool
    created_at: datetime


# ════════════════════════════════════════════════════════════════════════════════
# ACADEMIC YEAR
# ════════════════════════════════════════════════════════════════════════════════

class AcademicYearCreate(BaseModel):
    department_id: str
    year_name: str   # FE, SE, TE, BE
    year_number: int


class AcademicYearOut(OrmBase):
    id: str
    department_id: str
    year_name: str
    year_number: int
    is_active: bool


# ════════════════════════════════════════════════════════════════════════════════
# SECTION
# ════════════════════════════════════════════════════════════════════════════════

class SectionCreate(BaseModel):
    academic_year_id: str
    name: str
    strength: int = 60


class SectionUpdate(BaseModel):
    name: Optional[str] = None
    strength: Optional[int] = None
    is_active: Optional[bool] = None


class BatchOut(OrmBase):
    id: str
    section_id: str
    name: str
    strength: int
    is_active: bool


class SectionOut(OrmBase):
    id: str
    academic_year_id: str
    name: str
    strength: int
    is_active: bool
    batches: List[BatchOut] = []


# ════════════════════════════════════════════════════════════════════════════════
# BATCH
# ════════════════════════════════════════════════════════════════════════════════

class BatchCreate(BaseModel):
    section_id: str
    name: str
    strength: int = 20


class BatchUpdate(BaseModel):
    name: Optional[str] = None
    strength: Optional[int] = None
    is_active: Optional[bool] = None


# ════════════════════════════════════════════════════════════════════════════════
# SUBJECT
# ════════════════════════════════════════════════════════════════════════════════

class SubjectCreate(BaseModel):
    department_id: str
    academic_year_id: str
    name: str
    code: str
    description: Optional[str] = None


class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class SubjectOut(OrmBase):
    id: str
    department_id: str
    academic_year_id: str
    name: str
    code: str
    description: Optional[str]
    is_active: bool


# ════════════════════════════════════════════════════════════════════════════════
# LECTURE FREQUENCY
# ════════════════════════════════════════════════════════════════════════════════

class LectureFrequencyCreate(BaseModel):
    subject_id: str
    section_id: str
    theory_per_week: int = 3
    tutorial_per_week: int = 1
    lab_per_week: int = 1
    theory_duration_min: int = 60
    tutorial_duration_min: int = 60
    lab_duration_min: int = 120


class LectureFrequencyOut(OrmBase):
    id: str
    subject_id: str
    section_id: str
    theory_per_week: int
    tutorial_per_week: int
    lab_per_week: int
    theory_duration_min: int
    tutorial_duration_min: int
    lab_duration_min: int


# ════════════════════════════════════════════════════════════════════════════════
# TEACHER
# ════════════════════════════════════════════════════════════════════════════════

class TeacherCreate(BaseModel):
    email: EmailStr
    password: str
    department_id: str
    employee_id: str
    first_name: str
    last_name: str
    designation: Optional[str] = None
    specialization: Optional[str] = None
    phone: Optional[str] = None
    max_lectures_per_day: int = 5
    max_lectures_per_week: int = 25


class TeacherUpdate(BaseModel):
    department_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    designation: Optional[str] = None
    specialization: Optional[str] = None
    phone: Optional[str] = None
    max_lectures_per_day: Optional[int] = None
    max_lectures_per_week: Optional[int] = None
    is_active: Optional[bool] = None


class TeacherOut(OrmBase):
    id: str
    user_id: str
    department_id: str
    employee_id: str
    first_name: str
    last_name: str
    designation: Optional[str]
    specialization: Optional[str]
    phone: Optional[str]
    max_lectures_per_day: int
    max_lectures_per_week: int
    is_active: bool


class TeacherSubjectAssignmentCreate(BaseModel):
    teacher_id: str
    subject_id: str
    section_id: str
    lecture_type: LectureType
    batch_id: Optional[str] = None


class TeacherClassroomAssignmentCreate(BaseModel):
    teacher_id: str
    classroom_id: str


class TeacherClassroomAssignmentOut(OrmBase):
    id: str
    teacher_id: str
    classroom_id: str


# ════════════════════════════════════════════════════════════════════════════════
# STUDENT
# ════════════════════════════════════════════════════════════════════════════════

class StudentCreate(BaseModel):
    email: EmailStr
    password: str
    section_id: str
    batch_id: str
    student_id: str
    first_name: str
    last_name: str
    phone: Optional[str] = None


class StudentUpdate(BaseModel):
    section_id: Optional[str] = None
    batch_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None


class StudentOut(OrmBase):
    id: str
    user_id: str
    section_id: str
    batch_id: str
    student_id: str
    first_name: str
    last_name: str
    phone: Optional[str]
    is_active: bool


# ════════════════════════════════════════════════════════════════════════════════
# CLASSROOM
# ════════════════════════════════════════════════════════════════════════════════

class ClassroomCreate(BaseModel):
    name: str
    room_number: str
    building: str
    floor: int = 0
    capacity: int
    room_type: RoomType
    has_projector: bool = True
    has_ac: bool = False
    notes: Optional[str] = None


class ClassroomUpdate(BaseModel):
    name: Optional[str] = None
    capacity: Optional[int] = None
    room_type: Optional[RoomType] = None
    has_projector: Optional[bool] = None
    has_ac: Optional[bool] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class ClassroomOut(OrmBase):
    id: str
    name: str
    room_number: str
    building: str
    floor: int
    capacity: int
    room_type: RoomType
    has_projector: bool
    has_ac: bool
    is_active: bool
    notes: Optional[str]


# ════════════════════════════════════════════════════════════════════════════════
# TIMETABLE SETTINGS
# ════════════════════════════════════════════════════════════════════════════════

class TimetableSettingsCreate(BaseModel):
    department_id: str
    working_days: str = "monday,tuesday,wednesday,thursday,friday"
    lectures_per_day: int = 7
    break_after_lectures: int = 3
    lecture_start_time: str = "09:00"
    lecture_duration_min: int = 60
    break_duration_min: int = 15
    lunch_after_slot: int = 3
    lunch_duration_min: int = 45
    max_teacher_lectures_per_day: int = 5
    max_teacher_lectures_per_week: int = 25


class TimetableSettingsOut(OrmBase):
    id: str
    department_id: str
    working_days: str
    lectures_per_day: int
    break_after_lectures: int
    lecture_start_time: str
    lecture_duration_min: int
    break_duration_min: int
    lunch_after_slot: int
    lunch_duration_min: int
    max_teacher_lectures_per_day: int
    max_teacher_lectures_per_week: int


# ════════════════════════════════════════════════════════════════════════════════
# TIMETABLE ENTRY
# ════════════════════════════════════════════════════════════════════════════════

class TimeslotOut(OrmBase):
    id: str
    day_of_week: DayOfWeek
    slot_index: int
    start_time: str
    end_time: str
    is_break: bool
    is_lunch: bool
    label: Optional[str]


class TimetableEntryOut(OrmBase):
    id: str
    version_id: str
    timeslot_id: str
    subject_id: str
    teacher_id: str
    classroom_id: str
    section_id: str
    lecture_type: LectureType
    batch_id: Optional[str]
    is_lab_continuation: bool
    lab_group_id: Optional[str]
    is_locked: bool

    # Nested for UI convenience
    timeslot: Optional[TimeslotOut] = None
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    teacher_name: Optional[str] = None
    classroom_name: Optional[str] = None
    classroom_room_number: Optional[str] = None
    section_name: Optional[str] = None
    batch_name: Optional[str] = None
    department_name: Optional[str] = None


class TimetableEntryMove(BaseModel):
    """Request to drag-drop / move a lecture to a new slot + classroom."""
    entry_id: str
    new_timeslot_id: str
    new_classroom_id: str
    reason: Optional[str] = None


class TimetableVersionOut(OrmBase):
    id: str
    department_id: str
    academic_year_id: str
    name: str
    status: TimetableStatus
    solver_score: Optional[float]
    notes: Optional[str]
    created_at: datetime


# ════════════════════════════════════════════════════════════════════════════════
# TIMETABLE GENERATION REQUEST
# ════════════════════════════════════════════════════════════════════════════════

class GenerateTimetableRequest(BaseModel):
    department_id: str
    academic_year_id: str
    version_name: str
    num_candidates: int = 5   # how many valid schedules to generate and score
    section_id: Optional[str] = None
    batch_id: Optional[str] = None


# ════════════════════════════════════════════════════════════════════════════════
# CLASSROOM AVAILABILITY
# ════════════════════════════════════════════════════════════════════════════════

class ClassroomAvailabilityQuery(BaseModel):
    version_id: str
    day_of_week: DayOfWeek
    slot_index: int
    room_type: Optional[RoomType] = None
    min_capacity: Optional[int] = None


class ClassroomAvailabilityResult(OrmBase):
    classroom: ClassroomOut
    is_available: bool
    occupied_by: Optional[str] = None  # subject name if occupied


# ════════════════════════════════════════════════════════════════════════════════
# SWAP REQUEST
# ════════════════════════════════════════════════════════════════════════════════

class SwapRequestCreate(BaseModel):
    entry_a_id: str
    entry_b_id: Optional[str] = None
    target_teacher_id: Optional[str] = None
    reason: Optional[str] = None


class SwapRequestOut(OrmBase):
    id: str
    requester_teacher_id: str
    target_teacher_id: Optional[str]
    entry_a_id: str
    entry_b_id: Optional[str]
    status: SwapStatus
    reason: Optional[str]
    admin_comment: Optional[str]
    created_at: datetime


# ════════════════════════════════════════════════════════════════════════════════
# CONSTRAINT CONFIG
# ════════════════════════════════════════════════════════════════════════════════

class ConstraintConfigUpdate(BaseModel):
    enforce_no_teacher_clash: Optional[bool] = None
    enforce_no_room_clash: Optional[bool] = None
    enforce_lab_consecutive: Optional[bool] = None
    enforce_workload_limits: Optional[bool] = None
    enforce_room_type_match: Optional[bool] = None
    weight_minimize_gaps: Optional[float] = None
    weight_teacher_comfort: Optional[float] = None
    weight_room_switch_penalty: Optional[float] = None
    weight_consecutive_workload: Optional[float] = None
    weight_lab_morning_pref: Optional[float] = None


class ConstraintConfigOut(OrmBase):
    id: str
    department_id: str
    enforce_no_teacher_clash: bool
    enforce_no_room_clash: bool
    enforce_lab_consecutive: bool
    enforce_workload_limits: bool
    enforce_room_type_match: bool
    weight_minimize_gaps: float
    weight_teacher_comfort: float
    weight_room_switch_penalty: float
    weight_consecutive_workload: float
    weight_lab_morning_pref: float
