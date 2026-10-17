import { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { bedrockClient as client } from "./bedrockClient";

/**
 * Extracts the generated text from an Anthropic Messages response body.
 * Joins all text blocks and throws a descriptive error if there are none
 * (e.g. an empty content array), instead of failing with a TypeError on
 * `content[0].text`.
 */
export function parseAnswerResponse(body: unknown): string {
  const content = (body as { content?: unknown } | null)?.content;

  if (!Array.isArray(content)) {
    throw new Error("Bedrock response did not contain a content array");
  }

  const text = content
    .filter(
      (block): block is { type: "text"; text: string } =>
        typeof block === "object" &&
        block !== null &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string"
    )
    .map((block) => block.text)
    .join("");

  if (text.trim().length === 0) {
    throw new Error("Bedrock response did not contain any generated text");
  }

  return text;
}

export async function generateAnswer(query: string, context: string): Promise<string> {
  const prompt = `Based on the following context, answer the question.\n\nContext:\n${context}\n\nQuestion: ${query}`;

  const command = new InvokeModelCommand({
    modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    contentType: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const response = await client.send(command);
  const body = JSON.parse(new TextDecoder().decode(response.body));
  return parseAnswerResponse(body);
}
