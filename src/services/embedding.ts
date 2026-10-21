import { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { bedrockClient as client } from "./bedrockClient";

export const EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v2:0";

/**
 * Vector size requested from Titan Text Embeddings v2 (it supports 256, 512
 * or 1024). Must match the `vector(N)` column in src/db/schema.sql, otherwise
 * pgvector rejects the similarity query with "different vector dimensions".
 */
export const EMBEDDING_DIMENSIONS = 1024;

/**
 * Builds the Titan v2 request body. The dimensions are set explicitly rather
 * than relying on the model default, and vectors are normalized so cosine
 * distance in pgvector behaves consistently.
 */
export function buildEmbeddingRequest(text: string): string {
  return JSON.stringify({
    inputText: text,
    dimensions: EMBEDDING_DIMENSIONS,
    normalize: true,
  });
}

/**
 * Extracts the embedding vector from a Titan embeddings response body.
 * Throws a descriptive error if the body does not contain an array of
 * `expectedDimensions` finite numbers, rather than letting a malformed or
 * wrongly sized vector reach Postgres.
 */
export function parseEmbeddingResponse(
  body: unknown,
  expectedDimensions: number = EMBEDDING_DIMENSIONS
): number[] {
  const embedding = (body as { embedding?: unknown } | null)?.embedding;

  if (
    !Array.isArray(embedding) ||
    embedding.length === 0 ||
    !embedding.every((v) => typeof v === "number" && Number.isFinite(v))
  ) {
    throw new Error("Bedrock embedding response did not contain a valid embedding vector");
  }

  if (embedding.length !== expectedDimensions) {
    throw new Error(
      `Bedrock embedding has ${embedding.length} dimensions, expected ${expectedDimensions}`
    );
  }

  return embedding;
}

export async function embedText(text: string): Promise<number[]> {
  const command = new InvokeModelCommand({
    modelId: EMBEDDING_MODEL_ID,
    contentType: "application/json",
    body: buildEmbeddingRequest(text),
  });

  const response = await client.send(command);
  const body = JSON.parse(new TextDecoder().decode(response.body));
  return parseEmbeddingResponse(body);
}
