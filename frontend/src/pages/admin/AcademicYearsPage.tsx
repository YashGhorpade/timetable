import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api";
import { Button, Card, Input, Modal, PageHeader, Select, Table, Toast } from "@/components/ui";
import type { AcademicYear, Department } from "@/types";

interface AcademicYearFormValues {
  department_id: string;
  year_name: string;
  year_number: number;
  is_active?: boolean;
}

const DEFAULT_FORM: AcademicYearFormValues = {
  department_id: "",
  year_name: "",
  year_number: new Date().getFullYear(),
};

export const AcademicYearsPage: React.FC = () => {
  const qc = useQueryClient();
  const [selectedDepartment, setSelectedDepartment] = useState(""
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState<AcademicYear | null>(null);
  const [formValues, setFormValues] = useState<AcademicYearFormValues>(DEFAULT_FORM);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: () => adminApi.getDepartments().then((res) => res.data),
  });

  const { data: academicYears = [], isLoading } = useQuery<AcademicYear[]>({
    queryKey: ["academic-years", selectedDepartment],
    queryFn: () => adminApi.getAcademicYears(selectedDepartment).then((res) => res.data),
    enabled: !!selectedDepartment,
  });

  const createMutation = useMutation({
    mutationFn: (payload: AcademicYearFormValues) => adminApi.createAcademicYear(payload),
    onSuccess: () => {
      qc.invalidateQueries(["academic-years", selectedDepartment]);
      setIsModalOpen(false);
      setFormValues({ ...DEFAULT_FORM, department_id: selectedDepartment });
      setToast({ message: "Academic year created successfully.", type: "success" });
    },
    onError: (error) => {
      setFormError(String((error as any)?.response?.data?.detail ?? (error as Error).message));
    },
  });

  useEffect(() => {
    if (departments.length && !selectedDepartment) {
      setSelectedDepartment(departments[0].id);
    }
  }, [departments, selectedDepartment]);

  const handleOpenCreate = () => {
    setSelectedYear(null);
    setFormError(null);
    setFormValues({ ...DEFAULT_FORM, department_id: selectedDepartment });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!formValues.department_id || !formValues.year_name.trim() || !formValues.year_number) {
      setFormError("Department, year name, and year number are required.");
      return;
    }

    try {
      await createMutation.mutateAsync(formValues);
    } catch {
      // handled by onError
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic Years"
        subtitle="Manage academic years for each department."
        actions={<Button onClick={handleOpenCreate}>New Academic Year</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="space-y-4">
          <Select
            label="Department"
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            options={departments.map((d) => ({ value: d.id, label: d.code }))}
          />
          <div className="text-sm text-slate-500">Academic years are grouped by department.</div>
        </Card>

        <Card>
          <Table
            columns={[
              { key: "year_number", header: "Year" },
              { key: "year_name", header: "Name" },
              { key: "is_active", header: "Status", render: (row) => (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${row.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {row.is_active ? "Active" : "Inactive"}
                </span>
              )},
            ]}
            data={academicYears}
            loading={isLoading || createMutation.isLoading}
          />
        </Card>
      </div>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Academic Year"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={createMutation.isLoading}>Create</Button>
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
          <Input
            label="Academic year name"
            value={formValues.year_name}
            onChange={(e) => setFormValues({ ...formValues, year_name: e.target.value })}
          />
          <Input
            label="Year number"
            type="number"
            value={formValues.year_number}
            onChange={(e) => setFormValues({ ...formValues, year_number: Number(e.target.value) })}
          />
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
