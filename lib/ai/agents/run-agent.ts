import { streamText } from "ai";
import type { UIMessageStreamWriter } from "ai";
import "server-only";
import {
  getRecentAgentMemory,
  insertAgentMemory,
  updateAgentTask,
} from "@/lib/db/queries";
import { getLanguageModel } from "@/lib/ai/providers";
import type { AgentTaskEvent, ChatMessage } from "@/lib/types";

/**
 * Ejecuta un agente especialista:
 * 1. Recupera memoria reciente del agente
 * 2. Llama streamText() con el modelo del agente
 * 3. Actualiza el estado de la tarea en DB
 * 4. Persiste el output en agent_memory
 * 5. Emite eventos al dataStream para la UI
 */
export async function runAgent({
  taskId,
  sessionId,
  agentName,
  systemPrompt,
  modelId,
  input,
  userId,
  dataStream,
  sequenceIndex,
}: {
  taskId: string;
  sessionId: string;
  agentName: string;
  systemPrompt: string;
  modelId: string;
  input: string;
  userId: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  sequenceIndex: number;
}): Promise<string> {
  // Marcar tarea como en progreso
  await updateAgentTask({ id: taskId, status: "running" });

  const runningEvent: AgentTaskEvent = {
    taskId,
    agentName,
    sessionId,
    input,
    sequenceIndex,
  };
  dataStream.write({
    type: "data-agent-task-running",
    data: runningEvent,
    transient: true,
  });

  // Recuperar memoria reciente para enriquecer el contexto
  const memories = await getRecentAgentMemory({ userId, agentName, limit: 3 });
  const memoryContext =
    memories.length > 0
      ? `\n\n## Contexto de trabajos anteriores:\n${memories.map((m) => `- ${m.content}`).join("\n")}`
      : "";

  let fullOutput = "";

  try {
    const result = streamText({
      model: getLanguageModel(modelId),
      system: systemPrompt + memoryContext,
      prompt: input,
    });

    for await (const chunk of result.textStream) {
      fullOutput += chunk;
    }

    await updateAgentTask({ id: taskId, status: "completed", output: fullOutput });

    // Persistir en memoria del agente (sin embedding por ahora — se añade en Fase 7)
    await insertAgentMemory({
      userId,
      agentName,
      content: `Tarea: ${input.slice(0, 200)}\nResultado: ${fullOutput.slice(0, 500)}`,
    });

    const completedEvent: AgentTaskEvent = {
      taskId,
      agentName,
      sessionId,
      input,
      output: fullOutput,
      sequenceIndex,
    };
    dataStream.write({
      type: "data-agent-task-completed",
      data: completedEvent,
      transient: true,
    });

    return fullOutput;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await updateAgentTask({ id: taskId, status: "failed", errorMessage });

    const failedEvent: AgentTaskEvent = {
      taskId,
      agentName,
      sessionId,
      input,
      error: errorMessage,
      sequenceIndex,
    };
    dataStream.write({
      type: "data-agent-task-failed",
      data: failedEvent,
      transient: true,
    });

    throw error;
  }
}
