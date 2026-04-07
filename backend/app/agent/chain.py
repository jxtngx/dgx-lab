from __future__ import annotations

import logging
import time
import uuid

from app.agent.personas import build_team_directory
from app.agent.rag import get_retriever
from app.agent.skills import build_skills_summary
from app.agent.tracing import configure_tracing, export_trace_locally

log = logging.getLogger(__name__)

_chain = None

SYSTEM_PROMPT = """You are the DGX Lab Assistant, a local AI helper embedded in the DGX Lab dashboard. \
You help users understand and work with DGX Lab -- its tools, architecture, codebase, and configuration.

You run on a DGX Spark (GB10, 128 GB unified memory, ~273 GB/s bandwidth, FP4). \
DGX Lab is a local-first developer dashboard with 8 tools: Control, Logger, Traces, Monitor, AutoModel, Designer, Curator, Datasets.

The stack is Next.js 16 + Tailwind CSS 4 frontend, FastAPI + Python 3.12 backend, Docker Compose + nginx, Tailscale for remote access.

When answering:
- Be direct and technical. The user is an ML engineer or AI developer.
- Reference specific files, functions, and configuration when relevant.
- Use the retrieved context to ground your answers in the actual codebase.
- If the question is about a specific agent persona's domain, adopt that perspective.
- If the question is about a specific skill (LangChain, LangSmith, etc.), reference the skill documentation.
- Always mention file paths in monospace.

{team_directory}

{skills_summary}
"""


def _build_chain():
    global _chain

    configure_tracing()

    from langchain_aws import ChatBedrockConverse
    from langchain_core.output_parsers import StrOutputParser
    from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
    from langchain_core.runnables import RunnablePassthrough

    llm = ChatBedrockConverse(
        model="anthropic.claude-3-5-haiku-20241022-v1:0",
        region_name="us-east-1",
        temperature=0.3,
        max_tokens=2048,
    )

    team_dir = build_team_directory()
    skills_sum = build_skills_summary()

    system = SYSTEM_PROMPT.format(
        team_directory=team_dir,
        skills_summary=skills_sum,
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system", system),
        MessagesPlaceholder("context_docs", optional=True),
        MessagesPlaceholder("history", optional=True),
        ("human", "{question}"),
    ])

    retriever = get_retriever(k=6)

    def format_docs(docs):
        if not docs:
            return ""
        parts = []
        for doc in docs:
            source = doc.metadata.get("source", "unknown")
            parts.append(f"--- {source} ---\n{doc.page_content}")
        return "\n\n".join(parts)

    def retrieve_and_format(inputs):
        question = inputs["question"]
        docs = []
        sources = []
        if retriever:
            docs = retriever.invoke(question)
            sources = [d.metadata.get("source", "unknown") for d in docs]
        context = format_docs(docs)
        return {
            "question": question,
            "history": inputs.get("history", []),
            "context_docs": [("system", f"Retrieved context:\n\n{context}")] if context else [],
            "_sources": sources,
        }

    chain = (
        RunnablePassthrough()
        | retrieve_and_format
        | prompt
        | llm
        | StrOutputParser()
    )

    _chain = chain
    log.info("Agent chain built with Bedrock Haiku 3.5")
    return chain


def get_chain():
    global _chain
    if _chain is None:
        return _build_chain()
    return _chain


def invoke(question: str, history: list | None = None, conversation_id: str | None = None) -> dict:
    chain = get_chain()
    retriever = get_retriever(k=6)

    sources = []
    if retriever:
        docs = retriever.invoke(question)
        sources = list(dict.fromkeys(d.metadata.get("source", "unknown") for d in docs))

    trace_id = str(uuid.uuid4())
    start = time.time()

    try:
        result = chain.invoke({
            "question": question,
            "history": history or [],
        })
        duration_ms = int((time.time() - start) * 1000)

        export_trace_locally(
            trace_id=trace_id,
            run_name="dgx-lab-agent",
            inputs={"question": question},
            outputs={"answer": result},
            duration_ms=duration_ms,
            status="success",
        )

        return {
            "answer": result,
            "sources": sources,
            "trace_id": trace_id,
            "duration_ms": duration_ms,
            "conversation_id": conversation_id,
        }
    except Exception as exc:
        duration_ms = int((time.time() - start) * 1000)
        export_trace_locally(
            trace_id=trace_id,
            run_name="dgx-lab-agent",
            inputs={"question": question},
            outputs={},
            duration_ms=duration_ms,
            status="error",
            error=str(exc),
        )
        raise
