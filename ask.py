from pdf_loader import load_pdf
from chunker import chunk_pages
from create_store import add_chunks, search
from llm_client import complete

# Run once to load your PDF
pages = load_pdf("data/sample.pdf")
chunks = chunk_pages(pages)
add_chunks(chunks)

question = input("Ask a question: ")
results = search(question, top_k=5)

context = "\n\n".join(
    f"[{meta['document']}, page {meta['page']}]\n{doc}"
    for doc, meta in zip(results["documents"][0], results["metadatas"][0])
)

messages = [
    {
        "role": "system",
        "content": (
            "You are StudyMate. Answer only from the provided context. "
            "If the answer is not present, say you cannot find it. "
            "Cite sources as [document, page X]."
        ),
    },
    {
        "role": "user",
        "content": f"Context:\n{context}\n\nQuestion:\n{question}",
    },
]

response = complete(messages)

print("\nAnswer:")
print(response["text"])

print("\nToken usage:")
print(response)