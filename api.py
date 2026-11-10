
from pathlib import Path
from uuid import uuid4
import sqlite3
from fastapi.openapi.utils import get_openapi

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from rag_service import process_pdf, answer_question

from metadata_db import (
    initialize_db,
    create_knowledge_base,
    list_knowledge_bases,
    get_knowledge_base,
    list_documents,
    add_document,
    update_document_status,
)


app = FastAPI(
    title="StudyMate API",
    description="PDF-based question answering using RAG and Ollama",
    version="1.1.0",
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

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# Initialize metadata tables when the API starts.
initialize_db()


# --------------------------------------------------
# Request models
# --------------------------------------------------

class QuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    document_id: str | None = None


class KnowledgeBaseRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)


# --------------------------------------------------
# Health API
# --------------------------------------------------

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "StudyMate API"
    }


# --------------------------------------------------
# Knowledge Base APIs
# --------------------------------------------------

@app.post("/knowledge-bases", status_code=201)
def create_knowledge_base_api(request: KnowledgeBaseRequest):

    try:
        knowledge_base = create_knowledge_base(
            name=request.name,
            description=request.description,
        )

        return {
            "message": "Knowledge Base created successfully.",
            "knowledge_base": knowledge_base,
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=409,
            detail="A Knowledge Base with this name already exists.",
        ) from exc


@app.get("/knowledge-bases")
def get_knowledge_bases_api():

    return {
        "knowledge_bases": list_knowledge_bases()
    }


@app.get("/knowledge-bases/{knowledge_base_id}")
def get_knowledge_base_api(knowledge_base_id: str):

    knowledge_base = get_knowledge_base(knowledge_base_id)

    if not knowledge_base:
        raise HTTPException(
            status_code=404,
            detail="Knowledge Base not found.",
        )

    return {
        "knowledge_base": knowledge_base
    }


# --------------------------------------------------
# List Knowledge Base Documents API
# --------------------------------------------------

@app.get("/knowledge-bases/{knowledge_base_id}/documents")
def get_knowledge_base_documents_api(
    knowledge_base_id: str,
):
    knowledge_base = get_knowledge_base(knowledge_base_id)

    if not knowledge_base:
        raise HTTPException(
            status_code=404,
            detail="Knowledge Base not found.",
        )

    documents = list_documents(knowledge_base_id)

    return {
        "knowledge_base_id": knowledge_base_id,
        "documents": documents,
        "total_documents": len(documents),
    }


# --------------------------------------------------
# Knowledge Base PDF Upload API
# --------------------------------------------------

@app.post("/knowledge-bases/{knowledge_base_id}/documents")
async def upload_knowledge_base_documents(
    knowledge_base_id: str,
    files: list[UploadFile] = File(...),
):
    knowledge_base = get_knowledge_base(knowledge_base_id)

    if not knowledge_base:
        raise HTTPException(
            status_code=404,
            detail="Knowledge Base not found.",
        )

    if not files:
        raise HTTPException(
            status_code=400,
            detail="Please select at least one PDF.",
        )

    uploaded_documents = []
    failed_documents = []

    for file in files:
        document_id = None
        original_name = (
            Path(file.filename).name if file.filename else ""
        )

        try:
            if not original_name or not original_name.lower().endswith(".pdf"):
                raise ValueError("Please upload a PDF file.")

            content = await file.read()

            if not content:
                raise ValueError("The uploaded PDF is empty.")

            if len(content) > 20 * 1024 * 1024:
                raise ValueError("PDF size must not exceed 20 MB.")

            stored_name = f"{uuid4().hex}_{original_name}"
            pdf_path = DATA_DIR / stored_name

            # Create document metadata in SQLite.
            document_id = add_document(
                knowledge_base_id=knowledge_base_id,
                filename=original_name,
                stored_filename=stored_name,
            )

            update_document_status(document_id, "PROCESSING")

            pdf_path.write_bytes(content)

            # Extract, chunk, generate embeddings and index.
            result = process_pdf(
                str(pdf_path),
                knowledge_base_id=knowledge_base_id,
                document_id=document_id,
            )

            update_document_status(document_id, "COMPLETED")

            uploaded_documents.append({
                "document_id": document_id,
                "filename": original_name,
                "status": "COMPLETED",
                **result,
            })

        except Exception as exc:
            if document_id is not None:
                try:
                    update_document_status(document_id, "FAILED")
                except Exception:
                    pass

            failed_documents.append({
                "filename": original_name or "Unknown",
                "status": "FAILED",
                "error": str(exc),
            })

        finally:
            await file.close()

    return {
        "message": "Knowledge Base document upload processing completed.",
        "knowledge_base_id": knowledge_base_id,
        "uploaded_count": len(uploaded_documents),
        "failed_count": len(failed_documents),
        "uploaded_documents": uploaded_documents,
        "failed_documents": failed_documents,
    }


# --------------------------------------------------
# Existing PDF Upload API
# --------------------------------------------------

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


# --------------------------------------------------
# Knowledge Base Question Answering API
# --------------------------------------------------


@app.post("/knowledge-bases/{knowledge_base_id}/ask")
def ask_knowledge_base(
    knowledge_base_id: str,
    request: QuestionRequest,
):
    try:
        knowledge_base = get_knowledge_base(knowledge_base_id)

        if not knowledge_base:
            raise HTTPException(
                status_code=404,
                detail="Knowledge Base not found.",
            )

        # If a document is selected, verify that it belongs
        # to the requested Knowledge Base.
        if request.document_id:
            documents = list_documents(knowledge_base_id)

            matching_document = next(
                (
                    doc for doc in documents
                    if doc["id"] == request.document_id
                ),
                None,
            )

            if not matching_document:
                raise HTTPException(
                    status_code=404,
                    detail="Document not found in this Knowledge Base.",
                )

            if matching_document["status"] != "COMPLETED":
                raise HTTPException(
                    status_code=400,
                    detail="Selected document is not ready for questions.",
                )

        return answer_question(
            request.question,
            knowledge_base_id=knowledge_base_id,
            document_id=request.document_id,
        )

    except HTTPException:
        raise

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



# --------------------------------------------------
# Existing Question Answering API
# --------------------------------------------------

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




def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )

    schemas = openapi_schema.get("components", {}).get("schemas", {})

    for component in schemas.values():
        properties = component.get("properties", {})

        for prop in properties.values():

            # Fix single-file upload fields.
            if prop.get("contentMediaType") == "application/octet-stream":
                prop.pop("contentMediaType", None)
                prop["format"] = "binary"

            # Fix multiple-file upload fields.
            items = prop.get("items", {})

            if items.get("contentMediaType") == "application/octet-stream":
                items.pop("contentMediaType", None)
                items["format"] = "binary"

    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi

