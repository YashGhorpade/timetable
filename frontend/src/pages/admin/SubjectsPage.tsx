import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api";
import { Button, Card, Input, Modal, PageHeader, Select, Table, Toast } from "@/components/ui";
import type { AcademicYear, Department, Subject } from "@/types";

interface SubjectFormValues {
  department_id: string;
  academic_year_id: string;
  name: string;
  code: string;
  description: string;
  is_active?: boolean;
}

const DEFAULT_FORM: SubjectFormValues = {
  department_id: "",
  academic_year_id: "",
  name: "",
  code: "",
  description: "",
};

export const SubjectsPage: React.FC = () => {
  const qc = useQueryClient();
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [formValues, setFormValues] = useState<SubjectFormValues>(DEFAULT_FORM);
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

  const { data: subjects = [], isLoading } = useQuery<Subject[]>({
    queryKey: ["subjects", selectedDepartment, selectedYear],
    queryFn: () => adminApi.getSubjects({ department_id: selectedDepartment || undefined, academic_year_id: selectedYear || undefined }).then((res) => res.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: SubjectFormValues) => adminApi.createSubject(payload),
    onSuccess: () => {
      qc.invalidateQueries(["subjects", selectedDepartment, selectedYear]);
      setIsModalOpen(false);
      setSelectedSubject(null);
      setFormValues(DEFAULT_FORM);
      setToast({ message: "Subject created successfully.", type: "success" });
    },
    onError: (error) => {
      setFormError(String((error as any)?.response?.data?.detail ?? (error as Error).message));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<SubjectFormValues> }) =>
      adminApi.updateSubject(id, payload),
    onSuccess: () => {
      qc.invalidateQueries(["subjects", selectedDepartment, selectedYear]);
      setIsModalOpen(false);
      setSelectedSubject(null);
      setFormValues(DEFAULT_FORM);
      setToast({ message: "Subject updated successfully.", type: "success" });
    },
    onError: (error) => {
      setFormError(String((error as any)?.response?.data?.detail ?? (error as Error).message));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteSubject(id),
    onSuccess: () => {
      qc.invalidateQueries(["subjects", selectedDepartment, selectedYear]);
      setToast({ message: "Subject deleted.", type: "success" });
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

  const handleOpenCreate = () => {
    setSelectedSubject(null);
    setFormError(null);
    setFormValues({ ...DEFAULT_FORM, department_id: selectedDepartment, academic_year_id: selectedYear });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (subject: Subject) => {
    setSelectedSubject(subject);
    setFormError(null);
    setFormValues({
      department_id: subject.department_id,
      academic_year_id: subject.academic_year_id,
      name: subject.name,
      code: subject.code,
      description: subject.description ?? "",
      is_active: subject.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!formValues.department_id || !formValues.academic_year_id || !formValues.name.trim() || !formValues.code.trim()) {
      setFormError("Department, year, name, and code are required.");
      return;
    }

    try {
      if (selectedSubject) {
        await updateMutation.mutateAsync({ id: selectedSubject.id, payload: formValues });
      } else {
        await createMutation.mutateAsync(formValues);
      }
    } catch {
      // handled by onError
    }
  };

  const handleDelete = async (subject: Subject) => {
    if (!window.confirm(`Delete subject "${subject.name}"?`)) return;
    await deleteMutation.mutateAsync(subject.id);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subjects"
        subtitle="Manage academic subjects across departments and year groups."
        actions={<Button onClick={handleOpenCreate}>New Subject</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="space-y-4">
          <Select
            label="Department"
            value={selectedDepartment}
            onChange={(e) => { setSelectedDepartment(e.target.value); setSelectedYear(""); }}
            options={departments.map((d) => ({ value: d.id, label: d.code }))}
          />
          <Select
            label="Academic year"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            options={academicYears.map((y) => ({ value: y.id, label: y.year_name }))}
            disabled={!selectedDepartment}
          />
          <div className="text-sm text-slate-500">Filter subjects by department and year.</div>
        </Card>

        <Card>
          <Table
            columns={[
              { key: "code", header: "Code" },
              { key: "name", header: "Subject" },
              { key: "description", header: "Description" },
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
            data={subjects}
            loading={isLoading || createMutation.isLoading || updateMutation.isLoading || deleteMutation.isLoading}
          />
        </Card>
      </div>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedSubject ? "Edit Subject" : "Create Subject"}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={createMutation.isLoading || updateMutation.isLoading}>
              {selectedSubject ? "Save changes" : "Create"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Select
            label="Department"
            value={formValues.department_id}
            onChange={(e) => setFormValues({ ...formValues, department_id: e.target.value })}
            options={departments.map((d) => ({ value: d.id, label: d.code }))}
            placeholder="Choose department"
          />
          <Select
            label="Academic year"
            value={formValues.academic_year_id}
            onChange={(e) => setFormValues({ ...formValues, academic_year_id: e.target.value })}
            options={academicYears.map((y) => ({ value: y.id, label: y.year_name }))}
            placeholder="Choose year"
          />
          <Input label="Subject name" value={formValues.name} onChange={(e) => setFormValues({ ...formValues, name: e.target.value })} />
          <Input label="Code" value={formValues.code} onChange={(e) => setFormValues({ ...formValues, code: e.target.value })} />
          <Input label="Description" value={formValues.description} onChange={(e) => setFormValues({ ...formValues, description: e.target.value })} />
          {selectedSubject && (
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={formValues.is_active ?? false}
                onChange={(e) => setFormValues({ ...formValues, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Active
            </label>
          )}
          {formError && <p className="text-sm text-red-500">{formError}</p>}
        </div>
      </Modal>

      {toast && <div className="fixed right-6 top-6 z-50"><Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} /></div>}
    </div>
  );
};
