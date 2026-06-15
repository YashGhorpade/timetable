"""
XGBoost Soft Constraint Scorer.

Pipeline:
  1. Receive N candidate TimetableEntry lists (from OR-Tools)
  2. Extract feature vectors for each candidate
  3. Score with XGBoost regressor (or heuristic if model not yet trained)
  4. Return ranked list — best candidate first

Features extracted per candidate:
  - avg_teacher_gap_slots        : average idle slots between lectures per teacher
  - max_teacher_gap_slots        : worst gap any teacher has in a day
  - teacher_overload_days        : days where any teacher exceeds 4 consecutive lectures
  - classroom_switches_per_day   : avg times a section changes building per day
  - lab_in_preferred_slots_ratio : fraction of labs in admin-preferred slots
  - section_gap_ratio            : fraction of section days with gaps > 2 slots
  - avg_daily_spread             : average spread of lectures across the day
  - total_idle_teacher_slots     : sum of all idle teacher slots in the week
"""
import json
import os
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np

from app.models.models import (
    LectureType, TimetableEntry, Timeslot, Classroom, Teacher,
    LabSlotPreference
)


# ─── Feature vector definition ───────────────────────────────────────────────

FEATURE_NAMES = [
    "avg_teacher_gap_slots",
    "max_teacher_gap_slots",
    "teacher_overload_days",
    "classroom_switches_per_day",
    "lab_in_preferred_slots_ratio",
    "section_gap_ratio",
    "avg_daily_spread",
    "total_idle_teacher_slots",
]

MODEL_PATH = os.path.join(os.path.dirname(__file__), "xgb_timetable_scorer.json")


@dataclass
class ScoredCandidate:
    entries: List[TimetableEntry]
    features: Dict[str, float]
    score: float       # higher = better
    rank: int


