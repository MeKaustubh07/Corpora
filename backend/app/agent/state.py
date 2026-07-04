from typing import TypedDict


class Citation(TypedDict):
    n: int
    document_id: str
    document_name: str
    chunk_index: int
    text: str
    score: float


class AgentState(TypedDict, total=False):
    # inputs
    question: str
    tenant_id: str
    collection_id: str
    history: list[dict]  # [{"role": "user"|"assistant", "content": str}]
    # intermediate
    queries: list[str]
    hits: list[dict]  # raw retrieval payloads + score
    citations: list[Citation]  # reranked top-k, numbered
    # outputs
    answer: str
    grounded: bool
    retries: int
