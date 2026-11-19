
import json
import os
import urllib.request

import chromadb

# --------------------------------------------------
# Embedding configuration
# --------------------------------------------------

EMBEDDING_PROVIDER = os.getenv(
    "STUDYMATE_EMBEDDING_PROVIDER", "ollama"
).strip().lower()

OLLAMA_URL = os.getenv(
    "OLLAMA_URL", "http://localhost:11434"
)

OLLAMA_EMBEDDING_MODEL = os.getenv(
    "OLLAMA_EMBEDDING_MODEL", "nomic-embed-text"
)

GEMINI_EMBEDDING_MODEL = os.getenv(
    "GEMINI_EMBEDDING_MODEL", "gemini-embedding-001"
)

GEMINI_EMBEDDING_DIMENSIONS = int(
    os.getenv("GEMINI_EMBEDDING_DIMENSIONS", "768")
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Preserve the existing Ollama collection.
DEFAULT_COLLECTION = (
    "studymate"
    if EMBEDDING_PROVIDER == "ollama"
    else f"studymate_{EMBEDDING_PROVIDER}"
)

COLLECTION_NAME = os.getenv(
    "STUDYMATE_CHROMA_COLLECTION",
    DEFAULT_COLLECTION,
)

CHROMA_DIR = os.path.expanduser(
    os.getenv("STUDYMATE_CHROMA_DIR", "./chroma_db")
)

chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)

_gemini_client = None


# --------------------------------------------------
# Gemini client
# --------------------------------------------------

def get_gemini_client():
    global _gemini_client

    if _gemini_client is None:
        if not GEMINI_API_KEY:
            raise RuntimeError(
                "GEMINI_API_KEY is not configured."
            )

        from google import genai

        _gemini_client = genai.Client(
            api_key=GEMINI_API_KEY
        )

    return _gemini_client


# --------------------------------------------------
# Ollama embedding
# --------------------------------------------------

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


def generate_ollama_embeddings(texts):
    response = ollama_request(
        "/api/embed",
        {
            "model": OLLAMA_EMBEDDING_MODEL,
            "input": texts,
        },
    )

    return response["embeddings"]


# --------------------------------------------------
# Gemini embedding
# --------------------------------------------------

def generate_gemini_embeddings(
    texts,
    task_type="RETRIEVAL_DOCUMENT",
):
    from google.genai import types

    client = get_gemini_client()

    response = client.models.embed_content(
        model=GEMINI_EMBEDDING_MODEL,
        contents=texts,
        config=types.EmbedContentConfig(
            task_type=task_type,
            output_dimensionality=GEMINI_EMBEDDING_DIMENSIONS,
        ),
    )

    return [
        embedding.values
        for embedding in response.embeddings
    ]


# --------------------------------------------------
# Provider-independent embedding interface
# --------------------------------------------------

def generate_embeddings(
    texts,
    task_type="RETRIEVAL_DOCUMENT",
):
    if not texts:
        return []

    results = []

    # Process in batches to avoid oversized requests.
    batch_size = 100

    for start in range(0, len(texts), batch_size):
        batch = texts[start:start + batch_size]

        if EMBEDDING_PROVIDER == "ollama":
            embeddings = generate_ollama_embeddings(batch)

        elif EMBEDDING_PROVIDER == "gemini":
            embeddings = generate_gemini_embeddings(
                batch,
                task_type=task_type,
            )

        else:
            raise ValueError(
                f"Unsupported embedding provider: "
                f"{EMBEDDING_PROVIDER}"
            )

        if len(embeddings) != len(batch):
            raise RuntimeError(
                "Embedding response count does not match input count."
            )

        results.extend(embeddings)

    return results


# --------------------------------------------------
# ChromaDB collections
# --------------------------------------------------

def get_collection(name=None):
    name = name or COLLECTION_NAME

    return chroma_client.get_or_create_collection(
        name=name,
        metadata={
            "hnsw:space": "cosine",
            "embedding_provider": EMBEDDING_PROVIDER,
            "embedding_model": (
                OLLAMA_EMBEDDING_MODEL
                if EMBEDDING_PROVIDER == "ollama"
                else GEMINI_EMBEDDING_MODEL
            ),
        },
    )


# --------------------------------------------------
# Add document chunks
# --------------------------------------------------

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

    embeddings = generate_embeddings(
        texts,
        task_type="RETRIEVAL_DOCUMENT",
    )

    metadatas = []

    for chunk in chunks:
        metadata = {
            "document": chunk["document"],
            "page": chunk["page"],
        }

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

    print(
        f"Stored {len(chunks)} chunks in "
        f"collection '{COLLECTION_NAME}'."
    )


# --------------------------------------------------
# Search
# --------------------------------------------------

def search(
    query,
    top_k=5,
    knowledge_base_id=None,
    document_id=None,
):
    collection = get_collection()

    filters = []

    if knowledge_base_id:
        filters.append({
            "knowledge_base_id": knowledge_base_id
        })

    if document_id:
        filters.append({
            "document_id": document_id
        })

    where_filter = None

    if len(filters) == 1:
        where_filter = filters[0]

    elif len(filters) > 1:
        where_filter = {"$and": filters}

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

    query_embedding = generate_embeddings(
        [query],
        task_type="RETRIEVAL_QUERY",
    )[0]

    query_arguments = {
        "query_embeddings": [query_embedding],
        "n_results": result_count,
    }

    if where_filter:
        query_arguments["where"] = where_filter

    return collection.query(**query_arguments)


# --------------------------------------------------
# Migrate existing Ollama vectors to Gemini
# --------------------------------------------------

def migrate_ollama_to_gemini(batch_size=100):
    source = chroma_client.get_collection(
        name="studymate"
    )

    target = chroma_client.get_or_create_collection(
        name="studymate_gemini",
        metadata={
            "hnsw:space": "cosine",
            "embedding_provider": "gemini",
            "embedding_model": GEMINI_EMBEDDING_MODEL,
        },
    )

    total = source.count()

    print(f"Source vectors: {total}")

    migrated = 0

    for offset in range(0, total, batch_size):
        records = source.get(
            limit=batch_size,
            offset=offset,
            include=["documents", "metadatas"],
        )

        ids = records["ids"]
        documents = records["documents"]
        metadatas = records["metadatas"]

        if not ids:
            continue

        embeddings = generate_gemini_embeddings(
            documents,
            task_type="RETRIEVAL_DOCUMENT",
        )

        target.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas,
        )

        migrated += len(ids)

        print(
            f"Migrated {migrated}/{total} vectors."
        )

    print("Migration completed.")
    print("Source collection:", source.count())
    print("Gemini collection:", target.count())