class TimetableScorer:
    """
    Scores and ranks timetable candidates using XGBoost.
    Falls back to weighted heuristic scoring if no trained model exists.
    """

    def __init__(
        self,
        timeslot_map: Dict[str, Timeslot],
        classroom_map: Dict[str, Classroom],
        teacher_map: Dict[str, Teacher],
        constraint_weights: Optional[Dict[str, float]] = None,
        lab_preferred_slots: Optional[List[int]] = None,
    ):
        self.timeslot_map = timeslot_map
        self.classroom_map = classroom_map
        self.teacher_map = teacher_map
        self.lab_preferred_slots = set(lab_preferred_slots or [])
        self.weights = constraint_weights or {
            "weight_minimize_gaps": 1.0,
            "weight_teacher_comfort": 1.0,
            "weight_room_switch_penalty": 0.8,
            "weight_consecutive_workload": 0.9,
            "weight_lab_morning_pref": 0.5,
        }
        self._model = self._load_model()

    def _load_model(self):
        if os.path.exists(MODEL_PATH):
            try:
                import xgboost as xgb
                model = xgb.XGBRegressor()
                model.load_model(MODEL_PATH)
                return model
            except Exception:
                pass
        return None  # use heuristic

    def rank_candidates(
        self, candidates: List[List[TimetableEntry]]
    ) -> List[ScoredCandidate]:
        """Score all candidates and return sorted list (best first)."""
        scored = []
        for entries in candidates:
            features = self._extract_features(entries)
            score    = self._score(features)
            scored.append(ScoredCandidate(
                entries=entries,
                features=features,
                score=score,
                rank=0,
            ))

        scored.sort(key=lambda c: c.score, reverse=True)
        for i, c in enumerate(scored):
            c.rank = i + 1
        return scored

    def best(self, candidates: List[List[TimetableEntry]]) -> List[TimetableEntry]:
        ranked = self.rank_candidates(candidates)
        return ranked[0].entries if ranked else []

    # ─── Feature extraction ──────────────────────────────────────────────────

    def _extract_features(self, entries: List[TimetableEntry]) -> Dict[str, float]:
        # Group entries by teacher and day
        teacher_day_slots: Dict[str, Dict[str, List[int]]] = {}
        section_day_slots: Dict[str, Dict[str, List[int]]] = {}
        section_day_rooms: Dict[str, Dict[str, List[str]]]  = {}
        lab_slot_indices: List[int] = []

        for e in entries:
            ts = self.timeslot_map.get(e.timeslot_id)
            if not ts:
                continue
            day = ts.day_of_week
            si  = ts.slot_index

            # Teacher
            teacher_day_slots.setdefault(e.teacher_id, {}).setdefault(day, []).append(si)

            # Section
            section_day_slots.setdefault(e.section_id, {}).setdefault(day, []).append(si)
            section_day_rooms.setdefault(e.section_id, {}).setdefault(day, []).append(e.classroom_id)

            # Lab preferred slots
            if e.lecture_type == LectureType.LAB and not e.is_lab_continuation:
                lab_slot_indices.append(si)

        # ── Teacher gap metrics ──────────────────────────────────────────────
        all_gaps: List[float] = []
        overload_days = 0
        total_idle = 0

        for teacher_id, day_map in teacher_day_slots.items():
            for day, slots in day_map.items():
                slots_sorted = sorted(slots)
                if len(slots_sorted) < 2:
                    continue
                # Gaps between consecutive lectures
                gaps = [slots_sorted[i+1] - slots_sorted[i] - 1 for i in range(len(slots_sorted)-1)]
                idle = sum(g for g in gaps if g > 0)
                all_gaps.extend([g for g in gaps if g > 0])
                total_idle += idle
                # Overload: 4+ consecutive lectures without break
                max_run = self._max_consecutive_run(slots_sorted)
                if max_run >= 4:
                    overload_days += 1

        avg_gap = float(np.mean(all_gaps)) if all_gaps else 0.0
        max_gap = float(np.max(all_gaps))  if all_gaps else 0.0

        # ── Classroom switches ────────────────────────────────────────────────
        switch_counts: List[float] = []
        for section_id, day_map in section_day_rooms.items():
            for day, rooms in day_map.items():
                # Count building changes (simplified: room changes)
                switches = sum(1 for i in range(len(rooms)-1) if rooms[i] != rooms[i+1])
                switch_counts.append(float(switches))
        avg_switches = float(np.mean(switch_counts)) if switch_counts else 0.0

        # ── Lab in preferred slots ────────────────────────────────────────────
        if lab_slot_indices and self.lab_preferred_slots:
            in_pref = sum(1 for si in lab_slot_indices if si in self.lab_preferred_slots)
            lab_pref_ratio = in_pref / len(lab_slot_indices)
        else:
            lab_pref_ratio = 1.0  # no preference = perfect

        # ── Section gap ratio ─────────────────────────────────────────────────
        gap_days = 0
        total_days_with_lectures = 0
        for section_id, day_map in section_day_slots.items():
            for day, slots in day_map.items():
                total_days_with_lectures += 1
                slots_sorted = sorted(slots)
                gaps = [slots_sorted[i+1] - slots_sorted[i] - 1 for i in range(len(slots_sorted)-1)]
                if any(g > 2 for g in gaps):
                    gap_days += 1
        section_gap_ratio = gap_days / total_days_with_lectures if total_days_with_lectures else 0.0

        # ── Daily spread ──────────────────────────────────────────────────────
        spreads: List[float] = []
        for teacher_id, day_map in teacher_day_slots.items():
            for day, slots in day_map.items():
                if slots:
                    spreads.append(float(max(slots) - min(slots)))
        avg_spread = float(np.mean(spreads)) if spreads else 0.0

        return {
            "avg_teacher_gap_slots":         avg_gap,
            "max_teacher_gap_slots":         max_gap,
            "teacher_overload_days":         float(overload_days),
            "classroom_switches_per_day":    avg_switches,
            "lab_in_preferred_slots_ratio":  lab_pref_ratio,
            "section_gap_ratio":             section_gap_ratio,
            "avg_daily_spread":              avg_spread,
            "total_idle_teacher_slots":      float(total_idle),
        }

    # ─── Scoring ─────────────────────────────────────────────────────────────

    def _score(self, features: Dict[str, float]) -> float:
        if self._model is not None:
            try:
                import xgboost as xgb
                import numpy as np
                fv = np.array([[features[n] for n in FEATURE_NAMES]])
                return float(self._model.predict(fv)[0])
            except Exception:
                pass
        return self._heuristic_score(features)

    def _heuristic_score(self, f: Dict[str, float]) -> float:
        """
        Weighted heuristic score when XGBoost model is not yet trained.
        Returns a value where HIGHER = better timetable.
        """
        w = self.weights
        score = 100.0

        # Penalize gaps (lower is better)
        score -= f["avg_teacher_gap_slots"]     * w.get("weight_minimize_gaps", 1.0)    * 5.0
        score -= f["max_teacher_gap_slots"]     * w.get("weight_minimize_gaps", 1.0)    * 2.0
        score -= f["total_idle_teacher_slots"]  * w.get("weight_minimize_gaps", 1.0)    * 0.5

        # Penalize overload days
        score -= f["teacher_overload_days"]     * w.get("weight_consecutive_workload", 0.9) * 3.0

        # Penalize room switches
        score -= f["classroom_switches_per_day"] * w.get("weight_room_switch_penalty", 0.8) * 4.0

        # Reward lab in preferred slots
        score += f["lab_in_preferred_slots_ratio"] * w.get("weight_lab_morning_pref", 0.5) * 10.0

        # Penalize section gaps > 2
        score -= f["section_gap_ratio"]         * w.get("weight_teacher_comfort", 1.0)  * 8.0

        # Penalize high daily spread (teacher comes early, stays late with gaps)
        score -= f["avg_daily_spread"]           * w.get("weight_teacher_comfort", 1.0)  * 0.3

        return score

    @staticmethod
    def _max_consecutive_run(sorted_slots: List[int]) -> int:
        """Length of longest run of consecutive slot indices."""
        if not sorted_slots:
            return 0
        max_run = run = 1
        for i in range(1, len(sorted_slots)):
            if sorted_slots[i] == sorted_slots[i-1] + 1:
                run += 1
                max_run = max(max_run, run)
            else:
                run = 1
        return max_run

    # ─── Training helper ──────────────────────────────────────────────────────

    def train(self, feature_rows: List[Dict[str, float]], labels: List[float]) -> None:
        """
        Train the XGBoost regressor on collected MLFeedback data.
        Call this from an admin-triggered endpoint.
        """
        import xgboost as xgb
        import numpy as np

        X = np.array([[row[n] for n in FEATURE_NAMES] for row in feature_rows])
        y = np.array(labels)

        model = xgb.XGBRegressor(
            n_estimators=200,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            objective="reg:squarederror",
            random_state=42,
        )
        model.fit(X, y)
        model.save_model(MODEL_PATH)
        self._model = model
