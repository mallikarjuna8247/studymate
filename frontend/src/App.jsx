
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, SubmitEvent } from 'react'
import './App.css'

const API_URL = (
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
).replace(/\/$/, '')

// --------------------------------------------------
// TYPES
// --------------------------------------------------

type KnowledgeBase = {
  id?: string
  knowledge_base_id?: string
  name?: string
  title?: string
}

type Document = {
  id?: string
  document_id?: string
  knowledge_base_id?: string
  knowledge_base_name?: string
  filename?: string
  original_filename?: string
  stored_filename?: string
  status?: string
  created_at?: string
}

type Message = {
  role: 'user' | 'assistant'
  text: string
  sources?: string[]
}

// --------------------------------------------------
// API RESPONSE HELPERS
// --------------------------------------------------

function getItems<T>(
  data: unknown,
  possibleKeys: string[]
): T[] {
  if (Array.isArray(data)) {
    return data as T[]
  }

  if (typeof data === 'object' && data !== null) {
    const response = data as Record<string, unknown>

    for (const key of possibleKeys) {
      if (Array.isArray(response[key])) {
        return response[key] as T[]
      }
    }
  }

  return []
}

function getKnowledgeBaseId(item: KnowledgeBase): string {
  return item.id || item.knowledge_base_id || ''
}

function getDocumentId(item: Document): string {
  return item.id || item.document_id || ''
}

function getDocumentName(item: Document): string {
  return (
    item.filename ||
    item.original_filename ||
    item.stored_filename ||
    'Untitled PDF'
  )
}

// --------------------------------------------------
// APP COMPONENT
// --------------------------------------------------

