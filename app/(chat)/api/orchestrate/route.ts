import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
} from "ai";
import { after } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getLanguageModel } from "@/lib/ai/providers";
import { delegateToAgent } from "@/lib/ai/tools/delegate-to-agent";
import {
  createAgentSession,
  getChatById,
  updateAgentSession,
} from "@/lib/db/queries";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";
import { z } from "zod";

export const maxDuration = 300;

const ORCHESTRATOR_SYSTEM_PROMPT = `You are an expert orchestrator managing a team of specialized AI agents.

Your team:
- **coder**: writes, reviews, and debugs code in any language
- **writer**: drafts and edits long-form text, reports, documentation
- **analyst**: performs data analysis, structured reasoning, quantitative evaluation
- **researcher**: synthesizes information, summarizes, and identifies key insights

Your job:
1. Analyze the user's request
2. Break it into clear sub-tasks
3. Delegate each sub-task to the most appropriate agent using \`delegateToAgent\`
4. Synthesize the agents' outputs into a final coherent response

Rules:
- Always delegate — never try to do the agents' work yourself
- Be specific when describing tasks to agents
- After all delegations, synthesize a final answer that integrates all outputs
- Maximum 6 delegations per request`;

const requestSchema = z.object({
  chatId: z.string(),
  userMessage: z.string(),
  selectedModelId: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { chatId, userMessage, selectedModelId } = parsed.data;
  const orchestratorModel = selectedModelId ?? "moonshotai/kimi-k2.5";

  // Verificar que el chat pertenece al usuario
  const chat = await getChatById({ id: chatId });
  if (!chat || chat.userId !== session.user.id) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  // Crear sesión de orquestación en DB
  const [agentSessionRow] = await createAgentSession({
    chatId,
    userId: session.user.id,
    orchestratorModel,
  });

  const sequenceIndex = { current: 0 };

  const stream = createUIMessageStream<ChatMessage>({
    execute: async ({ writer: dataStream }) => {
      // Emitir session ID a la UI para que se suscriba a Realtime
      dataStream.write({
        type: "data-agent-session-id",
        data: agentSessionRow.id,
        transient: true,
      });

      await updateAgentSession({ id: agentSessionRow.id, status: "running" });

      const result = streamText({
        model: getLanguageModel(orchestratorModel),
        system: ORCHESTRATOR_SYSTEM_PROMPT,
        prompt: userMessage,
        tools: {
          delegateToAgent: delegateToAgent({
            sessionId: agentSessionRow.id,
            userId: session.user.id,
            dataStream,
            sequenceIndex,
          }),
        },
        stopWhen: stepCountIs(6),
        maxSteps: 6,
      });

      dataStream.merge(result.toUIMessageStream());

      after(async () => {
        const finalText = await result.text;
        await updateAgentSession({
          id: agentSessionRow.id,
          status: "completed",
          summary: finalText,
        });
      });
    },
    generateId: generateUUID,
    onError: async () => {
      await updateAgentSession({ id: agentSessionRow.id, status: "failed" });
      return "The orchestration failed. Please try again.";
    },
  });

  return createUIMessageStreamResponse({ stream });
}
