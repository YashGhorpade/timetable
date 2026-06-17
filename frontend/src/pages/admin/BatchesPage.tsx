import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api";
import { Button, Card, Input, Modal, PageHeader, Select, Table, Toast } from "@/components/ui";
import type { AcademicYear, Batch, Department, Section } from "@/types";

interface BatchFormValues {
  section_id: string;
  name: string;
  strength: number;
  is_active?: boolean;
}

const DEFAULT_FORM: BatchFormValues = {
  section_id: "",
  name: "",
  strength: 30,
};

export const BatchesPage: React.FC = () => {
  const qc = useQueryClient();
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [formValues, setFormValues] = useState<BatchFormValues>(DEFAULT_FORM);
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

  const { data: batches = [], isLoading } = useQuery<Batch[]>({
    queryKey: ["batches", selectedSection],
    queryFn: () => adminApi.getBatches(selectedSection).then((res) => res.data),
    enabled: !!selectedSection,
  });

  const createMutation = useMutation({
    mutationFn: (payload: BatchFormValues) => adminApi.createBatch(payload),
    onSuccess: () => {
      qc.invalidateQueries(["batches", selectedSection]);
      setIsModalOpen(false);
      setSelectedBatch(null);
      setFormValues({ ...DEFAULT_FORM, section_id: selectedSection });
      setToast({ message: "Batch created successfully.", type: "success" });
    },
    onError: (error) => {
      setFormError(String((error as any)?.response?.data?.detail ?? (error as Error).message));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<BatchFormValues> }) => adminApi.updateBatch(id, payload),
    onSuccess: () => {
      qc.invalidateQueries(["batches", selectedSection]);
      setIsModalOpen(false);
      setSelectedBatch(null);
      setFormValues({ ...DEFAULT_FORM, section_id: selectedSection });
      setToast({ message: "Batch updated successfully.", type: "success" });
    },
    onError: (error) => {
      setFormError(String((error as any)?.response?.data?.detail ?? (error as Error).message));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteBatch(id),
    onSuccess: () => {
      qc.invalidateQueries(["batches", selectedSection]);
      setToast({ message: "Batch deleted.", type: "success" });
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

  const handleOpenCreate = () => {
    setSelectedBatch(null);
    setFormError(null);
    setFormValues({ ...DEFAULT_FORM, section_id: selectedSection });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (batch: Batch) => {
    setSelectedBatch(batch);
    setFormError(null);
    setFormValues({
      section_id: batch.section_id,
      name: batch.name,
      strength: batch.strength,
      is_active: batch.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!formValues.section_id || !formValues.name.trim()) {
      setFormError("Section and name are required.");
      return;
    }

    try {
      if (selectedBatch) {
        await updateMutation.mutateAsync({ id: selectedBatch.id, payload: formValues });
      } else {
        await createMutation.mutateAsync(formValues);
      }
    } catch {
      // handled by onError
    }
  };

  const handleDelete = async (batch: Batch) => {
    if (!window.confirm(`Delete batch \"${batch.name}\"?`)) return;
    await deleteMutation.mutateAsync(batch.id);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Batches"
        subtitle="Manage batches within sections and academic years."
        actions={<Button onClick={handleOpenCreate}>New Batch</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="space-y-4">
          <Select
            label="Department"
            value={selectedDepartment}
            onChange={(e) => { setSelectedDepartment(e.target.value); setSelectedYear(""); setSelectedSection(""); }}
            options={departments.map((d) => ({ value: d.id, label: d.code }))}
          />
          <Select
            label="Academic year"
            value={selectedYear}
            onChange={(e) => { setSelectedYear(e.target.value); setSelectedSection(""); }}
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
          <div className="text-sm text-slate-500">Batches are created for the selected section.</div>
        </Card>

        <Card>
          <Table
            columns={[
              { key: "name", header: "Batch" },
              { key: "strength", header: "Strength" },
              { key: "status", header: "Status", render: (row) => (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${row.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {row.is_active ? "Active" : "Inactive"}
                </span>
              )},
              { key: "actions", header: "Actions", render: (row) => (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); handleOpenEdit(row); }}>Edit</Button>
                  <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(row); }}>Delete</Button>
                </div>
              ), width: "220px" },
            ]}
            data={batches}
            loading={isLoading || createMutation.isLoading || updateMutation.isLoading || deleteMutation.isLoading}
          />
        </Card>
      </div>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedBatch ? "Edit Batch" : "Create Batch"}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={createMutation.isLoading || updateMutation.isLoading}>
              {selectedBatch ? "Save changes" : "Create"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Select
            label="Section"
            value={formValues.section_id}
            onChange={(e) => setFormValues({ ...formValues, section_id: e.target.value })}
            options={sections.map((s) => ({ value: s.id, label: s.name }))}
            placeholder="Choose section"
          />
          <Input
            label="Batch name"
            value={formValues.name}
            onChange={(e) => setFormValues({ ...formValues, name: e.target.value })}
          />
          <Input
            label="Strength"
            type="number"
            value={formValues.strength}
            onChange={(e) => setFormValues({ ...formValues, strength: Number(e.target.value) })}
          />
          {selectedBatch && (
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
