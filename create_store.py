
import json
import urllib.request

import chromadb

OLLAMA_URL = "http://localhost:11434"

EMBEDDING_MODEL = "nomic-embed-text"

chroma_client = chromadb.PersistentClient(
    path="./chroma_db"
)


def ollama_request(endpoint, payload):
    data = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(
        f"{OLLAMA_URL}{endpoint}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=300) as response:
        return json.loads(response.read().decode("utf-8"))


def get_collection():
    return chroma_client.get_or_create_collection(
        name="studymate",
        metadata={"hnsw:space": "cosine"}
    )


def generate_embeddings(texts):
    response = ollama_request(
        "/api/embed",
        {
            "model": EMBEDDING_MODEL,
            "input": texts
        }
    )

    return response["embeddings"]


def add_chunks(chunks):
    if not chunks:
        print("No chunks available.")
        return

    collection = get_collection()

    texts = [chunk["text"] for chunk in chunks]

    embeddings = generate_embeddings(texts)

    collection.upsert(
        ids=[chunk["id"] for chunk in chunks],
        embeddings=embeddings,
        documents=texts,
        metadatas=[
            {
                "document": chunk["document"],
                "page": chunk["page"],
            }
            for chunk in chunks
        ],
    )

    print(f"Stored {len(chunks)} chunks successfully.")


def search(query, top_k=5):
    collection = get_collection()

    query_embedding = generate_embeddings([query])[0]

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, collection.count()),
    )

    return results
