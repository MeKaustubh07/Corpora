from datetime import datetime

from pydantic import BaseModel, HttpUrl


class CollectionCreate(BaseModel):
    name: str
    description: str = ""


class CollectionOut(BaseModel):
    id: str
    name: str
    description: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UrlIngest(BaseModel):
    url: HttpUrl


class DocumentOut(BaseModel):
    id: str
    name: str
    source_type: str
    status: str
    error: str
    chunk_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class SearchHit(BaseModel):
    score: float
    text: str
    document_id: str
    document_name: str
    chunk_index: int


class SearchResponse(BaseModel):
    query: str
    hits: list[SearchHit]
