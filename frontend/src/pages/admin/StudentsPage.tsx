import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api";
import { Button, Card, Input, Modal, PageHeader, Select, Table, Toast } from "@/components/ui";
import type { Department, AcademicYear, Section, Batch, Student } from "@/types";

interface StudentFormValues {
  email: string;
  password: string;
  section_id: string;
  batch_id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  is_active?: boolean;
}

const DEFAULT_FORM: StudentFormValues = {
  email: "",
  password: "",
  section_id: "",
  batch_id: "",
  student_id: "",
  first_name: "",
  last_name: "",
  phone: "",
};

export const StudentsPage: React.FC = () => {
  const qc = useQueryClient();
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [selectedBatch, setSelectedBatch] = useState<string>("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [formValues, setFormValues] = useState<StudentFormValues>(DEFAULT_FORM);
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

  const { data: batches = [] } = useQuery<Batch[]>({
    queryKey: ["batches", selectedSection],
    queryFn: () => adminApi.getBatches(selectedSection).then((res) => res.data),
    enabled: !!selectedSection,
  });

  const { data: students = [], isLoading } = useQuery<Student[]>({
    queryKey: ["students", selectedSection, selectedBatch],
    queryFn: () => adminApi.getStudents({ section_id: selectedSection || undefined, batch_id: selectedBatch || undefined }).then((res) => res.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: StudentFormValues) => adminApi.createStudent(payload),
    onSuccess: () => {
      qc.invalidateQueries(["students", selectedSection, selectedBatch]);
      setIsModalOpen(false);
      setSelectedStudent(null);
      setFormValues(DEFAULT_FORM);
      setToast({ message: "Student created successfully.", type: "success" });
    },
    onError: (error) => {
      setFormError(String((error as any)?.response?.data?.detail ?? (error as Error).message));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<StudentFormValues> }) =>
      adminApi.updateStudent(id, payload),
    onSuccess: () => {
      qc.invalidateQueries(["students", selectedSection, selectedBatch]);
      setIsModalOpen(false);
      setSelectedStudent(null);
      setFormValues(DEFAULT_FORM);
      setToast({ message: "Student updated successfully.", type: "success" });
    },
    onError: (error) => {
      setFormError(String((error as any)?.response?.data?.detail ?? (error as Error).message));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteStudent(id),
    onSuccess: () => {
      qc.invalidateQueries(["students", selectedSection, selectedBatch]);
      setToast({ message: "Student deleted.", type: "success" });
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
    if (sections.length && !selectedSection) {
      setSelectedSection(sections[0].id);
    }
  }, [sections, selectedSection]);

  useEffect(() => {
    if (batches.length && !selectedBatch) {
      setSelectedBatch(batches[0].id);
    }
  }, [batches, selectedBatch]);

  const handleOpenCreate = () => {
    setSelectedStudent(null);
    setFormError(null);
    setFormValues({ ...DEFAULT_FORM, section_id: selectedSection, batch_id: selectedBatch });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setSelectedStudent(student);
    setFormError(null);
    setFormValues({
      email: "",
      password: "",
      section_id: student.section_id,
      batch_id: student.batch_id,
      student_id: student.student_id,
      first_name: student.first_name,
      last_name: student.last_name,
      phone: student.phone ?? "",
      is_active: student.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!formValues.section_id || !formValues.batch_id || !formValues.student_id.trim() || !formValues.first_name.trim() || !formValues.last_name.trim()) {
      setFormError("Section, batch, student ID, and name are required.");
      return;
    }
    if (!selectedStudent && !formValues.password) {
      setFormError("Password is required for a new student.");
      return;
    }

    try {
      if (selectedStudent) {
        const payload = { ...formValues };
        delete payload.password;
        await updateMutation.mutateAsync({ id: selectedStudent.id, payload });
      } else {
        await createMutation.mutateAsync(formValues);
      }
    } catch {
      // handled by onError
    }
  };

  const handleDelete = async (student: Student) => {
    if (!window.confirm(`Delete student "${student.first_name} ${student.last_name}"?`)) return;
    await deleteMutation.mutateAsync(student.id);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        subtitle="Create, edit, and remove student profiles."
        actions={<Button onClick={handleOpenCreate}>New Student</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="space-y-4">
          <Select
            label="Department"
            value={selectedDepartment}
            onChange={(e) => { setSelectedDepartment(e.target.value); setSelectedYear(""); setSelectedSection(""); setSelectedBatch(""); }}
            options={departments.map((d) => ({ value: d.id, label: d.code }))}
          />
          <Select
            label="Academic year"
            value={selectedYear}
            onChange={(e) => { setSelectedYear(e.target.value); setSelectedSection(""); setSelectedBatch(""); }}
            options={academicYears.map((y) => ({ value: y.id, label: y.year_name }))}
            disabled={!selectedDepartment}
          />
          <Select
            label="Section"
            value={selectedSection}
            onChange={(e) => { setSelectedSection(e.target.value); setSelectedBatch(""); }}
            options={sections.map((s) => ({ value: s.id, label: s.name }))}
            disabled={!selectedYear}
          />
          <Select
            label="Batch"
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
            options={batches.map((b) => ({ value: b.id, label: b.name }))}
            disabled={!selectedSection}
          />
          <div className="text-sm text-slate-500">Filter students by section and batch.</div>
        </Card>

        <Card>
          <Table
            columns={[
              { key: "student_id", header: "Student ID" },
              { key: "first_name", header: "Name", render: (row) => `${row.first_name} ${row.last_name}` },
              { key: "section_id", header: "Section" },
              { key: "batch_id", header: "Batch" },
              { key: "status", header: "Status", render: (row) => (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${row.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {row.is_active ? "Active" : "Inactive"}
                  </span>
                )
              },
              { key: "actions", header: "Actions", render: (row) => (
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); handleOpenEdit(row); }}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(row); }}>Delete</Button>
                  </div>
                ), width: "220px"
              },
            ]}
            data={students}
            loading={isLoading || createMutation.isLoading || updateMutation.isLoading || deleteMutation.isLoading}
          />
        </Card>
      </div>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedStudent ? "Edit Student" : "Create Student"}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={createMutation.isLoading || updateMutation.isLoading}>
              {selectedStudent ? "Save changes" : "Create"}
            </Button>
          </div>
        }
        size="lg"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Section"
            value={formValues.section_id}
            onChange={(e) => setFormValues({ ...formValues, section_id: e.target.value, batch_id: "" })}
            options={sections.map((s) => ({ value: s.id, label: s.name }))}
            placeholder="Choose section"
          />
          <Select
            label="Batch"
            value={formValues.batch_id}
            onChange={(e) => setFormValues({ ...formValues, batch_id: e.target.value })}
            options={batches.map((b) => ({ value: b.id, label: b.name }))}
            placeholder="Choose batch"
          />
          <Input label="Student ID" value={formValues.student_id} onChange={(e) => setFormValues({ ...formValues, student_id: e.target.value })} />
          {!selectedStudent && <Input label="Email" value={formValues.email} onChange={(e) => setFormValues({ ...formValues, email: e.target.value })} />}
          {!selectedStudent && <Input label="Password" type="password" value={formValues.password} onChange={(e) => setFormValues({ ...formValues, password: e.target.value })} />}
          <Input label="First name" value={formValues.first_name} onChange={(e) => setFormValues({ ...formValues, first_name: e.target.value })} />
          <Input label="Last name" value={formValues.last_name} onChange={(e) => setFormValues({ ...formValues, last_name: e.target.value })} />
          <Input label="Phone" value={formValues.phone} onChange={(e) => setFormValues({ ...formValues, phone: e.target.value })} />
          {selectedStudent && (
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 md:col-span-2">
              <input
                type="checkbox"
                checked={formValues.is_active ?? false}
                onChange={(e) => setFormValues({ ...formValues, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Active
            </label>
          )}
          {formError && <p className="text-sm text-red-500 md:col-span-2">{formError}</p>}
        </div>
      </Modal>

      {toast && <div className="fixed right-6 top-6 z-50"><Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} /></div>}
    </div>
  );
};
