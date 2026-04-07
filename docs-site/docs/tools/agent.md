---
sidebar_position: 1
---

# DGX Lab Agent

The DGX Lab Agent is a codebase-aware assistant embedded in the dashboard navbar. It uses RAG over the full repository, agent persona definitions, and skill documentation to answer questions about DGX Lab's architecture, tools, configuration, and team structure.

## Stack

| Component | Implementation |
|-----------|---------------|
| LLM | Claude 3.5 Haiku via AWS Bedrock (`anthropic.claude-3-5-haiku-20241022-v1:0`) |
| Embeddings | `nvidia/llama-embed-nemotron-8b` on CUDA (FAISS GPU) |
| Reranker | `nvidia/llama-nemotron-rerank-1b-v2` on CUDA |
| Vector store | FAISS (GPU), persisted to `~/.dgx-lab/agent/faiss-index/` |
| Framework | LangChain + LangSmith tracing |
| Frontend | Sheet panel in the navbar (480px slide-out) |

## How it works

1. **Document collection** -- On first invocation (or manual reindex), the agent walks the codebase starting from `CODEBASE_ROOT`, respecting `.cursorignore` patterns. It skips `node_modules`, `.venv`, `__pycache__`, `.git`, binary files, and lock files. Agent personas and skills get a metadata boost for retrieval priority.

2. **Splitting** -- Documents are split using language-aware splitters: Python, TypeScript, and Markdown each get their own `RecursiveCharacterTextSplitter` with appropriate chunk sizes. Everything else gets a 1500-char default splitter.

3. **Embedding and indexing** -- Chunks are embedded with `nvidia/llama-embed-nemotron-8b` and stored in a FAISS GPU index. The index is saved to disk and reloaded on subsequent starts.

4. **Retrieval and reranking** -- Queries retrieve the top 20 candidates from FAISS, then `nvidia/llama-nemotron-rerank-1b-v2` (cross-encoder) reranks them down to the top 6.

5. **Generation** -- The reranked context, team directory, skills summary, and conversation history are injected into the prompt. Claude 3.5 Haiku generates the response with temperature 0.3 and a 2048 token limit.

6. **Tracing** -- Every invocation is traced. If `LANGSMITH_API_KEY` is set, traces go to LangSmith cloud. Regardless, a local JSONL export is written to `~/.dgx-lab/langsmith-traces/traces.jsonl`.

## Using the agent

Click the agent icon in the navbar to open the chat sheet. Type a question and press Enter or click Send.

The agent understands:

- Codebase structure, file locations, and configuration values
- How each tool works (Monitor, Control, AutoModel, Designer, Curator, Datasets, Traces, LangSmith)
- Agent persona roles and responsibilities (all 14 team members)
- Skills from `.cursor/skills/`
- DGX Spark hardware specs and constraints

Each response includes **source citations** -- the files the agent retrieved to ground its answer. These appear as chips below the message.

Use the **New chat** button to start a fresh conversation.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `LANGSMITH_API_KEY` | (none) | Enables LangSmith cloud tracing |
| `DGX_LAB_CODEBASE_ROOT` | Current working directory | Root directory for document collection |
| `DGX_LAB_AGENT_INDEX_DIR` | `~/.dgx-lab/agent` | FAISS index and conversation storage |
| `DGX_LAB_LANGSMITH_TRACES_DIR` | `~/.dgx-lab/langsmith-traces` | Local trace export directory |
| `AWS_REGION` / `AWS_DEFAULT_REGION` | `us-east-1` | Bedrock region for Claude |

AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or an instance profile) must be configured for Bedrock access.

## API endpoints

All endpoints are under `/api/agent`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/agent/chat` | Send a message. Body: `{ "message": "...", "conversation_id": "..." }` |
| `GET` | `/api/agent/conversations` | List all conversations (id, title, turn count, last activity) |
| `GET` | `/api/agent/conversations/{id}` | Get full conversation history |
| `DELETE` | `/api/agent/conversations/{id}` | Delete a conversation |
| `POST` | `/api/agent/reindex` | Force-rebuild the FAISS index from the current codebase |

### Chat response shape

```json
{
  "conversation_id": "uuid",
  "answer": "The Monitor tool reads GPU data via...",
  "sources": ["backend/app/routers/monitor.py", "docs/setup.md"],
  "trace_id": "uuid",
  "duration_ms": 3200
}
```

## Reindexing

The index is built lazily on first query and cached. To force a rebuild after code changes:

```bash
curl -X POST http://localhost:8000/api/agent/reindex
```

Or restart the backend -- the index will be rebuilt on the next query if the saved index file is missing.

## Evaluation

The agent ships with a seed evaluation dataset (`dgx-lab-agent-evals`) and a keyword-overlap correctness evaluator. Both require `LANGSMITH_API_KEY`.

The dataset covers five categories: tool knowledge, hardware specs, codebase structure, team awareness, and skill documentation. The evaluator scores predictions by checking how many key terms from the reference answer appear in the agent's response.

Evaluation functions are in `backend/app/agent/evals.py`. They are not run automatically -- invoke them from a script or notebook when validating agent quality.

## Source files

| Layer | Path |
|-------|------|
| Agent chain | `backend/app/agent/chain.py` |
| RAG pipeline | `backend/app/agent/rag.py` |
| Personas loader | `backend/app/agent/personas.py` |
| Skills loader | `backend/app/agent/skills.py` |
| Tracing config | `backend/app/agent/tracing.py` |
| Evaluation | `backend/app/agent/evals.py` |
| Chat router | `backend/app/routers/agent_chat.py` |
| Config paths | `backend/app/config.py` |
| Frontend sheet | `frontend/apps/web/components/agent-sheet.tsx` |
