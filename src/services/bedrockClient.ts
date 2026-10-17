import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";

// Region the Bedrock models used by this app (Titan embeddings, Claude) are
// enabled in. Kept as the default so existing deployments are unaffected.
export const DEFAULT_BEDROCK_REGION = "us-east-1";

/**
 * Picks the region for Bedrock calls. `BEDROCK_REGION` overrides the default,
 * e.g. when model access is enabled in a different region than us-east-1.
 * Blank values are ignored so an empty variable can't produce an invalid
 * endpoint.
 */
export function resolveBedrockRegion(env: NodeJS.ProcessEnv = process.env): string {
  const region = env.BEDROCK_REGION?.trim();
  return region ? region : DEFAULT_BEDROCK_REGION;
}

// Shared by the embedding and generation services so both always talk to the
// same region, and the SDK client (and its connection pool) is created once.
export const bedrockClient = new BedrockRuntimeClient({ region: resolveBedrockRegion() });
