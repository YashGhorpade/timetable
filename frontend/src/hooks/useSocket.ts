import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "@/store/authStore";
import type { WsEvent, WsPayload } from "@/types";

const WS_URL = import.meta.env.VITE_WS_URL;

let globalSocket: Socket | null = null;

export function useSocket() {
  const { accessToken, role, profile } = useAuthStore();
  const handlersRef = useRef<Map<string, Set<(data: WsPayload) => void>>>(new Map());

  useEffect(() => {
    if (!accessToken) return;

    // Build rooms to join based on role
    const rooms: string[] = [];
    if (role === "admin") rooms.push("admin");
    if (role === "teacher" && profile?.teacher_id) rooms.push(`teacher:${profile.teacher_id}`);
    if (role === "student" && profile?.section_id) rooms.push(`section:${profile.section_id}`);
    if (role === "student" && profile?.batch_id)   rooms.push(`batch:${profile.batch_id}`);

    if (!globalSocket || !globalSocket.connected) {
      globalSocket = io(WS_URL ?? undefined, {
        path: "/socket.io",
        auth: { token: accessToken, rooms },
        transports: ["websocket", "polling"],
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      });
    }

    const socket = globalSocket;

    // Forward all events to registered handlers
    const EVENTS: WsEvent[] = [
      "TIMETABLE_UPDATED", "TEACHER_UPDATED", "CLASSROOM_UPDATED",
      "SECTION_UPDATED", "SUBJECT_UPDATED", "NOTIFICATION",
      "TRAINING_STARTED", "TRAINING_COMPLETED", "TRAINING_FAILED",
    ];

    EVENTS.forEach((evt) => {
      socket.on(evt, (data: WsPayload) => {
        handlersRef.current.get(evt)?.forEach((cb) => cb(data));
      });
    });

    return () => {
      EVENTS.forEach((evt) => socket.off(evt));
    };
  }, [accessToken, role, profile]);

  const on = useCallback((event: WsEvent, handler: (data: WsPayload) => void) => {
    if (!handlersRef.current.has(event)) handlersRef.current.set(event, new Set());
    handlersRef.current.get(event)!.add(handler);
    return () => { handlersRef.current.get(event)?.delete(handler); };
  }, []);

  const joinRoom = useCallback((room: string) => {
    globalSocket?.emit("join_room", { room });
  }, []);

  return { on, joinRoom, socket: globalSocket };
}
