"""
Complete ORM models for the Timetable Management System.
One file — all models — so relationships are easy to follow.
Database: Microsoft SQL Server (MSSQL)
"""
import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum
from typing import List, Optional

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer,
    String, Text, UniqueConstraint, Enum, CheckConstraint, Index
)
from sqlalchemy.dialects.mssql import UNIQUEIDENTIFIER
from sqlalchemy.orm import relationship, mapped_column, Mapped

from app.db.database import Base


# ════════════════════════════════════════════════════════════════════════════════
# ENUMS
# ════════════════════════════════════════════════════════════════════════════════

class UserRole(str, PyEnum):
    ADMIN   = "admin"
    TEACHER = "teacher"
    STUDENT = "student"

class LectureType(str, PyEnum):
    THEORY   = "theory"
    TUTORIAL = "tutorial"
    LAB      = "lab"

class RoomType(str, PyEnum):
    THEORY_ROOM  = "theory_room"
    TUTORIAL_ROOM = "tutorial_room"
    LABORATORY   = "laboratory"

class DayOfWeek(str, PyEnum):
    MONDAY    = "monday"
    TUESDAY   = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY  = "thursday"
    FRIDAY    = "friday"
    SATURDAY  = "saturday"

class TimetableStatus(str, PyEnum):
    DRAFT     = "draft"
    PUBLISHED = "published"
    ARCHIVED  = "archived"

class LabSlotPreference(str, PyEnum):
    MORNING          = "morning"
    AFTERNOON        = "afternoon"
    NO_PREFERENCE    = "no_preference"
    ADMIN_CONFIGURED = "admin_configured"

class SwapStatus(str, PyEnum):
    PENDING  = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


# ════════════════════════════════════════════════════════════════════════════════
# MIXIN
# ════════════════════════════════════════════════════════════════════════════════

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


def new_uuid() -> str:
    return str(uuid.uuid4())


# ════════════════════════════════════════════════════════════════════════════════
# USERS & AUTH
# ════════════════════════════════════════════════════════════════════════════════

