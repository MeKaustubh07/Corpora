"""Recursive character chunking with overlap, paragraph-boundary aware."""

from dataclasses import dataclass, field

SEPARATORS = ["\n\n", "\n", ". ", " "]


@dataclass
class Chunk:
    text: str
    index: int
    meta: dict = field(default_factory=dict)


def _split(text: str, separators: list[str], max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    if not separators:
        return [text[i : i + max_chars] for i in range(0, len(text), max_chars)]
    sep, rest = separators[0], separators[1:]
    parts = [p for p in text.split(sep) if p.strip()]
    if len(parts) == 1:
        return _split(text, rest, max_chars)

    out: list[str] = []
    buf = ""
    for part in parts:
        candidate = f"{buf}{sep}{part}" if buf else part
        if len(candidate) <= max_chars:
            buf = candidate
        else:
            if buf:
                out.append(buf)
            if len(part) > max_chars:
                out.extend(_split(part, rest, max_chars))
                buf = ""
            else:
                buf = part
    if buf:
        out.append(buf)
    return out


def chunk_text(
    text: str,
    meta: dict | None = None,
    max_chars: int = 1200,
    overlap_chars: int = 150,
) -> list[Chunk]:
    """Split text into ~max_chars pieces on natural boundaries, with tail overlap."""
    pieces = _split(text.strip(), SEPARATORS, max_chars)
    chunks: list[Chunk] = []
    for i, piece in enumerate(pieces):
        body = piece.strip()
        if not body:
            continue
        if i > 0 and overlap_chars > 0:
            tail = pieces[i - 1][-overlap_chars:]
            body = f"{tail.strip()} {body}"
        chunks.append(Chunk(text=body, index=len(chunks), meta=dict(meta or {})))
    return chunks
