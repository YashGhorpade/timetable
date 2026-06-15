import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserRole, MeResponse } from "@/types";

interface AuthState {
  accessToken:  string | null;
  refreshToken: string | null;
  userId:       string | null;
  role:         UserRole | null;
  name:         string | null;
  profile:      MeResponse | null;
  isAuthenticated: boolean;

  setTokens: (access: string, refresh: string, userId: string, role: UserRole, name: string) => void;
  setProfile: (profile: MeResponse) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken:     null,
      refreshToken:    null,
      userId:          null,
      role:            null,
      name:            null,
      profile:         null,
      isAuthenticated: false,

      setTokens: (access, refresh, userId, role, name) =>
        set({ accessToken: access, refreshToken: refresh, userId, role, name, isAuthenticated: true }),

      setProfile: (profile) => set({ profile }),

      logout: () =>
        set({
          accessToken: null, refreshToken: null,
          userId: null, role: null, name: null,
          profile: null, isAuthenticated: false,
        }),
    }),
    {
      name: "timetable-auth",
      partialState: (state: AuthState) => ({
        accessToken:    state.accessToken,
        refreshToken:   state.refreshToken,
        userId:         state.userId,
        role:           state.role,
        name:           state.name,
        profile:        state.profile,
        isAuthenticated: state.isAuthenticated,
      }),
    } as any,
  ),
);
