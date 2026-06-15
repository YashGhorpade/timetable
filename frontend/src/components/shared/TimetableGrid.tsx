import React, { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import type { TimetableEntry, Timeslot, DayOfWeek, LectureType } from "@/types";

// ─── Colours per lecture type ─────────────────────────────────────────────────
const TYPE_STYLES: Record<LectureType, string> = {
  theory:   "bg-blue-500/15 border-blue-400/40 text-blue-900 dark:text-blue-200",
  tutorial: "bg-emerald-500/15 border-emerald-400/40 text-emerald-900 dark:text-emerald-200",
  lab:      "bg-violet-500/15 border-violet-400/40 text-violet-900 dark:text-violet-200",
};
const TYPE_BADGE: Record<LectureType, string> = {
  theory:   "bg-blue-500 text-white",
  tutorial: "bg-emerald-500 text-white",
  lab:      "bg-violet-500 text-white",
};
const TYPE_LABEL: Record<LectureType, string> = {
  theory: "T", tutorial: "TUT", lab: "LAB",
};

const DAYS: DayOfWeek[] = ["monday","tuesday","wednesday","thursday","friday","saturday"];
const DAY_LABELS: Record<DayOfWeek, string> = {
  monday:"Mon", tuesday:"Tue", wednesday:"Wed",
  thursday:"Thu", friday:"Fri", saturday:"Sat",
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface TimetableGridProps {
  entries:      TimetableEntry[];
  timeslots:    Timeslot[];
  readOnly?:    boolean;
  onMoveEntry?: (entryId: string, newTimeslotId: string) => Promise<void>;
  onEntryClick?:(entry: TimetableEntry) => void;
  showBatchLabel?: boolean;
  highlightBatchId?: string;
}

// ─── Grid helpers ─────────────────────────────────────────────────────────────
function buildGrid(timeslots: Timeslot[]) {
  const days = new Set<DayOfWeek>();
  timeslots.forEach((s) => days.add(s.day_of_week));
  const activeDays = DAYS.filter((d) => days.has(d));

  const slotsByDay: Record<DayOfWeek, Timeslot[]> = {} as any;
  activeDays.forEach((d) => {
    slotsByDay[d] = timeslots
      .filter((s) => s.day_of_week === d)
      .sort((a, b) => a.slot_index - b.slot_index);
  });

  // All unique slot indices (0-based) — used as row keys
  const allSlotIndices = [...new Set(timeslots.map((s) => s.slot_index))].sort((a, b) => a - b);

  return { activeDays, slotsByDay, allSlotIndices };
}

// ─── Entry Card ───────────────────────────────────────────────────────────────
const EntryCard: React.FC<{
  entry: TimetableEntry;
  isDragging?: boolean;
  readOnly: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  highlighted?: boolean;
}> = ({ entry, isDragging, readOnly, onClick, onDragStart, highlighted }) => (
  <motion.div
    layout
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: isDragging ? 0.4 : 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    className={clsx(
      "rounded-lg border px-2 py-1.5 cursor-pointer select-none text-xs",
      "transition-shadow hover:shadow-md",
      TYPE_STYLES[entry.lecture_type],
      entry.is_locked && "opacity-70 cursor-not-allowed",
      highlighted && "ring-2 ring-yellow-400",
      !readOnly && !entry.is_locked && "cursor-grab active:cursor-grabbing",
    )}
    draggable={!readOnly && !entry.is_locked}
    onDragStart={(e: any) => {
      if (!readOnly && !entry.is_locked) {
        onDragStart(e);
      }
    }}
    onClick={onClick}
  >
    <div className="flex items-center justify-between gap-1 mb-1">
      <span className={clsx("text-[10px] font-bold px-1.5 py-0.5 rounded-full", TYPE_BADGE[entry.lecture_type])}>
        {TYPE_LABEL[entry.lecture_type]}
      </span>
      {entry.is_locked && (
        <svg className="w-3 h-3 opacity-50" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
        </svg>
      )}
    </div>
    <p className="font-semibold leading-tight truncate">{entry.subject_code ?? entry.subject_name}</p>
    {entry.teacher_name && (
      <p className="text-[10px] opacity-70 truncate mt-0.5">{entry.teacher_name}</p>
    )}
    {entry.department_name && (
      <p className="text-[10px] opacity-70 truncate">Dept: {entry.department_name}</p>
    )}
    {entry.section_name && (
      <p className="text-[10px] opacity-70 truncate">Section: {entry.section_name}</p>
    )}
    {entry.batch_name && (
      <p className="text-[10px] opacity-70 truncate">Batch: {entry.batch_name}</p>
    )}
    {(entry.classroom_room_number || entry.classroom_name) && (
      <p className="text-[10px] opacity-60 truncate">Room: {entry.classroom_room_number ?? entry.classroom_name}{entry.classroom_name && entry.classroom_room_number ? ` — ${entry.classroom_name}` : ""}</p>
    )}
  </motion.div>
);

// ─── Main Grid ────────────────────────────────────────────────────────────────
export const TimetableGrid: React.FC<TimetableGridProps> = ({
  entries,
  timeslots,
  readOnly = false,
  onMoveEntry,
  onEntryClick,
  showBatchLabel = true,
  highlightBatchId,
}) => {
  const [draggingId, setDraggingId]   = useState<string | null>(null);
  const [dropTarget, setDropTarget]   = useState<string | null>(null);
  const [moving, setMoving]           = useState(false);
  const dragEntryRef = useRef<TimetableEntry | null>(null);

  const { activeDays, slotsByDay, allSlotIndices } = buildGrid(timeslots);

  // Map: timeslot_id → entries[]
  const entryMap = new Map<string, TimetableEntry[]>();
  entries.forEach((e) => {
    if (!entryMap.has(e.timeslot_id)) entryMap.set(e.timeslot_id, []);
    entryMap.get(e.timeslot_id)!.push(e);
  });

  // Map: slotIndex_day → timeslot
  const slotLookup = new Map<string, Timeslot>();
  timeslots.forEach((s) => slotLookup.set(`${s.slot_index}__${s.day_of_week}`, s));

  const handleDragStart = useCallback((e: React.DragEvent, entry: TimetableEntry) => {
    dragEntryRef.current = entry;
    setDraggingId(entry.id);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, slotId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(slotId);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, slotId: string) => {
    e.preventDefault();
    const entry = dragEntryRef.current;
    if (!entry || entry.timeslot_id === slotId || !onMoveEntry) return;
    setMoving(true);
    try {
      await onMoveEntry(entry.id, slotId);
    } finally {
      setMoving(false);
      setDraggingId(null);
      setDropTarget(null);
      dragEntryRef.current = null;
    }
  }, [onMoveEntry]);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTarget(null);
    dragEntryRef.current = null;
  }, []);

  if (!activeDays.length || !allSlotIndices.length) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
        No timetable data available.
      </div>
    );
  }

  return (
    <div className="relative overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-card">
      {moving && (
        <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 z-50 flex items-center justify-center rounded-xl">
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-4 py-2 rounded-lg shadow-lg">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
            <span className="text-sm font-medium">Moving lecture…</span>
          </div>
        </div>
      )}

      <table className="w-full border-collapse min-w-[700px]">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/60">
            {/* Time column */}
            <th className="w-24 px-3 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-50 dark:bg-slate-800/60 z-10">
              Slot
            </th>
            {activeDays.map((day) => (
              <th
                key={day}
                className="px-3 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 border-b border-l border-slate-200 dark:border-slate-700 min-w-[140px]"
              >
                {DAY_LABELS[day]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allSlotIndices.map((idx) => {
            // Use Monday's slot as reference for time label; fall back to first day
            const refSlot =
              slotLookup.get(`${idx}__monday`) ??
              slotLookup.get(`${idx}__${activeDays[0]}`);
            const isBreak = refSlot?.is_break;
            const isLunch = refSlot?.is_lunch;

            return (
              <tr
                key={idx}
                className={clsx(
                  "border-b border-slate-100 dark:border-slate-800",
                  (isBreak || isLunch) && "bg-amber-50/60 dark:bg-amber-900/10",
                )}
              >
                {/* Time label */}
                <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap sticky left-0 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 z-10">
                  {refSlot ? (
                    <div>
                      <div className="font-medium">{refSlot.start_time}</div>
                      <div className="text-slate-400 text-[10px]">{refSlot.end_time}</div>
                      {isBreak && <span className="text-amber-600 text-[10px] font-medium">Break</span>}
                      {isLunch && <span className="text-orange-600 text-[10px] font-medium">Lunch</span>}
                    </div>
                  ) : `Slot ${idx}`}
                </td>

                {activeDays.map((day) => {
                  const slot = slotLookup.get(`${idx}__${day}`);
                  const cellEntries = slot ? (entryMap.get(slot.id) ?? []) : [];
                  const isDropTarget = slot && dropTarget === slot.id;

                  return (
                    <td
                      key={day}
                      onDragOver={slot && !isBreak && !isLunch ? (e) => handleDragOver(e, slot.id) : undefined}
                      onDrop={slot && !isBreak && !isLunch ? (e) => handleDrop(e, slot.id) : undefined}
                      onDragLeave={() => setDropTarget(null)}
                      className={clsx(
                        "px-1.5 py-1.5 border-l border-slate-100 dark:border-slate-800 align-top min-h-[60px]",
                        (isBreak || isLunch) && "opacity-50",
                        isDropTarget && "bg-blue-50 dark:bg-blue-900/20 ring-2 ring-inset ring-blue-400",
                        !slot && "bg-slate-50/30 dark:bg-slate-800/10",
                      )}
                    >
                      <AnimatePresence>
                        <div className="flex flex-col gap-1">
                          {cellEntries
                            .filter((e) => !e.is_lab_continuation) // show first lab slot only
                            .map((entry) => (
                              <EntryCard
                                key={entry.id}
                                entry={entry}
                                isDragging={draggingId === entry.id}
                                readOnly={readOnly}
                                highlighted={!!highlightBatchId && entry.batch_id === highlightBatchId}
                                onClick={() => onEntryClick?.(entry)}
                                onDragStart={(e) => handleDragStart(e, entry)}
                              />
                            ))}
                        </div>
                      </AnimatePresence>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
        {(Object.entries(TYPE_BADGE) as [LectureType, string][]).map(([type, cls]) => (
          <span key={type} className="flex items-center gap-1.5">
            <span className={clsx("w-2 h-2 rounded-full", cls)} />
            <span className="capitalize">{type}</span>
          </span>
        ))}
        {!readOnly && <span className="ml-auto opacity-60">Drag cards to move lectures</span>}
      </div>
    </div>
  );
};
