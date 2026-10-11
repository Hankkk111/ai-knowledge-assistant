import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({ region: "us-east-1" });

/**
 * Extracts the embedding vector from a Titan embeddings response body.
 * Throws a descriptive error if the body does not contain a non-empty array
 * of finite numbers, rather than letting a malformed vector reach Postgres.
 */
export function parseEmbeddingResponse(body: unknown): number[] {
  const embedding = (body as { embedding?: unknown } | null)?.embedding;

  if (
    !Array.isArray(embedding) ||
    embedding.length === 0 ||
    !embedding.every((v) => typeof v === "number" && Number.isFinite(v))
  ) {
    throw new Error("Bedrock embedding response did not contain a valid embedding vector");
  }

  return embedding;
}

export async function embedText(text: string): Promise<number[]> {
  const command = new InvokeModelCommand({
    modelId: "amazon.titan-embed-text-v2:0",
    contentType: "application/json",
    body: JSON.stringify({ inputText: text }),
  });

  const response = await client.send(command);
  const body = JSON.parse(new TextDecoder().decode(response.body));
  return parseEmbeddingResponse(body);
}
