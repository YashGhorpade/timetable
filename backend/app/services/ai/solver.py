"""
OR-Tools CP-SAT Timetable Generation Solver.

Architecture:
  1. Load all constraints from DB
  2. Build CP-SAT model variables
  3. Add hard constraints
  4. Solve with configurable time limit
  5. Extract solution(s) → TimetableEntry objects
  6. Return multiple candidate solutions for XGBoost ranking

Hard constraints enforced:
  - No teacher clash (teacher → at most 1 lecture per timeslot)
  - No classroom clash (classroom → at most 1 occupancy per timeslot)
  - No section theory clash (section → at most 1 theory per timeslot)
  - No batch clash (batch → at most 1 lecture per timeslot)
  - Lab = exactly 2 consecutive timeslots, same teacher, same classroom, same batch
  - Room type match (labs only in labs, tutorials only in tutorial rooms)
  - Lecture frequency satisfaction (theory/tutorial/lab counts per week)
  - Teacher workload limits per day and per week
  - Lab slot preference per department (admin-configurable)
"""
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from ortools.sat.python import cp_model
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.models import (
    Batch, Classroom, Department, LectureFrequency, LectureType,
    RoomType, Section, Subject, Teacher, TeacherSubjectAssignment,
    TimetableEntry, TimetableVersion, Timeslot, TeacherClassroomAssignment,
    LabSlotPreference
)


# ─── Data transfer objects ────────────────────────────────────────────────────

@dataclass
class SolverInput:
    """Everything the solver needs, pre-loaded from DB."""
    version_id: str
    department: Department
    sections: List[Section]
    batches: List[Batch]  # all batches across sections
    subjects: List[Subject]
    teachers: List[Teacher]
    classrooms: List[Classroom]
    timeslots: List[Timeslot]   # only non-break, non-lunch slots
    frequencies: List[LectureFrequency]
    assignments: List[TeacherSubjectAssignment]
    teacher_classroom_assignments: List[TeacherClassroomAssignment]
    max_teacher_per_day: int
    max_teacher_per_week: int
    break_after_lectures: int
    lab_slot_preference: LabSlotPreference
    lab_preferred_slots: List[int]  # slot indices, empty if no_preference


@dataclass
class SolverResult:
    success: bool
    entries: List[TimetableEntry] = field(default_factory=list)
    status_str: str = ""
    wall_time: float = 0.0
    error: Optional[str] = None


# ─── Main Solver Class ────────────────────────────────────────────────────────