class User(Base, TimestampMixin):
    __tablename__ = "users"

    id          = Column(String(36), primary_key=True, default=new_uuid)
    email       = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role        = Column(Enum(UserRole), nullable=False)
    is_active   = Column(Boolean, default=True, nullable=False)
    last_login  = Column(DateTime, nullable=True)

    # relationships
    teacher     = relationship("Teacher", back_populates="user", uselist=False, cascade="all, delete-orphan")
    student     = relationship("Student", back_populates="user", uselist=False, cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    audit_logs  = relationship("AuditLog", back_populates="user")


class RefreshToken(Base, TimestampMixin):
    __tablename__ = "refresh_tokens"

    id         = Column(String(36), primary_key=True, default=new_uuid)
    user_id    = Column(String(36), ForeignKey("users.id", ondelete="NO ACTION"), nullable=False)
    token_hash = Column(String(255), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    revoked    = Column(Boolean, default=False, nullable=False)

    user = relationship("User", back_populates="refresh_tokens")


# ════════════════════════════════════════════════════════════════════════════════
# ACADEMIC STRUCTURE
# ════════════════════════════════════════════════════════════════════════════════

class Department(Base, TimestampMixin):
    __tablename__ = "departments"

    id          = Column(String(36), primary_key=True, default=new_uuid)
    name        = Column(String(100), unique=True, nullable=False)
    code        = Column(String(20), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    is_active   = Column(Boolean, default=True, nullable=False)

    # Lab scheduling preference per department (admin-configurable)
    lab_slot_preference = Column(
        Enum(LabSlotPreference),
        default=LabSlotPreference.NO_PREFERENCE,
        nullable=False,
    )
    # If ADMIN_CONFIGURED: specify which slot indices are preferred for labs
    lab_preferred_slot_indices = Column(String(255), nullable=True)  # e.g. "0,1,2,3" CSV

    academic_years = relationship("AcademicYear", back_populates="department", cascade="all, delete-orphan")
    teachers       = relationship("Teacher", back_populates="department")
    subjects       = relationship("Subject", back_populates="department")
    timetable_settings = relationship("TimetableSettings", back_populates="department", uselist=False)


class AcademicYear(Base, TimestampMixin):
    __tablename__ = "academic_years"
    __table_args__ = (UniqueConstraint("department_id", "year_name"),)

    id            = Column(String(36), primary_key=True, default=new_uuid)
    department_id = Column(String(36), ForeignKey("departments.id", ondelete="NO ACTION"), nullable=False)
    year_name     = Column(String(10), nullable=False)  # FE, SE, TE, BE
    year_number   = Column(Integer, nullable=False)      # 1,2,3,4
    is_active     = Column(Boolean, default=True)

    department = relationship("Department", back_populates="academic_years")
    sections   = relationship("Section", back_populates="academic_year", cascade="all, delete-orphan")


class Section(Base, TimestampMixin):
    __tablename__ = "sections"
    __table_args__ = (UniqueConstraint("academic_year_id", "name"),)

    id               = Column(String(36), primary_key=True, default=new_uuid)
    academic_year_id = Column(String(36), ForeignKey("academic_years.id", ondelete="NO ACTION"), nullable=False)
    name             = Column(String(20), nullable=False)   # SE-A, SE-B
    strength         = Column(Integer, default=60, nullable=False)
    is_active        = Column(Boolean, default=True)

    academic_year = relationship("AcademicYear", back_populates="sections")
    batches       = relationship("Batch", back_populates="section", cascade="all, delete-orphan")
    students      = relationship("Student", back_populates="section")
    timetable_entries = relationship("TimetableEntry", back_populates="section")


class Batch(Base, TimestampMixin):
    __tablename__ = "batches"
    __table_args__ = (UniqueConstraint("section_id", "name"),)

    id         = Column(String(36), primary_key=True, default=new_uuid)
    section_id = Column(String(36), ForeignKey("sections.id", ondelete="NO ACTION"), nullable=False)
    name       = Column(String(20), nullable=False)   # A1, A2, A3
    strength   = Column(Integer, default=20, nullable=False)
    is_active  = Column(Boolean, default=True)

    section  = relationship("Section", back_populates="batches")
    students = relationship("Student", back_populates="batch")
    timetable_entries = relationship("TimetableEntry", back_populates="batch")


# ════════════════════════════════════════════════════════════════════════════════
# SUBJECTS
# ════════════════════════════════════════════════════════════════════════════════

class Subject(Base, TimestampMixin):
    __tablename__ = "subjects"
    __table_args__ = (UniqueConstraint("department_id", "academic_year_id", "code"),)

    id               = Column(String(36), primary_key=True, default=new_uuid)
    department_id    = Column(String(36), ForeignKey("departments.id", ondelete="NO ACTION"), nullable=False)
    academic_year_id = Column(String(36), ForeignKey("academic_years.id", ondelete="NO ACTION"), nullable=False)
    name             = Column(String(150), nullable=False)
    code             = Column(String(30), nullable=False)
    description      = Column(Text, nullable=True)
    is_active        = Column(Boolean, default=True)

    department    = relationship("Department", back_populates="subjects")
    academic_year = relationship("AcademicYear")
    frequencies   = relationship("LectureFrequency", back_populates="subject", cascade="all, delete-orphan")
    teacher_assignments = relationship("TeacherSubjectAssignment", back_populates="subject")
    timetable_entries   = relationship("TimetableEntry", back_populates="subject")


class LectureFrequency(Base, TimestampMixin):
    """
    Configures how many times per week each lecture type occurs for a subject.
    This directly drives the OR-Tools solver input.
    """
    __tablename__ = "lecture_frequencies"
    __table_args__ = (UniqueConstraint("subject_id", "section_id"),)

    id         = Column(String(36), primary_key=True, default=new_uuid)
    subject_id = Column(String(36), ForeignKey("subjects.id", ondelete="NO ACTION"), nullable=False)
    section_id = Column(String(36), ForeignKey("sections.id", ondelete="NO ACTION"), nullable=False)

    # Frequencies per week
    theory_per_week   = Column(Integer, default=3, nullable=False)
    tutorial_per_week = Column(Integer, default=1, nullable=False)
    lab_per_week      = Column(Integer, default=1, nullable=False)

    # Durations (minutes)
    theory_duration_min   = Column(Integer, default=60)
    tutorial_duration_min = Column(Integer, default=60)
    lab_duration_min      = Column(Integer, default=120)

    subject = relationship("Subject", back_populates="frequencies")
    section = relationship("Section")


# ════════════════════════════════════════════════════════════════════════════════
# TEACHERS & STUDENTS
# ════════════════════════════════════════════════════════════════════════════════

class Teacher(Base, TimestampMixin):
    __tablename__ = "teachers"

    id              = Column(String(36), primary_key=True, default=new_uuid)
    user_id         = Column(String(36), ForeignKey("users.id", ondelete="NO ACTION"), nullable=False, unique=True)
    department_id   = Column(String(36), ForeignKey("departments.id"), nullable=False)
    employee_id     = Column(String(50), unique=True, nullable=False)
    first_name      = Column(String(100), nullable=False)
    last_name       = Column(String(100), nullable=False)
    designation     = Column(String(100), nullable=True)
    specialization  = Column(String(200), nullable=True)
    phone           = Column(String(20), nullable=True)

    # Workload limits
    max_lectures_per_day  = Column(Integer, default=5)
    max_lectures_per_week = Column(Integer, default=25)
    is_active             = Column(Boolean, default=True)

    user            = relationship("User", back_populates="teacher")
    department      = relationship("Department", back_populates="teachers")
    subject_assignments = relationship("TeacherSubjectAssignment", back_populates="teacher", cascade="all, delete-orphan")
    classroom_assignments = relationship("TeacherClassroomAssignment", back_populates="teacher", cascade="all, delete-orphan")
    preferences     = relationship("TeacherPreference", back_populates="teacher", cascade="all, delete-orphan")
    timetable_entries = relationship("TimetableEntry", back_populates="teacher")
    swap_requests_sent     = relationship("SwapRequest", foreign_keys="SwapRequest.requester_teacher_id", back_populates="requester_teacher")
    swap_requests_received = relationship("SwapRequest", foreign_keys="SwapRequest.target_teacher_id",    back_populates="target_teacher")

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"


class TeacherSubjectAssignment(Base, TimestampMixin):
    """Many-to-many: teacher ↔ subject, scoped to section + lecture_type."""
    __tablename__ = "teacher_subject_assignments"
    __table_args__ = (
        UniqueConstraint("teacher_id", "subject_id", "section_id", "lecture_type"),
    )

    id           = Column(String(36), primary_key=True, default=new_uuid)
    teacher_id   = Column(String(36), ForeignKey("teachers.id", ondelete="NO ACTION"), nullable=False)
    subject_id   = Column(String(36), ForeignKey("subjects.id", ondelete="NO ACTION"), nullable=False)
    section_id   = Column(String(36), ForeignKey("sections.id", ondelete="NO ACTION"), nullable=False)
    lecture_type = Column(Enum(LectureType), nullable=False)
    # For batch-specific (tutorial/lab) assignments
    batch_id     = Column(String(36), ForeignKey("batches.id", ondelete="SET NULL"), nullable=True)

    teacher = relationship("Teacher", back_populates="subject_assignments")
    subject = relationship("Subject", back_populates="teacher_assignments")
    section = relationship("Section")
    batch   = relationship("Batch")


class TeacherClassroomAssignment(Base, TimestampMixin):
    """Many-to-many: teacher ↔ classroom compatibility for scheduling."""
    __tablename__ = "teacher_classroom_assignments"
    __table_args__ = (
        UniqueConstraint("teacher_id", "classroom_id"),
    )

    id           = Column(String(36), primary_key=True, default=new_uuid)
    teacher_id   = Column(String(36), ForeignKey("teachers.id", ondelete="NO ACTION"), nullable=False)
    classroom_id = Column(String(36), ForeignKey("classrooms.id", ondelete="NO ACTION"), nullable=False)

    teacher   = relationship("Teacher", back_populates="classroom_assignments")
    classroom = relationship("Classroom", back_populates="teacher_assignments")


class TeacherPreference(Base, TimestampMixin):
    """Soft preferences for scheduling (used by XGBoost scorer)."""
    __tablename__ = "teacher_preferences"
    __table_args__ = (UniqueConstraint("teacher_id", "day_of_week", "slot_index"),)

    id           = Column(String(36), primary_key=True, default=new_uuid)
    teacher_id   = Column(String(36), ForeignKey("teachers.id", ondelete="NO ACTION"), nullable=False)
    day_of_week  = Column(Enum(DayOfWeek), nullable=False)
    slot_index   = Column(Integer, nullable=False)        # 0-based slot index
    preference   = Column(Float, default=1.0, nullable=False)  # 0.0 = avoid, 1.0 = neutral, 2.0 = preferred

    teacher = relationship("Teacher", back_populates="preferences")


class Student(Base, TimestampMixin):
    __tablename__ = "students"

    id           = Column(String(36), primary_key=True, default=new_uuid)
    user_id      = Column(String(36), ForeignKey("users.id", ondelete="NO ACTION"), nullable=False, unique=True)
    section_id   = Column(String(36), ForeignKey("sections.id"), nullable=False)
    batch_id     = Column(String(36), ForeignKey("batches.id"), nullable=False)
    student_id   = Column(String(50), unique=True, nullable=False)  # enrollment number
    first_name   = Column(String(100), nullable=False)
    last_name    = Column(String(100), nullable=False)
    phone        = Column(String(20), nullable=True)
    is_active    = Column(Boolean, default=True)

    user    = relationship("User", back_populates="student")
    section = relationship("Section", back_populates="students")
    batch   = relationship("Batch", back_populates="students")

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"


# ════════════════════════════════════════════════════════════════════════════════
# CLASSROOMS & LABS
# ════════════════════════════════════════════════════════════════════════════════

class Classroom(Base, TimestampMixin):
    __tablename__ = "classrooms"
    __table_args__ = (UniqueConstraint("building", "room_number"),)

    id          = Column(String(36), primary_key=True, default=new_uuid)
    name        = Column(String(100), nullable=False)
    room_number = Column(String(20), nullable=False)
    building    = Column(String(100), nullable=False)
    floor       = Column(Integer, nullable=False, default=0)
    capacity    = Column(Integer, nullable=False)
    room_type   = Column(Enum(RoomType), nullable=False)
    is_active   = Column(Boolean, default=True)
    has_projector = Column(Boolean, default=True)
    has_ac        = Column(Boolean, default=False)
    notes         = Column(Text, nullable=True)

    timetable_entries = relationship("TimetableEntry", back_populates="classroom")
    teacher_assignments = relationship("TeacherClassroomAssignment", back_populates="classroom", cascade="all, delete-orphan")
    reservations      = relationship("RoomReservation", back_populates="classroom")


# ════════════════════════════════════════════════════════════════════════════════
# TIMESLOTS & TIMETABLE SETTINGS
# ════════════════════════════════════════════════════════════════════════════════

class TimetableSettings(Base, TimestampMixin):
    """Per-department timetable configuration."""
    __tablename__ = "timetable_settings"

    id                    = Column(String(36), primary_key=True, default=new_uuid)
    department_id         = Column(String(36), ForeignKey("departments.id", ondelete="NO ACTION"), nullable=False, unique=True)
    working_days          = Column(String(100), default="monday,tuesday,wednesday,thursday,friday")  # CSV
    lectures_per_day      = Column(Integer, default=7)
    break_after_lectures  = Column(Integer, default=3)  # insert break after N lectures
    lecture_start_time    = Column(String(10), default="09:00")
    lecture_duration_min  = Column(Integer, default=60)
    break_duration_min    = Column(Integer, default=15)
    lunch_after_slot      = Column(Integer, default=3)   # 0-based slot index after which lunch occurs
    lunch_duration_min    = Column(Integer, default=45)
    max_teacher_lectures_per_day  = Column(Integer, default=5)
    max_teacher_lectures_per_week = Column(Integer, default=25)

    department = relationship("Department", back_populates="timetable_settings")
    timeslots  = relationship("Timeslot", back_populates="settings", cascade="all, delete-orphan")


class Timeslot(Base):
    """
    Materialized time slots generated from TimetableSettings.
    Each row is one slot on one day: (day, slot_index) → (start_time, end_time).
    """
    __tablename__ = "timeslots"
    __table_args__ = (UniqueConstraint("settings_id", "day_of_week", "slot_index"),)

    id          = Column(String(36), primary_key=True, default=new_uuid)
    settings_id = Column(String(36), ForeignKey("timetable_settings.id", ondelete="NO ACTION"), nullable=False)
    day_of_week = Column(Enum(DayOfWeek), nullable=False)
    slot_index  = Column(Integer, nullable=False)       # 0-based
    start_time  = Column(String(10), nullable=False)    # "09:00"
    end_time    = Column(String(10), nullable=False)    # "10:00"
    is_break    = Column(Boolean, default=False)
    is_lunch    = Column(Boolean, default=False)
    label       = Column(String(30), nullable=True)     # "09:00 – 10:00"

    settings = relationship("TimetableSettings", back_populates="timeslots")
    timetable_entries = relationship("TimetableEntry", back_populates="timeslot")


# ════════════════════════════════════════════════════════════════════════════════
# CENTRAL TIMETABLE — THE ONE SOURCE OF TRUTH
# ════════════════════════════════════════════════════════════════════════════════

class TimetableVersion(Base, TimestampMixin):
    """
    A timetable generation run. Multiple versions can exist per department;
    only one is PUBLISHED at a time.
    """
    __tablename__ = "timetable_versions"

    id               = Column(String(36), primary_key=True, default=new_uuid)
    department_id    = Column(String(36), ForeignKey("departments.id", ondelete="NO ACTION"), nullable=False)
    academic_year_id = Column(String(36), ForeignKey("academic_years.id"), nullable=False)
    name             = Column(String(100), nullable=False)
    status           = Column(Enum(TimetableStatus), default=TimetableStatus.DRAFT, nullable=False)
    generated_by     = Column(String(36), ForeignKey("users.id"), nullable=True)
    solver_score     = Column(Float, nullable=True)  # XGBoost composite score
    notes            = Column(Text, nullable=True)

    department    = relationship("Department")
    academic_year = relationship("AcademicYear")
    entries       = relationship("TimetableEntry", back_populates="version", cascade="all, delete-orphan")
    history       = relationship("TimetableHistory", back_populates="version")


class TimetableEntry(Base, TimestampMixin):
    """
    THE CENTRAL TIMETABLE TABLE.
    Every lecture slot for every section/batch lives here.
    All dashboards are filtered views of this table.

    Hard rules encoded in DB:
    - Lab entries span two consecutive timeslots (is_lab_continuation = True on slot 2)
    - No classroom double-booking (enforced by unique constraint + service layer)
    - No teacher double-booking (enforced by unique constraint + service layer)
    """
    __tablename__ = "timetable_entries"
    __table_args__ = (
        # Prevent classroom double-booking
        UniqueConstraint("version_id", "timeslot_id", "classroom_id",
                         name="uq_classroom_timeslot"),
        # Prevent teacher double-booking
        UniqueConstraint("version_id", "timeslot_id", "teacher_id",
                         name="uq_teacher_timeslot"),
        # Prevent section double-booking (theory)
        # Partial: only for theory lectures (enforced in service layer)
        Index("ix_entry_version_section_slot", "version_id", "section_id", "timeslot_id"),
        Index("ix_entry_version_batch_slot",   "version_id", "batch_id",   "timeslot_id"),
        Index("ix_entry_teacher",              "teacher_id"),
        Index("ix_entry_classroom",            "classroom_id"),
    )

    id           = Column(String(36), primary_key=True, default=new_uuid)
    version_id   = Column(String(36), ForeignKey("timetable_versions.id", ondelete="NO ACTION"), nullable=False)
    timeslot_id  = Column(String(36), ForeignKey("timeslots.id"), nullable=False)
    subject_id   = Column(String(36), ForeignKey("subjects.id"), nullable=False)
    teacher_id   = Column(String(36), ForeignKey("teachers.id"), nullable=False)
    classroom_id = Column(String(36), ForeignKey("classrooms.id"), nullable=False)
    section_id   = Column(String(36), ForeignKey("sections.id"), nullable=False)
    lecture_type = Column(Enum(LectureType), nullable=False)

    # Batch is set for tutorial/lab; NULL for theory (section-wide)
    batch_id     = Column(String(36), ForeignKey("batches.id"), nullable=True)

    # Lab continuity: the second slot of a 2-hour lab references the first entry
    is_lab_continuation = Column(Boolean, default=False, nullable=False)
    lab_group_id        = Column(String(36), nullable=True)  # links the 2 lab slots together

    # Override / lock (admin locked entries won't be touched by re-generation)
    is_locked    = Column(Boolean, default=False, nullable=False)

    # Relationships
    version    = relationship("TimetableVersion", back_populates="entries")
    timeslot   = relationship("Timeslot", back_populates="timetable_entries")
    subject    = relationship("Subject",  back_populates="timetable_entries")
    teacher    = relationship("Teacher",  back_populates="timetable_entries")
    classroom  = relationship("Classroom", back_populates="timetable_entries")
    section    = relationship("Section",  back_populates="timetable_entries")
    batch      = relationship("Batch",    back_populates="timetable_entries")
    history    = relationship("TimetableHistory", back_populates="entry")


# ════════════════════════════════════════════════════════════════════════════════
# AUDIT & HISTORY
# ════════════════════════════════════════════════════════════════════════════════

class TimetableHistory(Base):
    """Immutable audit trail — every change to a TimetableEntry is recorded here."""
    __tablename__ = "timetable_history"

    id           = Column(String(36), primary_key=True, default=new_uuid)
    version_id   = Column(String(36), ForeignKey("timetable_versions.id"), nullable=False)
    entry_id     = Column(String(36), ForeignKey("timetable_entries.id"), nullable=True)  # NULL if deleted
    changed_by   = Column(String(36), ForeignKey("users.id"), nullable=False)
    changed_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    action       = Column(String(20), nullable=False)   # create | update | delete | move | swap
    old_value    = Column(Text, nullable=True)          # JSON snapshot before
    new_value    = Column(Text, nullable=True)          # JSON snapshot after
    reason       = Column(String(500), nullable=True)

    version = relationship("TimetableVersion", back_populates="history")
    entry   = relationship("TimetableEntry",   back_populates="history")


class AuditLog(Base):
    """System-wide audit log for all user actions."""
    __tablename__ = "audit_logs"

    id          = Column(String(36), primary_key=True, default=new_uuid)
    user_id     = Column(String(36), ForeignKey("users.id"), nullable=True)
    action      = Column(String(100), nullable=False)
    entity_type = Column(String(50), nullable=True)
    entity_id   = Column(String(36), nullable=True)
    detail      = Column(Text, nullable=True)  # JSON
    ip_address  = Column(String(45), nullable=True)
    timestamp   = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="audit_logs")


# ════════════════════════════════════════════════════════════════════════════════
# ROOM RESERVATIONS
# ════════════════════════════════════════════════════════════════════════════════

class RoomReservation(Base, TimestampMixin):
    """Ad-hoc room reservations by teachers (outside regular timetable)."""
    __tablename__ = "room_reservations"
    __table_args__ = (UniqueConstraint("classroom_id", "timeslot_id"),)

    id           = Column(String(36), primary_key=True, default=new_uuid)
    classroom_id = Column(String(36), ForeignKey("classrooms.id"), nullable=False)
    timeslot_id  = Column(String(36), ForeignKey("timeslots.id"), nullable=False)
    reserved_by  = Column(String(36), ForeignKey("teachers.id"), nullable=False)
    purpose      = Column(String(300), nullable=True)
    approved     = Column(Boolean, default=False)

    classroom = relationship("Classroom", back_populates="reservations")
    timeslot  = relationship("Timeslot")


# ════════════════════════════════════════════════════════════════════════════════
# SWAP REQUESTS
# ════════════════════════════════════════════════════════════════════════════════

class SwapRequest(Base, TimestampMixin):
    """Teacher-initiated lecture swap requests."""
    __tablename__ = "swap_requests"

    id                    = Column(String(36), primary_key=True, default=new_uuid)
    requester_teacher_id  = Column(String(36), ForeignKey("teachers.id"), nullable=False)
    target_teacher_id     = Column(String(36), ForeignKey("teachers.id"), nullable=True)
    entry_a_id            = Column(String(36), ForeignKey("timetable_entries.id"), nullable=False)
    entry_b_id            = Column(String(36), ForeignKey("timetable_entries.id"), nullable=True)
    status                = Column(Enum(SwapStatus), default=SwapStatus.PENDING, nullable=False)
    reason                = Column(String(500), nullable=True)
    admin_comment         = Column(String(500), nullable=True)
    resolved_at           = Column(DateTime, nullable=True)

    requester_teacher = relationship("Teacher", foreign_keys=[requester_teacher_id], back_populates="swap_requests_sent")
    target_teacher    = relationship("Teacher", foreign_keys=[target_teacher_id],    back_populates="swap_requests_received")


# ════════════════════════════════════════════════════════════════════════════════
# SOLVER & ML TRACKING
# ════════════════════════════════════════════════════════════════════════════════

class SolverRun(Base, TimestampMixin):
    """Records each OR-Tools solver invocation for debugging and analytics."""
    __tablename__ = "solver_runs"

    id               = Column(String(36), primary_key=True, default=new_uuid)
    department_id    = Column(String(36), ForeignKey("departments.id"), nullable=False)
    academic_year_id = Column(String(36), ForeignKey("academic_years.id"), nullable=False)
    triggered_by     = Column(String(36), ForeignKey("users.id"), nullable=False)
    status           = Column(String(30), nullable=False)   # running | success | failed | timeout
    num_candidates   = Column(Integer, nullable=True)
    best_score       = Column(Float, nullable=True)
    solver_wall_time_seconds = Column(Float, nullable=True)
    error_message    = Column(Text, nullable=True)
    selected_version_id = Column(String(36), ForeignKey("timetable_versions.id"), nullable=True)

    department    = relationship("Department")
    academic_year = relationship("AcademicYear")


class MLFeedback(Base, TimestampMixin):
    """Stores XGBoost training data — admin ratings of generated timetables."""
    __tablename__ = "ml_feedback"

    id                = Column(String(36), primary_key=True, default=new_uuid)
    version_id        = Column(String(36), ForeignKey("timetable_versions.id"), nullable=False)
    rated_by          = Column(String(36), ForeignKey("users.id"), nullable=False)
    overall_rating    = Column(Float, nullable=False)   # 0.0 – 5.0
    teacher_comfort   = Column(Float, nullable=True)
    room_efficiency   = Column(Float, nullable=True)
    gap_score         = Column(Float, nullable=True)
    comment           = Column(Text, nullable=True)


# ════════════════════════════════════════════════════════════════════════════════
# CONSTRAINTS CONFIGURATION
# ════════════════════════════════════════════════════════════════════════════════

class ConstraintConfig(Base, TimestampMixin):
    """Admin-configurable constraint weights for the scheduler."""
    __tablename__ = "constraint_configs"

    id            = Column(String(36), primary_key=True, default=new_uuid)
    department_id = Column(String(36), ForeignKey("departments.id", ondelete="NO ACTION"), nullable=False, unique=True)

    # Hard constraints — disable only for special scenarios
    enforce_no_teacher_clash    = Column(Boolean, default=True)
    enforce_no_room_clash       = Column(Boolean, default=True)
    enforce_lab_consecutive     = Column(Boolean, default=True)
    enforce_workload_limits     = Column(Boolean, default=True)
    enforce_room_type_match     = Column(Boolean, default=True)

    # Soft constraint weights (0.0 = ignore, 1.0 = normal, 2.0 = high priority)
    weight_minimize_gaps        = Column(Float, default=1.0)
    weight_teacher_comfort      = Column(Float, default=1.0)
    weight_room_switch_penalty  = Column(Float, default=0.8)
    weight_consecutive_workload = Column(Float, default=0.9)
    weight_lab_morning_pref     = Column(Float, default=0.5)

    department = relationship("Department")
