# test_pdf_loader.py
from pdf_loader import load_pdf

pages = load_pdf("data/sample.pdf")

print(f"Pages extracted: {len(pages)}")

for page in pages[:2]:
    print(f"\nPage {page['page']}:")
    print(page["text"][:500])