function App() {
  // Knowledge Base state
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [selectedKB, setSelectedKB] = useState('')
  const [documents, setDocuments] = useState<Document[]>([])
  const [selectedDocumentId, setSelectedDocumentId] = useState('')

  // PDF upload state
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  // Loading state
  const [loadingKBs, setLoadingKBs] = useState(true)
  const [loadingDocuments, setLoadingDocuments] = useState(false)
  const [loadingAllDocuments, setLoadingAllDocuments] = useState(false)
  const [asking, setAsking] = useState(false)

  // Navigation state
  const [activeView, setActiveView] = useState<'chat' | 'documents'>('chat')

  // My Documents state
  const [allDocuments, setAllDocuments] = useState<Document[]>([])
  const [documentsSearch, setDocumentsSearch] = useState('')
  const [documentsError, setDocumentsError] = useState('')
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0)

  // Chat state
  const [question, setQuestion] = useState('')
  const [error, setError] = useState('')

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: 'Hello! I am StudyMate. Select a Knowledge Base and document, then ask me questions about your PDFs.'
    }
  ])

  const fileInput = useRef<HTMLInputElement>(null)

  // Completed documents in selected Knowledge Base
  const completedDocuments = documents.filter(
    (document) => document.status === 'COMPLETED'
  )

  const selectedDocument = documents.find(
    (document) => getDocumentId(document) === selectedDocumentId
  )

  const canAsk = selectedDocumentId
    ? selectedDocument?.status === 'COMPLETED'
    : completedDocuments.length > 0

  // Selected Knowledge Base name
  const selectedKBName =
    knowledgeBases.find(
      (item) => getKnowledgeBaseId(item) === selectedKB
    )?.name || 'Select a Knowledge Base'

  // Filter all documents
  const filteredAllDocuments = allDocuments.filter((document) => {
    const search = documentsSearch.trim().toLowerCase()

    return (
      getDocumentName(document).toLowerCase().includes(search) ||
      (document.knowledge_base_name || '').toLowerCase().includes(search)
    )
  })

  // --------------------------------------------------
  // 1. LOAD ALL KNOWLEDGE BASES
  // --------------------------------------------------

  useEffect(() => {
    let cancelled = false

    async function loadKnowledgeBases() {
      setLoadingKBs(true)
      setError('')

      try {
        const response = await fetch(`${API_URL}/knowledge-bases`)
        const data: unknown = await response.json()

        if (!response.ok) {
          const detail =
            typeof data === 'object' && data !== null
              ? (data as Record<string, unknown>).detail
              : undefined

          throw new Error(
            typeof detail === 'string'
              ? detail
              : 'Unable to load Knowledge Bases.'
          )
        }

        const items = getItems<KnowledgeBase>(
          data,
          ['knowledge_bases', 'items']
        )

        if (cancelled) return

        setKnowledgeBases(items)

        if (items.length > 0) {
          const discoveryKB = items.find((item) =>
            String(item.name || item.title || '')
              .toLowerCase()
              .includes('discovery agent')
          )

          setSelectedKB(
            getKnowledgeBaseId(discoveryKB || items[0])
          )
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to connect to the backend.'
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingKBs(false)
        }
      }
    }

    loadKnowledgeBases()

    return () => {
      cancelled = true
    }
  }, [])

  // --------------------------------------------------
  // 2. LOAD DOCUMENTS FROM ALL KNOWLEDGE BASES
  // --------------------------------------------------

  useEffect(() => {
    if (knowledgeBases.length === 0) {
      setAllDocuments([])
      setLoadingAllDocuments(false)
      return
    }

    let cancelled = false

    async function loadAllDocuments() {
      setLoadingAllDocuments(true)
      setDocumentsError('')

      try {
        const results = await Promise.allSettled(
          knowledgeBases.map(async (kb) => {
            const knowledgeBaseId = getKnowledgeBaseId(kb)

            const response = await fetch(
              `${API_URL}/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents`
            )

            const data: unknown = await response.json()

            if (!response.ok) {
              throw new Error(
                `Unable to load documents from ${kb.name || knowledgeBaseId}`
              )
            }

            const items = getItems<Document>(
              data,
              ['documents', 'items']
            )

            return items.map((document) => ({
              ...document,
              knowledge_base_id:
                document.knowledge_base_id || knowledgeBaseId,
              knowledge_base_name:
                kb.name || kb.title || knowledgeBaseId
            }))
          })
        )

        if (cancelled) return

        const successfulDocuments = results
          .filter(
            (result): result is PromiseFulfilledResult<Document[]> =>
              result.status === 'fulfilled'
          )
          .flatMap((result) => result.value)

        const failedKnowledgeBases = results
          .map((result, index) =>
            result.status === 'rejected'
              ? knowledgeBases[index].name || 'Unknown Knowledge Base'
              : null
          )
          .filter((name): name is string => Boolean(name))

        setAllDocuments(successfulDocuments)

        if (failedKnowledgeBases.length > 0) {
          setDocumentsError(
            `Could not load documents from: ${failedKnowledgeBases.join(', ')}`
          )
        }
      } catch (err) {
        if (!cancelled) {
          setDocumentsError(
            err instanceof Error
              ? err.message
              : 'Unable to load all documents.'
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingAllDocuments(false)
        }
      }
    }

    loadAllDocuments()

    return () => {
      cancelled = true
    }
  }, [knowledgeBases, documentsRefreshKey])

  // --------------------------------------------------
  // 3. LOAD DOCUMENTS FOR SELECTED KNOWLEDGE BASE
  // --------------------------------------------------

  const loadDocuments = async (
    knowledgeBaseId: string
  ): Promise<Document[]> => {
    if (!knowledgeBaseId) {
      setDocuments([])
      return []
    }

    setLoadingDocuments(true)

    try {
      const response = await fetch(
        `${API_URL}/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents`
      )

      const data: unknown = await response.json()

      if (!response.ok) {
        throw new Error('Unable to load documents.')
      }

      const items = getItems<Document>(
        data,
        ['documents', 'items']
      )

      setDocuments(items)

      return items
    } finally {
      setLoadingDocuments(false)
    }
  }

  useEffect(() => {
    if (!selectedKB) {
      setDocuments([])
      return
    }

    setDocuments([])
    setSelectedDocumentId('')
    setFile(null)
    setError('')

    loadDocuments(selectedKB).catch((err: unknown) => {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load documents.'
      )
    })
  }, [selectedKB])

  // --------------------------------------------------
  // 4. UPLOAD PDF
  // --------------------------------------------------

  const uploadPDF = async (selectedFile: File) => {
    if (!selectedFile) {
      setError('Please select a PDF first.')
      return
    }

    if (!selectedKB) {
      setError('Please select a Knowledge Base first.')
      return
    }

    setUploading(true)
    setError('')

    try {
      const formData = new FormData()

      formData.append('files', selectedFile)

      const response = await fetch(
        `${API_URL}/knowledge-bases/${encodeURIComponent(selectedKB)}/documents`,
        {
          method: 'POST',
          body: formData
        }
      )

      const data: unknown = await response.json()

      if (!response.ok) {
        throw new Error('PDF upload failed.')
      }

      const updatedDocuments = await loadDocuments(selectedKB)

      const matchingDocument = updatedDocuments.find(
        (document) =>
          getDocumentName(document) === selectedFile.name &&
          document.status === 'COMPLETED'
      )

      if (matchingDocument) {
        setSelectedDocumentId(
          getDocumentId(matchingDocument)
        )
      } else {
        setSelectedDocumentId('')
      }

      const responseData =
        typeof data === 'object' && data !== null
          ? data as Record<string, unknown>
          : {}

      const processedCount =
        responseData.documents_processed ??
        responseData.processed_count ??
        (
          Array.isArray(responseData.documents)
            ? responseData.documents.length
            : 1
        )

      setMessages((previous) => [
        ...previous,
        {
          role: 'assistant',
          text: `Successfully uploaded ${selectedFile.name} to the selected Knowledge Base. Processing result: ${processedCount}. Select the PDF from the document selector to ask document-specific questions.`
        }
      ])

      setFile(null)

      // Refresh My Documents
      setDocumentsRefreshKey((previous) => previous + 1)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to upload the PDF.'
      )
    } finally {
      setUploading(false)
    }
  }

  // --------------------------------------------------
  // 5. VALIDATE SELECTED PDF
  // --------------------------------------------------

  const handleFile = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFile = event.target.files?.[0]

    if (!selectedFile) return

    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a PDF file.')
      setFile(null)
      event.target.value = ''
      return
    }

    if (selectedFile.size > 20 * 1024 * 1024) {
      setError('The PDF must not exceed 20 MB.')
      event.target.value = ''
      return
    }

    setFile(selectedFile)
    setError('')

    uploadPDF(selectedFile)

    // Allow selecting the same PDF again later
    event.target.value = ''
  }

  // --------------------------------------------------
  // 6. ASK A QUESTION
  // --------------------------------------------------

  const sendMessage = async (
    event: SubmitEvent<HTMLFormElement>
  ) => {
    event.preventDefault()

    const userQuestion = question.trim()

    if (!userQuestion || asking) return

    if (!selectedKB) {
      setError('Please select a Knowledge Base.')
      return
    }

    if (!canAsk) {
      setError(
        'Please upload or select a completed PDF before asking questions.'
      )
      return
    }

    setMessages((previous) => [
      ...previous,
      { role: 'user', text: userQuestion }
    ])

    setQuestion('')
    setAsking(true)
    setError('')

    try {
      const response = await fetch(
        `${API_URL}/knowledge-bases/${encodeURIComponent(selectedKB)}/ask`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            question: userQuestion,
            document_id: selectedDocumentId || null
          })
        }
      )

      const data: unknown = await response.json()

      if (!response.ok) {
        throw new Error('Unable to generate an answer.')
      }

      const responseData = data as {
        answer?: string
        sources?: {
          document?: string
          page?: string | number
        }[]
      }

      const sources = (responseData.sources || []).map(
        (source) =>
          `${source.document || 'Unknown document'}, page ${source.page ?? 'Unknown'}`
      )

      setMessages((previous) => [
        ...previous,
        {
          role: 'assistant',
          text: responseData.answer || 'I could not generate an answer.',
          sources
        }
      ])
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to connect to the backend.'
      )
    } finally {
      setAsking(false)
    }
  }

  // --------------------------------------------------
  // 7. START A NEW CHAT
  // --------------------------------------------------

  const startNewChat = () => {
    setActiveView('chat')
    setQuestion('')
    setError('')

    setMessages([
      {
        role: 'assistant',
        text: 'Hello! I am StudyMate. Select a Knowledge Base and document, then ask me questions about your PDFs.'
      }
    ])
  }

  // --------------------------------------------------
  // 8. MAIN UI
  // --------------------------------------------------

  return (
    <div className="app">

      {/* SIDEBAR */}
      <aside className="sidebar">

        <div className="brand">
          <span className="brand-icon">✦</span>
          <h2>StudyMate</h2>
        </div>

        <button
          className="new-chat"
          onClick={startNewChat}
        >
          + New Chat
        </button>

        <div className="sidebar-section">

          <p>WORKSPACE</p>

          <button
            type="button"
            className={`nav-item ${activeView === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveView('chat')}
          >
            💬 Chat with PDF
          </button>

          <button
            type="button"
            className={`nav-item ${activeView === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveView('documents')}
          >
            📚 My Documents
          </button>

          <div className="nav-item">
            🕘 Recent Chats
          </div>

        </div>

        <div className="sidebar-bottom">
          <div className="profile">

            <div className="avatar">S</div>

            <div>
              <strong>Student</strong>
              <small>Personal Workspace</small>
            </div>

          </div>
        </div>

      </aside>

      {/* MAIN CONTENT */}
      <main className="main">

        {/* TOPBAR */}
        <header className="topbar">

          <div>
            <span className="breadcrumb">Workspace / </span>

            <strong>
              {activeView === 'documents'
                ? 'My Documents'
                : 'Chat with PDF'}
            </strong>
          </div>

          <span className="status">● AI Assistant</span>

        </header>

        {/* MY DOCUMENTS VIEW */}
        {activeView === 'documents' ? (

          <section className="documents-page">

            <div className="documents-header">

              <div>
                <h1>My Documents</h1>
                <p>
                  Manage PDFs across all your Knowledge Bases.
                </p>
              </div>

            </div>

            {/* Search */}
            <input
              className="documents-search"
              type="text"
              placeholder="Search by PDF filename or Knowledge Base..."
              value={documentsSearch}
              onChange={(event) =>
                setDocumentsSearch(event.target.value)
              }
            />

            {/* Statistics */}
            <div className="documents-stats">

              <div className="documents-stat">
                <span>Total PDFs</span>
                <strong>{allDocuments.length}</strong>
              </div>

              <div className="documents-stat">
                <span>Knowledge Bases</span>
                <strong>{knowledgeBases.length}</strong>
              </div>

            </div>

            {/* Loading / Error / Empty / Documents */}
            {documentsError && (
              <p className="error-message">
                {documentsError}
              </p>
            )}

            {loadingAllDocuments ? (

              <div className="documents-empty">
                Loading documents from all Knowledge Bases...
              </div>

            ) : filteredAllDocuments.length === 0 ? (

              <div className="documents-empty">

                <div style={{ fontSize: '35px' }}>
                  📂
                </div>

                <h3>
                  {documentsSearch
                    ? 'No matching documents found'
                    : 'No documents available'}
                </h3>

                <p>
                  {documentsSearch
                    ? 'Try searching with another filename or Knowledge Base.'
                    : 'Upload PDFs to your Knowledge Bases to see them here.'}
                </p>

              </div>

            ) : (

              <div className="documents-list">

                {filteredAllDocuments.map((document) => (

                  <div
                    className="document-card"
                    key={`${document.knowledge_base_id}-${getDocumentId(document)}`}
                  >

                    <div className="document-card-icon">
                      PDF
                    </div>

                    <div className="document-card-details">

                      <strong>
                        {getDocumentName(document)}
                      </strong>

                      <p>
                        Knowledge Base: {document.knowledge_base_name}
                      </p>

                      <p>
                        Uploaded:{' '}
                        {document.created_at
                          ? new Date(document.created_at).toLocaleDateString()
                          : 'Date unavailable'}
                      </p>

                    </div>

                    <span
                      className="document-status"
                      style={
                        document.status === 'COMPLETED'
                          ? {}
                          : {
                              background: '#fff7ed',
                              color: '#c2410c'
                            }
                      }
                    >
                      {document.status || 'UNKNOWN'}
                    </span>

                  </div>

                ))}

              </div>

            )}

          </section>

        ) : (

          /* CHAT WITH PDF VIEW */
          <>

            <section className="chat-area">

              <div className="welcome">

                <div className="welcome-icon">✦</div>

                <h1>Your Personal Study Assistant</h1>

                <p>
                  Choose your knowledge source. Ask questions. Learn faster.
                </p>

                <div className="upload-card">

                  <div className="pdf-icon">📄</div>

                  <h3>Knowledge Base and Document Selection</h3>

                  <p>
                    Select where StudyMate should search for answers.
                  </p>

                  {/* Knowledge Base selector */}
                  <label
                    htmlFor="knowledge-base"
                    style={{
                      display: 'block',
                      textAlign: 'left',
                      marginTop: '16px',
                      marginBottom: '6px',
                      fontWeight: '600'
                    }}
                  >
                    Knowledge Base
                  </label>

                  <select
                    id="knowledge-base"
                    value={selectedKB}
                    onChange={(event) =>
                      setSelectedKB(event.target.value)
                    }
                    disabled={loadingKBs || uploading || asking}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #ccc',
                      marginBottom: '12px'
                    }}
                  >

                    <option value="">
                      {loadingKBs
                        ? 'Loading Knowledge Bases...'
                        : 'Select a Knowledge Base'}
                    </option>

                    {knowledgeBases.map((kb) => (

                      <option
                        key={getKnowledgeBaseId(kb)}
                        value={getKnowledgeBaseId(kb)}
                      >
                        {kb.name || kb.title || getKnowledgeBaseId(kb)}
                      </option>

                    ))}

                  </select>

                  {/* Document selector */}
                  <label
                    htmlFor="document-selector"
                    style={{
                      display: 'block',
                      textAlign: 'left',
                      marginBottom: '6px',
                      fontWeight: '600'
                    }}
                  >
                    Document
                  </label>

                  <select
                    id="document-selector"
                    value={selectedDocumentId}
                    onChange={(event) =>
                      setSelectedDocumentId(event.target.value)
                    }
                    disabled={
                      !selectedKB ||
                      loadingDocuments ||
                      uploading ||
                      asking
                    }
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #ccc',
                      marginBottom: '12px'
                    }}
                  >

                    <option value="">
                      All Documents in this Knowledge Base
                    </option>

                    {documents.map((document) => (

                      <option
                        key={getDocumentId(document)}
                        value={getDocumentId(document)}
                        disabled={document.status !== 'COMPLETED'}
                      >
                        {getDocumentName(document)} ({document.status || 'UNKNOWN'})
                      </option>

                    ))}

                  </select>

                  <p>
                    {loadingDocuments
                      ? 'Loading documents...'
                      : `${completedDocuments.length} completed document(s) in ${selectedKBName}.`}
                  </p>

                  {/* PDF upload */}
                  <div style={{ marginTop: '18px' }}>

                    <h3>Upload a PDF</h3>

                    <p>
                      The PDF will be uploaded to the selected Knowledge Base.
                    </p>

                    <input
                      ref={fileInput}
                      type="file"
                      accept=".pdf,application/pdf"
                      hidden
                      onChange={handleFile}
                    />

                    <button
                      className="upload-button"
                      onClick={() => fileInput.current?.click()}
                      disabled={!selectedKB || uploading || asking}
                    >
                      {uploading ? 'Processing PDF...' : 'Browse PDF'}
                    </button>

                    {file && <p>{file.name}</p>}

                    <small>
                      PDF documents only · Maximum 20 MB
                    </small>

                  </div>

                  {uploading && (
                    <p className="processing-message">
                      Uploading, extracting text, generating embeddings and indexing your document...
                    </p>
                  )}

                  {canAsk && (
                    <p className="success-message">
                      ✓ Ready for questions
                    </p>
                  )}

                </div>

              </div>

              {/* CHAT MESSAGES */}
              <div className="messages">

                {messages.map((message, index) => {

                  const isUser = message.role === 'user'

                  return (

                    <div
                      key={index}
                      className={`message-row ${isUser ? 'user-row' : 'assistant-row'}`}
                      style={{
                        display: 'flex',
                        justifyContent: isUser ? 'flex-start' : 'flex-end',
                        width: '100%',
                        marginBottom: '18px'
                      }}
                    >

                      <div
                        className={`message-bubble ${message.role}`}
                        style={{
                          maxWidth: 'min(75%, 760px)',
                          padding: '16px 20px',
                          borderRadius: '18px',
                          background: isUser
                            ? 'linear-gradient(135deg, #EDE9FE, #DDD6FE)'
                            : 'linear-gradient(135deg, #D1FAE5, #A7F3D0)',
                          border: isUser
                            ? '1px solid #C4B5FD'
                            : '1px solid #6EE7B7',
                          color: isUser ? '#312E81' : '#064E3B',
                          overflowWrap: 'anywhere',
                          boxShadow: '0 4px 12px rgba(30, 41, 59, 0.08)',
                          lineHeight: 1.6
                        }}
                      >

                        <strong
                          style={{
                            display: 'block',
                            marginBottom: '7px'
                          }}
                        >
                          {isUser ? 'You' : 'StudyMate'}
                        </strong>

                        <p
                          className="message-text"
                          style={{
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            lineHeight: 1.6
                          }}
                        >
                          {message.text}
                        </p>

                        {message.sources && message.sources.length > 0 && (

                          <div
                            className="sources"
                            style={{
                              marginTop: '12px',
                              paddingTop: '10px',
                              borderTop: '1px solid rgba(0, 0, 0, 0.12)',
                              fontSize: '13px'
                            }}
                          >

                            <strong>Sources</strong>

                            <ul
                              style={{
                                margin: '6px 0 0',
                                paddingLeft: '20px'
                              }}
                            >
                              {message.sources.map((source, sourceIndex) => (
                                <li key={sourceIndex}>{source}</li>
                              ))}
                            </ul>

                          </div>

                        )}

                      </div>

                    </div>

                  )
                })}

                {/* PDF Upload Processing Message */}
                {uploading && (

                  <div
                    className="message-row assistant-row"
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      width: '100%',
                      marginBottom: '18px'
                    }}
                  >

                    <div
                      className="message-bubble assistant"
                      style={{
                        maxWidth: 'min(75%, 760px)',
                        padding: '16px 20px',
                        borderRadius: '18px',
                        background: 'linear-gradient(135deg, #D1FAE5, #A7F3D0)',
                        border: '1px solid #6EE7B7',
                        color: '#064E3B',
                        overflowWrap: 'anywhere',
                        boxShadow: '0 4px 12px rgba(30, 41, 59, 0.08)',
                        lineHeight: 1.6
                      }}
                    >

                      <strong>StudyMate</strong>

                      <p>
                        Processing your PDF. Preparing your Knowledge Base...
                      </p>

                    </div>

                  </div>

                )}

                {/* Question Processing Message */}
                {asking && (

                  <div
                    className="message-row assistant-row"
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      width: '100%',
                      marginBottom: '18px'
                    }}
                  >

                    <div
                      className="message-bubble assistant"
                      style={{
                        maxWidth: 'min(75%, 760px)',
                        padding: '16px 20px',
                        borderRadius: '18px',
                        background: 'linear-gradient(135deg, #D1FAE5, #A7F3D0)',
                        border: '1px solid #6EE7B7',
                        color: '#064E3B',
                        overflowWrap: 'anywhere',
                        boxShadow: '0 4px 12px rgba(30, 41, 59, 0.08)',
                        lineHeight: 1.6
                      }}
                    >

                      <strong>StudyMate</strong>

                      <p>
                        Thinking... Searching the selected document and generating an answer.
                      </p>

                    </div>

                  </div>

                )}

              </div>

            </section>

            {/* CHAT FOOTER */}
            <footer className="chat-footer">

              {error && (
                <p className="error-message">
                  {error}
                </p>
              )}

              <form
                className="chat-input"
                onSubmit={sendMessage}
              >

                <input
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder={
                    canAsk
                      ? 'Ask a question about your selected document...'
                      : 'Select a Knowledge Base and upload a PDF first...'
                  }
                  disabled={!canAsk || uploading || asking}
                />

                <button
                  type="submit"
                  disabled={
                    !canAsk ||
                    !question.trim() ||
                    uploading ||
                    asking
                  }
                >
                  {asking ? '...' : '➤'}
                </button>

              </form>

              <p>
                StudyMate AI can make mistakes. Verify important information.
              </p>

            </footer>

          </>

        )}

      </main>

    </div>
  )
}

export default App
