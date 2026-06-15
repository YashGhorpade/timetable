import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api";
import { Button, Card, Input, PageHeader, Select, Toast } from "@/components/ui";
import type { ConstraintConfig, Department, TimetableSettings } from "@/types";

const DEFAULT_SETTINGS = {
  working_days: "monday,tuesday,wednesday,thursday,friday",
  lectures_per_day: 7,
  break_after_lectures: 3,
  lecture_start_time: "09:00",
  lecture_duration_min: 60,
  break_duration_min: 15,
  lunch_after_slot: 3,
  lunch_duration_min: 45,
  max_teacher_lectures_per_day: 5,
  max_teacher_lectures_per_week: 25,
};

const DEFAULT_CONSTRAINTS = {
  enforce_no_teacher_clash: true,
  enforce_no_room_clash: true,
  enforce_lab_consecutive: true,
  enforce_workload_limits: true,
  enforce_room_type_match: true,
  weight_minimize_gaps: 1,
  weight_teacher_comfort: 1,
  weight_room_switch_penalty: 1,
  weight_consecutive_workload: 1,
  weight_lab_morning_pref: 1,
};

export const SettingsPage: React.FC = () => {
  const qc = useQueryClient();
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [settingsForm, setSettingsForm] = useState({ ...DEFAULT_SETTINGS });
  const [constraintsForm, setConstraintsForm] = useState<ConstraintConfig>({
    id: "",
    department_id: "",
    ...DEFAULT_CONSTRAINTS,
  });
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [constraintsError, setConstraintsError] = useState<string | null>(null);

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: () => adminApi.getDepartments().then((res) => res.data),
  });

  const { data: settings, isLoading: loadingSettings } = useQuery<TimetableSettings | null>({
    queryKey: ["settings", selectedDepartment],
    queryFn: () =>
      adminApi.getSettings(selectedDepartment).then((res) => res.data).catch((error: any) => {
        if (error?.response?.status === 404) return null;
        throw error;
      }),
    enabled: !!selectedDepartment,
    retry: false,
  });

  const { data: constraints, isLoading: loadingConstraints } = useQuery<ConstraintConfig>({
    queryKey: ["constraints", selectedDepartment],
    queryFn: () => adminApi.getConstraints(selectedDepartment).then((res) => res.data),
    enabled: !!selectedDepartment,
  });

  useEffect(() => {
    if (departments.length && !selectedDepartment) {
      setSelectedDepartment(departments[0].id);
    }
  }, [departments, selectedDepartment]);

  useEffect(() => {
    if (settings) {
      setSettingsForm(settings);
    } else {
      setSettingsForm({ ...DEFAULT_SETTINGS });
    }
  }, [settings]);

  useEffect(() => {
    if (constraints) {
      setConstraintsForm(constraints);
    } else if (selectedDepartment) {
      setConstraintsForm({
        id: "",
        department_id: selectedDepartment,
        ...DEFAULT_CONSTRAINTS,
      });
    }
  }, [constraints, selectedDepartment]);

  const createSettingsMutation = useMutation({
    mutationFn: (payload: typeof settingsForm) => adminApi.createSettings({ department_id: selectedDepartment, ...payload }),
    onSuccess: () => {
      qc.invalidateQueries(["settings", selectedDepartment]);
      setToast({ message: "Timetable settings created successfully.", type: "success" });
    },
    onError: (error: any) => {
      setSettingsError(String(error?.response?.data?.detail ?? error?.message ?? "Unable to create settings."));
    },
  });

  const updateConstraintsMutation = useMutation({
    mutationFn: (payload: Partial<ConstraintConfig>) => adminApi.updateConstraints(selectedDepartment, payload),
    onSuccess: () => {
      qc.invalidateQueries(["constraints", selectedDepartment]);
      setToast({ message: "Constraints updated successfully.", type: "success" });
    },
    onError: (error: any) => {
      setConstraintsError(String(error?.response?.data?.detail ?? error?.message ?? "Unable to save constraints."));
    },
  });

  const trainScorerMutation = useMutation({
    mutationFn: (deptId?: string) => adminApi.trainScorer(deptId),
    onSuccess: () => {
      setToast({ message: "Training scheduled. Check server logs for progress.", type: "success" });
    },
    onError: (error: any) => {
      setToast({ message: String(error?.response?.data?.detail ?? error?.message ?? "Failed to schedule training."), type: "error" });
    },
  });

  const handleSettingsSubmit = async () => {
    setSettingsError(null);
    if (!selectedDepartment) {
      setSettingsError("Select a department first.");
      return;
    }
    if (settings) {
      setSettingsError("Timetable settings already exist. Create only when no settings are initialized.");
      return;
    }
    await createSettingsMutation.mutateAsync(settingsForm);
  };

  const handleConstraintsSubmit = async () => {
    setConstraintsError(null);
    if (!selectedDepartment) {
      setConstraintsError("Select a department first.");
      return;
    }
    await updateConstraintsMutation.mutateAsync({
      enforce_no_teacher_clash: constraintsForm.enforce_no_teacher_clash,
      enforce_no_room_clash: constraintsForm.enforce_no_room_clash,
      enforce_lab_consecutive: constraintsForm.enforce_lab_consecutive,
      enforce_workload_limits: constraintsForm.enforce_workload_limits,
      enforce_room_type_match: constraintsForm.enforce_room_type_match,
      weight_minimize_gaps: constraintsForm.weight_minimize_gaps,
      weight_teacher_comfort: constraintsForm.weight_teacher_comfort,
      weight_room_switch_penalty: constraintsForm.weight_room_switch_penalty,
      weight_consecutive_workload: constraintsForm.weight_consecutive_workload,
      weight_lab_morning_pref: constraintsForm.weight_lab_morning_pref,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Manage timetable defaults and solver constraint weights for your selected department."
        actions={
          !settings ? (
            <Button onClick={handleSettingsSubmit} loading={createSettingsMutation.isLoading}>
              Initialize Settings
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button onClick={() => trainScorerMutation.mutate(selectedDepartment)} loading={trainScorerMutation.isLoading}>
                Train Scorer
              </Button>
            </div>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="space-y-4">
          <Select
            label="Department"
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            options={departments.map((dept) => ({ value: dept.id, label: dept.code }))}
          />
          <div className="text-sm text-slate-500">Select the department whose timetable defaults and constraint weights you want to manage.</div>
          {settings ? (
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4 text-sm text-slate-600 dark:text-slate-300">
              Timetable settings are initialized for this department. Only constraint weights can be updated from this page.
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4 text-sm text-slate-600 dark:text-slate-300">
              No settings exist yet for this department. Fill in the values and click Initialize Settings.
            </div>
          )}
        </Card>

        <div className="grid gap-4">
          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Timetable Settings</h2>
                <p className="text-sm text-slate-500">Lecture timing, working days, and teacher load limits.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Working days"
                value={settingsForm.working_days}
                onChange={(e) => setSettingsForm({ ...settingsForm, working_days: e.target.value })}
                hint="Comma-separated days (e.g. monday,tuesday,wednesday,thursday,friday)"
              />
              <Input
                label="Lectures per day"
                type="number"
                value={settingsForm.lectures_per_day}
                onChange={(e) => setSettingsForm({ ...settingsForm, lectures_per_day: Number(e.target.value) })}
              />
              <Input
                label="Break after lectures"
                type="number"
                value={settingsForm.break_after_lectures}
                onChange={(e) => setSettingsForm({ ...settingsForm, break_after_lectures: Number(e.target.value) })}
              />
              <Input
                label="Lecture start time"
                type="time"
                value={settingsForm.lecture_start_time}
                onChange={(e) => setSettingsForm({ ...settingsForm, lecture_start_time: e.target.value })}
              />
              <Input
                label="Lecture duration (min)"
                type="number"
                value={settingsForm.lecture_duration_min}
                onChange={(e) => setSettingsForm({ ...settingsForm, lecture_duration_min: Number(e.target.value) })}
              />
              <Input
                label="Break duration (min)"
                type="number"
                value={settingsForm.break_duration_min}
                onChange={(e) => setSettingsForm({ ...settingsForm, break_duration_min: Number(e.target.value) })}
              />
              <Input
                label="Lunch after slot"
                type="number"
                value={settingsForm.lunch_after_slot}
                onChange={(e) => setSettingsForm({ ...settingsForm, lunch_after_slot: Number(e.target.value) })}
              />
              <Input
                label="Lunch duration (min)"
                type="number"
                value={settingsForm.lunch_duration_min}
                onChange={(e) => setSettingsForm({ ...settingsForm, lunch_duration_min: Number(e.target.value) })}
              />
              <Input
                label="Max teacher lectures/day"
                type="number"
                value={settingsForm.max_teacher_lectures_per_day}
                onChange={(e) => setSettingsForm({ ...settingsForm, max_teacher_lectures_per_day: Number(e.target.value) })}
              />
              <Input
                label="Max teacher lectures/week"
                type="number"
                value={settingsForm.max_teacher_lectures_per_week}
                onChange={(e) => setSettingsForm({ ...settingsForm, max_teacher_lectures_per_week: Number(e.target.value) })}
              />
            </div>

            {settingsError && <p className="text-sm text-red-500">{settingsError}</p>}
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Solver Constraints</h2>
                <p className="text-sm text-slate-500">Soft and hard constraint weights used by the timetable solver.</p>
              </div>
              <Button onClick={handleConstraintsSubmit} loading={updateConstraintsMutation.isLoading}>
                Save Constraints
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={constraintsForm.enforce_no_teacher_clash}
                    onChange={(e) => setConstraintsForm({ ...constraintsForm, enforce_no_teacher_clash: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Enforce no teacher clash
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={constraintsForm.enforce_no_room_clash}
                    onChange={(e) => setConstraintsForm({ ...constraintsForm, enforce_no_room_clash: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Enforce no room clash
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={constraintsForm.enforce_lab_consecutive}
                    onChange={(e) => setConstraintsForm({ ...constraintsForm, enforce_lab_consecutive: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Enforce lab consecutive sessions
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={constraintsForm.enforce_workload_limits}
                    onChange={(e) => setConstraintsForm({ ...constraintsForm, enforce_workload_limits: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Enforce workload limits
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={constraintsForm.enforce_room_type_match}
                    onChange={(e) => setConstraintsForm({ ...constraintsForm, enforce_room_type_match: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Enforce room type match
                </label>
              </div>

              <div className="grid gap-4">
                <Input
                  label="Gap minimization weight"
                  type="number"
                  value={constraintsForm.weight_minimize_gaps}
                  onChange={(e) => setConstraintsForm({ ...constraintsForm, weight_minimize_gaps: Number(e.target.value) })}
                />
                <Input
                  label="Teacher comfort weight"
                  type="number"
                  value={constraintsForm.weight_teacher_comfort}
                  onChange={(e) => setConstraintsForm({ ...constraintsForm, weight_teacher_comfort: Number(e.target.value) })}
                />
                <Input
                  label="Room switch penalty"
                  type="number"
                  value={constraintsForm.weight_room_switch_penalty}
                  onChange={(e) => setConstraintsForm({ ...constraintsForm, weight_room_switch_penalty: Number(e.target.value) })}
                />
                <Input
                  label="Consecutive workload weight"
                  type="number"
                  value={constraintsForm.weight_consecutive_workload}
                  onChange={(e) => setConstraintsForm({ ...constraintsForm, weight_consecutive_workload: Number(e.target.value) })}
                />
                <Input
                  label="Lab morning preference weight"
                  type="number"
                  value={constraintsForm.weight_lab_morning_pref}
                  onChange={(e) => setConstraintsForm({ ...constraintsForm, weight_lab_morning_pref: Number(e.target.value) })}
                />
              </div>
            </div>

            {constraintsError && <p className="text-sm text-red-500">{constraintsError}</p>}
          </Card>
        </div>
      </div>

      {toast && (
        <div className="fixed right-6 top-6 z-50">
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        </div>
      )}
    </div>
  );
};
