from app.ingest.chunking import chunk_text
from app.ingest.parsers import detect_source_type


def test_short_text_single_chunk():
    chunks = chunk_text("hello world")
    assert len(chunks) == 1
    assert chunks[0].text == "hello world"
    assert chunks[0].index == 0


def test_long_text_splits_with_overlap():
    para = "This is a sentence about testing. " * 30  # ~1000 chars
    text = "\n\n".join([para, para, para])
    chunks = chunk_text(text, max_chars=1200, overlap_chars=150)
    assert len(chunks) >= 3
    assert all(len(c.text) <= 1200 + 160 for c in chunks)
    # overlap: chunk 1 starts with tail of chunk 0's source
    assert chunks[1].text.split(" ")[0] in chunks[0].text


def test_meta_propagates():
    chunks = chunk_text("some text", meta={"page": 3})
    assert chunks[0].meta == {"page": 3}


def test_empty_text():
    assert chunk_text("   ") == []


def test_indices_sequential():
    text = "word " * 2000
    chunks = chunk_text(text, max_chars=500)
    assert [c.index for c in chunks] == list(range(len(chunks)))


def test_detect_source_type():
    assert detect_source_type("a.PDF") == "pdf"
    assert detect_source_type("notes.md") == "md"
    assert detect_source_type("img.jpeg") == "image"


def test_detect_unsupported():
    import pytest

    with pytest.raises(ValueError):
        detect_source_type("virus.exe")
