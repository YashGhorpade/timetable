import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api";
import { Button, Card, Input, Modal, PageHeader, Select, Table, Toast } from "@/components/ui";
import type { AcademicYear, Department, Section } from "@/types";

interface SectionFormValues {
  academic_year_id: string;
  name: string;
  strength: number;
  is_active?: boolean;
}

const DEFAULT_FORM: SectionFormValues = {
  academic_year_id: "",
  name: "",
  strength: 60,
};

export const SectionsPage: React.FC = () => {
  const qc = useQueryClient();
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [formValues, setFormValues] = useState<SectionFormValues>(DEFAULT_FORM);
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

  const { data: sections = [], isLoading } = useQuery<Section[]>({
    queryKey: ["sections", selectedYear],
    queryFn: () => adminApi.getSections(selectedYear).then((res) => res.data),
    enabled: !!selectedYear,
  });

  const createMutation = useMutation({
    mutationFn: (payload: SectionFormValues) => adminApi.createSection(payload),
    onSuccess: () => {
      qc.invalidateQueries(["sections", selectedYear]);
      setIsModalOpen(false);
      setSelectedSection(null);
      setFormValues(DEFAULT_FORM);
      setToast({ message: "Section created successfully.", type: "success" });
    },
    onError: (error) => {
      setFormError(String((error as any)?.response?.data?.detail ?? (error as Error).message));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<SectionFormValues> }) =>
      adminApi.updateSection(id, payload),
    onSuccess: () => {
      qc.invalidateQueries(["sections", selectedYear]);
      setIsModalOpen(false);
      setSelectedSection(null);
      setFormValues(DEFAULT_FORM);
      setToast({ message: "Section updated successfully.", type: "success" });
    },
    onError: (error) => {
      setFormError(String((error as any)?.response?.data?.detail ?? (error as Error).message));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteSection(id),
    onSuccess: () => {
      qc.invalidateQueries(["sections", selectedYear]);
      setToast({ message: "Section deleted.", type: "success" });
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
    setSelectedSection(null);
    setFormError(null);
    setFormValues({ ...DEFAULT_FORM, academic_year_id: selectedYear });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (section: Section) => {
    setSelectedSection(section);
    setFormError(null);
    setFormValues({
      academic_year_id: section.academic_year_id,
      name: section.name,
      strength: section.strength,
      is_active: section.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!formValues.academic_year_id || !formValues.name.trim()) {
      setFormError("Academic year and name are required.");
      return;
    }

    try {
      if (selectedSection) {
        await updateMutation.mutateAsync({ id: selectedSection.id, payload: formValues });
      } else {
        await createMutation.mutateAsync(formValues);
      }
    } catch {
      // handled by onError
    }
  };

  const handleDelete = async (section: Section) => {
    if (!window.confirm(`Delete section "${section.name}"?`)) return;
    await deleteMutation.mutateAsync(section.id);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sections"
        subtitle="Manage academic sections by department and year."
        actions={<Button onClick={handleOpenCreate}>New Section</Button>}
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
          <div className="text-sm text-slate-500">Section list is scoped by the selected academic year.</div>
        </Card>

        <Card>
          <Table
            columns={[
              { key: "name", header: "Section" },
              { key: "strength", header: "Strength" },
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
            data={sections}
            loading={isLoading || createMutation.isLoading || updateMutation.isLoading || deleteMutation.isLoading}
          />
        </Card>
      </div>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedSection ? "Edit Section" : "Create Section"}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={createMutation.isLoading || updateMutation.isLoading}>
              {selectedSection ? "Save changes" : "Create"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Select
            label="Academic year"
            value={formValues.academic_year_id}
            onChange={(e) => setFormValues({ ...formValues, academic_year_id: e.target.value })}
            options={academicYears.map((y) => ({ value: y.id, label: y.year_name }))}
            placeholder="Choose year"
          />
          <Input
            label="Section name"
            value={formValues.name}
            onChange={(e) => setFormValues({ ...formValues, name: e.target.value })}
          />
          <Input
            label="Strength"
            type="number"
            value={formValues.strength}
            onChange={(e) => setFormValues({ ...formValues, strength: Number(e.target.value) })}
          />
          {selectedSection && (
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

      {toast && (
        <div className="fixed right-6 top-6 z-50"><Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} /></div>
      )}
    </div>
  );
};
