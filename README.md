# StudyMate – AI-Powered Learning Assistant

## 1. Project Overview

StudyMate is an AI-powered learning assistant designed to help students understand, explore, and interact with their study materials.

The application allows users to upload educational documents, process their content, and ask questions based on the uploaded materials. It uses Retrieval-Augmented Generation (RAG) to retrieve relevant information from documents and generate context-aware responses using a Large Language Model (LLM).

The primary objective of StudyMate is to make learning more interactive, efficient, and accessible by providing an intelligent assistant that understands the user's study materials.

## 2. Key Objectives

- Simplify the process of understanding lengthy educational documents.
- Allow users to interact with their documents using natural language.
- Provide context-aware answers based on uploaded study materials.
- Reduce the time required to search for specific information.
- Build an extensible AI-powered learning platform.

## 3. Technology Stack

### Frontend
- React
- Vite
- JavaScript
- HTML5
- CSS3

### Backend
- Python
- FastAPI
- REST APIs

### AI and RAG
- Large Language Models (LLMs)
- Retrieval-Augmented Generation (RAG)
- Document chunking and processing
- Embedding generation

### Vector Database
- ChromaDB

### Containerization and Deployment
- Docker
- Docker Compose (planned/if configured)
- Cloud deployment (planned)

## 4. Application Architecture

StudyMate follows a frontend-backend architecture.

The React frontend provides the user interface, while the Python backend handles document processing, vector storage, retrieval, and AI-powered question answering.

High-level application workflow:

1. User interacts with the StudyMate frontend.
2. Frontend communicates with the Python backend through REST APIs.
3. Backend processes uploaded documents.
4. Documents are divided into smaller chunks.
5. Embeddings are generated for document chunks.
6. Embeddings and associated metadata are stored in ChromaDB.
7. When a user asks a question, the backend retrieves relevant document chunks.
8. Retrieved information is passed to the LLM.
9. The generated response is returned to the frontend.

## 5. RAG Workflow

StudyMate uses Retrieval-Augmented Generation to improve the relevance of AI-generated responses.

### Document Ingestion
- Accept educational documents (PDF support).
- Extract text from documents.
- Split extracted content into manageable chunks.
- Generate embeddings.
- Store document vectors in ChromaDB.

### Question Answering
- Accept natural-language questions.
- Convert questions into embeddings.
- Retrieve relevant document chunks from ChromaDB.
- Provide retrieved context to the LLM.
- Generate responses using the retrieved information.

## 6. Project Structure

The project is organized into separate frontend and backend components.

```text
StudyMate/
│
├── backend/
│   ├── ask.py
│   ├── chunker.py
│   ├── create_store.py
│   ├── llm_client.py
│   ├── pdf_loader.py
│   └── tests/
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── README.md
```

Note: Update this structure to match the actual repository layout.

## 7. Backend Components

| Component | Responsibility |
|---|---|
| pdf_loader.py | Extracts text from PDF documents |
| chunker.py | Splits document content into smaller chunks |
| create_store.py | Creates and manages the vector store |
| ask.py | Handles document-based question answering |
| llm_client.py | Handles communication with the LLM |

## 8. Frontend

The frontend is developed using React and Vite.

It provides
