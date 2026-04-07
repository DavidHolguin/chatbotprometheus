import { tool } from "ai";
import type { UIMessageStreamWriter } from "ai";
import { z } from "zod";
import "server-only";
import { createAgentTask } from "@/lib/db/queries";
import { runAgent } from "@/lib/ai/agents/run-agent";
import type { AgentTaskEvent, ChatMessage } from "@/lib/types";

const AGENT_CONFIGS = {
  coder: {
    modelId: "deepseek/deepseek-v3.2",
    systemPrompt:
      "You are an expert software engineer. You write clean, efficient, well-commented code. Focus exclusively on the programming task given. Return ONLY the code or technical explanation requested — no small talk.",
  },
  writer: {
    modelId: "mistral/mistral-small",
    systemPrompt:
      "You are an expert writer and editor. Produce clear, concise, well-structured text. Adapt tone and style to context. Return ONLY the written content requested — no meta-commentary.",
  },
  analyst: {
    modelId: "moonshotai/kimi-k2-0905",
    systemPrompt:
      "You are an expert data analyst and critical thinker. Break down complex problems, identify patterns, and provide structured analysis with clear reasoning. Return ONLY your analysis — be precise and evidence-based.",
  },
  researcher: {
    modelId: "moonshotai/kimi-k2-0905",
    systemPrompt:
      "You are an expert researcher. Synthesize information thoroughly, identify key insights, and present findings in a structured format. Return ONLY your research summary.",
  },
} as const;

export type AgentName = keyof typeof AGENT_CONFIGS;

/**
 * Herramienta del Orquestador para delegar tareas a agentes especializados.
 * Crea una task en DB, ejecuta el agente y retorna el output al modelo.
 */
export const delegateToAgent = ({
  sessionId,
  userId,
  dataStream,
  sequenceIndex,
}: {
  sessionId: string;
  userId: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  sequenceIndex: { current: number };
}) =>
  tool({
    description:
      "Delegate a specific subtask to a specialized agent. Use this when the task requires deep expertise in coding, writing, data analysis, or research.",
    inputSchema: z.object({
      agentName: z
        .enum(["coder", "writer", "analyst", "researcher"])
        .describe("The specialized agent to use"),
      task: z
        .string()
        .describe(
          "Detailed description of what the agent must produce. Be specific and self-contained."
        ),
    }),
    execute: async ({ agentName, task }) => {
      const index = sequenceIndex.current++;
      const config = AGENT_CONFIGS[agentName];

      // Crear tarea en DB
      const [createdTask] = await createAgentTask({
        sessionId,
        agentName,
        input: task,
        sequenceIndex: index,
      });

      // Emitir evento "queued" a la UI
      const queuedEvent: AgentTaskEvent = {
        taskId: createdTask.id,
        agentName,
        sessionId,
        input: task,
        sequenceIndex: index,
      };
      dataStream.write({
        type: "data-agent-task-queued",
        data: queuedEvent,
        transient: true,
      });

      // Ejecutar el agente
      const output = await runAgent({
        taskId: createdTask.id,
        sessionId,
        agentName,
        systemPrompt: config.systemPrompt,
        modelId: config.modelId,
        input: task,
        userId,
        dataStream,
        sequenceIndex: index,
      });

      return { agentName, output, taskId: createdTask.id };
    },
  });
