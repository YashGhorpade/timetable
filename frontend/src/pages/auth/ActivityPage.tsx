import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSocket } from "@/hooks/useSocket";
import { authApi } from "@/api";
import { useAuthStore } from "@/store/authStore";
import { Button, Card } from "@/components/ui";

export const ActivityPage: React.FC = () => {
  const { profile } = useAuthStore();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["me", "activity"],
    queryFn: () => authApi.getActivity().then((r) => r.data),
    enabled: !!profile,
  });

  const { on } = useSocket();

  // Refresh activity on training events
  React.useEffect(() => {
    const offStart = on("TRAINING_STARTED", () => refetch());
    const offComplete = on("TRAINING_COMPLETED", () => refetch());
    const offFail = on("TRAINING_FAILED", () => refetch());
    return () => { offStart(); offComplete(); offFail(); };
  }, [on, refetch]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">My Activity</h2>
        <div>
          <Button onClick={() => refetch()}>{isLoading ? "Refreshing..." : "Refresh"}</Button>
        </div>
      </div>

      <Card>
        {isLoading && <p>Loading…</p>}
        {!isLoading && (!data || !data.items || data.items.length === 0) && <p>No recent activity.</p>}
        {!isLoading && data && data.items && (
          <ul className="space-y-2">
            {data.items.map((it: any, idx: number) => (
              <li key={idx} className="border-b py-2">
                <div className="text-sm text-slate-600">{it.type.toUpperCase()}</div>
                <div className="text-sm">{JSON.stringify(it)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
