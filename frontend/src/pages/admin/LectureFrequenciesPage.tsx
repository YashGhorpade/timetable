import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api";
import { Button, Card, Input, Modal, PageHeader, Select, Table, Toast } from "@/components/ui";
import type { AcademicYear, Department, Section, Subject, LectureFrequency } from "@/types";

interface FrequencyFormValues {
  subject_id: string;
  section_id: string;
  theory_per_week: number;
  tutorial_per_week: number;
  lab_per_week: number;
  theory_duration_min: number;
  tutorial_duration_min: number;
  lab_duration_min: number;
}

const DEFAULT_FORM: FrequencyFormValues = {
  subject_id: "",
  section_id: "",
  theory_per_week: 3,
  tutorial_per_week: 0,
  lab_per_week: 0,
  theory_duration_min: 60,
  tutorial_duration_min: 60,
  lab_duration_min: 120,
};

export const LectureFrequenciesPage: React.FC = () => {
  const qc = useQueryClient();
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedFrequency, setSelectedFrequency] = useState<LectureFrequency | null>(null);
  const [formValues, setFormValues] = useState<FrequencyFormValues>(DEFAULT_FORM);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: () => adminApi.getDepartments().then((res) => res.data),
  });

  const { data: academicYears = [] } = useQuery<AcademicYear[]>({
    queryKey: ["academic-years", selectedDepartment],
    queryFn: () => adminApi.getAcademicYears(selectedDepartment).then((res) => res.data),
    enabled: !!selectedDepartment,
  });

  const { data: sections = [] } = useQuery<Section[]>({
    queryKey: ["sections", selectedYear],
    queryFn: () => adminApi.getSections(selectedYear).then((res) => res.data),
    enabled: !!selectedYear,
  });

  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ["subjects", selectedDepartment, selectedYear],
    queryFn: () => adminApi.getSubjects({ department_id: selectedDepartment || undefined, academic_year_id: selectedYear || undefined }).then((res) => res.data),
    enabled: !!selectedDepartment && !!selectedYear,
  });

  const { data: frequencies = [], isLoading } = useQuery<LectureFrequency[]>({
    queryKey: ["frequencies", selectedSubject],
    queryFn: () => adminApi.getFrequencies(selectedSubject).then((res) => res.data),
    enabled: !!selectedSubject,
  });

  const { data: modalFrequencies = [] } = useQuery<LectureFrequency[]>({
    queryKey: ["frequencies", formValues.subject_id],
    queryFn: () => adminApi.getFrequencies(formValues.subject_id).then((res) => res.data),
    enabled: !!formValues.subject_id,
  });

  const createMutation = useMutation({
    mutationFn: (payload: FrequencyFormValues) => adminApi.createFrequency(payload),
    onSuccess: () => {
      qc.invalidateQueries(["frequencies", selectedSubject]);
      setIsModalOpen(false);
      setSelectedFrequency(null);
      setFormValues({ ...DEFAULT_FORM, subject_id: selectedSubject, section_id: selectedSection });
      setToast({ message: "Lecture frequency created successfully.", type: "success" });
    },
    onError: (error) => {
      setFormError(String((error as any)?.response?.data?.detail ?? (error as Error).message));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<FrequencyFormValues> }) => adminApi.updateFrequency(id, payload),
    onSuccess: () => {
      qc.invalidateQueries(["frequencies", selectedSubject]);
      setIsModalOpen(false);
      setSelectedFrequency(null);
      setFormValues({ ...DEFAULT_FORM, subject_id: selectedSubject, section_id: selectedSection });
      setToast({ message: "Lecture frequency updated successfully.", type: "success" });
    },
    onError: (error) => {
      setFormError(String((error as any)?.response?.data?.detail ?? (error as Error).message));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteFrequency(id),
    onSuccess: () => {
      qc.invalidateQueries(["frequencies", selectedSubject]);
      setToast({ message: "Lecture frequency deleted successfully.", type: "success" });
    },
    onError: (error) => {
      setToast({ message: String((error as any)?.response?.data?.detail ?? (error as Error).message), type: "error" });
    },
  });

  useEffect(() => {
    if (departments.length && !selectedDepartment) {
      setSelectedDepartment(departments[0].id);
    }
  }, [departments, selectedDepartment]);

  useEffect(() => {
    if (academicYears.length && !selectedYear) {
      setSelectedYear(academicYears[0].id);
    }
  }, [academicYears, selectedYear]);

  useEffect(() => {
    if (subjects.length && !selectedSubject) {
      setSelectedSubject(subjects[0].id);
    }
  }, [subjects, selectedSubject]);

  useEffect(() => {
    if (sections.length && !selectedSection) {
      setSelectedSection(sections[0].id);
    }
  }, [sections, selectedSection]);

  const handleOpenCreate = () => {
    setSelectedFrequency(null);
    setFormError(null);
    setFormValues({ ...DEFAULT_FORM, subject_id: selectedSubject, section_id: selectedSection });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (frequency: LectureFrequency) => {
    setSelectedFrequency(frequency);
    setFormError(null);
    setFormValues({
      subject_id: frequency.subject_id,
      section_id: frequency.section_id,
      theory_per_week: frequency.theory_per_week,
      tutorial_per_week: frequency.tutorial_per_week,
      lab_per_week: frequency.lab_per_week,
      theory_duration_min: frequency.theory_duration_min,
      tutorial_duration_min: frequency.tutorial_duration_min,
      lab_duration_min: frequency.lab_duration_min,
    });
    setIsModalOpen(true);
  };

  const subjectSectionDuplicate = Boolean(
    formValues.subject_id && formValues.section_id && modalFrequencies.some((freq) => freq.section_id === formValues.section_id),
  );

  const handleSubmit = async () => {
    setFormError(null);
    if (!formValues.subject_id || !formValues.section_id) {
      setFormError("Section and subject are required.");
      return;
    }

    if (!selectedFrequency && modalFrequencies.some((freq) => freq.section_id === formValues.section_id)) {
      setFormError("A lecture frequency for this subject and section already exists.");
      return;
    }

    try {
      if (selectedFrequency) {
        await updateMutation.mutateAsync({ id: selectedFrequency.id, payload: formValues });
      } else {
        await createMutation.mutateAsync(formValues);
      }
    } catch {
      // handled by onError
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lecture Frequencies"
        subtitle="Manage lecture frequency settings used by the timetable solver."
        actions={<Button onClick={handleOpenCreate}>New Frequency</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="space-y-4">
          <Select
            label="Department"
            value={selectedDepartment}
            onChange={(e) => { setSelectedDepartment(e.target.value); setSelectedYear(""); setSelectedSubject(""); setSelectedSection(""); }}
            options={departments.map((d) => ({ value: d.id, label: d.code }))}
          />
          <Select
            label="Academic year"
            value={selectedYear}
            onChange={(e) => { setSelectedYear(e.target.value); setSelectedSubject(""); setSelectedSection(""); }}
            options={academicYears.map((y) => ({ value: y.id, label: y.year_name }))}
            disabled={!selectedDepartment}
          />
          <Select
            label="Section"
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            options={sections.map((s) => ({ value: s.id, label: s.name }))}
            disabled={!selectedYear}
          />
          <Select
            label="Subject"
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            options={subjects.map((s) => ({ value: s.id, label: `${s.code} • ${s.name}` }))}
            disabled={!selectedYear}
          />
          <div className="text-sm text-slate-500">Choose a subject to view or create lecture frequencies.</div>
        </Card>

        <Card>
          <Table
            columns={[
              { key: "section_id", header: "Section" },
              { key: "theory_per_week", header: "Theory/week" },
              { key: "tutorial_per_week", header: "Tutorial/week" },
              { key: "lab_per_week", header: "Lab/week" },
              { key: "actions", header: "Actions", render: (row) => (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); handleOpenEdit(row); }}>Edit</Button>
                  <Button variant="danger" size="sm" onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm("Delete this lecture frequency?")) {
                      deleteMutation.mutate(row.id);
                    }
                  }}>Delete</Button>
                </div>
              ), width: "220px" },
            ]}
            data={frequencies.map((frequency) => ({
              ...frequency,
              section_id: sections.find((s) => s.id === frequency.section_id)?.name ?? frequency.section_id,
            }))}
            loading={isLoading || createMutation.isLoading || updateMutation.isLoading}
          />
        </Card>
      </div>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedFrequency ? "Edit Lecture Frequency" : "Create Lecture Frequency"}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={createMutation.isLoading || updateMutation.isLoading}>
              {selectedFrequency ? "Save changes" : "Create"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Section"
            value={formValues.section_id}
            onChange={(e) => setFormValues({ ...formValues, section_id: e.target.value })}
            options={sections.map((s) => ({ value: s.id, label: s.name }))}
            placeholder="Choose section"
          />
          <Select
            label="Subject"
            value={formValues.subject_id}
            onChange={(e) => setFormValues({ ...formValues, subject_id: e.target.value })}
            options={subjects.map((s) => ({ value: s.id, label: `${s.code} • ${s.name}` }))}
            placeholder="Choose subject"
          />
          <Input
            label="Theory/week"
            type="number"
            value={formValues.theory_per_week}
            onChange={(e) => setFormValues({ ...formValues, theory_per_week: Number(e.target.value) })}
          />
          <Input
            label="Tutorial/week"
            type="number"
            value={formValues.tutorial_per_week}
            onChange={(e) => setFormValues({ ...formValues, tutorial_per_week: Number(e.target.value) })}
          />
          <Input
            label="Lab/week"
            type="number"
            value={formValues.lab_per_week}
            onChange={(e) => setFormValues({ ...formValues, lab_per_week: Number(e.target.value) })}
          />
          <Input
            label="Theory duration (min)"
            type="number"
            value={formValues.theory_duration_min}
            onChange={(e) => setFormValues({ ...formValues, theory_duration_min: Number(e.target.value) })}
          />
          <Input
            label="Tutorial duration (min)"
            type="number"
            value={formValues.tutorial_duration_min}
            onChange={(e) => setFormValues({ ...formValues, tutorial_duration_min: Number(e.target.value) })}
          />
          <Input
            label="Lab duration (min)"
            type="number"
            value={formValues.lab_duration_min}
            onChange={(e) => setFormValues({ ...formValues, lab_duration_min: Number(e.target.value) })}
          />
          {formError && <p className="text-sm text-red-500 md:col-span-2">{formError}</p>}
          {subjectSectionDuplicate && !selectedFrequency && (
            <p className="text-sm text-orange-600 md:col-span-2">
              A lecture frequency for this subject and section already exists in the database.
            </p>
          )}
        </div>
      </Modal>

      {toast && (
        <div className="fixed right-6 top-6 z-50"><Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} /></div>
      )}
    </div>
  );
};
