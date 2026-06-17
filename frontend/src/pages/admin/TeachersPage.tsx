import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api";
import { Button, Card, Input, Modal, PageHeader, Select, Table, Toast } from "@/components/ui";
import type { Department, Teacher, AcademicYear, Section, Subject } from "@/types";

interface TeacherFormValues {
  email: string;
  password: string;
  department_id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  designation: string;
  specialization: string;
  phone: string;
  max_lectures_per_day: number;
  max_lectures_per_week: number;
  is_active?: boolean;
}

interface AssignmentFormValues {
  teacher_id: string;
  department_id: string;
  academic_year_id: string;
  section_id: string;
  subject_id: string;
  lecture_type: "theory" | "tutorial" | "lab";
}

const DEFAULT_TEACHER_FORM: TeacherFormValues = {
  email: "",
  password: "",
  department_id: "",
  employee_id: "",
  first_name: "",
  last_name: "",
  designation: "",
  specialization: "",
  phone: "",
  max_lectures_per_day: 5,
  max_lectures_per_week: 25,
};

const DEFAULT_ASSIGNMENT_FORM: AssignmentFormValues = {
  teacher_id: "",
  department_id: "",
  academic_year_id: "",
  section_id: "",
  subject_id: "",
  lecture_type: "theory",
};

