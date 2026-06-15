import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { adminApi, timetableApi } from "@/api";
import { useSocket } from "@/hooks/useSocket";
import { TimetableGrid } from "@/components/shared/TimetableGrid";
import { StatCard, Card, Badge, PageHeader, Button, Select, Spinner, EmptyState, Table } from "@/components/ui";
import type { TimetableEntry, Timeslot, TimetableVersion, WsPayload } from "@/types";

// ─── Icons ────────────────────────────────────────────────────────────────────
const I = ({ d }: { d: string }) => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

export const AdminDashboard: React.FC = () => {
  const qc = useQueryClient();
  const { on } = useSocket();
  const [selectedDeptId,   setSelectedDeptId]   = useState("");
  const [selectedYearId,   setSelectedYearId]   = useState("");
  const [selectedVersion,  setSelectedVersion]  = useState<TimetableVersion | null>(null);
  const [wsStatus, setWsStatus] = useState<"live" | "idle">("idle");

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: () => adminApi.getDepartments().then((r) => r.data),
  });

  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");

  const { data: academicYears = [] } = useQuery({
    queryKey: ["academic-years", selectedDeptId],
    queryFn: () => adminApi.getAcademicYears(selectedDeptId).then((r) => r.data),
    enabled: !!selectedDeptId,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["sections", selectedYearId],
    queryFn: () => adminApi.getSections(selectedYearId).then((r) => r.data),
    enabled: !!selectedYearId,
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["batches", selectedSectionId],
    queryFn: () => adminApi.getBatches(selectedSectionId).then((r) => r.data),
    enabled: !!selectedSectionId,
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers"],
    queryFn: () => adminApi.getTeachers().then((r) => r.data),
  });

  const { data: students = [] } = useQuery({
    queryKey: ["students"],
    queryFn: () => adminApi.getStudents().then((r) => r.data),
  });

  const { data: classrooms = [] } = useQuery({
    queryKey: ["classrooms"],
    queryFn: () => adminApi.getClassrooms().then((r) => r.data),
  });

  const { data: versions = [] } = useQuery({
    queryKey: ["versions", selectedDeptId, selectedYearId],
    queryFn: () => timetableApi.listVersions(selectedDeptId, selectedYearId).then((r) => r.data),
    enabled: !!selectedDeptId && !!selectedYearId,
  });

  const { data: timeslots = [], isLoading: tsLoading } = useQuery<Timeslot[]>({
    queryKey: ["timeslots", selectedVersion?.id],
    queryFn: () => timetableApi.getTimeslots(selectedVersion!.id).then((r) => r.data),
    enabled: !!selectedVersion,
  });

  const { data: entries = [], isLoading: entriesLoading, refetch: refetchEntries } = useQuery<TimetableEntry[]>({
    queryKey: ["entries-all", selectedVersion?.id],
    queryFn: () => timetableApi.getAllEntries(selectedVersion!.id).then((r) => r.data),
    enabled: !!selectedVersion,
  });

  // ── WebSocket: refresh on timetable update ─────────────────────────────────
  useEffect(() => {
    const unsub = on("TIMETABLE_UPDATED", (data: WsPayload) => {
      setWsStatus("live");
      setTimeout(() => setWsStatus("idle"), 3000);
      if (data.version_id === selectedVersion?.id) {
        refetchEntries();
      }
      qc.invalidateQueries({ queryKey: ["versions"] });
    });
    return unsub;
  }, [on, selectedVersion, refetchEntries, qc]);

  // ── Defaults ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (departments.length && !selectedDeptId) setSelectedDeptId(departments[0].id);
  }, [departments]);

  useEffect(() => {
    if (academicYears.length && !selectedYearId) setSelectedYearId(academicYears[0].id);
  }, [academicYears]);

  useEffect(() => {
    if (sections.length && !selectedSectionId) setSelectedSectionId(sections[0].id);
  }, [sections]);

  useEffect(() => {
    if (batches.length && !selectedBatchId) setSelectedBatchId(batches[0].id);
  }, [batches]);

  useEffect(() => {
    if (versions.length && !selectedVersion) {
      const published = versions.find((v: TimetableVersion) => v.status === "published");
      setSelectedVersion(published ?? versions[0]);
    }
  }, [versions]);

  // ── Move handler ───────────────────────────────────────────────────────────
  const handleMove = async (entryId: string, newTimeslotId: string) => {
    await timetableApi.moveEntry({ entry_id: entryId, new_timeslot_id: newTimeslotId, new_classroom_id: "" });
    refetchEntries();
  };

  const publishedCount    = versions.filter((v: TimetableVersion) => v.status === "published").length;
  const occupiedClassrooms = new Set(entries.map((e: TimetableEntry) => e.classroom_id)).size;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timetable Dashboard"
        subtitle="Centralized view of all scheduling activity"
        actions={
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full font-medium
              ${wsStatus === "live" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === "live" ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
              {wsStatus === "live" ? "Live update" : "Connected"}
            </span>
          </div>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Departments"
          value={departments.length}
          color="blue"
          icon={<I d="M4 6h16M4 12h16M4 18h16" />}
        />
        <StatCard
          label="Teachers"
          value={teachers.length}
          color="blue"
          icon={<I d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />}
        />
        <StatCard
          label="Students"
          value={students.length}
          color="green"
          icon={<I d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />}
        />
        <StatCard
          label="Classrooms"
          value={classrooms.length}
          color="purple"
          icon={<I d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />}
        />
        <StatCard
          label="Active Versions"
          value={publishedCount}
          color="orange"
          icon={<I d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />}
        />
      </div>

      {/* Department list */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Departments</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">View all created departments without leaving the dashboard.</p>
          </div>
        </div>
        <Table
          columns={[
            { key: "code", header: "Code" },
            { key: "name", header: "Name" },
            { key: "lab_slot_preference", header: "Lab preference" },
            { key: "is_active", header: "Status", render: (row) => (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${row.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {row.is_active ? "Active" : "Inactive"}
                </span>
              )
            },
            { key: "created_at", header: "Created" },
          ]}
          data={departments}
          loading={false}
        />
      </Card>

      {/* Timetable viewer */}
      <Card padding={false}>
        {/* Filters bar */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
            <I d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            Timetable Grid
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Select
              options={departments.map((d: any) => ({ value: d.id, label: d.code }))}
              value={selectedDeptId}
              onChange={(e) => {
                setSelectedDeptId(e.target.value);
                setSelectedYearId("");
                setSelectedSectionId("");
                setSelectedBatchId("");
                setSelectedVersion(null);
              }}
              className="text-xs py-1.5 w-28"
              placeholder="Dept"
            />
            <Select
              options={academicYears.map((y: any) => ({ value: y.id, label: y.year_name }))}
              value={selectedYearId}
              onChange={(e) => {
                setSelectedYearId(e.target.value);
                setSelectedSectionId("");
                setSelectedBatchId("");
                setSelectedVersion(null);
              }}
              className="text-xs py-1.5 w-20"
              placeholder="Year"
              disabled={!selectedDeptId}
            />
            <Select
              options={sections.map((s: any) => ({ value: s.id, label: s.name }))}
              value={selectedSectionId}
              onChange={(e) => {
                setSelectedSectionId(e.target.value);
                setSelectedBatchId("");
                setSelectedVersion(null);
              }}
              className="text-xs py-1.5 w-28"
              placeholder="Section"
              disabled={!selectedYearId}
            />
            <Select
              options={batches.map((b: any) => ({ value: b.id, label: b.name }))}
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              className="text-xs py-1.5 w-24"
              placeholder="Batch"
              disabled={!selectedSectionId}
            />
            <Select
              options={versions.map((v: TimetableVersion) => ({ value: v.id, label: `${v.name} (${v.status})` }))}
              value={selectedVersion?.id ?? ""}
              onChange={(e) => setSelectedVersion(versions.find((v: TimetableVersion) => v.id === e.target.value) ?? null)}
              className="text-xs py-1.5 w-48"
              placeholder="Select version"
              disabled={!versions.length}
            />
            {selectedVersion && (
              <Badge variant={selectedVersion.status === "published" ? "green" : selectedVersion.status === "draft" ? "yellow" : "slate"}>
                {selectedVersion.status}
              </Badge>
            )}
          </div>
        </div>

        <div className="p-4">
          {!selectedVersion ? (
            <EmptyState
              title="No timetable version selected"
              description="Select a department, academic year, and version above to view the timetable."
            />
          ) : tsLoading || entriesLoading ? (
            <div className="flex items-center justify-center py-20"><Spinner size="lg" className="text-blue-500" /></div>
          ) : (
            <TimetableGrid
              entries={entries.filter((entry) => {
                if (selectedBatchId) {
                  return entry.section_id === selectedSectionId && (entry.batch_id === selectedBatchId || entry.batch_id === null);
                }
                if (selectedSectionId) {
                  return entry.section_id === selectedSectionId;
                }
                return true;
              })}
              timeslots={timeslots.filter((s) => !s.is_break && !s.is_lunch)}
              onMoveEntry={handleMove}
              onEntryClick={(e) => console.log("Entry clicked:", e)}
            />
          )}
        </div>
      </Card>

      {/* Version list */}
      {versions.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Timetable Versions</h3>
          <div className="space-y-2">
            {versions.map((v: TimetableVersion) => (
              <motion.div
                key={v.id}
                layout
                className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                onClick={() => setSelectedVersion(v)}
              >
                <div className="flex items-center gap-3">
                  <Badge variant={v.status === "published" ? "green" : v.status === "draft" ? "yellow" : "slate"}>
                    {v.status}
                  </Badge>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{v.name}</span>
                  {v.solver_score != null && (
                    <span className="text-xs text-slate-400">Score: {v.solver_score.toFixed(1)}</span>
                  )}
                </div>
                <span className="text-xs text-slate-400">{new Date(v.created_at).toLocaleDateString()}</span>
              </motion.div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
