# AI Knowledge Assistant

A RAG-based (Retrieval-Augmented Generation) Q&A assistant. Upload documents, ask questions in plain English, and get answers grounded in the source material, with citations attached.

**Live demo:**
- Frontend: http://ai-knowledge-assistant-frontend-415400464254.s3-website-us-east-1.amazonaws.com
- API: https://xum7phmpeg.execute-api.us-east-1.amazonaws.com

## Stack

**Backend**
- Node.js + TypeScript + Express
- PostgreSQL + pgvector for vector similarity search
- AWS Bedrock (Claude + Titan Embeddings) for retrieval and generation
- Deployed as AWS Lambda behind API Gateway (via serverless-http)

**Frontend**
- React + TypeScript + Vite
- Tailwind CSS v4
- Deployed to S3 static website hosting

**Infrastructure**
- Terraform: all AWS resources (Lambda, API Gateway, S3, IAM) are defined as code, not created manually

## Local development

Backend, runs on localhost:3000:

    npm install
    npm run dev

Frontend, runs on localhost:5173:

    cd frontend
    npm install
    npm run dev

In dev mode the frontend sends /chat and /health to the Vite dev server, which proxies them to the local backend on localhost:3000 (set API_PROXY_TARGET to proxy elsewhere). Production builds (npm run build) call the deployed API. Set VITE_API_BASE to point either mode at a specific API URL instead.

Database, requires Docker:

    docker run -d --name ai-knowledge-pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ai_knowledge_assistant -p 5433:5432 pgvector/pgvector:pg16

Configuration, all optional (defaults match the local setup above):

| Variable | Default | Used for |
| --- | --- | --- |
| PORT | 3000 | Local dev server port |
| DB_HOST / DB_PORT | localhost / 5433 | Postgres connection |
| DB_NAME | ai_knowledge_assistant | Postgres database |
| DB_USER / DB_PASSWORD | postgres / postgres | Postgres credentials |
| BEDROCK_REGION | us-east-1 | Region for Bedrock embedding and generation calls |

Unit tests, no AWS or database needed (Bedrock and Postgres are stubbed):

    npm test

Frontend unit tests (Vitest, with `fetch` stubbed) and lint:

    cd frontend
    npm test
    npm run lint

## API

All responses, including errors, are JSON. Errors have the shape `{ "error": "<message>" }`.

### POST /chat

Request:

    { "query": "How do I rotate the API keys?" }

The query is trimmed and must be non-empty and at most 2000 characters.

Response (200):

    {
      "answer": "…",
      "sources": [
        { "documentId": "<uuid>", "snippet": "preview of the matching chunk…" }
      ]
    }

Each `snippet` is a one-line preview of the chunk: runs of whitespace (line breaks, indentation) are collapsed to single spaces, and text longer than 150 characters is cut at a character boundary and ends with `…`. A document appears once per matching chunk, so the same `documentId` can be listed more than once.

Up to 5 of the most similar chunks are retrieved. If none are found, the model is not called and the answer says no relevant documents were found, with an empty `sources` array.

| Status | When |
| --- | --- |
| 400 | `query` missing or blank (`query is required`), not a string (`query must be a string`) or longer than 2000 characters; body is not valid JSON |
| 413 | Request body is larger than the 16 KB JSON limit (far above the largest valid query) |
| 404 | Unknown route |
| 405 | Known route called with the wrong method (e.g. `GET /chat`); the `Allow` header lists the supported ones |
| 502 | Bedrock or Postgres failed while answering |

### GET /health

Returns `{ "status": "ok" }` when the API is up. It does not check Bedrock or the database.

## Infrastructure deployment

    cd infra
    terraform init
    terraform plan
    terraform apply

## Project structure

- src/app.ts, Express app definition
- src/index.ts, local dev entry point
- src/port.ts, dev server port selection
- src/lambda.ts, AWS Lambda entry point
- src/handlers/chat.ts, chat request handler
- src/services/bedrock.ts, Claude generation via Bedrock
- src/services/embedding.ts, text embedding via Titan
- src/services/bedrockClient.ts, shared Bedrock client and region config
- src/services/retrieval.ts, pgvector similarity search
- src/db/client.ts, PostgreSQL connection
- src/db/schema.sql, table and index definitions
- frontend/src/App.tsx, chat UI
- frontend/src/api.ts, API client and base URL selection
- infra/*.tf, Terraform resource definitions

## Status

Built as a portfolio project to demonstrate a full-stack, cloud-native RAG implementation, from infrastructure-as-code through to a deployed, publicly accessible application.
