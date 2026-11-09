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
        metadata={"hnsw:space": "cosine"},
    )


def generate_embeddings(texts):
    response = ollama_request(
        "/api/embed",
        {
            "model": EMBEDDING_MODEL,
            "input": texts,
        },
    )

    return response["embeddings"]


def add_chunks(
    chunks,
    knowledge_base_id=None,
    document_id=None,
):
    if not chunks:
        print("No chunks available.")
        return

    collection = get_collection()

    texts = [chunk["text"] for chunk in chunks]
    embeddings = generate_embeddings(texts)

    metadatas = []

    for chunk in chunks:
        metadata = {
            "document": chunk["document"],
            "page": chunk["page"],
        }

        # Add KB metadata only for Knowledge Base uploads.
        if knowledge_base_id:
            metadata["knowledge_base_id"] = knowledge_base_id

        if document_id:
            metadata["document_id"] = document_id

        metadatas.append(metadata)

    collection.upsert(
        ids=[chunk["id"] for chunk in chunks],
        embeddings=embeddings,
        documents=texts,
        metadatas=metadatas,
    )

    print(f"Stored {len(chunks)} chunks successfully.")


def search(
    query,
    top_k=5,
    knowledge_base_id=None,
):
    collection = get_collection()

    if knowledge_base_id:
        # Count only chunks belonging to this Knowledge Base.
        matching_records = collection.get(
            where={"knowledge_base_id": knowledge_base_id},
            include=[],
        )

        matching_count = len(matching_records["ids"])

        if matching_count == 0:
            return {
                "documents": [[]],
                "metadatas": [[]],
            }

        result_count = min(top_k, matching_count)

    else:
        # Legacy search across the original collection.
        collection_count = collection.count()

        if collection_count == 0:
            return {
                "documents": [[]],
                "metadatas": [[]],
            }

        result_count = min(top_k, collection_count)

    query_embedding = generate_embeddings([query])[0]

    query_arguments = {
        "query_embeddings": [query_embedding],
        "n_results": result_count,
    }

    if knowledge_base_id:
        query_arguments["where"] = {
            "knowledge_base_id": knowledge_base_id,
        }

    return collection.query(**query_arguments)