class TimetableSolver:
    """
    Wraps OR-Tools CP-SAT to generate valid timetables.
    Call solve() to get a list of candidate solutions.
    """

    def __init__(self, inp: SolverInput, time_limit_seconds: int = 60):
        self.inp = inp
        self.time_limit = time_limit_seconds

        # Index maps for fast lookup
        self.slot_ids  = [s.id for s in inp.timeslots]
        self.slot_map  = {s.id: s for s in inp.timeslots}
        self.slot_idx  = {s.id: i for i, s in enumerate(inp.timeslots)}
        self.days      = list(dict.fromkeys(s.day_of_week for s in inp.timeslots))
        self.day_slots: Dict[str, List[int]] = {}   # day → list of slot indices in self.slot_ids
        for i, sl in enumerate(inp.timeslots):
            self.day_slots.setdefault(sl.day_of_week, []).append(i)

        self.teacher_map   = {t.id: t for t in inp.teachers}
        self.classroom_map = {c.id: c for c in inp.classrooms}
        self.section_map   = {s.id: s for s in inp.sections}
        self.batch_map     = {b.id: b for b in inp.batches}
        self.teacher_classroom_assignments = inp.teacher_classroom_assignments

        # Separate classrooms by type for constraint enforcement
        self.theory_rooms    = [c for c in inp.classrooms if c.room_type == RoomType.THEORY_ROOM]
        self.tutorial_rooms  = [c for c in inp.classrooms if c.room_type == RoomType.TUTORIAL_ROOM]
        self.labs            = [c for c in inp.classrooms if c.room_type == RoomType.LABORATORY]

    def solve(self) -> SolverResult:
        import time
        start = time.time()
        model = cp_model.CpModel()
        inp   = self.inp

        # ── Build lecture tasks ────────────────────────────────────────────────
        # A "task" = one instance of (subject, section, lecture_type, batch?) that needs placing.
        # We enumerate all tasks from lecture frequencies.

        tasks = self._build_tasks()
        if not tasks:
            return SolverResult(success=False, error="No lecture tasks to schedule", status_str="empty")

        num_slots   = len(inp.timeslots)
        num_rooms   = len(inp.classrooms)
        num_tasks   = len(tasks)

        # Decision variables: x[task_i, slot_i, room_i] ∈ {0,1}
        x: Dict[Tuple[int, int, int], cp_model.IntVar] = {}
        for ti in range(num_tasks):
            for si in range(num_slots):
                for ri in range(num_rooms):
                    x[ti, si, ri] = model.new_bool_var(f"x_{ti}_{si}_{ri}")

        # ── Each task must be placed exactly once ──────────────────────────────
        for ti, task in enumerate(tasks):
            if task["type"] != LectureType.LAB:
                # Theory / tutorial: sum over all slots and compatible rooms = 1
                compatible_rooms = self._compatible_rooms(task)
                compatible_slots = self._compatible_slots(task)
                if not compatible_rooms or not compatible_slots:
                    return SolverResult(
                        success=False,
                        error=f"No compatible rooms/slots for task {task}",
                        status_str="infeasible"
                    )
                model.add(
                    sum(x[ti, si, ri]
                        for si in compatible_slots
                        for ri in compatible_rooms) == 1
                )
                # Zero out incompatible combinations
                for si in range(num_slots):
                    for ri in range(num_rooms):
                        if si not in compatible_slots or ri not in compatible_rooms:
                            model.add(x[ti, si, ri] == 0)

        # ── Lab tasks: 2 consecutive slots, same room, same teacher ───────────
        # Lab tasks come in pairs; we link them.
        lab_tasks  = [(ti, t) for ti, t in enumerate(tasks) if t["type"] == LectureType.LAB]
        lab_groups = {}
        for ti, task in lab_tasks:
            grp = task["lab_group"]
            lab_groups.setdefault(grp, []).append(ti)

        for grp, (ti_a, ti_b) in [(g, (tis[0], tis[1])) for g, tis in lab_groups.items() if len(tis) == 2]:
            compatible_rooms = self._compatible_rooms(tasks[ti_a])
            compatible_slots = self._consecutive_slot_pairs()

            # Place lab slot A
            model.add(sum(x[ti_a, si, ri] for si, _ in compatible_slots for ri in compatible_rooms) == 1)
            model.add(sum(x[ti_b, si, ri] for _, si in compatible_slots for ri in compatible_rooms) == 1)

            # Force same room
            for ri in range(num_rooms):
                room_a = sum(x[ti_a, si, ri] for si, _ in compatible_slots)
                room_b = sum(x[ti_b, si, ri] for _, si in compatible_slots)
                model.add(room_a == room_b)

            # Force consecutive: if A placed at slot_pair[0], B must be at slot_pair[1]
            for pair_si, pair_si_next in compatible_slots:
                for ri in compatible_rooms:
                    model.add(x[ti_b, pair_si_next, ri] == x[ti_a, pair_si, ri])

            # Zero out non-pair positions
            pair_a_slots = {si for si, _ in compatible_slots}
            pair_b_slots = {si for _, si in compatible_slots}
            for si in range(num_slots):
                for ri in range(num_rooms):
                    if si not in pair_a_slots or ri not in compatible_rooms:
                        model.add(x[ti_a, si, ri] == 0)
                    if si not in pair_b_slots or ri not in compatible_rooms:
                        model.add(x[ti_b, si, ri] == 0)

        # ── No classroom double-booking ────────────────────────────────────────
        for si in range(num_slots):
            for ri in range(num_rooms):
                model.add(sum(x[ti, si, ri] for ti in range(num_tasks)) <= 1)

        # ── No teacher double-booking ──────────────────────────────────────────
        teacher_tasks: Dict[str, List[int]] = {}
        for ti, task in enumerate(tasks):
            teacher_tasks.setdefault(task["teacher_id"], []).append(ti)

        for teacher_id, tis in teacher_tasks.items():
            for si in range(num_slots):
                model.add(sum(x[ti, si, ri] for ti in tis for ri in range(num_rooms)) <= 1)

        # ── No section theory double-booking ───────────────────────────────────
        section_theory_tasks: Dict[str, List[int]] = {}
        for ti, task in enumerate(tasks):
            if task["type"] == LectureType.THEORY:
                section_theory_tasks.setdefault(task["section_id"], []).append(ti)

        for section_id, tis in section_theory_tasks.items():
            for si in range(num_slots):
                model.add(sum(x[ti, si, ri] for ti in tis for ri in range(num_rooms)) <= 1)

        # ── No batch double-booking ────────────────────────────────────────────
        batch_tasks: Dict[str, List[int]] = {}
        for ti, task in enumerate(tasks):
            if task.get("batch_id"):
                batch_tasks.setdefault(task["batch_id"], []).append(ti)

        for batch_id, tis in batch_tasks.items():
            for si in range(num_slots):
                model.add(sum(x[ti, si, ri] for ti in tis for ri in range(num_rooms)) <= 1)

        # ── Teacher workload per day ───────────────────────────────────────────
        for teacher_id, tis in teacher_tasks.items():
            teacher = self.teacher_map[teacher_id]
            for day, day_slot_indices in self.day_slots.items():
                model.add(
                    sum(x[ti, si, ri]
                        for ti in tis
                        for si in day_slot_indices
                        for ri in range(num_rooms)) <= teacher.max_lectures_per_day
                )
            # Per week
            model.add(
                sum(x[ti, si, ri]
                    for ti in tis
                    for si in range(num_slots)
                    for ri in range(num_rooms)) <= teacher.max_lectures_per_week
            )

        # ── Soft: Lab slot preference (per department) ─────────────────────────
        # Add as maximization objective bonus
        preferred_slots = inp.lab_preferred_slots
        lab_preference_bonus = []
        if preferred_slots:
            for ti, task in enumerate(tasks):
                if task["type"] == LectureType.LAB:
                    lab_rooms = [ri for ri, c in enumerate(inp.classrooms) if c.room_type == RoomType.LABORATORY]
                    for si in preferred_slots:
                        if 0 <= si < num_slots:
                            for ri in lab_rooms:
                                lab_preference_bonus.append(x[ti, si, ri])

        model.maximize(sum(lab_preference_bonus) if lab_preference_bonus else model.new_constant(0))

        # ── Solve ──────────────────────────────────────────────────────────────
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self.time_limit
        solver.parameters.num_workers = settings.OR_TOOLS_NUM_WORKERS
        solver.parameters.log_search_progress = False

        status = solver.solve(model)
        wall   = time.time() - start

        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return SolverResult(
                success=False,
                status_str=solver.status_name(status),
                wall_time=wall,
                error="No feasible solution found within time limit",
            )

        # ── Extract solution ────────────────────────────────────────────────────
        entries = []
        lab_groups_seen = {}
        for ti, task in enumerate(tasks):
            for si in range(num_slots):
                for ri in range(num_rooms):
                    if solver.value(x[ti, si, ri]):
                        timeslot  = inp.timeslots[si]
                        classroom = inp.classrooms[ri]
                        lab_gid   = task.get("lab_group")
                        is_cont   = task.get("is_lab_continuation", False)

                        # Resolve shared lab_group_id for paired slots
                        if lab_gid:
                            if lab_gid not in lab_groups_seen:
                                lab_groups_seen[lab_gid] = str(uuid.uuid4())
                            shared_gid = lab_groups_seen[lab_gid]
                        else:
                            shared_gid = None

                        entry = TimetableEntry(
                            id=str(uuid.uuid4()),
                            version_id=inp.version_id,
                            timeslot_id=timeslot.id,
                            subject_id=task["subject_id"],
                            teacher_id=task["teacher_id"],
                            classroom_id=classroom.id,
                            section_id=task["section_id"],
                            lecture_type=task["type"],
                            batch_id=task.get("batch_id"),
                            is_lab_continuation=is_cont,
                            lab_group_id=shared_gid,
                        )
                        entries.append(entry)

        return SolverResult(
            success=True,
            entries=entries,
            status_str=solver.status_name(status),
            wall_time=wall,
        )

    # ── Private helpers ─────────────────────────────────────────────────────────

    def _build_tasks(self) -> List[dict]:
        """
        Enumerate one task-dict per lecture instance per week.
        Each task represents a single slot that needs to be placed.
        Lab sessions generate 2 tasks with a shared lab_group key.
        """
        tasks = []
        inp = self.inp

        def find_assignment(subject_id: str, section_id: str, lecture_type: LectureType, batch_id: Optional[str] = None):
            exact = [a for a in inp.assignments if a.subject_id == subject_id and a.section_id == section_id and a.lecture_type == lecture_type and a.batch_id == batch_id]
            if exact:
                return exact[0]
            if batch_id is not None:
                fallback = [a for a in inp.assignments if a.subject_id == subject_id and a.section_id == section_id and a.lecture_type == lecture_type and a.batch_id is None]
                return fallback[0] if fallback else None
            return None

        for freq in inp.frequencies:
            subject = next((s for s in inp.subjects if s.id == freq.subject_id), None)
            section = next((s for s in inp.sections if s.id == freq.section_id), None)
            if not subject or not section:
                continue

            batches = [b for b in inp.batches if b.section_id == section.id]

            # Theory lectures (section-wide)
            theory_assign = find_assignment(freq.subject_id, freq.section_id, LectureType.THEORY)
            if freq.theory_per_week > 0 and not theory_assign:
                raise ValueError(
                    f"Missing THEORY assignment for subject {freq.subject_id} in section {freq.section_id}"
                )
            if theory_assign:
                for _ in range(freq.theory_per_week):
                    tasks.append({
                        "type": LectureType.THEORY,
                        "subject_id": subject.id,
                        "teacher_id": theory_assign.teacher_id,
                        "section_id": section.id,
                        "batch_id": None,
                        "lab_group": None,
                        "is_lab_continuation": False,
                    })

            # Tutorial lectures (batch-wise)
            for batch in batches:
                if freq.tutorial_per_week <= 0:
                    continue

                tut_assign = find_assignment(freq.subject_id, freq.section_id, LectureType.TUTORIAL, batch.id)
                if not tut_assign:
                    raise ValueError(
                        f"Missing TUTORIAL assignment for subject {freq.subject_id} in section {freq.section_id}, batch {batch.id}"
                    )

                for _ in range(freq.tutorial_per_week):
                    tasks.append({
                        "type": LectureType.TUTORIAL,
                        "subject_id": subject.id,
                        "teacher_id": tut_assign.teacher_id,
                        "section_id": section.id,
                        "batch_id": batch.id,
                        "lab_group": None,
                        "is_lab_continuation": False,
                    })

            # Lab sessions (batch-wise, 2 consecutive slots each)
            for batch in batches:
                if freq.lab_per_week <= 0:
                    continue

                lab_assign = find_assignment(freq.subject_id, freq.section_id, LectureType.LAB, batch.id)
                if not lab_assign:
                    raise ValueError(
                        f"Missing LAB assignment for subject {freq.subject_id} in section {freq.section_id}, batch {batch.id}"
                    )

                for i in range(freq.lab_per_week):
                    grp_key = f"lab_{subject.id}_{batch.id}_{i}"
                    tasks.append({
                        "type": LectureType.LAB,
                        "subject_id": subject.id,
                        "teacher_id": lab_assign.teacher_id,
                        "section_id": section.id,
                        "batch_id": batch.id,
                        "lab_group": grp_key,
                        "is_lab_continuation": False,
                    })
                    tasks.append({
                        "type": LectureType.LAB,
                        "subject_id": subject.id,
                        "teacher_id": lab_assign.teacher_id,
                        "section_id": section.id,
                        "batch_id": batch.id,
                        "lab_group": grp_key,
                        "is_lab_continuation": True,
                    })
        return tasks

    def _compatible_rooms(self, task: dict) -> List[int]:
        """Returns indices into inp.classrooms compatible with this task's lecture type and teacher."""
        inp = self.inp
        if task["type"] == LectureType.THEORY:
            types = {RoomType.THEORY_ROOM}
        elif task["type"] == LectureType.TUTORIAL:
            types = {RoomType.TUTORIAL_ROOM}
        else:  # LAB
            types = {RoomType.LABORATORY}

        allowed_room_ids = {
            a.classroom_id
            for a in self.teacher_classroom_assignments
            if a.teacher_id == task["teacher_id"]
        }

        compatible = []
        for i, c in enumerate(inp.classrooms):
            if not c.is_active or c.room_type not in types:
                continue
            if allowed_room_ids and c.id not in allowed_room_ids:
                continue
            compatible.append(i)
        return compatible

    def _compatible_slots(self, task: dict) -> List[int]:
        """For theory/tutorial: all non-break, non-lunch slot indices."""
        return list(range(len(self.inp.timeslots)))  # timeslots already filtered to non-break

    def _consecutive_slot_pairs(self) -> List[Tuple[int, int]]:
        """
        Returns (slot_i, slot_i+1) pairs where both slots are in the same day
        and are numerically consecutive within that day.
        Lab preference applied here if configured.
        """
        inp = self.inp
        pairs = []
        preferred = set(inp.lab_preferred_slots)

        for day, slot_indices in self.day_slots.items():
            sorted_idx = sorted(slot_indices)
            for k in range(len(sorted_idx) - 1):
                a, b = sorted_idx[k], sorted_idx[k + 1]
                slot_a = inp.timeslots[a]
                slot_b = inp.timeslots[b]
                if slot_b.slot_index == slot_a.slot_index + 1:
                    if preferred and slot_a.slot_index not in preferred:
                        continue  # skip non-preferred pairs if preference configured
                    pairs.append((a, b))

        # If preference filtering left nothing, fall back to all pairs
        if not pairs:
            for day, slot_indices in self.day_slots.items():
                sorted_idx = sorted(slot_indices)
                for k in range(len(sorted_idx) - 1):
                    a, b = sorted_idx[k], sorted_idx[k + 1]
                    slot_a = inp.timeslots[a]
                    slot_b = inp.timeslots[b]
                    if slot_b.slot_index == slot_a.slot_index + 1:
                        pairs.append((a, b))
        return pairs
