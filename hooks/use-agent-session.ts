"use client";

import { useCallback, useState } from "react";
import type { AgentTaskEvent } from "@/lib/types";

export type AgentTaskState = AgentTaskEvent & {
  status: "queued" | "running" | "completed" | "failed";
};

export type AgentSessionState = {
  sessionId: string | null;
  tasks: AgentTaskState[];
  isActive: boolean;
};

const initialState: AgentSessionState = {
  sessionId: null,
  tasks: [],
  isActive: false,
};

export function useAgentSession() {
  const [state, setState] = useState<AgentSessionState>(initialState);

  const setSessionId = useCallback((sessionId: string) => {
    setState((prev) => ({ ...prev, sessionId, isActive: true, tasks: [] }));
  }, []);

  const updateTask = useCallback(
    (event: AgentTaskEvent, status: AgentTaskState["status"]) => {
      setState((prev) => {
        const exists = prev.tasks.find((t) => t.taskId === event.taskId);
        if (exists) {
          return {
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.taskId === event.taskId ? { ...t, ...event, status } : t
            ),
          };
        }
        return {
          ...prev,
          tasks: [...prev.tasks, { ...event, status }],
        };
      });
    },
    []
  );

  const reset = useCallback(() => setState(initialState), []);

  return { state, setSessionId, updateTask, reset };
}
