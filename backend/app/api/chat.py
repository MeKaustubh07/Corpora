"""Chat CRUD + SSE streaming through the LangGraph agent.

SSE events: stage {name} · token {content} · retry · citations {items} · done {message_id}
"""

import json

import anyio
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.agent.graph import get_graph
from app.api.collections import get_owned_collection
from app.core.security import Principal, get_principal
from app.db.models import Chat, Message
from app.db.session import get_db, get_sessionmaker
from app.observability.tracing import langchain_callbacks

router = APIRouter(prefix="/chats", tags=["chat"])

NODE_STAGES = {"planner", "retrieve", "rerank", "answer", "verify"}


class ChatCreate(BaseModel):
    collection_id: str
    title: str = "New chat"


class ChatOut(BaseModel):
    id: str
    collection_id: str
    title: str

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    citations: list

    model_config = {"from_attributes": True}


class MessageIn(BaseModel):
    content: str


async def _get_owned_chat(chat_id: str, db: AsyncSession, principal: Principal) -> Chat:
    chat = await db.get(Chat, chat_id)
    if chat is None or chat.tenant_id != principal.tenant_id:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


@router.post("", response_model=ChatOut, status_code=201)
async def create_chat(
    body: ChatCreate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    await get_owned_collection(body.collection_id, db, principal)
    chat = Chat(
        tenant_id=principal.tenant_id,
        user_id=principal.user_id,
        collection_id=body.collection_id,
        title=body.title,
    )
    db.add(chat)
    await db.commit()
    await db.refresh(chat)
    return chat


@router.get("", response_model=list[ChatOut])
async def list_chats(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    rows = await db.scalars(
        select(Chat).where(Chat.tenant_id == principal.tenant_id).order_by(Chat.created_at.desc())
    )
    return list(rows)


@router.get("/{chat_id}/messages", response_model=list[MessageOut])
async def list_messages(
    chat_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    chat = await _get_owned_chat(chat_id, db, principal)
    rows = await db.scalars(
        select(Message).where(Message.chat_id == chat.id).order_by(Message.created_at)
    )
    return list(rows)


@router.post("/{chat_id}/messages")
async def send_message(
    chat_id: str,
    body: MessageIn,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    chat = await _get_owned_chat(chat_id, db, principal)
    history_rows = await db.scalars(
        select(Message).where(Message.chat_id == chat.id).order_by(Message.created_at)
    )
    history = [{"role": m.role, "content": m.content} for m in history_rows]
    db.add(Message(chat_id=chat.id, role="user", content=body.content))
    await db.commit()

    state = {
        "question": body.content,
        "tenant_id": principal.tenant_id,
        "collection_id": chat.collection_id,
        "history": history,
        "retries": 0,
    }

    async def stream():
        final: dict = {}
        tokens: list[str] = []
        citations: list = []
        answer_runs = 0
        saved_id: str | None = None

        async def _save(content: str) -> str | None:
            nonlocal saved_id
            if saved_id or not content:
                return saved_id
            async with get_sessionmaker()() as s:
                msg = Message(
                    chat_id=chat.id, role="assistant", content=content, citations=citations
                )
                s.add(msg)
                await s.commit()
                await s.refresh(msg)
                saved_id = msg.id
            return saved_id

        try:
            config = {"callbacks": langchain_callbacks()}
            async for ev in get_graph().astream_events(state, version="v2", config=config):
                kind = ev["event"]
                node = ev.get("metadata", {}).get("langgraph_node", "")
                if kind == "on_chain_start" and ev.get("name") in NODE_STAGES:
                    if ev["name"] == "answer":
                        answer_runs += 1
                        if answer_runs > 1:
                            tokens.clear()
                            yield {"event": "retry", "data": "{}"}
                    yield {"event": "stage", "data": json.dumps({"name": ev["name"]})}
                elif kind == "on_chat_model_stream" and node == "answer":
                    content = ev["data"]["chunk"].content
                    if content:
                        tokens.append(content)
                        yield {"event": "token", "data": json.dumps({"content": content})}
                elif kind == "on_chain_end" and ev.get("name") == "rerank":
                    citations = (ev["data"]["output"] or {}).get("citations", [])
                elif kind == "on_chain_end" and ev.get("name") == "LangGraph":
                    final = ev["data"]["output"] or {}

            citations = final.get("citations", citations)
            msg_id = await _save(final.get("answer") or "".join(tokens))
            yield {"event": "citations", "data": json.dumps({"items": citations})}
            yield {"event": "done", "data": json.dumps({"message_id": msg_id})}
        finally:
            # client disconnected mid-stream — persist what was generated
            if saved_id is None and tokens:
                with anyio.CancelScope(shield=True):
                    await _save("".join(tokens))

    return EventSourceResponse(stream())
