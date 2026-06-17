import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/api";
import { useAuthStore } from "@/store/authStore";
import { Button, Input, Select } from "@/components/ui";
import type { SignupDepartment, UserRole } from "@/types";

export const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const { setTokens, setProfile } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("admin");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: departments = [], isLoading: loadingData } = useQuery<SignupDepartment[]>({
    queryKey: ["signup-data"],
    queryFn: () => authApi.signupData().then((res) => res.data),
    retry: false,
  });

  const selectedDepartment = useMemo(
    () => departments.find((dept) => dept.id === departmentId),
    [departments, departmentId],
  );

  const sections = useMemo(() => {
    if (!selectedDepartment) return [];
    return selectedDepartment.academic_years.flatMap((year) => year.sections);
  }, [selectedDepartment]);

  const selectedSection = useMemo(
    () => sections.find((section) => section.id === sectionId),
    [sections, sectionId],
  );

  const batches = selectedSection?.batches ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const payload: Record<string, unknown> = {
        email,
        password,
        role,
      };

      if (role === "teacher") {
        payload.first_name = firstName;
        payload.last_name = lastName;
        payload.employee_id = employeeId;
        payload.department_id = departmentId;
      }

      if (role === "student") {
        payload.first_name = firstName;
        payload.last_name = lastName;
        payload.student_id = studentId;
        payload.section_id = sectionId;
        payload.batch_id = batchId;
      }

      const res = await authApi.signup(payload);
      const data = res.data;
      setTokens(data.access_token, data.refresh_token, data.user_id, data.role, data.name);
      const meRes = await authApi.me();
      setProfile(meRes.data);

      const routes: Record<UserRole, string> = {
        admin: "/admin",
        teacher: "/teacher",
        student: "/student",
      };
      const roleKey = data.role as UserRole;
      navigate(routes[roleKey]);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (!detail) {
        setError("Signup failed. Please review your inputs.");
      } else if (typeof detail === "string") {
        setError(detail);
      } else {
        try {
          setError(Array.isArray(detail) ? detail.map((d) => d.msg || JSON.stringify(d)).join("; ") : JSON.stringify(detail));
        } catch {
          setError("Signup failed. See console for details.");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const roleRequiresDepartment = role === "teacher" || role === "student";
  const roleRequiresTeacherInfo = role === "teacher";
  const roleRequiresStudentInfo = role === "student";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4 font-sans">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="absolute rounded-full opacity-5 bg-blue-400"
            style={{ width: `${150 + i*80}px`, height: `${150 + i*80}px`, top: `${10+i*12}%`, left: `${5+i*15}%`, animationDelay: `${i*0.5}s` }} />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="relative w-full max-w-2xl"
      >
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/30">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">TimetableOS</h1>
              <p className="text-blue-300/60 text-xs">Create your account and access role-specific timetables</p>
            </div>
          </div>

          <h2 className="text-white font-semibold text-xl mb-1">Create account</h2>
          <p className="text-slate-400 text-sm mb-6">Sign up as admin, teacher, or student</p>

          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Email"
                type="email"
                value={email}
                required
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                label="Password"
                type="password"
                value={password}
                required
                onChange={(e) => setPassword(e.target.value)}
                hint="Minimum 8 characters"
              />
            </div>

            <Select
              label="Role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value as UserRole);
                setError("");
              }}
              options={
                // If there are no departments seeded yet, only allow admin signup
                departments.length === 0
                  ? [{ value: "admin", label: "Admin" }]
                  : [
                      { value: "admin", label: "Admin" },
                      { value: "teacher", label: "Teacher" },
                      { value: "student", label: "Student" },
                    ]
              }
            />

            {departments.length === 0 && (
              <div className="text-sm text-yellow-300">No departments exist yet — create an Admin account first, then add departments/sections/batches from the Admin dashboard.</div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required={roleRequiresTeacherInfo || roleRequiresStudentInfo}
              />
              <Input
                label="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required={roleRequiresTeacherInfo || roleRequiresStudentInfo}
              />
            </div>

            {roleRequiresDepartment && (
              <Select
                label="Department"
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  setSectionId("");
                  setBatchId("");
                }}
                options={departments.map((dept) => ({ value: dept.id, label: `${dept.name} (${dept.code})` }))}
                placeholder={loadingData ? "Loading departments…" : departments.length ? "Select department" : "No departments available"}
                required={departments.length > 0}
              />
            )}

            {roleRequiresTeacherInfo && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="Employee ID"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  required
                />
              </div>
            )}

            {roleRequiresStudentInfo && (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input
                    label="Student ID"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    required
                  />
                </div>
                <Select
                  label="Section"
                  value={sectionId}
                  onChange={(e) => {
                    setSectionId(e.target.value);
                    setBatchId("");
                  }}
                  options={sections.map((section) => ({ value: section.id, label: section.name }))}
                  placeholder={departmentId ? "Select section" : "Choose a department first"}
                  required
                />
                <Select
                  label="Batch"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  options={batches.map((batch) => ({ value: batch.id, label: batch.name }))}
                  placeholder={sectionId ? "Select batch" : "Choose a section first"}
                  required
                />
              </>
            )}

            {error && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <Button type="submit" loading={loading} className="w-full md:w-auto">
                {loading ? "Creating account…" : "Create account"}
              </Button>
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="text-sm text-slate-300 hover:text-white transition-colors"
              >
                Already have an account? Sign in
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
};
