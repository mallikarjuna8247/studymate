from pathlib import Path

from pdf_loader import load_pdf
from chunker import chunk_pages
from create_store import add_chunks, search
from llm_client import complete


# --------------------------------------------------
# 1. Load all PDF documents from the data directory
# --------------------------------------------------

DATA_DIR = Path("data")

pdf_files = sorted(DATA_DIR.glob("*.pdf"))

if not pdf_files:
    raise FileNotFoundError(
        f"No PDF documents found in {DATA_DIR.resolve()}"
    )

pages = []

for pdf_file in pdf_files:
    print(f"Loading document: {pdf_file.name}")

    document_pages = load_pdf(str(pdf_file))
    pages.extend(document_pages)

print(f"\nTotal PDF documents loaded: {len(pdf_files)}")
print(f"Total pages loaded: {len(pages)}")


# --------------------------------------------------
# 2. Split documents into chunks
# --------------------------------------------------

chunks = chunk_pages(pages)

print(f"Total chunks generated: {len(chunks)}")


# --------------------------------------------------
# 3. Store document chunks in ChromaDB
# --------------------------------------------------

add_chunks(chunks)


# --------------------------------------------------
# 4. Accept user question
# --------------------------------------------------

question = input("\nAsk a question: ")


# --------------------------------------------------
# 5. Retrieve relevant chunks from ChromaDB
# --------------------------------------------------

results = search(question, top_k=5)

context = "\n\n".join(
    f"[{meta['document']}, page {meta['page']}]\n{doc}"
    for doc, meta in zip(
        results["documents"][0],
        results["metadatas"][0]
    )
)


# --------------------------------------------------
# 6. Prepare LLM prompt
# --------------------------------------------------

messages = [
    {
        "role": "system",
        "content": (
            "You are StudyMate, a document-based question-answering assistant. "
            "Answer ONLY using information explicitly available in the provided context. "
            "Do not use external or pretrained knowledge. "
            "If the answer is not available in the context, say: "
            "'I cannot find the answer in the provided documents.' "
            "Cite every factual answer using the source format "
            "[document, page X]."
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


# --------------------------------------------------
# 7. Generate answer using local LLM
# --------------------------------------------------

response = complete(messages)


# --------------------------------------------------
# 8. Display answer and token usage
# --------------------------------------------------

print("\nAnswer:")
print(response["text"])

print("\nToken usage:")
print(response)
