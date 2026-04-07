"use client";

import { useCallback } from "react";
import { useAgentRealtime } from "@/hooks/use-agent-realtime";
import type { AgentTaskEvent } from "@/lib/types";
import { useAgentSessionContext, type AgentTaskState } from "./agent-session-provider";

const STATUS_ICON: Record<AgentTaskState["status"], string> = {
  queued: "○",
  running: "◌",
  completed: "●",
  failed: "✕",
};

const STATUS_COLOR: Record<AgentTaskState["status"], string> = {
  queued: "text-muted-foreground",
  running: "text-blue-500 animate-pulse",
  completed: "text-green-500",
  failed: "text-red-500",
};

const AGENT_LABELS: Record<string, string> = {
  coder: "Coder",
  writer: "Writer",
  analyst: "Analyst",
  researcher: "Researcher",
};

export function AgentStatusPanel() {
  const { sessionId, tasks, isActive, updateTask } = useAgentSessionContext();

  const handleRealtimeUpdate = useCallback(
    (event: AgentTaskEvent, status: AgentTaskState["status"]) => {
      updateTask(event, status);
    },
    [updateTask]
  );

  useAgentRealtime({ sessionId, onTaskUpdate: handleRealtimeUpdate });

  if (!isActive || tasks.length === 0) return null;

  return (
    <div className="border rounded-lg p-3 mt-2 bg-muted/30 space-y-2 text-sm">
      <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">
        Agentes activos
      </p>
      <ul className="space-y-1.5">
        {tasks.map((task) => (
          <li key={task.taskId} className="flex items-start gap-2">
            <span
              className={`mt-0.5 shrink-0 font-mono ${STATUS_COLOR[task.status]}`}
            >
              {STATUS_ICON[task.status]}
            </span>
            <div className="min-w-0">
              <span className="font-medium">
                {AGENT_LABELS[task.agentName] ?? task.agentName}
              </span>
              <span className="text-muted-foreground ml-1 text-xs">
                #{task.sequenceIndex + 1}
              </span>
              <p className="text-muted-foreground truncate text-xs mt-0.5">
                {task.input.slice(0, 80)}
                {task.input.length > 80 ? "…" : ""}
              </p>
              {task.status === "failed" && task.error && (
                <p className="text-red-500 text-xs mt-0.5">{task.error}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
