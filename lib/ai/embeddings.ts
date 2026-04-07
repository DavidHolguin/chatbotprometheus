import { embed } from "ai";
import "server-only";

/**
 * Genera un embedding de 1536 dimensiones usando text-embedding-3-small via AI Gateway.
 * Usado para guardar y buscar memorias semánticas de agentes.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: "openai/text-embedding-3-small" as Parameters<typeof embed>[0]["model"],
    value: text,
  });
  return embedding;
}
