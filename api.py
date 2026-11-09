
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from rag_service import process_pdf, answer_question


app = FastAPI(
    title="StudyMate API",
    description="PDF-based question answering using RAG and Ollama",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)


class QuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


@app.get("/health")
def health():
    return {"status": "ok", "service": "StudyMate API"}


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a PDF file.",
        )

    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="The uploaded PDF is empty.",
        )

    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="PDF size must not exceed 20 MB.",
        )

    original_name = Path(file.filename).name
    stored_name = f"{uuid4().hex}_{original_name}"
    pdf_path = DATA_DIR / stored_name

    try:
        pdf_path.write_bytes(content)

        result = process_pdf(str(pdf_path))

        return {
            "message": "PDF uploaded and indexed successfully.",
            "original_filename": original_name,
            **result,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"PDF processing failed: {str(exc)}",
        ) from exc

    finally:
        await file.close()


@app.post("/ask")
def ask_question(request: QuestionRequest):
    try:
        return answer_question(request.question)

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Question processing failed: {str(exc)}",
        ) from exc
