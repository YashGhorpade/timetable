import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, timetableApi } from "@/api";
import { Card, PageHeader, Button, Select, Input, Badge, Spinner, EmptyState } from "@/components/ui";
import { Modal, Toast } from "@/components/ui";
import { TimetableGrid } from "@/components/shared/TimetableGrid";
import type { TimetableVersion, TimetableEntry, Timeslot } from "@/types";
import { clsx } from "clsx";

export const AdminTimetablePage: React.FC = () => {
  const qc = useQueryClient();
  const [deptId,    setDeptId]    = useState("");
  const [yearId,    setYearId]    = useState("");
  const [sectionId, setSectionId] = useState("");
  const [batchId,   setBatchId]   = useState("");
  const [versionId, setVersionId] = useState("");
  const [vName,     setVName]     = useState("Version 1");
  const [nCandidates, setNCandidates] = useState(3);
  const [genLog,    setGenLog]    = useState<string[]>([]);

  const { data: departments = [] } = useQuery({ queryKey: ["departments"], queryFn: () => adminApi.getDepartments().then(r => r.data) });
  const { data: years = [] }       = useQuery({ queryKey: ["years", deptId], queryFn: () => adminApi.getAcademicYears(deptId).then(r => r.data), enabled: !!deptId });
  const { data: sections = [] }    = useQuery({ queryKey: ["sections", yearId], queryFn: () => adminApi.getSections(yearId).then(r => r.data), enabled: !!yearId });
  const { data: batches = [] }     = useQuery({ queryKey: ["batches", sectionId], queryFn: () => adminApi.getBatches(sectionId).then(r => r.data), enabled: !!sectionId });
  const { data: versions = [] }    = useQuery({ queryKey: ["versions", deptId, yearId], queryFn: () => timetableApi.listVersions(deptId, yearId).then(r => r.data), enabled: !!deptId && !!yearId });
  const { data: timeslots = [] }   = useQuery<Timeslot[]>({ queryKey: ["timeslots", versionId], queryFn: () => timetableApi.getTimeslots(versionId).then(r => r.data), enabled: !!versionId });
  const { data: entries = [], isLoading: entriesLoading, refetch: refetchEntries } = useQuery<TimetableEntry[]>({ queryKey: ["entries-all", versionId], queryFn: () => timetableApi.getAllEntries(versionId).then(r => r.data), enabled: !!versionId });
  const { data: classrooms = [] } = useQuery({ queryKey: ["classrooms"], queryFn: () => adminApi.getClassrooms().then(r => r.data) });

  const generateMutation = useMutation({
    mutationFn: () => timetableApi.generate({
      department_id: deptId,
      academic_year_id: yearId,
      version_name: vName,
      num_candidates: nCandidates,
      section_id: sectionId || undefined,
      batch_id: batchId || undefined,
    }),
    onMutate: () => setGenLog(["🔧 Initializing OR-Tools CP-SAT solver...", "📐 Loading constraints and lecture frequencies..."]),
    onSuccess: (res) => {
      const v: TimetableVersion = res.data;
      setGenLog(l => [...l, `✅ Generated ${nCandidates} candidate(s)`, `🧠 XGBoost scored candidates`, `🏆 Best timetable selected (score: ${v.solver_score?.toFixed(1) ?? "N/A"})`, `📋 Draft version created: "${v.name}"`]);
      qc.invalidateQueries({ queryKey: ["versions"] });
      setVersionId(v.id);
    },
    onError: (e: any) => setGenLog(l => [...l, `❌ Error: ${e.response?.data?.detail ?? e.message}`]),
  });

  const publishMutation = useMutation({
    mutationFn: () => timetableApi.publishVersion(versionId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["versions"] }); },
  });

  const moveMutation = useMutation({
    mutationFn: (payload: any) => timetableApi.moveEntry(payload),
    onSuccess: () => refetchEntries(),
  });

  const deleteMutation = useMutation({ mutationFn: (id: string) => timetableApi.deleteEntry(id) });
  const saveMutation = useMutation({ mutationFn: (versionId: string) => timetableApi.saveVersion(versionId) });
  const deleteVersionMutation = useMutation({ mutationFn: (versionId: string) => timetableApi.deleteVersion(versionId) });

  const selectedVersion = versions.find((v: TimetableVersion) => v.id === versionId);

  React.useEffect(() => {
    if (sections.length && !sectionId) {
      setSectionId(sections[0].id);
    }
  }, [sections]);

  React.useEffect(() => {
    if (batches.length && !batchId) {
      setBatchId(batches[0].id);
    }
  }, [batches]);

  // Entry modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TimetableEntry | null>(null);
  const [editedTimeslot, setEditedTimeslot] = useState<string | null>(null);
  const [editedClassroom, setEditedClassroom] = useState<string | null>(null);
  const [toast, setToast] = useState<{msg:string,type?:string} | null>(null);

  const onEntryClick = (entry: TimetableEntry) => {
    setSelectedEntry(entry);
    setEditedTimeslot(entry.timeslot_id);
    setEditedClassroom(entry.classroom_id);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Timetable Management" subtitle="Generate, review, and publish AI-optimized timetables" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Generation panel */}
        <Card className="lg:col-span-1">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-lg flex items-center justify-center text-xs font-bold">1</span>
            Configure & Generate
          </h3>

          <div className="space-y-3">
            <Select label="Department" options={departments.map((d: any) => ({ value: d.id, label: `${d.code} – ${d.name}` }))}
              value={deptId} onChange={e => { setDeptId(e.target.value); setYearId(""); setSectionId(""); setBatchId(""); setVersionId(""); }} placeholder="Select department" />

            <Select label="Academic Year" options={years.map((y: any) => ({ value: y.id, label: y.year_name }))}
              value={yearId} onChange={e => { setYearId(e.target.value); setSectionId(""); setBatchId(""); setVersionId(""); }} placeholder="Select year" disabled={!deptId} />

            <Select label="Section" options={sections.map((s: any) => ({ value: s.id, label: s.name }))}
              value={sectionId} onChange={e => { setSectionId(e.target.value); setBatchId(""); setVersionId(""); }} placeholder="Select section" disabled={!yearId} />

            <Select label="Batch" options={batches.map((b: any) => ({ value: b.id, label: b.name }))}
              value={batchId} onChange={e => setBatchId(e.target.value)} placeholder="Select batch" disabled={!sectionId} />

            <Input label="Version Name" value={vName} onChange={e => setVName(e.target.value)} placeholder="e.g. Week 1 Draft" />

            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1.5">
                Candidates to generate ({nCandidates})
              </label>
              <input type="range" min={1} max={10} value={nCandidates} onChange={e => setNCandidates(Number(e.target.value))}
                className="w-full accent-blue-600" />
              <div className="flex justify-between text-xs text-slate-400 mt-1"><span>1 (fast)</span><span>10 (best quality)</span></div>
            </div>

            <Button
              className="w-full"
              loading={generateMutation.isPending}
              disabled={!deptId || !yearId}
              onClick={() => generateMutation.mutate()}
              icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>}
            >
              Generate Timetable
            </Button>
          </div>

          {/* Generation log */}
          {genLog.length > 0 && (
            <div className="mt-4 bg-slate-900 dark:bg-slate-950 rounded-xl p-3 font-mono text-xs space-y-1 max-h-48 overflow-y-auto">
              {genLog.map((line, i) => (
                <div key={i} className={clsx("text-slate-300", line.startsWith("❌") && "text-red-400", line.startsWith("✅") || line.startsWith("🏆") ? "text-emerald-400" : "")}>
                  {line}
                </div>
              ))}
              {generateMutation.isPending && <div className="flex items-center gap-2 text-blue-400"><Spinner size="sm" /><span>Solving…</span></div>}
            </div>
          )}
        </Card>

        {/* Version selector + actions */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <span className="w-6 h-6 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-lg flex items-center justify-center text-xs font-bold">2</span>
              Review & Publish
            </h3>
            {selectedVersion && (
              <div className="flex items-center gap-2">
                <Badge variant={selectedVersion.status === "published" ? "green" : selectedVersion.status === "draft" ? "yellow" : "slate"}>
                  {selectedVersion.status}
                </Badge>
                {selectedVersion.solver_score != null && (
                  <Badge variant="blue">Score: {selectedVersion.solver_score.toFixed(1)}</Badge>
                )}
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="danger" onClick={async () => {
                    if (!selectedVersion) return;
                    if (!window.confirm(`Delete version '${selectedVersion.name}'? This cannot be undone.`)) return;
                    try {
                      await deleteVersionMutation.mutateAsync(selectedVersion.id);
                      setToast({ msg: "Version deleted", type: "success" });
                      qc.invalidateQueries({ queryKey: ["versions"] });
                      setVersionId("");
                    } catch (e: any) {
                      setToast({ msg: e.response?.data?.detail ?? e.message, type: "error" });
                    }
                  }}>Delete</Button>
                  {selectedVersion.status === "draft" && (
                    <Button size="sm" variant="success" loading={publishMutation.isPending} onClick={() => publishMutation.mutate()}>
                      Publish
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {versions.length === 0 ? (
            <EmptyState title="No versions yet" description="Generate your first timetable using the panel on the left." />
          ) : (
            <div className="space-y-2">
              {versions.map((v: TimetableVersion) => (
                <button
                  key={v.id}
                  onClick={() => setVersionId(v.id)}
                  className={clsx(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all text-sm",
                    versionId === v.id
                      ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20"
                      : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Badge variant={v.status === "published" ? "green" : v.status === "draft" ? "yellow" : "slate"}>{v.status}</Badge>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{v.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    {v.solver_score != null && <span>⭐ {v.solver_score.toFixed(1)}</span>}
                    <span>{new Date(v.created_at).toLocaleDateString()}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Timetable grid */}
      {versionId && (
        <Card padding={false}>
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {selectedVersion?.name ?? "Timetable"} — All Entries
            </h3>
            <span className="text-xs text-slate-400">{entries.length} entries</span>
          </div>
          <div className="p-4">
            {entries.length === 0 ? (
              <EmptyState title="No entries" description="This version has no timetable entries yet." />
            ) : (
              <TimetableGrid
                entries={entries}
                timeslots={timeslots.filter(s => !s.is_break && !s.is_lunch)}
                onMoveEntry={async (entryId, newSlotId) => {
                  const entry = entries.find((e: TimetableEntry) => e.id === entryId);
                  if (!entry) return;
                  await moveMutation.mutateAsync({ entry_id: entryId, new_timeslot_id: newSlotId, new_classroom_id: entry.classroom_id });
                }}
                readOnly={selectedVersion?.status === "published"}
                onEntryClick={onEntryClick}
              />
            )}
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Edit Timetable Entry" footer={(
        <div className="flex items-center justify-end gap-2">
          <Button variant="danger" onClick={async () => {
            if (!selectedEntry) return;
            try {
              await deleteMutation.mutateAsync(selectedEntry.id);
              setToast({ msg: "Entry deleted", type: "success" });
              setModalOpen(false);
              refetchEntries();
            } catch (e: any) {
              setToast({ msg: e.response?.data?.detail ?? e.message, type: "error" });
            }
          }}>Delete</Button>

          <Button variant="secondary" onClick={async () => {
            if (!selectedVersion) return;
            try {
              await saveMutation.mutateAsync(selectedVersion.id);
              setToast({ msg: "Draft saved", type: "success" });
            } catch (e: any) {
              setToast({ msg: e.response?.data?.detail ?? e.message, type: "error" });
            }
          }}>Save Draft</Button>

          <Button variant="primary" onClick={async () => {
            if (!selectedEntry || !editedTimeslot || !editedClassroom) return;
            try {
              await moveMutation.mutateAsync({ entry_id: selectedEntry.id, new_timeslot_id: editedTimeslot, new_classroom_id: editedClassroom });
              setToast({ msg: "Entry updated", type: "success" });
              setModalOpen(false);
              refetchEntries();
            } catch (e: any) {
              setToast({ msg: e.response?.data?.detail ?? e.message, type: "error" });
            }
          }}>Apply</Button>
        </div>
      )}>
        {selectedEntry && (
          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium">Subject</div>
              <div className="text-slate-700">{selectedEntry.subject_name} ({selectedEntry.subject_code})</div>
            </div>
            <div>
              <label className="text-sm font-medium">Timeslot</label>
              <Select options={timeslots.map(ts => ({ value: ts.id, label: `${ts.day_of_week} ${ts.start_time}-${ts.end_time}` }))}
                value={editedTimeslot ?? ""} onChange={e => setEditedTimeslot(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Classroom</label>
              <Select options={(classrooms as any[]).map(c => ({ value: c.id, label: `${c.room_number} — ${c.name}` }))}
                value={editedClassroom ?? ""} onChange={e => setEditedClassroom(e.target.value)} />
            </div>
            <div>
              <div className="text-sm font-medium">Teacher</div>
              <div className="text-slate-700">{selectedEntry.teacher_name}</div>
            </div>
          </div>
        )}
      </Modal>

      {toast && <Toast message={toast.msg} type={toast.type as any} onDismiss={() => setToast(null)} />}
    </div>
  );
};
