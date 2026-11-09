def chunk_pages(
    pages,
    chunk_size=1200,
    overlap=200,
    document_id=None,
    knowledge_base_id=None,
):
    chunks = []

    for page in pages:
        text = page["text"]
        start = 0
        chunk_id = 0

        while start < len(text):
            end = start + chunk_size
            chunk_text = text[start:end]

            # A unique document ID prevents chunk ID collisions
            # when different PDFs have the same filename.
            if document_id:
                unique_id = (
                    f"{document_id}_p{page['page']}_c{chunk_id}"
                )
            else:
                # Preserve the old ID format for legacy uploads.
                unique_id = (
                    f"{page['document']}_p{page['page']}_c{chunk_id}"
                )

            chunk = {
                "id": unique_id,
                "document": page["document"],
                "page": page["page"],
                "text": chunk_text,
            }

            if document_id:
                chunk["document_id"] = document_id

            if knowledge_base_id:
                chunk["knowledge_base_id"] = knowledge_base_id

            chunks.append(chunk)

            start += chunk_size - overlap
            chunk_id += 1

    return chunks