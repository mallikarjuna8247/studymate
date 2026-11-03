import chromadb

client = chromadb.PersistentClient(path="./chroma_db")

def get_collection():
    return client.get_or_create_collection(name="studymate")

def add_chunks(chunks):
    collection = get_collection()

    collection.add(
        ids=[chunk["id"] for chunk in chunks],
        documents=[chunk["text"] for chunk in chunks],
        metadatas=[
            {
                "document": chunk["document"],
                "page": chunk["page"],
            }
            for chunk in chunks
        ],
    )

def search(query, top_k=5):
    collection = get_collection()

    results = collection.query(
        query_texts=[query],
        n_results=top_k,
    )

    return results