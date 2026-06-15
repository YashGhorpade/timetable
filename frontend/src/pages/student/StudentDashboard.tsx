import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { timetableApi, adminApi } from "@/api";
import { useAuthStore } from "@/store/authStore";
import { useSocket } from "@/hooks/useSocket";
import { TimetableGrid } from "@/components/shared/TimetableGrid";
import { Card, PageHeader, Badge, Spinner, EmptyState, Modal } from "@/components/ui";
import type { TimetableEntry, Timeslot, TimetableVersion, WsPayload } from "@/types";

export const StudentDashboard: React.FC = () => {
  const { profile, name } = useAuthStore();
  const { on } = useSocket();
  const sectionId = profile?.section_id ?? "";
  const batchId   = profile?.batch_id   ?? "";
  const deptId    = profile?.department_id ?? "";

  const [selectedVersion, setSelectedVersion] = useState<TimetableVersion | null>(null);
  const [selectedEntry,   setSelectedEntry]   = useState<TimetableEntry | null>(null);
  const [liveFlash,       setLiveFlash]       = useState(false);
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
    queryKey: ["student-tt", selectedVersion?.id],
    queryFn: () => timetableApi.getStudentTimetable(selectedVersion!.id).then(r => r.data),
    enabled: !!selectedVersion,
  });

  useEffect(() => {
    if (versions.length && !selectedVersion) {
      setSelectedVersion(versions.find(v => v.status === "published") ?? versions[0]);
    }
  }, [versions]);

  useEffect(() => {
    const unsub = on("TIMETABLE_UPDATED", (_: WsPayload) => {
      setLiveFlash(true);
      setTimeout(() => setLiveFlash(false), 3000);
      refetch();
    });
    return unsub;
  }, [on, refetch]);

  const theoryCount   = entries.filter(e => e.lecture_type === "theory").length;
  const tutorialCount = entries.filter(e => e.lecture_type === "tutorial").length;
  const labCount      = entries.filter(e => e.lecture_type === "lab" && !e.is_lab_continuation).length;
  const totalHours    = theoryCount + tutorialCount + labCount * 2;

  const batchName = entries.find(e => e.batch_name)?.batch_name ?? batchId.slice(-2).toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 space-y-6 font-sans">
      <PageHeader
        title={`My Timetable`}
        subtitle={`${name ?? "Student"} · Batch ${batchName}`}
        actions={
          liveFlash && (
            <span className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live update received
            </span>
          )
        }
      />

      {/* Personalization info */}
      <Card>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Showing:</span>
            <Badge variant="blue">All Theory Lectures</Badge>
            <span className="text-slate-400">+</span>
            <Badge variant="purple">Batch {batchName} only</Badge>
          </div>
          <div className="ml-auto flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
            <span><span className="font-semibold text-slate-700 dark:text-slate-300">{theoryCount}</span> Theory</span>
            <span><span className="font-semibold text-slate-700 dark:text-slate-300">{tutorialCount}</span> Tutorials</span>
            <span><span className="font-semibold text-slate-700 dark:text-slate-300">{labCount}</span> Labs</span>
            <span className="text-blue-600 font-medium">{totalHours}h / week</span>
          </div>
        </div>
      </Card>

      {/* Timetable */}
      <Card padding={false}>
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Weekly Schedule</h3>
        </div>
        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Spinner size="lg" className="text-blue-500" /></div>
          ) : entries.length === 0 ? (
            <EmptyState title="No lectures scheduled" description="Your personalized timetable will appear here once published." />
          ) : (
            <TimetableGrid
              entries={entries}
              timeslots={timeslots.filter(s => !s.is_break && !s.is_lunch)}
              readOnly
              highlightBatchId={batchId}
              onEntryClick={setSelectedEntry}
            />
          )}
        </div>
      </Card>

      {/* Entry detail modal */}
      <Modal open={!!selectedEntry} onClose={() => setSelectedEntry(null)} title="Lecture Details" size="sm">
        {selectedEntry && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={selectedEntry.lecture_type === "theory" ? "blue" : selectedEntry.lecture_type === "tutorial" ? "green" : "purple"}>
                {selectedEntry.lecture_type.toUpperCase()}
              </Badge>
              {selectedEntry.batch_name && <Badge variant="slate">Batch {selectedEntry.batch_name}</Badge>}
            </div>
            <div className="space-y-2 text-slate-600 dark:text-slate-400">
              <div className="flex justify-between">
                <span>Subject</span>
                <span className="font-medium text-slate-900 dark:text-white">{selectedEntry.subject_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Teacher</span>
                <span className="font-medium text-slate-900 dark:text-white">{selectedEntry.teacher_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Room</span>
                <span className="font-medium text-slate-900 dark:text-white">{selectedEntry.classroom_room_number} — {selectedEntry.classroom_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Time</span>
                <span className="font-medium text-slate-900 dark:text-white">
                  {selectedEntry.timeslot?.label ?? `${selectedEntry.timeslot?.start_time} – ${selectedEntry.timeslot?.end_time}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Day</span>
                <span className="font-medium text-slate-900 dark:text-white capitalize">{selectedEntry.timeslot?.day_of_week}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
