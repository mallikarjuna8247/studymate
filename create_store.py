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
    document_id=None,
):
    collection = get_collection()

    # Build metadata filters.
    filters = []

    if knowledge_base_id:
        filters.append({
            "knowledge_base_id": knowledge_base_id
        })

    if document_id:
        filters.append({
            "document_id": document_id
        })

    # Support KB-wide and individual-document retrieval.
    where_filter = None

    if len(filters) == 1:
        where_filter = filters[0]
    elif len(filters) > 1:
        where_filter = {
            "$and": filters
        }

    # Count only matching records.
    if where_filter:
        matching_records = collection.get(
            where=where_filter,
            include=[],
        )

        matching_count = len(matching_records["ids"])

    else:
        matching_count = collection.count()

    if matching_count == 0:
        return {
            "documents": [[]],
            "metadatas": [[]],
        }

    result_count = min(top_k, matching_count)

    query_embedding = generate_embeddings([query])[0]

    query_arguments = {
        "query_embeddings": [query_embedding],
        "n_results": result_count,
    }

    if where_filter:
        query_arguments["where"] = where_filter

    return collection.query(**query_arguments)
