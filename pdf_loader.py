from pathlib import Path
from pypdf import PdfReader

def load_pdf(path: str):
    reader = PdfReader(path)
    pages = []

    for page_number, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        text = " ".join(text.split())

        if text:
            pages.append({
                "document": Path(path).name,
                "page": page_number,
                "text": text,
            })

    return pages