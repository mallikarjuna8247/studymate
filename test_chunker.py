# test_chunker.py
from pdf_loader import load_pdf
from chunker import chunk_pages

pages = load_pdf("data/sample.pdf")
chunks = chunk_pages(pages)

print(f"Pages: {len(pages)}")
print(f"Chunks: {len(chunks)}")

print("\nFirst chunk:")
print(chunks[0])