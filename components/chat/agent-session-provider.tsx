"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { AgentTaskEvent } from "@/lib/types";

export type AgentTaskState = AgentTaskEvent & {
  status: "queued" | "running" | "completed" | "failed";
};

type AgentSessionContextValue = {
  sessionId: string | null;
  tasks: AgentTaskState[];
  isActive: boolean;
  setSessionId: (id: string) => void;
  updateTask: (
    event: AgentTaskEvent,
    status: AgentTaskState["status"]
  ) => void;
  reset: () => void;
};

const AgentSessionContext = createContext<AgentSessionContextValue | null>(
  null
);

export function AgentSessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionIdState] = useState<string | null>(null);
  const [tasks, setTasks] = useState<AgentTaskState[]>([]);
  const [isActive, setIsActive] = useState(false);

  const setSessionId = useCallback((id: string) => {
    setSessionIdState(id);
    setIsActive(true);
    setTasks([]);
  }, []);

  const updateTask = useCallback(
    (event: AgentTaskEvent, status: AgentTaskState["status"]) => {
      setTasks((prev) => {
        const exists = prev.find((t) => t.taskId === event.taskId);
        if (exists) {
          return prev.map((t) =>
            t.taskId === event.taskId ? { ...t, ...event, status } : t
          );
        }
        return [...prev, { ...event, status }];
      });
    },
    []
  );

  const reset = useCallback(() => {
    setSessionIdState(null);
    setTasks([]);
    setIsActive(false);
  }, []);

  return (
    <AgentSessionContext.Provider
      value={{ sessionId, tasks, isActive, setSessionId, updateTask, reset }}
    >
      {children}
    </AgentSessionContext.Provider>
  );
}

export function useAgentSessionContext() {
  const ctx = useContext(AgentSessionContext);
  if (!ctx) {
    throw new Error(
      "useAgentSessionContext must be used within AgentSessionProvider"
    );
  }
  return ctx;
}
