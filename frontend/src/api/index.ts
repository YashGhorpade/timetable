import axios, { type AxiosInstance } from "axios";
import { useAuthStore } from "@/store/authStore";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

export const api: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

// ─── Request interceptor: attach access token ────────────────────────────────
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor: auto refresh on 401 ───────────────────────────────
let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)));
  failedQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const { refreshToken, setTokens, logout } = useAuthStore.getState();

      if (!refreshToken) {
        logout();
        window.location.href = "/login";
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }

      isRefreshing = true;
      try {
        const res = await axios.post(`${BASE_URL}/api/v1/auth/refresh`, {
          refresh_token: refreshToken,
        });
        const { access_token, refresh_token, user_id, role, name } = res.data;
        setTokens(access_token, refresh_token, user_id, role, name);
        processQueue(null, access_token);
        original.headers.Authorization = `Bearer ${access_token}`;
        return api(original);
      } catch (e) {
        processQueue(e, null);
        logout();
        window.location.href = "/login";
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);

// ─── Auth endpoints ────────────────────────────────────────────────────────────
export const authApi = {
  login:   (email: string, password: string) =>
    api.post("/auth/login",   { email, password }),
  signup:  (data: Record<string, unknown>) =>
    api.post("/auth/signup",  data),
  signupData: () => api.get("/auth/signup-data"),
  refresh: (refresh_token: string) =>
    api.post("/auth/refresh", { refresh_token }),
  logout:  (refresh_token: string) =>
    api.post("/auth/logout",  { refresh_token }),
  me:      () => api.get("/auth/me"),
  getActivity: () => api.get("/auth/activity"),
};

// ─── Admin endpoints ──────────────────────────────────────────────────────────
export const adminApi = {
  // Departments
  getDepartments:    () => api.get("/admin/departments"),
  createDepartment:  (d: unknown) => api.post("/admin/departments", d),
  updateDepartment:  (id: string, d: unknown) => api.patch(`/admin/departments/${id}`, d),
  deleteDepartment:  (id: string) => api.delete(`/admin/departments/${id}`),

  // Academic Years
  getAcademicYears:  (deptId: string) => api.get(`/admin/academic-years/${deptId}`),
  createAcademicYear:(d: unknown) => api.post("/admin/academic-years", d),

  // Sections
  getSections:       (yearId: string) => api.get(`/admin/sections/${yearId}`),
  createSection:     (d: unknown) => api.post("/admin/sections", d),
  updateSection:     (id: string, d: unknown) => api.patch(`/admin/sections/${id}`, d),
  deleteSection:     (id: string) => api.delete(`/admin/sections/${id}`),

  // Batches
  getBatches:        (sectionId: string) => api.get(`/admin/batches/${sectionId}`),
  createBatch:       (d: unknown) => api.post("/admin/batches", d),
  updateBatch:       (id: string, d: unknown) => api.patch(`/admin/batches/${id}`, d),
  deleteBatch:       (id: string) => api.delete(`/admin/batches/${id}`),

  // Subjects
  getSubjects:       (params?: Record<string, string>) => api.get("/admin/subjects", { params }),
  createSubject:     (d: unknown) => api.post("/admin/subjects", d),
  updateSubject:     (id: string, d: unknown) => api.patch(`/admin/subjects/${id}`, d),
  deleteSubject:     (id: string) => api.delete(`/admin/subjects/${id}`),

  // Lecture frequencies
  getFrequencies:    (subjectId: string) => api.get(`/admin/lecture-frequencies/${subjectId}`),
  createFrequency:   (d: unknown) => api.post("/admin/lecture-frequencies", d),
  updateFrequency:   (id: string, d: unknown) => api.patch(`/admin/lecture-frequencies/${id}`, d),
  deleteFrequency:   (id: string) => api.delete(`/admin/lecture-frequencies/${id}`),

  // Teachers
  getTeachers:       (params?: Record<string, string>) => api.get("/admin/teachers", { params }),
  createTeacher:     (d: unknown) => api.post("/admin/teachers", d),
  updateTeacher:     (id: string, d: unknown) => api.patch(`/admin/teachers/${id}`, d),
  deleteTeacher:     (id: string) => api.delete(`/admin/teachers/${id}`),
  assignSubject:     (d: unknown) => api.post("/admin/teachers/assign-subject", d),

  // Students
  getStudents:       (params?: Record<string, string>) => api.get("/admin/students", { params }),
  createStudent:     (d: unknown) => api.post("/admin/students", d),
  updateStudent:     (id: string, d: unknown) => api.patch(`/admin/students/${id}`, d),
  deleteStudent:     (id: string) => api.delete(`/admin/students/${id}`),

  // Classrooms
  getClassrooms:     (params?: Record<string, string>) => api.get("/admin/classrooms", { params }),
  createClassroom:   (d: unknown) => api.post("/admin/classrooms", d),
  updateClassroom:   (id: string, d: unknown) => api.patch(`/admin/classrooms/${id}`, d),
  deleteClassroom:   (id: string) => api.delete(`/admin/classrooms/${id}`),

  // Settings & constraints
  createSettings:    (d: unknown) => api.post("/admin/timetable-settings", d),
  getSettings:       (deptId: string) => api.get(`/admin/timetable-settings/${deptId}`),
  getConstraints:    (deptId: string) => api.get(`/admin/constraints/${deptId}`),
  updateConstraints: (deptId: string, d: unknown) => api.patch(`/admin/constraints/${deptId}`, d),
  // Train scorer
  trainScorer:       (deptId?: string) => api.post(`/admin/train-scorer`, null, { params: { department_id: deptId } }),
};

// ─── Timetable endpoints ──────────────────────────────────────────────────────
export const timetableApi = {
  generate:           (d: unknown) => api.post("/timetable/generate", d),
  publishVersion:     (versionId: string) => api.post(`/timetable/versions/${versionId}/publish`),
  listVersions:       (deptId: string, yearId: string) =>
    api.get("/timetable/versions", { params: { department_id: deptId, academic_year_id: yearId } }),
  getTimeslots:       (versionId: string) => api.get(`/timetable/versions/${versionId}/timeslots`),
  getAllEntries:       (versionId: string) => api.get(`/timetable/versions/${versionId}/all`),
  getTeacherTimetable:(versionId: string, teacherId: string) =>
    api.get(`/timetable/versions/${versionId}/teacher/${teacherId}`),
  getMyTimetable:(versionId: string) => api.get(`/timetable/me/${versionId}`),
  getSectionTimetable:(versionId: string, sectionId: string) =>
    api.get(`/timetable/versions/${versionId}/section/${sectionId}`),
  getStudentTimetable:(versionId: string) => api.get(`/timetable/me/${versionId}`),
  getBatchTimetable:  (versionId: string, batchId: string) =>
    api.get(`/timetable/versions/${versionId}/batch/${batchId}`),
  getClassroomTimetable:(versionId: string, classroomId: string) =>
    api.get(`/timetable/versions/${versionId}/classroom/${classroomId}`),
  moveEntry:          (d: unknown) => api.post("/timetable/move", d),
  checkAvailability:  (d: unknown) => api.post("/timetable/classroom-availability", d),
  lockEntry:          (entryId: string) => api.post(`/timetable/entries/${entryId}/lock`),
  unlockEntry:        (entryId: string) => api.post(`/timetable/entries/${entryId}/unlock`),
  deleteEntry:        (entryId: string) => api.delete(`/timetable/entries/${entryId}`),
  saveVersion:        (versionId: string) => api.post(`/timetable/versions/${versionId}/save`),
  deleteVersion:      (versionId: string) => api.delete(`/timetable/versions/${versionId}`),
};
