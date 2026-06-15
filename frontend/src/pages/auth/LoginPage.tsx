import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { authApi } from "@/api";
import { useAuthStore } from "@/store/authStore";
import { Button, Input } from "@/components/ui";

export const LoginPage: React.FC = () => {
  const navigate  = useNavigate();
  const { setTokens, setProfile } = useAuthStore();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res  = await authApi.login(email, password);
      const data = res.data;
      setTokens(data.access_token, data.refresh_token, data.user_id, data.role, data.name);
      const meRes = await authApi.me();
      setProfile(meRes.data);

      const routes: Record<string, string> = { admin: "/admin", teacher: "/teacher", student: "/student" };
      navigate(routes[data.role] ?? "/");
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  // Demo credentials
  const DEMOS = [
    { label: "Admin",   email: "admin@timetable.com",   pw: "Admin@1234",   color: "bg-blue-600" },
    { label: "Teacher", email: "t001@timetable.com",    pw: "Teacher@1234", color: "bg-emerald-600" },
    { label: "Student", email: "student@timetable.com", pw: "Student@1234", color: "bg-violet-600" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4 font-sans">
      {/* Background decoration */}
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
        className="relative w-full max-w-md"
      >
        {/* Card */}
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/30">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">TimetableOS</h1>
              <p className="text-blue-300/60 text-xs">Enterprise Scheduling System</p>
            </div>
          </div>

          <h2 className="text-white font-semibold text-xl mb-1">Sign in</h2>
          <p className="text-slate-400 text-sm mb-6">Access your dashboard</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1.5">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                placeholder="you@institution.edu"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1.5">Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)} required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
                {error}
              </motion.div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Signing in…</>
              ) : "Sign In"}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-slate-400">
            Don't have an account? <button type="button" onClick={() => navigate("/signup")} className="text-blue-400 hover:text-blue-300 font-medium">Sign up</button>
          </p>

          {/* Demo credentials */}
          <div className="mt-6 pt-6 border-t border-white/5">
            <p className="text-xs text-slate-500 mb-3 text-center">Demo accounts</p>
            <div className="grid grid-cols-3 gap-2">
              {DEMOS.map(d => (
                <button
                  key={d.label}
                  onClick={() => { setEmail(d.email); setPassword(d.pw); }}
                  className={`${d.color} hover:opacity-90 text-white text-xs font-medium py-2 px-3 rounded-xl transition-all`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-600 text-center mt-2">Click to autofill credentials</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
