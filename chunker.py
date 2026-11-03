def chunk_pages(pages, chunk_size=1200, overlap=200):
    chunks = []

    for page in pages:
        text = page["text"]
        start = 0
        chunk_id = 0

        while start < len(text):
            end = start + chunk_size
            chunk_text = text[start:end]

            chunks.append({
                "id": f"{page['document']}_p{page['page']}_c{chunk_id}",
                "document": page["document"],
                "page": page["page"],
                "text": chunk_text,
            })

            start += chunk_size - overlap
            chunk_id += 1

    return chunks