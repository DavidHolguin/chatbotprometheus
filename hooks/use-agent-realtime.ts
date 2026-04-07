"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AgentTaskEvent } from "@/lib/types";

type AgentTaskStatus = "queued" | "running" | "completed" | "failed";

/**
 * Suscripción Supabase Realtime a cambios en agent_tasks.
 * Complementa el dataStream de AI SDK: persiste el estado entre recargas.
 */
export function useAgentRealtime({
  sessionId,
  onTaskUpdate,
}: {
  sessionId: string | null;
  onTaskUpdate: (event: AgentTaskEvent, status: AgentTaskStatus) => void;
}) {
  useEffect(() => {
    if (!sessionId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`agent-session-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "agent_tasks",
          filter: `sessionId=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            agentName: string;
            sessionId: string;
            input: string;
            output?: string;
            errorMessage?: string;
            sequenceIndex: number;
            status: AgentTaskStatus;
          };

          onTaskUpdate(
            {
              taskId: row.id,
              agentName: row.agentName,
              sessionId: row.sessionId,
              input: row.input,
              output: row.output,
              error: row.errorMessage,
              sequenceIndex: row.sequenceIndex,
            },
            row.status
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, onTaskUpdate]);
}
