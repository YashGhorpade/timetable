"""
Seed script — creates initial data for development/demo.
Run via: python -m app.db.seed
Or automatically on first container start via entrypoint.sh.

Creates:
  - Admin user (admin@timetable.com / Admin@1234)
  - CSE Department
  - SE academic year with sections SE-A, SE-B
  - Batches A1,A2,A3 / B1,B2,B3
  - Sample subjects (DBMS, OS, CN)
  - 10 classrooms (theory, tutorial, lab)
  - Timetable settings for CSE
  - Sample teachers and their subject assignments
"""
import uuid
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.db.database import SessionLocal
from app.core.security import hash_password
from app.models.models import (
    AcademicYear, Batch, Classroom, ConstraintConfig, Department,
    LectureFrequency, LectureType, RoomType, Section, Student, Subject,
    Teacher, TeacherSubjectAssignment, TeacherClassroomAssignment,
    TimetableSettings, User, UserRole, LabSlotPreference
)


def seed():
    db = SessionLocal()
    try:
        # Skip if already seeded
        if db.query(User).filter(User.email == "admin@timetable.com").first():
            print("✅ Database already seeded — skipping")
            return

        print("🌱 Seeding database...")

        # ── Admin User ───────────────────────────────────────────────────────
        admin = User(
            id=str(uuid.uuid4()),
            email="admin@timetable.com",
            password_hash=hash_password("Admin@1234"),
            role=UserRole.ADMIN,
        )
        db.add(admin)

        # ── Department ────────────────────────────────────────────────────────
        cse = Department(
            id=str(uuid.uuid4()),
            name="Computer Science & Engineering",
            code="CSE",
            description="CSE Department",
            lab_slot_preference=LabSlotPreference.MORNING,
            is_active=True,
        )
        db.add(cse)
        db.flush()

        # ── Academic Years ────────────────────────────────────────────────────
        se_year = AcademicYear(
            id=str(uuid.uuid4()),
            department_id=cse.id,
            year_name="SE",
            year_number=2,
            is_active=True,
        )
        db.add(se_year)
        db.flush()

        # ── Sections ──────────────────────────────────────────────────────────
        se_a = Section(id=str(uuid.uuid4()), academic_year_id=se_year.id, name="SE-A", strength=60)
        se_b = Section(id=str(uuid.uuid4()), academic_year_id=se_year.id, name="SE-B", strength=60)
        db.add_all([se_a, se_b])
        db.flush()

        # ── Batches ───────────────────────────────────────────────────────────
        batches_a = [
            Batch(id=str(uuid.uuid4()), section_id=se_a.id, name="A1", strength=20),
            Batch(id=str(uuid.uuid4()), section_id=se_a.id, name="A2", strength=20),
            Batch(id=str(uuid.uuid4()), section_id=se_a.id, name="A3", strength=20),
        ]
        batches_b = [
            Batch(id=str(uuid.uuid4()), section_id=se_b.id, name="B1", strength=20),
            Batch(id=str(uuid.uuid4()), section_id=se_b.id, name="B2", strength=20),
            Batch(id=str(uuid.uuid4()), section_id=se_b.id, name="B3", strength=20),
        ]
        db.add_all(batches_a + batches_b)
        db.flush()

        # ── Subjects ──────────────────────────────────────────────────────────
        subj_data = [
            ("Database Management Systems", "DBMS"),
            ("Operating Systems", "OS"),
            ("Computer Networks", "CN"),
            ("Software Engineering", "SE"),
        ]
        subjects = []
        for name, code in subj_data:
            s = Subject(
                id=str(uuid.uuid4()),
                department_id=cse.id,
                academic_year_id=se_year.id,
                name=name,
                code=code,
                is_active=True,
            )
            subjects.append(s)
        db.add_all(subjects)
        db.flush()

        # ── Classrooms ────────────────────────────────────────────────────────
        rooms = []
        # Theory rooms
        for i in range(1, 5):
            rooms.append(Classroom(
                id=str(uuid.uuid4()),
                name=f"Lecture Hall {i}",
                room_number=f"LH-{i:02d}",
                building="A Block",
                floor=i,
                capacity=70,
                room_type=RoomType.THEORY_ROOM,
                has_projector=True,
            ))
        # Tutorial rooms
        for i in range(1, 4):
            rooms.append(Classroom(
                id=str(uuid.uuid4()),
                name=f"Tutorial Room {i}",
                room_number=f"TR-{i:02d}",
                building="B Block",
                floor=1,
                capacity=25,
                room_type=RoomType.TUTORIAL_ROOM,
                has_projector=True,
            ))
        # Labs
        for i in range(1, 4):
            rooms.append(Classroom(
                id=str(uuid.uuid4()),
                name=f"Computer Lab {i}",
                room_number=f"CL-{i:02d}",
                building="C Block",
                floor=2,
                capacity=30,
                room_type=RoomType.LABORATORY,
                has_projector=True,
            ))
        db.add_all(rooms)
        db.flush()

        # ── Timetable Settings ────────────────────────────────────────────────
        ts = TimetableSettings(
            id=str(uuid.uuid4()),
            department_id=cse.id,
            working_days="monday,tuesday,wednesday,thursday,friday",
            lectures_per_day=7,
            break_after_lectures=3,
            lecture_start_time="09:00",
            lecture_duration_min=60,
            break_duration_min=15,
            lunch_after_slot=3,
            lunch_duration_min=45,
            max_teacher_lectures_per_day=5,
            max_teacher_lectures_per_week=25,
        )
        db.add(ts)
        db.flush()

        # ── Constraint Config ─────────────────────────────────────────────────
        cc = ConstraintConfig(id=str(uuid.uuid4()), department_id=cse.id)
        db.add(cc)

        # ── Teachers ──────────────────────────────────────────────────────────
        teacher_data = [
            ("Prof. Ravi", "Sharma", "T001", "DBMS, OS"),
            ("Prof. Priya", "Mehta", "T002", "CN, DBMS"),
            ("Prof. Suresh", "Patil", "T003", "OS, SE"),
            ("Prof. Anjali", "Desai", "T004", "CN, SE"),
            ("Prof. Vikram", "Joshi", "T005", "DBMS"),
            ("Prof. Neha", "Kulkarni", "T006", "OS"),
        ]
        teachers = []
        for fn, ln, emp_id, spec in teacher_data:
            u = User(
                id=str(uuid.uuid4()),
                email=f"{emp_id.lower()}@timetable.com",
                password_hash=hash_password("Teacher@1234"),
                role=UserRole.TEACHER,
            )
            db.add(u); db.flush()
            t = Teacher(
                id=str(uuid.uuid4()),
                user_id=u.id,
                department_id=cse.id,
                employee_id=emp_id,
                first_name=fn,
                last_name=ln,
                specialization=spec,
                designation="Assistant Professor",
                max_lectures_per_day=5,
                max_lectures_per_week=20,
            )
            db.add(t); db.flush()
            teachers.append(t)

        # ── Lecture Frequencies ───────────────────────────────────────────────
        # DBMS: 3 theory, 1 tutorial, 1 lab per week (for SE-A)
        for section in [se_a, se_b]:
            for subj in subjects:
                freq = LectureFrequency(
                    id=str(uuid.uuid4()),
                    subject_id=subj.id,
                    section_id=section.id,
                    theory_per_week=3,
                    tutorial_per_week=1,
                    lab_per_week=1,
                    theory_duration_min=60,
                    tutorial_duration_min=60,
                    lab_duration_min=120,
                )
                db.add(freq)

        # ── Teacher Subject Assignments ────────────────────────────────────────
        # Simplified: first teacher → DBMS theory/tut/lab for SE-A batches
        assign_data = [
            # (teacher_idx, subject_idx, section, lecture_type, batch)
            (0, 0, se_a, LectureType.THEORY,   None),        # Ravi → DBMS theory SE-A
            (0, 0, se_b, LectureType.THEORY,   None),        # Ravi → DBMS theory SE-B
            (0, 0, se_a, LectureType.TUTORIAL, batches_a[0]),
            (0, 0, se_a, LectureType.TUTORIAL, batches_a[1]),
            (0, 0, se_a, LectureType.TUTORIAL, batches_a[2]),
            (0, 0, se_a, LectureType.LAB,      batches_a[0]),
            (0, 0, se_a, LectureType.LAB,      batches_a[1]),
            (0, 0, se_a, LectureType.LAB,      batches_a[2]),
            (1, 2, se_a, LectureType.THEORY,   None),        # Priya → CN theory SE-A
            (1, 2, se_b, LectureType.THEORY,   None),
            (1, 2, se_a, LectureType.TUTORIAL, batches_a[0]),
            (1, 2, se_a, LectureType.LAB,      batches_a[0]),
            (2, 1, se_a, LectureType.THEORY,   None),        # Suresh → OS theory SE-A
            (2, 1, se_b, LectureType.THEORY,   None),
            (2, 1, se_a, LectureType.TUTORIAL, batches_a[0]),
            (2, 1, se_a, LectureType.LAB,      batches_a[0]),
            (3, 3, se_a, LectureType.THEORY,   None),        # Anjali → SE theory
            (3, 3, se_b, LectureType.THEORY,   None),
        ]
        # Deduplicate assignments to avoid unique constraint errors.
        # The DB enforces uniqueness on (teacher_id, subject_id, section_id, lecture_type)
        # so ignore `batch` when deduplicating here.
        seen = set()
        deduped = []
        for t_idx, s_idx, section, ltype, batch in assign_data:
            key = (t_idx, s_idx, section.id, ltype)
            if key in seen:
                continue
            seen.add(key)
            deduped.append((t_idx, s_idx, section, ltype, batch))

        for t_idx, s_idx, section, ltype, batch in deduped:
            a = TeacherSubjectAssignment(
                id=str(uuid.uuid4()),
                teacher_id=teachers[t_idx].id,
                subject_id=subjects[s_idx].id,
                section_id=section.id,
                lecture_type=ltype,
                batch_id=batch.id if batch else None,
            )
            db.add(a)

        # ── Teacher Classroom Compatibility ───────────────────────────────────
        # Provide teacher-specific allowed rooms; if none exist, solver falls back to
        # room-type compatibility only.
        teacher_room_assignments = []
        for teacher in teachers:
            # Allow each teacher to teach in all corresponding room types.
            teacher_room_assignments.extend([
                TeacherClassroomAssignment(
                    id=str(uuid.uuid4()),
                    teacher_id=teacher.id,
                    classroom_id=room.id,
                )
                for room in rooms
                if (room.room_type == RoomType.THEORY_ROOM and teacher in teachers[:4])
                or (room.room_type == RoomType.TUTORIAL_ROOM and teacher in teachers[:4])
                or (room.room_type == RoomType.LABORATORY and teacher in teachers[:6])
            ])
        # Use broad compatibility mapping for all teachers to keep the solver feasible.
        db.add_all(teacher_room_assignments)
        db.flush()

        # ── Sample Student ────────────────────────────────────────────────────
        stu_user = User(
            id=str(uuid.uuid4()),
            email="student@timetable.com",
            password_hash=hash_password("Student@1234"),
            role=UserRole.STUDENT,
        )
        db.add(stu_user); db.flush()
        from app.models.models import Student as StudentModel
        stu = StudentModel(
            id=str(uuid.uuid4()),
            user_id=stu_user.id,
            section_id=se_a.id,
            batch_id=batches_a[0].id,
            student_id="S2024001",
            first_name="Arjun",
            last_name="Kumar",
        )
        db.add(stu)

        db.commit()
        print("✅ Seed complete!")
        print("   Admin:   admin@timetable.com / Admin@1234")
        print("   Teacher: t001@timetable.com / Teacher@1234")
        print("   Student: student@timetable.com / Student@1234")

    except Exception as e:
        db.rollback()
        print(f"❌ Seed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
