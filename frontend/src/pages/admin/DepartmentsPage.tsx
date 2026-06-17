import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api";
import { Button, Card, Input, Modal, PageHeader, Select, Table, Toast } from "@/components/ui";
import type { Department, LabSlotPreference } from "@/types";

const LAB_PREFERENCE_OPTIONS: { value: LabSlotPreference; label: string }[] = [
  { value: "no_preference", label: "No preference" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "admin_configured", label: "Admin configured" },
];

interface DepartmentFormValues {
  name: string;
  code: string;
  description: string;
  lab_slot_preference: LabSlotPreference;
  lab_preferred_slot_indices: string;
  is_active?: boolean;
}

const DEFAULT_FORM: DepartmentFormValues = {
  name: "",
  code: "",
  description: "",
  lab_slot_preference: "no_preference",
  lab_preferred_slot_indices: "",
};

export const DepartmentsPage: React.FC = () => {
  const qc = useQueryClient();
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [formValues, setFormValues] = useState<DepartmentFormValues>(DEFAULT_FORM);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: departments = [], isLoading } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: () => adminApi.getDepartments().then((res) => res.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: DepartmentFormValues) => adminApi.createDepartment(payload).then((res) => res.data),
    onSuccess: (createdDepartment: Department) => {
      qc.setQueryData<Department[]>(["departments"], (old) => old ? [...old, createdDepartment] : [createdDepartment]);
      qc.invalidateQueries(["departments"], { refetchType: "all", refetchInactive: true });
      setIsModalOpen(false);
      setSelectedDepartment(null);
      setFormValues(DEFAULT_FORM);
      setToast({ message: "Department created successfully.", type: "success" });
    },
    onError: (error) => {
      setFormError(String((error as any)?.response?.data?.detail ?? (error as Error).message));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<DepartmentFormValues> }) =>
      adminApi.updateDepartment(id, payload),
    onSuccess: (updatedDepartment: Department) => {
      qc.setQueryData<Department[]>(["departments"], (old) =>
        old ? old.map((dept) => (dept.id === updatedDepartment.id ? updatedDepartment : dept)) : [updatedDepartment]
      );
      qc.invalidateQueries({ queryKey: ["departments"], refetchType: "all", refetchInactive: true });
      setIsModalOpen(false);
      setSelectedDepartment(null);
      setFormValues(DEFAULT_FORM);
      setToast({ message: "Department updated successfully.", type: "success" });
    },
    onError: (error) => {
      setFormError(String((error as any)?.response?.data?.detail ?? (error as Error).message));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteDepartment(id),
    onSuccess: (_data, id) => {
      qc.setQueryData<Department[]>(["departments"], (old) => old ? old.filter((dept) => dept.id !== id) : []);
      qc.invalidateQueries({ queryKey: ["departments"], refetchType: "all", refetchInactive: true });
      setToast({ message: "Department deleted.", type: "success" });
    },
    onError: (error) => {
      setToast({ message: String((error as any)?.response?.data?.detail ?? (error as Error).message), type: "error" });
    },
  });

  const handleOpenCreate = () => {
    setSelectedDepartment(null);
    setFormError(null);
    setFormValues(DEFAULT_FORM);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (department: Department) => {
    setSelectedDepartment(department);
    setFormError(null);
    setFormValues({
      name: department.name,
      code: department.code,
      description: department.description ?? "",
      lab_slot_preference: department.lab_slot_preference,
      lab_preferred_slot_indices: department.lab_preferred_slot_indices ?? "",
      is_active: department.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!formValues.name.trim() || !formValues.code.trim()) {
      setFormError("Name and code are required.");
      return;
    }

    try {
      if (selectedDepartment) {
        await updateMutation.mutateAsync({
          id: selectedDepartment.id,
          payload: {
            name: formValues.name,
            code: formValues.code,
            description: formValues.description || undefined,
            lab_slot_preference: formValues.lab_slot_preference,
            lab_preferred_slot_indices: formValues.lab_preferred_slot_indices || undefined,
            is_active: formValues.is_active,
          },
        });
      } else {
        await createMutation.mutateAsync({
          name: formValues.name,
          code: formValues.code,
          description: formValues.description || undefined,
          lab_slot_preference: formValues.lab_slot_preference,
          lab_preferred_slot_indices: formValues.lab_preferred_slot_indices || undefined,
        });
      }
    } catch {
      // error state is handled by mutation
    }
  };

  const handleDelete = async (department: Department) => {
    const confirmed = window.confirm(`Delete department "${department.name}"? This cannot be undone.`);
    if (!confirmed) return;
    await deleteMutation.mutateAsync(department.id);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Departments"
        subtitle="Create, update, and remove departments for your timetable system."
        actions={
          <Button onClick={handleOpenCreate} icon={<span className="text-lg">+</span>}>New Department</Button>
        }
      />

      <Card>
        <Table
          columns={[
            { key: "code", header: "Code" },
            { key: "name", header: "Name" },
            { key: "lab_slot_preference", header: "Lab preference", render: (row) =>
                LAB_PREFERENCE_OPTIONS.find((opt) => opt.value === (row as Department).lab_slot_preference)?.label ?? row.lab_slot_preference
            },
            { key: "is_active", header: "Status", render: (row) => (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${row.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {row.is_active ? "Active" : "Inactive"}
                </span>
              )
            },
            { key: "created_at", header: "Created", render: (row) => new Date(row.created_at).toLocaleString() },
            { key: "actions", header: "Actions", render: (row) => (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); handleOpenEdit(row); }}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(row); }}>
                    Delete
                  </Button>
                </div>
              ), width: "260px"
            },
          ]}
          data={departments}
          loading={isLoading || createMutation.isLoading || updateMutation.isLoading || deleteMutation.isLoading}
        />
      </Card>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedDepartment ? "Edit Department" : "Create Department"}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={createMutation.isLoading || updateMutation.isLoading}>
              {selectedDepartment ? "Save changes" : "Create"}
            </Button>
          </div>
        }
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={formValues.name}
            onChange={(e) => setFormValues({ ...formValues, name: e.target.value })}
          />
          <Input
            label="Code"
            value={formValues.code}
            onChange={(e) => setFormValues({ ...formValues, code: e.target.value })}
          />
          <Input
            label="Description"
            value={formValues.description}
            onChange={(e) => setFormValues({ ...formValues, description: e.target.value })}
          />
          <Select
            label="Lab slot preference"
            value={formValues.lab_slot_preference}
            onChange={(e) => setFormValues({ ...formValues, lab_slot_preference: e.target.value as LabSlotPreference })}
            options={LAB_PREFERENCE_OPTIONS}
            placeholder="Select preference"
          />
          <Input
            label="Preferred slot indices"
            hint="Comma-separated slot numbers e.g. 1,2,3"
            value={formValues.lab_preferred_slot_indices}
            onChange={(e) => setFormValues({ ...formValues, lab_preferred_slot_indices: e.target.value })}
          />
          {selectedDepartment && (
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={formValues.is_active ?? false}
                  onChange={(e) => setFormValues({ ...formValues, is_active: e.target.checked })}
                  className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                Active
              </label>
            </div>
          )}
          {formError && <p className="text-sm text-red-500">{formError}</p>}
        </div>
      </Modal>

      {toast && (
        <div className="fixed right-6 top-6 z-50">
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        </div>
      )}
    </div>
  );
};