export const TeachersPage: React.FC = () => {
  const qc = useQueryClient();
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [formValues, setFormValues] = useState<TeacherFormValues>(DEFAULT_TEACHER_FORM);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormValues>(DEFAULT_ASSIGNMENT_FORM);
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);

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
    queryKey: ["sections", assignmentForm.academic_year_id],
    queryFn: () => adminApi.getSections(assignmentForm.academic_year_id).then((res) => res.data),
    enabled: !!assignmentForm.academic_year_id,
  });

  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ["subjects", assignmentForm.department_id, assignmentForm.academic_year_id],
    queryFn: () => adminApi.getSubjects({ department_id: assignmentForm.department_id || undefined, academic_year_id: assignmentForm.academic_year_id || undefined }).then((res) => res.data),
    enabled: !!assignmentForm.department_id && !!assignmentForm.academic_year_id,
  });

  const { data: teachers = [], isLoading } = useQuery<Teacher[]>({
    queryKey: ["teachers", selectedDepartment],
    queryFn: () => adminApi.getTeachers(selectedDepartment ? { department_id: selectedDepartment } : undefined).then((res) => res.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: TeacherFormValues) => adminApi.createTeacher(payload),
    onSuccess: () => {
      qc.invalidateQueries(["teachers", selectedDepartment]);
      setIsTeacherModalOpen(false);
      setSelectedTeacher(null);
      setFormValues(DEFAULT_TEACHER_FORM);
      setToast({ message: "Teacher created successfully.", type: "success" });
    },
    onError: (error) => {
      setFormError(String((error as any)?.response?.data?.detail ?? (error as Error).message));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<TeacherFormValues> }) =>
      adminApi.updateTeacher(id, payload),
    onSuccess: () => {
      qc.invalidateQueries(["teachers", selectedDepartment]);
      setIsTeacherModalOpen(false);
      setSelectedTeacher(null);
      setFormValues(DEFAULT_TEACHER_FORM);
      setToast({ message: "Teacher updated successfully.", type: "success" });
    },
    onError: (error) => {
      setFormError(String((error as any)?.response?.data?.detail ?? (error as Error).message));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteTeacher(id),
    onSuccess: () => {
      qc.invalidateQueries(["teachers", selectedDepartment]);
      setToast({ message: "Teacher deleted.", type: "success" });
    },
    onError: (error) => {
      setToast({ message: String((error as any)?.response?.data?.detail ?? (error as Error).message), type: "error" });
    },
  });

  const assignMutation = useMutation({
    mutationFn: (payload: AssignmentFormValues) => adminApi.assignSubject(payload),
    onSuccess: () => {
      setIsAssignModalOpen(false);
      setAssignmentForm(DEFAULT_ASSIGNMENT_FORM);
      setToast({ message: "Subject assigned to teacher.", type: "success" });
    },
    onError: (error) => {
      setAssignmentError(String((error as any)?.response?.data?.detail ?? (error as Error).message));
    },
  });

  useEffect(() => {
    if (departments.length && !selectedDepartment) {
      setSelectedDepartment(departments[0].id);
    }
  }, [departments, selectedDepartment]);

  const handleOpenCreate = () => {
    setSelectedTeacher(null);
    setFormError(null);
    setFormValues(DEFAULT_TEACHER_FORM);
    setIsTeacherModalOpen(true);
  };

  const handleOpenEdit = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setFormError(null);
    setFormValues({
      email: "",
      password: "",
      department_id: teacher.department_id,
      employee_id: teacher.employee_id,
      first_name: teacher.first_name,
      last_name: teacher.last_name,
      designation: teacher.designation ?? "",
      specialization: teacher.specialization ?? "",
      phone: teacher.phone ?? "",
      max_lectures_per_day: teacher.max_lectures_per_day,
      max_lectures_per_week: teacher.max_lectures_per_week,
      is_active: teacher.is_active,
    });
    setIsTeacherModalOpen(true);
  };

  const handleOpenAssign = (teacher: Teacher) => {
    setAssignmentError(null);
    setAssignmentForm({ ...DEFAULT_ASSIGNMENT_FORM, teacher_id: teacher.id, department_id: teacher.department_id });
    setIsAssignModalOpen(true);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!formValues.department_id || !formValues.employee_id.trim() || !formValues.first_name.trim() || !formValues.last_name.trim()) {
      setFormError("Department, employee ID, first name and last name are required.");
      return;
    }
    if (!selectedTeacher && !formValues.password) {
      setFormError("Password is required for a new teacher.");
      return;
    }

    try {
      if (selectedTeacher) {
        const payload = { ...formValues };
        delete payload.password;
        await updateMutation.mutateAsync({ id: selectedTeacher.id, payload });
      } else {
        await createMutation.mutateAsync(formValues);
      }
    } catch {
      // handled by onError
    }
  };

  const handleDelete = async (teacher: Teacher) => {
    if (!window.confirm(`Delete teacher "${teacher.first_name} ${teacher.last_name}"?`)) return;
    await deleteMutation.mutateAsync(teacher.id);
  };

  const handleAssign = async () => {
    setAssignmentError(null);
    if (!assignmentForm.teacher_id || !assignmentForm.section_id || !assignmentForm.subject_id) {
      setAssignmentError("Teacher, section, and subject are required.");
      return;
    }
    await assignMutation.mutateAsync(assignmentForm);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teachers"
        subtitle="Manage teachers, departments, and subject assignments."
        actions={<Button onClick={handleOpenCreate}>New Teacher</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="space-y-4">
          <Select
            label="Department"
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            options={departments.map((d) => ({ value: d.id, label: d.code }))}
          />
          <div className="text-sm text-slate-500">Filter teachers by department.</div>
        </Card>

        <Card>
          <Table
            columns={[
              { key: "employee_id", header: "Employee ID" },
              { key: "first_name", header: "Name", render: (row) => `${row.first_name} ${row.last_name}` },
              { key: "department_id", header: "Department" },
              { key: "phone", header: "Phone" },
              { key: "status", header: "Status", render: (row) => (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${row.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {row.is_active ? "Active" : "Inactive"}
                  </span>
                )
              },
              { key: "actions", header: "Actions", render: (row) => (
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); handleOpenEdit(row); }}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleOpenAssign(row); }}>Assign</Button>
                    <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(row); }}>Delete</Button>
                  </div>
                ), width: "320px"
              },
            ]}
            data={teachers}
            loading={isLoading || createMutation.isLoading || updateMutation.isLoading || deleteMutation.isLoading || assignMutation.isLoading}
          />
        </Card>
      </div>

      <Modal
        open={isTeacherModalOpen}
        onClose={() => setIsTeacherModalOpen(false)}
        title={selectedTeacher ? "Edit Teacher" : "Create Teacher"}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsTeacherModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={createMutation.isLoading || updateMutation.isLoading}>
              {selectedTeacher ? "Save changes" : "Create"}
            </Button>
          </div>
        }
        size="lg"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {!selectedTeacher && (
            <Input label="Email" value={formValues.email} onChange={(e) => setFormValues({ ...formValues, email: e.target.value })} />
          )}
          {!selectedTeacher && (
            <Input label="Password" type="password" value={formValues.password} onChange={(e) => setFormValues({ ...formValues, password: e.target.value })} />
          )}
          <Select
            label="Department"
            value={formValues.department_id}
            onChange={(e) => setFormValues({ ...formValues, department_id: e.target.value })}
            options={departments.map((d) => ({ value: d.id, label: d.code }))}
            placeholder="Choose department"
          />
          <Input label="Employee ID" value={formValues.employee_id} onChange={(e) => setFormValues({ ...formValues, employee_id: e.target.value })} />
          <Input label="First name" value={formValues.first_name} onChange={(e) => setFormValues({ ...formValues, first_name: e.target.value })} />
          <Input label="Last name" value={formValues.last_name} onChange={(e) => setFormValues({ ...formValues, last_name: e.target.value })} />
          <Input label="Phone" value={formValues.phone} onChange={(e) => setFormValues({ ...formValues, phone: e.target.value })} />
          <Input label="Designation" value={formValues.designation} onChange={(e) => setFormValues({ ...formValues, designation: e.target.value })} />
          <Input label="Specialization" value={formValues.specialization} onChange={(e) => setFormValues({ ...formValues, specialization: e.target.value })} />
          <Input label="Max lectures/day" type="number" value={formValues.max_lectures_per_day} onChange={(e) => setFormValues({ ...formValues, max_lectures_per_day: Number(e.target.value) })} />
          <Input label="Max lectures/week" type="number" value={formValues.max_lectures_per_week} onChange={(e) => setFormValues({ ...formValues, max_lectures_per_week: Number(e.target.value) })} />
          {selectedTeacher && (
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
          {formError && <p className="text-sm text-red-500 md:col-span-2">{formError}</p>}
        </div>
      </Modal>

      <Modal
        open={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title="Assign Subject to Teacher"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsAssignModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAssign} loading={assignMutation.isLoading}>
              Assign
            </Button>
          </div>
        }
        size="md"
      >
        <div className="space-y-4">
          <Select
            label="Department"
            value={assignmentForm.department_id}
            onChange={(e) => setAssignmentForm({ ...assignmentForm, department_id: e.target.value, academic_year_id: "", section_id: "", subject_id: "" })}
            options={departments.map((d) => ({ value: d.id, label: d.code }))}
            placeholder="Choose department"
          />
          <Select
            label="Academic year"
            value={assignmentForm.academic_year_id}
            onChange={(e) => setAssignmentForm({ ...assignmentForm, academic_year_id: e.target.value, section_id: "", subject_id: "" })}
            options={academicYears.map((y) => ({ value: y.id, label: y.year_name }))}
            placeholder="Choose year"
            disabled={!assignmentForm.department_id}
          />
          <Select
            label="Section"
            value={assignmentForm.section_id}
            onChange={(e) => setAssignmentForm({ ...assignmentForm, section_id: e.target.value })}
            options={sections.map((s) => ({ value: s.id, label: s.name }))}
            placeholder="Choose section"
            disabled={!assignmentForm.academic_year_id}
          />
          <Select
            label="Subject"
            value={assignmentForm.subject_id}
            onChange={(e) => setAssignmentForm({ ...assignmentForm, subject_id: e.target.value })}
            options={subjects.map((s) => ({ value: s.id, label: `${s.code} • ${s.name}` }))}
            placeholder="Choose subject"
            disabled={!assignmentForm.department_id || !assignmentForm.academic_year_id}
          />
          <Select
            label="Lecture type"
            value={assignmentForm.lecture_type}
            onChange={(e) => setAssignmentForm({ ...assignmentForm, lecture_type: e.target.value as AssignmentFormValues["lecture_type"] })}
            options={[
              { value: "theory", label: "Theory" },
              { value: "tutorial", label: "Tutorial" },
              { value: "lab", label: "Lab" },
            ]}
          />
          {assignmentError && <p className="text-sm text-red-500">{assignmentError}</p>}
        </div>
      </Modal>

      {toast && <div className="fixed right-6 top-6 z-50"><Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} /></div>}
    </div>
  );
};
