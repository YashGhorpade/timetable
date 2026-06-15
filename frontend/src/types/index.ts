// ─── Enums ────────────────────────────────────────────────────────────────────
export type UserRole      = "admin" | "teacher" | "student";
export type LectureType   = "theory" | "tutorial" | "lab";
export type RoomType      = "theory_room" | "tutorial_room" | "laboratory";
export type DayOfWeek     = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
export type TimetableStatus = "draft" | "published" | "archived";
export type SwapStatus    = "pending" | "approved" | "rejected" | "cancelled";
export type LabSlotPreference = "morning" | "afternoon" | "no_preference" | "admin_configured";

// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface TokenResponse {
  access_token:  string;
  refresh_token: string;
  token_type:    string;
  user_id:       string;
  role:          UserRole;
  name:          string;
}

export interface MeResponse {
  user_id:       string;
  email:         string;
  role:          UserRole;
  name:          string;
  is_active:     boolean;
  teacher_id?:   string;
  student_id?:   string;
  section_id?:   string;
  batch_id?:     string;
  department_id?: string;
}

export interface SignupBatch {
  id: string;
  section_id: string;
  name: string;
  strength: number;
  is_active: boolean;
}

export interface SignupSection {
  id: string;
  academic_year_id: string;
  name: string;
  batches: SignupBatch[];
}

export interface SignupAcademicYear {
  id: string;
  year_name: string;
  year_number: number;
  sections: SignupSection[];
}

export interface SignupDepartment {
  id: string;
  name: string;
  code: string;
  academic_years: SignupAcademicYear[];
}

// ─── Department ───────────────────────────────────────────────────────────────
export interface Department {
  id:                       string;
  name:                     string;
  code:                     string;
  description?:             string;
  lab_slot_preference:      LabSlotPreference;
  lab_preferred_slot_indices?: string;
  is_active:                boolean;
  created_at:               string;
}

// ─── Academic Year ────────────────────────────────────────────────────────────
export interface AcademicYear {
  id:            string;
  department_id: string;
  year_name:     string;
  year_number:   number;
  is_active:     boolean;
}

// ─── Section & Batch ──────────────────────────────────────────────────────────
export interface Batch {
  id:         string;
  section_id: string;
  name:       string;
  strength:   number;
  is_active:  boolean;
}

export interface Section {
  id:               string;
  academic_year_id: string;
  name:             string;
  strength:         number;
  is_active:        boolean;
  batches:          Batch[];
}

// ─── Subject ──────────────────────────────────────────────────────────────────
export interface Subject {
  id:               string;
  department_id:    string;
  academic_year_id: string;
  name:             string;
  code:             string;
  description?:     string;
  is_active:        boolean;
}

export interface LectureFrequency {
  id:                   string;
  subject_id:           string;
  section_id:           string;
  theory_per_week:      number;
  tutorial_per_week:    number;
  lab_per_week:         number;
  theory_duration_min:  number;
  tutorial_duration_min: number;
  lab_duration_min:     number;
}

// ─── Teacher ──────────────────────────────────────────────────────────────────
export interface Teacher {
  id:                    string;
  user_id:               string;
  department_id:         string;
  employee_id:           string;
  first_name:            string;
  last_name:             string;
  designation?:          string;
  specialization?:       string;
  phone?:                string;
  max_lectures_per_day:  number;
  max_lectures_per_week: number;
  is_active:             boolean;
}

// ─── Student ──────────────────────────────────────────────────────────────────
export interface Student {
  id:         string;
  user_id:    string;
  section_id: string;
  batch_id:   string;
  student_id: string;
  first_name: string;
  last_name:  string;
  phone?:     string;
  is_active:  boolean;
}

// ─── Classroom ────────────────────────────────────────────────────────────────
export interface Classroom {
  id:            string;
  name:          string;
  room_number:   string;
  building:      string;
  floor:         number;
  capacity:      number;
  room_type:     RoomType;
  has_projector: boolean;
  has_ac:        boolean;
  is_active:     boolean;
  notes?:        string;
}

// ─── Timeslot ─────────────────────────────────────────────────────────────────
export interface Timeslot {
  id:          string;
  day_of_week: DayOfWeek;
  slot_index:  number;
  start_time:  string;
  end_time:    string;
  is_break:    boolean;
  is_lunch:    boolean;
  label?:      string;
}

// ─── Timetable Entry ──────────────────────────────────────────────────────────
export interface TimetableEntry {
  id:                  string;
  version_id:          string;
  timeslot_id:         string;
  subject_id:          string;
  teacher_id:          string;
  classroom_id:        string;
  section_id:          string;
  lecture_type:        LectureType;
  batch_id?:           string;
  is_lab_continuation: boolean;
  lab_group_id?:       string;
  is_locked:           boolean;
  // Enriched
  timeslot?:           Timeslot;
  subject_name?:       string;
  subject_code?:       string;
  teacher_name?:       string;
  classroom_name?:     string;
  classroom_room_number?: string;
  section_name?:       string;
  batch_name?:         string;
  department_name?:    string;
}

export interface TimetableVersion {
  id:               string;
  department_id:    string;
  academic_year_id: string;
  name:             string;
  status:           TimetableStatus;
  solver_score?:    number;
  notes?:           string;
  created_at:       string;
}

// ─── Classroom Availability ───────────────────────────────────────────────────
export interface ClassroomAvailabilityResult {
  classroom:    Classroom;
  is_available: boolean;
  occupied_by?: string;
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export interface TimetableSettings {
  id:                            string;
  department_id:                 string;
  working_days:                  string;
  lectures_per_day:              number;
  break_after_lectures:          number;
  lecture_start_time:            string;
  lecture_duration_min:          number;
  break_duration_min:            number;
  lunch_after_slot:              number;
  lunch_duration_min:            number;
  max_teacher_lectures_per_day:  number;
  max_teacher_lectures_per_week: number;
}

// ─── WebSocket Events ─────────────────────────────────────────────────────────
export type WsEvent =
  | "TIMETABLE_UPDATED"
  | "TEACHER_UPDATED"
  | "CLASSROOM_UPDATED"
  | "SECTION_UPDATED"
  | "SUBJECT_UPDATED"
  | "NOTIFICATION";

export interface WsPayload {
  version_id?:     string;
  department_id?:  string;
  teacher_id?:     string;
  section_id?:     string;
  classroom_id?:   string;
  action?:         string;
  [key: string]:   unknown;
}
