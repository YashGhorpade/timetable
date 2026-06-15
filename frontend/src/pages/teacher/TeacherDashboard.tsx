import React, { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { timetableApi, adminApi } from "@/api";
import { useAuthStore } from "@/store/authStore";
import { useSocket } from "@/hooks/useSocket";
import { TimetableGrid } from "@/components/shared/TimetableGrid";
import { Card, PageHeader, Button, Select, Badge, Spinner, EmptyState, Modal, Input } from "@/components/ui";
import type { TimetableEntry, Timeslot, TimetableVersion, ClassroomAvailabilityResult, DayOfWeek, WsPayload } from "@/types";

export const TeacherDashboard: React.FC = () => {
  const { profile, name } = useAuthStore();
  const { on } = useSocket();
  const teacherId = profile?.teacher_id ?? "";
  const deptId    = profile?.department_id ?? "";

  const [selectedVersion, setSelectedVersion] = useState<TimetableVersion | null>(null);
  const [availQuery, setAvailQuery]   = useState({ day: "monday" as DayOfWeek, slot: 0, roomType: "" });
  const [showAvail,  setShowAvail]    = useState(false);
  const [liveFlash,  setLiveFlash]    = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: years = [] } = useQuery({
    queryKey: ["years", deptId],
    queryFn: () => adminApi.getAcademicYears(deptId).then(r => r.data),
    enabled: !!deptId,
  });

  const { data: versions = [] } = useQuery<TimetableVersion[]>({
    queryKey: ["versions", deptId, years[0]?.id],
    queryFn: () => timetableApi.listVersions(deptId, years[0].id).then(r => r.data),
    enabled: !!deptId && years.length > 0,
  });

  const { data: timeslots = [] } = useQuery<Timeslot[]>({
    queryKey: ["timeslots", selectedVersion?.id],
    queryFn: () => timetableApi.getTimeslots(selectedVersion!.id).then(r => r.data),
    enabled: !!selectedVersion,
  });

  const { data: entries = [], refetch, isLoading } = useQuery<TimetableEntry[]>({
    queryKey: ["my-tt", selectedVersion?.id],
    queryFn: () => timetableApi.getMyTimetable(selectedVersion!.id).then(r => r.data),
    enabled: !!selectedVersion,
  });

  const { data: availResults = [], isFetching: availLoading } = useQuery<ClassroomAvailabilityResult[]>({
    queryKey: ["avail", selectedVersion?.id, availQuery],
    queryFn: () => timetableApi.checkAvailability({
      version_id: selectedVersion!.id,
      day_of_week: availQuery.day,
      slot_index: availQuery.slot,
      room_type: availQuery.roomType || undefined,
    }).then(r => r.data),
    enabled: showAvail && !!selectedVersion,
  });

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = on("TIMETABLE_UPDATED", (data: WsPayload) => {
      if (data.teacher_id === teacherId || !data.teacher_id) {
        setLiveFlash(true);
        setTimeout(() => setLiveFlash(false), 2000);
        refetch();
      }
    });
    return unsub;
  }, [on, teacherId, refetch]);

  // ── Auto-select published version ──────────────────────────────────────────
  useEffect(() => {
    if (versions.length && !selectedVersion) {
      setSelectedVersion(versions.find(v => v.status === "published") ?? versions[0]);
    }
  }, [versions]);

  // ── Move handler ───────────────────────────────────────────────────────────
  const moveMutation = useMutation({
    mutationFn: (payload: any) => timetableApi.moveEntry(payload),
    onSuccess: () => refetch(),
  });

  const stats = {
    theory:   entries.filter(e => e.lecture_type === "theory").length,
    tutorial: entries.filter(e => e.lecture_type === "tutorial").length,
    lab:      entries.filter(e => e.lecture_type === "lab" && !e.is_lab_continuation).length,
  };

  const activeDays = [...new Set(entries.map(e => e.timeslot?.day_of_week).filter(Boolean))];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 space-y-6 font-sans">
      <PageHeader
        title={`Welcome, ${name ?? "Teacher"}`}
        subtitle="Your personal timetable — drag to reschedule permitted lectures"
        actions={
          <div className="flex items-center gap-2">
            {liveFlash && (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-emerald-100 text-emerald-700 font-medium animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Updated
              </span>
            )}
            <Button size="sm" variant="secondary" onClick={() => setShowAvail(true)}>
              🔍 Find Free Room
            </Button>
          </div>
        }
      />

      {/* Weekly summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Theory", value: stats.theory,   color: "bg-blue-500" },
          { label: "Tutorial", value: stats.tutorial, color: "bg-emerald-500" },
          { label: "Lab",    value: stats.lab,       color: "bg-violet-500" },
        ].map(s => (
          <Card key={s.label} className="flex items-center gap-3">
            <div className={`w-2 h-10 rounded-full ${s.color}`} />
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{s.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Version selector */}
      {versions.length > 1 && (
        <Card>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 dark:text-slate-400">Viewing:</span>
            <Select
              options={versions.map(v => ({ value: v.id, label: `${v.name} (${v.status})` }))}
              value={selectedVersion?.id ?? ""}
              onChange={e => setSelectedVersion(versions.find(v => v.id === e.target.value) ?? null)}
              className="text-xs py-1.5 w-64"
            />
            {selectedVersion && (
              <Badge variant={selectedVersion.status === "published" ? "green" : "yellow"}>
                {selectedVersion.status}
              </Badge>
            )}
          </div>
        </Card>
      )}

      {/* Timetable grid */}
      <Card padding={false}>
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">My Weekly Schedule</h3>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>{entries.length} lectures</span>
            <span>·</span>
            <span>{activeDays.length} days active</span>
          </div>
        </div>
        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Spinner size="lg" className="text-blue-500" /></div>
          ) : entries.length === 0 ? (
            <EmptyState title="No lectures scheduled" description="Your timetable will appear here once a version is published." />
          ) : (
            <TimetableGrid
              entries={entries}
              timeslots={timeslots.filter(s => !s.is_break && !s.is_lunch)}
              onMoveEntry={async (entryId, newSlotId) => {
                const entry = entries.find(e => e.id === entryId);
                if (!entry) return;
                await moveMutation.mutateAsync({
                  entry_id: entryId,
                  new_timeslot_id: newSlotId,
                  new_classroom_id: entry.classroom_id,
                });
              }}
            />
          )}
        </div>
      </Card>

      {/* Room availability modal */}
      <Modal open={showAvail} onClose={() => setShowAvail(false)} title="Find Free Classroom" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Day"
              options={["monday","tuesday","wednesday","thursday","friday","saturday"].map(d => ({ value: d, label: d.charAt(0).toUpperCase()+d.slice(1) }))}
              value={availQuery.day}
              onChange={e => setAvailQuery(q => ({ ...q, day: e.target.value as DayOfWeek }))}
            />
            <Select
              label="Slot Index"
              options={timeslots.filter(s => !s.is_break && !s.is_lunch && s.day_of_week === "monday").map(s => ({ value: String(s.slot_index), label: s.label ?? String(s.slot_index) }))}
              value={String(availQuery.slot)}
              onChange={e => setAvailQuery(q => ({ ...q, slot: Number(e.target.value) }))}
            />
            <Select
              label="Room Type"
              options={[
                { value: "", label: "Any" },
                { value: "theory_room", label: "Theory Room" },
                { value: "tutorial_room", label: "Tutorial Room" },
                { value: "laboratory", label: "Laboratory" },
              ]}
              value={availQuery.roomType}
              onChange={e => setAvailQuery(q => ({ ...q, roomType: e.target.value }))}
            />
          </div>

          {availLoading ? (
            <div className="flex justify-center py-8"><Spinner size="lg" className="text-blue-500" /></div>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {availResults.map(r => (
                <div key={r.classroom.id} className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm ${r.is_available ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20" : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 opacity-60"}`}>
                  <div>
                    <p className="font-medium text-slate-700 dark:text-slate-300">{r.classroom.room_number}</p>
                    <p className="text-xs text-slate-400">{r.classroom.building} · {r.classroom.capacity} seats</p>
                  </div>
                  <Badge variant={r.is_available ? "green" : "red"}>{r.is_available ? "Free" : "Taken"}</Badge>
                </div>
              ))}
              {availResults.length === 0 && !availLoading && (
                <p className="col-span-2 text-center text-slate-400 text-sm py-6">No rooms found for selected criteria.</p>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
