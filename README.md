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

Database, requires Docker:

    docker run -d --name ai-knowledge-pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ai_knowledge_assistant -p 5433:5432 pgvector/pgvector:pg16

## Infrastructure deployment

    cd infra
    terraform init
    terraform plan
    terraform apply

## Project structure

- src/app.ts, Express app definition
- src/index.ts, local dev entry point
- src/lambda.ts, AWS Lambda entry point
- src/handlers/chat.ts, chat request handler
- src/services/bedrock.ts, Claude generation via Bedrock
- src/services/embedding.ts, text embedding via Titan
- src/services/retrieval.ts, pgvector similarity search
- src/db/client.ts, PostgreSQL connection
- src/db/schema.sql, table and index definitions
- frontend/src/App.tsx, chat UI
- infra/*.tf, Terraform resource definitions

## Status

Built as a portfolio project to demonstrate a full-stack, cloud-native RAG implementation, from infrastructure-as-code through to a deployed, publicly accessible application.
