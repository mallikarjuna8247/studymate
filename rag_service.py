from pathlib import Path

from pdf_loader import load_pdf
from chunker import chunk_pages
from create_store import add_chunks, search, get_collection
from llm_client import complete

from metadata_db import get_knowledge_base


DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(exist_ok=True)


def process_pdf(
    pdf_path: str,
    knowledge_base_id=None,
    document_id=None,
):
    """Extract, chunk, and index one PDF document."""

    pages = load_pdf(pdf_path)

    if not pages:
        raise ValueError(
            "No extractable text found in the PDF. "
            "It may be scanned or image-only."
        )

    chunks = chunk_pages(
        pages,
        document_id=document_id,
        knowledge_base_id=knowledge_base_id,
    )

    if not chunks:
        raise ValueError("No text chunks were generated.")

    add_chunks(
        chunks,
        knowledge_base_id=knowledge_base_id,
        document_id=document_id,
    )

    return {
        "document": Path(pdf_path).name,
        "pages_processed": len(pages),
        "chunks_created": len(chunks),
    }


def answer_question(
    question: str,
    top_k: int = 5,
    knowledge_base_id=None,
):
    """Retrieve relevant PDF chunks and generate an answer."""

    question = question.strip()

    if not question:
        raise ValueError("Question cannot be empty.")

    if knowledge_base_id:
        knowledge_base = get_knowledge_base(knowledge_base_id)

        if not knowledge_base:
            raise ValueError("Knowledge Base not found.")

    collection = get_collection()

    if knowledge_base_id:
        matching_records = collection.get(
            where={"knowledge_base_id": knowledge_base_id},
            include=[],
        )

        if not matching_records["ids"]:
            raise ValueError(
                "No documents have been indexed in this Knowledge Base. "
                "Upload a PDF first."
            )
    elif collection.count() == 0:
        raise ValueError(
            "No documents have been indexed. Upload a PDF first."
        )

    results = search(
        question,
        top_k=top_k,
        knowledge_base_id=knowledge_base_id,
    )

    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]

    if not documents:
        raise ValueError("No relevant content was found.")

    context_parts = []
    sources = []

    for document_text, metadata in zip(documents, metadatas):
        filename = metadata["document"]
        page_number = metadata["page"]

        context_parts.append(
            f"[{filename}, page {page_number}]\n{document_text}"
        )

        source = {
            "document": filename,
            "page": page_number,
        }

        if source not in sources:
            sources.append(source)

    context = "\n\n".join(context_parts)

    messages = [
        {
            "role": "system",
            "content": (
                "You are StudyMate, a document-based question-answering "
                "assistant. Answer ONLY using information explicitly "
                "available in the provided context. Do not use external "
                "or pretrained knowledge. If the answer is unavailable, "
                "say: 'I cannot find the answer in the provided documents.' "
                "Cite factual claims using [document, page X]."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Context:\n{context}\n\n"
                f"Question:\n{question}"
            ),
        },
    ]

    response = complete(messages)

    return {
        "answer": response["text"],
        "sources": sources,
        "usage": {
            "prompt_tokens": response["prompt_tokens"],
            "completion_tokens": response["completion_tokens"],
            "total_tokens": response["total_tokens"],
            "latency_seconds": response["latency_seconds"],
        },
    }