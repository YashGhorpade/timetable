import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api";
import { Button, Card, Input, Modal, PageHeader, Select, Table, Toast } from "@/components/ui";
import type { Classroom, RoomType } from "@/types";

interface ClassroomFormValues {
  name: string;
  room_number: string;
  building: string;
  floor: number;
  capacity: number;
  room_type: RoomType;
  has_projector: boolean;
  has_ac: boolean;
  notes: string;
  is_active?: boolean;
}

const DEFAULT_FORM: ClassroomFormValues = {
  name: "",
  room_number: "",
  building: "",
  floor: 0,
  capacity: 20,
  room_type: "theory_room",
  has_projector: true,
  has_ac: false,
  notes: "",
};

export const ClassroomsPage: React.FC = () => {
  const qc = useQueryClient();
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(null);
  const [formValues, setFormValues] = useState<ClassroomFormValues>(DEFAULT_FORM);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: classrooms = [], isLoading } = useQuery<Classroom[]>({
    queryKey: ["classrooms"],
    queryFn: () => adminApi.getClassrooms().then((res) => res.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: ClassroomFormValues) => adminApi.createClassroom(payload),
    onSuccess: () => {
      qc.invalidateQueries(["classrooms"]);
      setIsModalOpen(false);
      setSelectedClassroom(null);
      setFormValues(DEFAULT_FORM);
      setToast({ message: "Classroom created successfully.", type: "success" });
    },
    onError: (error) => {
      setFormError(String((error as any)?.response?.data?.detail ?? (error as Error).message));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<ClassroomFormValues> }) =>
      adminApi.updateClassroom(id, payload),
    onSuccess: () => {
      qc.invalidateQueries(["classrooms"]);
      setIsModalOpen(false);
      setSelectedClassroom(null);
      setFormValues(DEFAULT_FORM);
      setToast({ message: "Classroom updated successfully.", type: "success" });
    },
    onError: (error) => {
      setFormError(String((error as any)?.response?.data?.detail ?? (error as Error).message));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteClassroom(id),
    onSuccess: () => {
      qc.invalidateQueries(["classrooms"]);
      setToast({ message: "Classroom deleted.", type: "success" });
    },
    onError: (error) => {
      setToast({ message: String((error as any)?.response?.data?.detail ?? (error as Error).message), type: "error" });
    },
  });

  const handleOpenCreate = () => {
    setSelectedClassroom(null);
    setFormError(null);
    setFormValues(DEFAULT_FORM);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (room: Classroom) => {
    setSelectedClassroom(room);
    setFormError(null);
    setFormValues({
      name: room.name,
      room_number: room.room_number,
      building: room.building,
      floor: room.floor,
      capacity: room.capacity,
      room_type: room.room_type,
      has_projector: room.has_projector,
      has_ac: room.has_ac,
      notes: room.notes ?? "",
      is_active: room.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!formValues.name.trim() || !formValues.room_number.trim() || !formValues.building.trim()) {
      setFormError("Name, room number, and building are required.");
      return;
    }

    try {
      if (selectedClassroom) {
        await updateMutation.mutateAsync({ id: selectedClassroom.id, payload: formValues });
      } else {
        await createMutation.mutateAsync(formValues);
      }
    } catch {
      // handled by onError
    }
  };

  const handleDelete = async (room: Classroom) => {
    if (!window.confirm(`Delete classroom "${room.name}"?`)) return;
    await deleteMutation.mutateAsync(room.id);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Classrooms"
        subtitle="Manage physical rooms used for lectures and labs."
        actions={<Button onClick={handleOpenCreate}>New Classroom</Button>}
      />

      <Card>
        <Table
          columns={[
            { key: "name", header: "Name" },
            { key: "room_number", header: "Room #" },
            { key: "building", header: "Building" },
            { key: "floor", header: "Floor" },
            { key: "capacity", header: "Capacity" },
            { key: "room_type", header: "Type" },
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
          data={classrooms}
          loading={isLoading || createMutation.isLoading || updateMutation.isLoading || deleteMutation.isLoading}
        />
      </Card>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedClassroom ? "Edit Classroom" : "Create Classroom"}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={createMutation.isLoading || updateMutation.isLoading}>
              {selectedClassroom ? "Save changes" : "Create"}
            </Button>
          </div>
        }
        size="lg"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Name" value={formValues.name} onChange={(e) => setFormValues({ ...formValues, name: e.target.value })} />
          <Input label="Room number" value={formValues.room_number} onChange={(e) => setFormValues({ ...formValues, room_number: e.target.value })} />
          <Input label="Building" value={formValues.building} onChange={(e) => setFormValues({ ...formValues, building: e.target.value })} />
          <Input label="Floor" type="number" value={formValues.floor} onChange={(e) => setFormValues({ ...formValues, floor: Number(e.target.value) })} />
          <Input label="Capacity" type="number" value={formValues.capacity} onChange={(e) => setFormValues({ ...formValues, capacity: Number(e.target.value) })} />
          <Select
            label="Room type"
            value={formValues.room_type}
            onChange={(e) => setFormValues({ ...formValues, room_type: e.target.value as RoomType })}
            options={[
              { value: "theory_room", label: "Theory room" },
              { value: "tutorial_room", label: "Tutorial room" },
              { value: "laboratory", label: "Laboratory" },
            ]}
          />
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={formValues.has_projector}
              onChange={(e) => setFormValues({ ...formValues, has_projector: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Has projector
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={formValues.has_ac}
              onChange={(e) => setFormValues({ ...formValues, has_ac: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Has AC
          </label>
          <Input label="Notes" value={formValues.notes} onChange={(e) => setFormValues({ ...formValues, notes: e.target.value })} />
          {selectedClassroom && (
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
