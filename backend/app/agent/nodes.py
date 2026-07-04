"""LangGraph nodes: planner → retrieve → rerank → answer → verify."""

import json
from functools import lru_cache

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from app.agent.state import AgentState, Citation
from app.core.config import get_settings
from app.retrieval.reranker import rerank
from app.retrieval.vectorstore import hybrid_search

MAX_QUERIES = 3
RETRIEVE_LIMIT = 20
TOP_K = 8
HISTORY_WINDOW = 10


@lru_cache
def _llm() -> ChatGroq:
    s = get_settings()
    return ChatGroq(model=s.groq_model, api_key=s.groq_api_key, temperature=0.2)


def _parse_json(text: str) -> dict:
    """Extract first JSON object from LLM output; {} on failure."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        return {}
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return {}


async def planner(state: AgentState) -> dict:
    """Rewrite the question into 1-3 focused search queries."""
    prompt = (
        "You turn a user question into search queries for a document retrieval system.\n"
        'Reply with ONLY JSON: {"queries": ["...", ...]} — 1 to 3 short keyword-rich '
        "queries. Split multi-part questions; otherwise return one rewritten query."
    )
    msgs = [SystemMessage(prompt), HumanMessage(state["question"])]
    resp = await _llm().ainvoke(msgs)
    queries = _parse_json(str(resp.content)).get("queries", [])
    queries = [q for q in queries if isinstance(q, str) and q.strip()][:MAX_QUERIES]
    return {"queries": queries or [state["question"]]}


async def retrieve(state: AgentState) -> dict:
    """Hybrid search per query; dedupe by (document_id, chunk_index)."""
    seen: set[tuple[str, int]] = set()
    hits: list[dict] = []
    for q in state["queries"]:
        for p in hybrid_search(
            q, state["tenant_id"], state.get("collection_id"), limit=RETRIEVE_LIMIT
        ):
            if not p.payload:
                continue
            key = (str(p.payload.get("document_id")), int(p.payload.get("chunk_index", 0)))
            if key in seen:
                continue
            seen.add(key)
            hits.append({**p.payload, "retrieval_score": p.score})
    return {"hits": hits}


async def rerank_node(state: AgentState) -> dict:
    """Cross-encoder rerank against the original question; keep top-k as citations."""
    hits = state["hits"]
    texts = [str(h.get("text", "")) for h in hits]
    ranked = rerank(state["question"], texts, top_k=TOP_K)
    citations: list[Citation] = [
        Citation(
            n=rank + 1,
            document_id=str(hits[i].get("document_id", "")),
            document_name=str(hits[i].get("document_name", "")),
            chunk_index=int(hits[i].get("chunk_index", 0)),
            text=str(hits[i].get("text", "")),
            score=score,
        )
        for rank, (i, score) in enumerate(ranked)
    ]
    return {"citations": citations}


def _context_block(citations: list[Citation]) -> str:
    return "\n\n".join(f"[{c['n']}] ({c['document_name']})\n{c['text']}" for c in citations)


async def answer(state: AgentState) -> dict:
    citations = state["citations"]
    if not citations:
        return {
            "answer": "I couldn't find anything relevant in this collection for that question.",
            "grounded": True,
        }
    strict_note = (
        "\nYour previous draft contained unsupported claims. Use ONLY facts from the "
        "sources. If the sources don't answer the question, say so."
        if state.get("retries", 0) > 0
        else ""
    )
    system = (
        "Answer the user's question using ONLY the numbered sources below. "
        "Cite every factual claim inline with its source number like [1] or [2][3]. "
        "If the sources are insufficient, say what's missing instead of guessing."
        f"{strict_note}\n\nSOURCES:\n{_context_block(citations)}"
    )
    msgs: list = [SystemMessage(system)]
    for m in state.get("history", [])[-HISTORY_WINDOW:]:
        cls = HumanMessage if m["role"] == "user" else AIMessage
        msgs.append(cls(m["content"]))
    msgs.append(HumanMessage(state["question"]))
    resp = await _llm().ainvoke(msgs)
    return {"answer": str(resp.content)}


async def verify(state: AgentState) -> dict:
    """LLM grounding check. Fails open — a broken judge must not block answers."""
    if state.get("grounded"):
        return {"grounded": True}
    prompt = (
        "Judge whether the ANSWER is fully supported by the SOURCES.\n"
        'Reply with ONLY JSON: {"grounded": true|false}\n\n'
        f"SOURCES:\n{_context_block(state['citations'])}\n\nANSWER:\n{state['answer']}"
    )
    resp = await _llm().ainvoke([HumanMessage(prompt)])
    grounded = _parse_json(str(resp.content)).get("grounded", True)
    return {"grounded": bool(grounded), "retries": state.get("retries", 0) + 1}


def should_retry(state: AgentState) -> str:
    if not state.get("grounded", True) and state.get("retries", 0) <= 1:
        return "answer"
    return "__end__"
