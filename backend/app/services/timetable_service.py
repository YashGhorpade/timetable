"""
TimetableService — the primary business logic layer.

Responsibilities:
  - Orchestrate OR-Tools solver + XGBoost scorer
  - Validate every timetable modification before applying
  - Emit WebSocket events on every change
  - Write audit/history records
  - Never expose raw DB objects to the API layer
"""
import json
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.repositories.repositories import (
    ClassroomRepository, DepartmentRepository, SectionRepository,
    TimetableRepository, TeacherRepository
)
from app.models.models import (
    AcademicYear, Batch, ConstraintConfig, LectureFrequency, LectureType,
    Section, Subject, Teacher, TeacherSubjectAssignment, TeacherClassroomAssignment,
    TimetableEntry, TimetableHistory, TimetableSettings, TimetableStatus,
    TimetableVersion, Timeslot, LabSlotPreference
)
from app.schemas.schemas import (
    GenerateTimetableRequest, TimetableEntryMove
)
from app.services.ai.solver import SolverInput, TimetableSolver
from app.services.ai.scorer import TimetableScorer
from app.services.realtime import RealtimeService


class ConflictError(Exception):
    """Raised when a scheduling conflict is detected."""
    pass


class TimetableService:
    def __init__(self, db: Session, realtime: RealtimeService):
        self.db       = db
        self.realtime = realtime
        self.tt_repo  = TimetableRepository(db)
        self.cls_repo = ClassroomRepository(db)
        self.dep_repo = DepartmentRepository(db)

    # ════════════════════════════════════════════════════════════════════════
    # GENERATION PIPELINE
    # ════════════════════════════════════════════════════════════════════════

    def generate(
        self,
        req: GenerateTimetableRequest,
        triggered_by_user_id: str,
    ) -> TimetableVersion:
        """
        Full pipeline:
          1. Load all solver inputs from DB
          2. Run OR-Tools solver N times (num_candidates)
          3. Score candidates with XGBoost
          4. Persist best candidate as a new DRAFT TimetableVersion
          5. Emit TIMETABLE_UPDATED websocket event
        """
        from app.db.repositories.repositories import (
            BaseRepository, UserRepository
        )

        dep = self.dep_repo.get(req.department_id)
        if not dep:
            raise ValueError(f"Department {req.department_id} not found")

        academic_year = self.db.query(AcademicYear).filter(
            AcademicYear.id == req.academic_year_id
        ).first()
        if not academic_year:
            raise ValueError(f"AcademicYear {req.academic_year_id} not found")

        selected_section = None
        selected_batch = None
        if req.batch_id:
            selected_batch = self.db.query(Batch).filter(Batch.id == req.batch_id).first()
            if not selected_batch:
                raise ValueError(f"Batch {req.batch_id} not found")
            selected_section = self.db.query(Section).filter(Section.id == selected_batch.section_id).first()
            if not selected_section:
                raise ValueError(f"Section for batch {req.batch_id} not found")
            if selected_section.academic_year_id != req.academic_year_id:
                raise ValueError("Batch does not belong to the selected academic year")
        elif req.section_id:
            selected_section = self.db.query(Section).filter(Section.id == req.section_id).first()
            if not selected_section:
                raise ValueError(f"Section {req.section_id} not found")
            if selected_section.academic_year_id != req.academic_year_id:
                raise ValueError("Section does not belong to the selected academic year")

        # ── Load timetable settings & timeslots ─────────────────────────────
        ts_settings = self.db.query(TimetableSettings).filter(
            TimetableSettings.department_id == req.department_id
        ).first()
        if not ts_settings:
            raise ValueError("Timetable settings not configured for this department")

        timeslots = self.db.query(Timeslot).filter(
            Timeslot.settings_id == ts_settings.id,
            Timeslot.is_break == False,
            Timeslot.is_lunch == False,
        ).all()
        if not timeslots:
            timeslots = self.generate_timeslots(ts_settings.id)

        # ── Load academic entities ───────────────────────────────────────────
        if selected_section:
            sections = [selected_section]
            section_ids = [selected_section.id]
            batches = self.db.query(Batch).filter(
                Batch.section_id == selected_section.id,
                Batch.is_active == True,
            )
            if selected_batch:
                batches = batches.filter(Batch.id == selected_batch.id)
            batches = batches.all()
        else:
            sections = self.db.query(Section).filter(
                Section.academic_year_id == req.academic_year_id,
                Section.is_active == True,
            ).all()
            section_ids = [s.id for s in sections]

            batches = self.db.query(Batch).filter(
                Batch.section_id.in_(section_ids),
                Batch.is_active == True,
            ).all()

        subjects = self.db.query(Subject).filter(
            Subject.department_id == req.department_id,
            Subject.academic_year_id == req.academic_year_id,
            Subject.is_active == True,
        ).all()

        frequencies = self.db.query(LectureFrequency).filter(
            LectureFrequency.section_id.in_(section_ids)
        ).all()

        assignments = self.db.query(TeacherSubjectAssignment).filter(
            TeacherSubjectAssignment.section_id.in_(section_ids)
        ).all()
        classroom_assignments = self.db.query(TeacherClassroomAssignment).all()

        teachers = self.db.query(Teacher).filter(Teacher.is_active == True).all()
        classrooms = self.cls_repo.get_active()

        # ── Lab slot preference ──────────────────────────────────────────────
        lab_preferred_slots = []
        if dep.lab_slot_preference == LabSlotPreference.MORNING:
            # First half of slots in each day = morning
            day_slot_counts: Dict[str, list] = {}
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

        # ── Constraint config ────────────────────────────────────────────────
        constraint_cfg = self.db.query(ConstraintConfig).filter(
            ConstraintConfig.department_id == req.department_id
        ).first()
        weights = {}
        if constraint_cfg:
            weights = {
                "weight_minimize_gaps": constraint_cfg.weight_minimize_gaps,
                "weight_teacher_comfort": constraint_cfg.weight_teacher_comfort,
                "weight_room_switch_penalty": constraint_cfg.weight_room_switch_penalty,
                "weight_consecutive_workload": constraint_cfg.weight_consecutive_workload,
                "weight_lab_morning_pref": constraint_cfg.weight_lab_morning_pref,
            }

        # ── Create placeholder version record ─────────────────────────────────
        version = TimetableVersion(
            id=str(uuid.uuid4()),
            department_id=req.department_id,
            academic_year_id=req.academic_year_id,
            name=req.version_name,
            status=TimetableStatus.DRAFT,
            generated_by=triggered_by_user_id,
        )
        self.tt_repo.create_version(version)

        # ── Run solver N times, collect valid candidates ──────────────────────
        inp = SolverInput(
            version_id=version.id,
            department=dep,
            sections=sections,
            batches=batches,
            subjects=subjects,
            teachers=teachers,
            classrooms=classrooms,
            timeslots=timeslots,
            frequencies=frequencies,
            assignments=assignments,
            teacher_classroom_assignments=classroom_assignments,
            max_teacher_per_day=ts_settings.max_teacher_lectures_per_day,
            max_teacher_per_week=ts_settings.max_teacher_lectures_per_week,
            break_after_lectures=ts_settings.break_after_lectures,
            lab_slot_preference=dep.lab_slot_preference,
            lab_preferred_slots=lab_preferred_slots,
        )

        candidates = []
        solver_wall_time = 0.0
        for _ in range(req.num_candidates):
            solver = TimetableSolver(inp, time_limit_seconds=settings.OR_TOOLS_TIME_LIMIT_SECONDS)
            result = solver.solve()
            solver_wall_time += result.wall_time
            if result.success:
                candidates.append(result.entries)

        if not candidates:
            # Build diagnostic summary to help debugging infeasibility
            assign_counts = {
                "theory_assignments": sum(1 for a in assignments if a.lecture_type == LectureType.THEORY),
                "tutorial_assignments": sum(1 for a in assignments if a.lecture_type == LectureType.TUTORIAL),
                "lab_assignments": sum(1 for a in assignments if a.lecture_type == LectureType.LAB),
            }
            from app.models.models import RoomType
            room_counts = {
                "theory_rooms": sum(1 for c in classrooms if c.room_type == RoomType.THEORY_ROOM),
                "tutorial_rooms": sum(1 for c in classrooms if c.room_type == RoomType.TUTORIAL_ROOM),
                "lab_rooms": sum(1 for c in classrooms if c.room_type == RoomType.LABORATORY),
            }
            diag = {
                "sections": len(sections),
                "batches": len(batches),
                "subjects": len(subjects),
                "timeslots": len(timeslots),
                "frequencies": len(frequencies),
                "assignments_total": len(assignments),
                **assign_counts,
                **room_counts,
                "lab_preferred_slots": lab_preferred_slots,
            }
            raise RuntimeError(f"OR-Tools could not find any feasible timetable. Check constraints and assignments. DIAG: {diag}")

        # ── Score candidates ─────────────────────────────────────────────────
        timeslot_map  = {sl.id: sl for sl in timeslots}
        classroom_map = {c.id: c for c in classrooms}
        teacher_map   = {t.id: t for t in teachers}

        scorer = TimetableScorer(
            timeslot_map=timeslot_map,
            classroom_map=classroom_map,
            teacher_map=teacher_map,
            constraint_weights=weights,
            lab_preferred_slots=lab_preferred_slots,
        )
        ranked = scorer.rank_candidates(candidates)
        best   = ranked[0]

        # ── Update version with entries & score ──────────────────────────────
        # Reassign version_id to selected best (solver may have used placeholder)
        for entry in best.entries:
            entry.version_id = version.id

        self.tt_repo.bulk_insert_entries(best.entries)

        # Update score on version
        self.db.query(TimetableVersion).filter(
            TimetableVersion.id == version.id
        ).update({"solver_score": best.score})
        self.db.commit()

        # ── Emit real-time event ─────────────────────────────────────────────
        self.realtime.emit("TIMETABLE_UPDATED", {
            "version_id": version.id,
            "department_id": req.department_id,
            "academic_year_id": req.academic_year_id,
            "action": "generated",
        })

        return version

    # ════════════════════════════════════════════════════════════════════════
    # PUBLISH VERSION
    # ════════════════════════════════════════════════════════════════════════

    def publish_version(self, version_id: str, user_id: str) -> TimetableVersion:
        version = self.tt_repo.get_version(version_id)
        if not version:
            raise ValueError("Version not found")

        self.tt_repo.publish_version(
            version_id, version.department_id, version.academic_year_id
        )
        self.db.refresh(version)

        self.realtime.emit("TIMETABLE_UPDATED", {
            "version_id": version_id,
            "department_id": version.department_id,
            "action": "published",
        })
        return version

    def delete_version(self, version_id: str, deleted_by_user_id: str) -> None:
        version = self.tt_repo.get_version(version_id)
        if not version:
            raise ValueError("Version not found")

        # Delete all entries and history related to this version
        self.tt_repo.delete_version_entries(version_id)
        # Delete history rows
        self.db.query(TimetableHistory).filter(TimetableHistory.version_id == version_id).delete()
        # Delete version record
        self.db.query(TimetableVersion).filter(TimetableVersion.id == version_id).delete()
        self.db.commit()

        # Emit realtime event
        self.realtime.emit("TIMETABLE_UPDATED", {
            "version_id": version_id,
            "action": "deleted",
        })

    # ════════════════════════════════════════════════════════════════════════
    # MOVE / DRAG-DROP
    # ════════════════════════════════════════════════════════════════════════

    def move_entry(
        self, move: TimetableEntryMove, moved_by_user_id: str
    ) -> TimetableEntry:
        """
        Move a lecture to a new timeslot + classroom.
        Full conflict detection runs before any write.
        Lab sessions: both slots move together (handled by lab_group_id).
        """
        entry = self.tt_repo.get(move.entry_id)
        if not entry:
            raise ValueError("Timetable entry not found")

        if entry.is_locked:
            raise ConflictError("This entry is locked and cannot be moved")

        version_id     = entry.version_id
        new_slot_id    = move.new_timeslot_id
        new_room_id    = move.new_classroom_id

        # ── Snapshot for audit ─────────────────────────────────────────────
        old_snapshot = self._entry_snapshot(entry)

        # ── Conflict checks ────────────────────────────────────────────────
        if self.tt_repo.check_teacher_conflict(version_id, entry.teacher_id, new_slot_id, exclude_entry_id=entry.id):
            raise ConflictError(f"Teacher is already scheduled at the target slot")

        if self.tt_repo.check_classroom_conflict(version_id, new_room_id, new_slot_id, exclude_entry_id=entry.id):
            raise ConflictError(f"Classroom is already occupied at the target slot")

        if entry.lecture_type == LectureType.THEORY:
            if self.tt_repo.check_section_theory_conflict(version_id, entry.section_id, new_slot_id, exclude_entry_id=entry.id):
                raise ConflictError("Section already has a theory lecture in this slot")

        if entry.batch_id:
            if self.tt_repo.check_batch_conflict(version_id, entry.batch_id, new_slot_id, exclude_entry_id=entry.id):
                raise ConflictError("Batch already has a lecture in this slot")

        # ── Room type compatibility ────────────────────────────────────────
        new_room = self.cls_repo.get(new_room_id)
        if not new_room:
            raise ValueError("Target classroom not found")
        self._validate_room_type(entry.lecture_type, new_room.room_type)

        # ── Teacher classroom compatibility ────────────────────────────────
        allowed_room_ids = {
            assignment.classroom_id
            for assignment in self.db.query(TeacherClassroomAssignment).filter(
                TeacherClassroomAssignment.teacher_id == entry.teacher_id
            ).all()
        }
        if allowed_room_ids and new_room_id not in allowed_room_ids:
            raise ConflictError("Teacher is not assigned to the selected classroom")

        # ── For lab sessions: also move continuation slot ──────────────────
        if entry.lecture_type == LectureType.LAB and entry.lab_group_id and not entry.is_lab_continuation:
            continuation = self.db.query(TimetableEntry).filter(
                TimetableEntry.lab_group_id == entry.lab_group_id,
                TimetableEntry.is_lab_continuation == True,
            ).first()
            if continuation:
                # Find the next consecutive timeslot
                new_slot = self.db.query(Timeslot).filter(Timeslot.id == new_slot_id).first()
                next_slot = self.db.query(Timeslot).filter(
                    Timeslot.settings_id == new_slot.settings_id,
                    Timeslot.day_of_week == new_slot.day_of_week,
                    Timeslot.slot_index  == new_slot.slot_index + 1,
                    Timeslot.is_break == False,
                    Timeslot.is_lunch == False,
                ).first()
                if not next_slot:
                    raise ConflictError("No consecutive slot available for lab continuation at target position")

                # Check conflicts for continuation slot
                if self.tt_repo.check_teacher_conflict(version_id, continuation.teacher_id, next_slot.id, exclude_entry_id=continuation.id):
                    raise ConflictError("Teacher conflict on lab continuation slot")
                if self.tt_repo.check_classroom_conflict(version_id, new_room_id, next_slot.id, exclude_entry_id=continuation.id):
                    raise ConflictError("Classroom conflict on lab continuation slot")

                continuation.timeslot_id  = next_slot.id
                continuation.classroom_id = new_room_id

        # ── Apply move ────────────────────────────────────────────────────
        entry.timeslot_id  = new_slot_id
        entry.classroom_id = new_room_id
        self.db.commit()
        self.db.refresh(entry)

        # ── Audit ─────────────────────────────────────────────────────────
        self.tt_repo.log_history(TimetableHistory(
            version_id=version_id,
            entry_id=entry.id,
            changed_by=moved_by_user_id,
            action="move",
            old_value=json.dumps(old_snapshot),
            new_value=json.dumps(self._entry_snapshot(entry)),
            reason=move.reason,
        ))

        # ── Real-time event ────────────────────────────────────────────────
        self.realtime.emit("TIMETABLE_UPDATED", {
            "version_id": version_id,
            "action": "move",
            "entry_id": entry.id,
            "section_id": entry.section_id,
            "teacher_id": entry.teacher_id,
        })

        return entry

    def delete_entry(self, entry_id: str, deleted_by_user_id: str, reason: Optional[str] = None) -> None:
        entry = self.db.query(TimetableEntry).filter(TimetableEntry.id == entry_id).first()
        if not entry:
            raise ValueError("Timetable entry not found")

        if entry.is_locked:
            raise ConflictError("This entry is locked and cannot be deleted")

        # Snapshot for audit
        old_snapshot = self._entry_snapshot(entry)

        version_id = entry.version_id

        # Delete entry
        self.db.delete(entry)
        self.db.commit()

        # Log history with entry_id NULL to indicate deletion
        self.tt_repo.log_history(TimetableHistory(
            version_id=version_id,
            entry_id=None,
            changed_by=deleted_by_user_id,
            action="delete",
            old_value=json.dumps(old_snapshot),
            new_value=None,
            reason=reason,
        ))

        # Emit realtime event
        self.realtime.emit("TIMETABLE_UPDATED", {
            "version_id": version_id,
            "action": "delete",
            "section_id": old_snapshot.get("section_id"),
            "teacher_id": old_snapshot.get("teacher_id"),
        })

    # ════════════════════════════════════════════════════════════════════════
    # TIMESLOT GENERATION (from TimetableSettings)
    # ════════════════════════════════════════════════════════════════════════

    def generate_timeslots(self, settings_id: str) -> List[Timeslot]:
        """
        Materialise Timeslot rows from TimetableSettings.
        Deletes existing slots for this settings_id first.
        """
        ts = self.db.query(TimetableSettings).filter(
            TimetableSettings.id == settings_id
        ).first()
        if not ts:
            raise ValueError("TimetableSettings not found")

        # Delete existing
        self.db.query(Timeslot).filter(Timeslot.settings_id == settings_id).delete()
        self.db.commit()

        from datetime import time as dtime
        days = [d.strip() for d in ts.working_days.split(",")]
        slots = []

        for day in days:
            # Parse start time
            h, m   = map(int, ts.lecture_start_time.split(":"))
            current = h * 60 + m
            slot_idx = 0
            lecture_in_run = 0

            for _ in range(ts.lectures_per_day):
                start_str = f"{current//60:02d}:{current%60:02d}"
                end       = current + ts.lecture_duration_min
                end_str   = f"{end//60:02d}:{end%60:02d}"

                sl = Timeslot(
                    id=str(uuid.uuid4()),
                    settings_id=settings_id,
                    day_of_week=day,
                    slot_index=slot_idx,
                    start_time=start_str,
                    end_time=end_str,
                    is_break=False,
                    is_lunch=False,
                    label=f"{start_str} – {end_str}",
                )
                slots.append(sl)
                current   = end
                slot_idx += 1
                lecture_in_run += 1

                # Insert lunch break
                if slot_idx - 1 == ts.lunch_after_slot:
                    lunch_start = f"{current//60:02d}:{current%60:02d}"
                    current    += ts.lunch_duration_min
                    lunch_end   = f"{current//60:02d}:{current%60:02d}"
                    slots.append(Timeslot(
                        id=str(uuid.uuid4()),
                        settings_id=settings_id,
                        day_of_week=day,
                        slot_index=slot_idx,
                        start_time=lunch_start,
                        end_time=lunch_end,
                        is_break=False,
                        is_lunch=True,
                        label=f"Lunch {lunch_start} – {lunch_end}",
                    ))
                    slot_idx      += 1
                    lecture_in_run = 0
                    continue

                # Insert short break
                if lecture_in_run >= ts.break_after_lectures:
                    brk_start = f"{current//60:02d}:{current%60:02d}"
                    current  += ts.break_duration_min
                    brk_end   = f"{current//60:02d}:{current%60:02d}"
                    slots.append(Timeslot(
                        id=str(uuid.uuid4()),
                        settings_id=settings_id,
                        day_of_week=day,
                        slot_index=slot_idx,
                        start_time=brk_start,
                        end_time=brk_end,
                        is_break=True,
                        is_lunch=False,
                        label=f"Break {brk_start} – {brk_end}",
                    ))
                    slot_idx       += 1
                    lecture_in_run  = 0

        self.db.bulk_save_objects(slots)
        self.db.commit()
        return slots

    # ════════════════════════════════════════════════════════════════════════
    # HELPERS
    # ════════════════════════════════════════════════════════════════════════

    def _entry_snapshot(self, e: TimetableEntry) -> dict:
        return {
            "timeslot_id":  e.timeslot_id,
            "classroom_id": e.classroom_id,
            "teacher_id":   e.teacher_id,
            "subject_id":   e.subject_id,
            "section_id":   e.section_id,
            "batch_id":     e.batch_id,
            "lecture_type": e.lecture_type,
        }

    @staticmethod
    def _validate_room_type(lecture_type: LectureType, room_type) -> None:
        from app.models.models import RoomType
        mapping = {
            LectureType.THEORY:   RoomType.THEORY_ROOM,
            LectureType.TUTORIAL: RoomType.TUTORIAL_ROOM,
            LectureType.LAB:      RoomType.LABORATORY,
        }
        if mapping[lecture_type] != room_type:
            raise ConflictError(
                f"{lecture_type} lectures cannot be placed in {room_type} rooms"
            )
