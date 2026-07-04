"""Retrieval-quality eval gate over the golden dataset (eval/golden.json).

Metrics per case:
  retrieval_hit — expected keyword appears in retrieved citations (deterministic)
  faithfulness  — LLM judge: is the answer fully supported by the citations? (0-1)
  relevancy     — LLM judge: does the answer address the question? (0-1)

CI fails if averages drop below thresholds in golden.json.
Run: uv run pytest -m eval   (needs GROQ_API_KEY + docker services)
"""

import json
import uuid
from pathlib import Path

import pytest
from langchain_core.messages import HumanMessage

from app.agent.graph import get_graph
from app.agent.nodes import _llm, _parse_json
from app.core.config import get_settings
from app.db.models import Collection, Document
from app.db.session import get_sessionmaker
from app.ingest.worker import ingest_document

EVAL_DIR = Path(__file__).resolve().parents[2] / "eval"

pytestmark = pytest.mark.eval


async def _judge(prompt: str) -> float:
    resp = await _llm().ainvoke([HumanMessage(prompt)])
    score = _parse_json(str(resp.content)).get("score")
    return float(score) if isinstance(score, int | float) else 0.0


async def _seed_corpus(corpus: list[str], tenant: str) -> str:
    async with get_sessionmaker()() as db:
        coll = Collection(tenant_id=tenant, name="golden-eval")
        db.add(coll)
        await db.flush()
        doc_ids = []
        for fname in corpus:
            doc = Document(
                tenant_id=tenant,
                collection_id=coll.id,
                name=fname,
                source_type="md",
                source_uri=str(EVAL_DIR / "corpus" / fname),
            )
            db.add(doc)
            await db.flush()
            doc_ids.append(doc.id)
        await db.commit()
        coll_id = coll.id
    for did in doc_ids:
        assert (await ingest_document({}, did)).startswith("ok:")
    return coll_id


async def test_golden_dataset():
    if not get_settings().groq_api_key:
        pytest.skip("GROQ_API_KEY not set")

    golden = json.loads((EVAL_DIR / "golden.json").read_text())
    tenant = f"eval-{uuid.uuid4().hex[:8]}"
    coll_id = await _seed_corpus(golden["corpus"], tenant)

    rows = []
    for case in golden["cases"]:
        final = await get_graph().ainvoke(
            {
                "question": case["question"],
                "tenant_id": tenant,
                "collection_id": coll_id,
                "history": [],
                "retries": 0,
            }
        )
        answer = final.get("answer", "")
        citations = final.get("citations", [])
        context = "\n\n".join(c["text"] for c in citations)

        hit = any(
            any(k.lower() in c["text"].lower() for c in citations)
            for k in case["must_contain_any"]
        )
        faith = await _judge(
            "Score 0.0-1.0 how fully the ANSWER is supported by the CONTEXT. "
            '1.0 = every claim supported. Reply ONLY JSON: {"score": <float>}\n\n'
            f"CONTEXT:\n{context}\n\nANSWER:\n{answer}"
        )
        rel = await _judge(
            "Score 0.0-1.0 how directly the ANSWER addresses the QUESTION. "
            'Reply ONLY JSON: {"score": <float>}\n\n'
            f"QUESTION:\n{case['question']}\n\nANSWER:\n{answer}"
        )
        rows.append({"q": case["question"], "hit": hit, "faithfulness": faith, "relevancy": rel})

    n = len(rows)
    hit_rate = sum(r["hit"] for r in rows) / n
    avg_faith = sum(r["faithfulness"] for r in rows) / n
    avg_rel = sum(r["relevancy"] for r in rows) / n

    print("\n=== Golden eval ===")
    for r in rows:
        print(
            f"hit={int(r['hit'])} faith={r['faithfulness']:.2f} "
            f"rel={r['relevancy']:.2f}  {r['q'][:60]}"
        )
    print(f"hit_rate={hit_rate:.2f} faithfulness={avg_faith:.2f} relevancy={avg_rel:.2f}")

    t = golden["thresholds"]
    assert hit_rate >= t["retrieval_hit_rate"], f"retrieval hit rate {hit_rate:.2f} below gate"
    assert avg_faith >= t["faithfulness"], f"faithfulness {avg_faith:.2f} below gate"
    assert avg_rel >= t["relevancy"], f"relevancy {avg_rel:.2f} below gate"
