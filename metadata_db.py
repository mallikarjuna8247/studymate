
import sqlite3
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone


DB_PATH = Path(__file__).resolve().parent / "studymate_metadata.db"


def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_db():
    """Create Knowledge Base and document metadata tables."""

    with get_connection() as connection:

        connection.execute("""
            CREATE TABLE IF NOT EXISTS knowledge_bases (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                description TEXT DEFAULT '',
                created_at TEXT NOT NULL
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                knowledge_base_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                stored_filename TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'UPLOADING',
                created_at TEXT NOT NULL,

                FOREIGN KEY (knowledge_base_id)
                    REFERENCES knowledge_bases(id)
                    ON DELETE CASCADE
            )
        """)

        connection.execute("""
            CREATE INDEX IF NOT EXISTS
            idx_documents_knowledge_base
            ON documents(knowledge_base_id)
        """)


def create_knowledge_base(name, description=""):
    """Create a new Knowledge Base."""

    name = name.strip()

    if not name:
        raise ValueError("Knowledge Base name cannot be empty.")

    knowledge_base_id = f"kb_{uuid4().hex}"

    created_at = datetime.now(timezone.utc).isoformat()

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO knowledge_bases
            (id, name, description, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (knowledge_base_id, name, description.strip(), created_at)
        )

    return {
        "id": knowledge_base_id,
        "name": name,
        "description": description.strip(),
        "created_at": created_at
    }


def list_knowledge_bases():
    """Return all Knowledge Bases."""

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                kb.id,
                kb.name,
                kb.description,
                kb.created_at,
                COUNT(d.id) AS document_count
            FROM knowledge_bases kb
            LEFT JOIN documents d
                ON kb.id = d.knowledge_base_id
            GROUP BY kb.id
            ORDER BY kb.created_at DESC
            """
        ).fetchall()

    return [dict(row) for row in rows]


def get_knowledge_base(knowledge_base_id):
    """Find one Knowledge Base."""

    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM knowledge_bases
            WHERE id = ?
            """,
            (knowledge_base_id,)
        ).fetchone()

    return dict(row) if row else None


def add_document(
    knowledge_base_id,
    filename,
    stored_filename
):
    """Register a PDF under a Knowledge Base."""

    document_id = f"doc_{uuid4().hex}"

    created_at = datetime.now(timezone.utc).isoformat()

    with get_connection() as connection:

        kb = connection.execute(
            """
            SELECT id FROM knowledge_bases
            WHERE id = ?
            """,
            (knowledge_base_id,)
        ).fetchone()

        if not kb:
            raise ValueError("Knowledge Base does not exist.")

        connection.execute(
            """
            INSERT INTO documents (
                id,
                knowledge_base_id,
                filename,
                stored_filename,
                status,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                document_id,
                knowledge_base_id,
                filename,
                stored_filename,
                "UPLOADING",
                created_at
            )
        )

    return document_id


def update_document_status(document_id, status):
    """Update PDF processing status."""

    allowed_statuses = {
        "UPLOADING",
        "PROCESSING",
        "COMPLETED",
        "FAILED"
    }

    if status not in allowed_statuses:
        raise ValueError("Invalid document status.")

    with get_connection() as connection:
        result = connection.execute(
            """
            UPDATE documents
            SET status = ?
            WHERE id = ?
            """,
            (status, document_id)
        )

        if result.rowcount == 0:
            raise ValueError("Document does not exist.")


def list_documents(knowledge_base_id):
    """List PDFs belonging to a Knowledge Base."""

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM documents
            WHERE knowledge_base_id = ?
            ORDER BY created_at DESC
            """,
            (knowledge_base_id,)
        ).fetchall()

    return [dict(row) for row in rows]
