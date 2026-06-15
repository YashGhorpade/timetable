import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import type { UserRole } from "@/types";

// Pages
import { LoginPage }       from "@/pages/auth/LoginPage";
import { SignupPage }      from "@/pages/auth/SignupPage";
import { AdminDashboard }  from "@/pages/admin/AdminDashboard";
import { AdminTimetablePage } from "@/pages/admin/AdminTimetablePage";
import { AcademicYearsPage } from "@/pages/admin/AcademicYearsPage";
import { BatchesPage }      from "@/pages/admin/BatchesPage";
import { DepartmentsPage } from "@/pages/admin/DepartmentsPage";
import { SectionsPage }    from "@/pages/admin/SectionsPage";
import { SubjectsPage }    from "@/pages/admin/SubjectsPage";
import { TeachersPage }    from "@/pages/admin/TeachersPage";
import { StudentsPage }    from "@/pages/admin/StudentsPage";
import { ClassroomsPage }  from "@/pages/admin/ClassroomsPage";
import { LectureFrequenciesPage } from "@/pages/admin/LectureFrequenciesPage";
import { SettingsPage }    from "@/pages/admin/SettingsPage";
import { TeacherDashboard } from "@/pages/teacher/TeacherDashboard";
import { StudentDashboard } from "@/pages/student/StudentDashboard";
import { ActivityPage } from "@/pages/auth/ActivityPage";

// Layouts
import { AdminLayout }    from "@/components/admin/AdminLayout";

// ─── Route guard ──────────────────────────────────────────────────────────────
const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles?: UserRole[] }> = ({
  children, allowedRoles,
}) => {
  const { isAuthenticated, role } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    const redirects: Record<UserRole, string> = { admin: "/admin", teacher: "/teacher", student: "/student" };
    return <Navigate to={redirects[role]} replace />;
  }
  return <>{children}</>;
};

// ─── Auto-redirect from / ─────────────────────────────────────────────────────
const RootRedirect: React.FC = () => {
  const { isAuthenticated, role } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const routes: Record<UserRole, string> = { admin: "/admin", teacher: "/teacher", student: "/student" };
  return <Navigate to={routes[role!] ?? "/login"} replace />;
};

// ─── Simple layout wrappers for teacher/student ───────────────────────────────
const TeacherLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-50 dark:bg-slate-950">{children}</div>
);
const StudentLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-50 dark:bg-slate-950">{children}</div>
);

// ─── App Router ───────────────────────────────────────────────────────────────
export const AppRouter: React.FC = () => (
  <Routes>
    <Route path="/" element={<RootRedirect />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/signup" element={<SignupPage />} />

    {/* Admin routes */}
    <Route path="/admin" element={
      <ProtectedRoute allowedRoles={["admin"]}>
        <AdminLayout><AdminDashboard /></AdminLayout>
      </ProtectedRoute>
    } />
    <Route path="/admin/timetable" element={
      <ProtectedRoute allowedRoles={["admin"]}>
        <AdminLayout><AdminTimetablePage /></AdminLayout>
      </ProtectedRoute>
    } />
    <Route path="/admin/departments" element={
      <ProtectedRoute allowedRoles={["admin"]}>
        <AdminLayout><DepartmentsPage /></AdminLayout>
      </ProtectedRoute>
    } />
    <Route path="/admin/sections" element={
      <ProtectedRoute allowedRoles={["admin"]}>
        <AdminLayout><SectionsPage /></AdminLayout>
      </ProtectedRoute>
    } />
    <Route path="/admin/subjects" element={
      <ProtectedRoute allowedRoles={["admin"]}>
        <AdminLayout><SubjectsPage /></AdminLayout>
      </ProtectedRoute>
    } />
    <Route path="/admin/teachers" element={
      <ProtectedRoute allowedRoles={["admin"]}>
        <AdminLayout><TeachersPage /></AdminLayout>
      </ProtectedRoute>
    } />
    <Route path="/admin/students" element={
      <ProtectedRoute allowedRoles={["admin"]}>
        <AdminLayout><StudentsPage /></AdminLayout>
      </ProtectedRoute>
    } />
    <Route path="/admin/classrooms" element={
      <ProtectedRoute allowedRoles={["admin"]}>
        <AdminLayout><ClassroomsPage /></AdminLayout>
      </ProtectedRoute>
    } />
    <Route path="/admin/academic-years" element={
      <ProtectedRoute allowedRoles={["admin"]}>
        <AdminLayout><AcademicYearsPage /></AdminLayout>
      </ProtectedRoute>
    } />
    <Route path="/admin/batches" element={
      <ProtectedRoute allowedRoles={["admin"]}>
        <AdminLayout><BatchesPage /></AdminLayout>
      </ProtectedRoute>
    } />
    <Route path="/admin/lecture-frequencies" element={
      <ProtectedRoute allowedRoles={["admin"]}>
        <AdminLayout><LectureFrequenciesPage /></AdminLayout>
      </ProtectedRoute>
    } />
    <Route path="/admin/settings" element={
      <ProtectedRoute allowedRoles={["admin"]}>
        <AdminLayout><SettingsPage /></AdminLayout>
      </ProtectedRoute>
    } />

    {/* Teacher routes */}
    <Route path="/teacher" element={
      <ProtectedRoute allowedRoles={["teacher", "admin"]}>
        <TeacherLayout><TeacherDashboard /></TeacherLayout>
      </ProtectedRoute>
    } />

    <Route path="/me/activity" element={
      <ProtectedRoute>
        <ActivityPage />
      </ProtectedRoute>
    } />

    {/* Student routes */}
    <Route path="/student" element={
      <ProtectedRoute allowedRoles={["student", "admin"]}>
        <StudentLayout><StudentDashboard /></StudentLayout>
      </ProtectedRoute>
    } />

    {/* 404 */}
    <Route path="*" element={
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <p className="text-6xl font-bold text-slate-200 dark:text-slate-800">404</p>
          <p className="text-slate-500 mt-2">Page not found</p>
          <a href="/" className="text-blue-600 text-sm mt-4 inline-block hover:underline">Go home</a>
        </div>
      </div>
    } />
  </Routes>
);
