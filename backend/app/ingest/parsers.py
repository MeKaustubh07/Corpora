"""Extract plain text from uploaded files / URLs. One function per source type."""

from pathlib import Path

SUPPORTED_TYPES = {"pdf", "docx", "md", "txt", "url", "image"}

EXT_TO_TYPE = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".md": "md",
    ".markdown": "md",
    ".txt": "txt",
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".webp": "image",
}


def detect_source_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in EXT_TO_TYPE:
        raise ValueError(f"Unsupported file type: {ext or filename}")
    return EXT_TO_TYPE[ext]


def parse_pdf(path: str) -> list[tuple[str, dict]]:
    """Returns [(text, meta)] per page."""
    import pymupdf

    out: list[tuple[str, dict]] = []
    with pymupdf.open(path) as doc:
        for i, page in enumerate(doc):
            text = page.get_text("text").strip()
            if text:
                out.append((text, {"page": i + 1}))
    return out


def parse_docx(path: str) -> list[tuple[str, dict]]:
    import docx

    doc = docx.Document(path)
    text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    return [(text, {})] if text else []


def parse_text(path: str) -> list[tuple[str, dict]]:
    text = Path(path).read_text(encoding="utf-8", errors="replace").strip()
    return [(text, {})] if text else []


def parse_url(url: str) -> list[tuple[str, dict]]:
    import trafilatura

    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        raise ValueError(f"Could not fetch URL: {url}")
    text = trafilatura.extract(downloaded) or ""
    if not text.strip():
        raise ValueError(f"No extractable text at: {url}")
    return [(text.strip(), {"url": url})]


def parse(source_type: str, path_or_url: str) -> list[tuple[str, dict]]:
    """Dispatch. Images are handled by the embedder directly, not parsed to text."""
    match source_type:
        case "pdf":
            return parse_pdf(path_or_url)
        case "docx":
            return parse_docx(path_or_url)
        case "md" | "txt":
            return parse_text(path_or_url)
        case "url":
            return parse_url(path_or_url)
        case _:
            raise ValueError(f"No parser for source type: {source_type}")
