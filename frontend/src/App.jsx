
import { useEffect, useRef, useState } from 'react'
import './App.css'

const API_URL = 'http://127.0.0.1:8000'

function getItems(data, possibleKeys) {
  if (Array.isArray(data)) return data

  for (const key of possibleKeys) {
    if (Array.isArray(data?.[key])) {
      return data[key]
    }
  }

  return []
}

function getKnowledgeBaseId(item) {
  return item.id || item.knowledge_base_id
}

function getDocumentId(item) {
  return item.id || item.document_id
}

function getDocumentName(item) {
  return item.filename || item.original_filename || item.stored_filename || 'Untitled PDF'
}

function App() {
  const [knowledgeBases, setKnowledgeBases] = useState([])
  const [selectedKB, setSelectedKB] = useState('')
  const [documents, setDocuments] = useState([])
  const [selectedDocumentId, setSelectedDocumentId] = useState('')

  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [loadingKBs, setLoadingKBs] = useState(true)
  const [loadingDocuments, setLoadingDocuments] = useState(false)
  const [asking, setAsking] = useState(false)

  const [question, setQuestion] = useState('')
  const [error, setError] = useState('')

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Hello! I am StudyMate. Select a Knowledge Base and document, then ask me questions about your PDFs.'
    }
  ])

  const fileInput = useRef(null)

  const completedDocuments = documents.filter(
    (document) => document.status === 'COMPLETED'
  )

  const selectedDocument = documents.find(
    (document) => getDocumentId(document) === selectedDocumentId
  )

  const canAsk =
    selectedDocumentId
      ? selectedDocument?.status === 'COMPLETED'
      : completedDocuments.length > 0

  // Load all available Knowledge Bases.
  useEffect(() => {
    let cancelled = false

    async function loadKnowledgeBases() {
      setLoadingKBs(true)
      setError('')

      try {
        const response = await fetch(`${API_URL}/knowledge-bases`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.detail || 'Unable to load Knowledge Bases.')
        }

        const items = getItems(data, ['knowledge_bases', 'items'])

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
          setError(err.message || 'Unable to connect to the backend.')
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

  // Load documents whenever the selected Knowledge Base changes.
  const loadDocuments = async (knowledgeBaseId) => {
    if (!knowledgeBaseId) {
      setDocuments([])
      return []
    }

    setLoadingDocuments(true)

    try {
      const response = await fetch(
        `${API_URL}/knowledge-bases/${knowledgeBaseId}/documents`
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Unable to load documents.')
      }

      const items = getItems(data, ['documents', 'items'])

      setDocuments(items)
      return items
    } finally {
      setLoadingDocuments(false)
    }
  }

  useEffect(() => {
    if (!selectedKB) return

    setDocuments([])
    setSelectedDocumentId('')
    setFile(null)
    setError('')

    loadDocuments(selectedKB).catch((err) => {
      setError(err.message || 'Unable to load documents.')
    })
  }, [selectedKB])

  // Upload the selected PDF to the currently selected Knowledge Base.
  const uploadPDF = async (selectedFile) => {
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

      // The backend expects the field name "files".
      formData.append('files', selectedFile)

      const response = await fetch(
        `${API_URL}/knowledge-bases/${selectedKB}/documents`,
        {
          method: 'POST',
          body: formData
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'PDF upload failed.')
      }

      const updatedDocuments = await loadDocuments(selectedKB)

      const matchingDocument = updatedDocuments.find(
        (document) =>
          getDocumentName(document) === selectedFile.name &&
          document.status === 'COMPLETED'
      )

      if (matchingDocument) {
        setSelectedDocumentId(getDocumentId(matchingDocument))
      } else {
        setSelectedDocumentId('')
      }

      const processedCount =
        data.documents_processed ??
        data.processed_count ??
        data.documents?.length ??
        1

      setMessages((previous) => [
        ...previous,
        {
          role: 'assistant',
          text: `Successfully uploaded ${selectedFile.name} to the selected Knowledge Base. Processing result: ${processedCount}. Select the PDF from the document selector to ask document-specific questions.`
        }
      ])

      setFile(null)
    } catch (err) {
      setError(err.message || 'Unable to upload the PDF.')
    } finally {
      setUploading(false)
    }
  }

  // Validate and upload a selected PDF.
  const handleFile = (event) => {
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

    // Allow selecting the same PDF again later.
    event.target.value = ''
  }

  // Ask a question using the selected Knowledge Base and optional document.
  const sendMessage = async (event) => {
    event.preventDefault()

    const userQuestion = question.trim()

    if (!userQuestion || asking) return

    if (!selectedKB) {
      setError('Please select a Knowledge Base.')
      return
    }

    if (!canAsk) {
      setError('Please upload or select a completed PDF before asking questions.')
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
        `${API_URL}/knowledge-bases/${selectedKB}/ask`,
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

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Unable to generate an answer.')
      }

      const sources = (data.sources || []).map(
        (source) => `${source.document}, page ${source.page}`
      )

      setMessages((previous) => [
        ...previous,
        {
          role: 'assistant',
          text: data.answer || 'I could not generate an answer.',
          sources
        }
      ])
    } catch (err) {
      setError(err.message || 'Unable to connect to the backend.')
    } finally {
      setAsking(false)
    }
  }

  const selectedKBName =
    knowledgeBases.find(
      (item) => getKnowledgeBaseId(item) === selectedKB
    )?.name || 'Select a Knowledge Base'

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">✦</span>
          <h2>StudyMate</h2>
        </div>

        <button
          className="new-chat"
          onClick={() =>
            setMessages([
              {
                role: 'assistant',
                text: 'Hello! I am StudyMate. Select a Knowledge Base and document, then ask me questions about your PDFs.'
              }
            ])
          }
        >
          + New Chat
        </button>

        <div className="sidebar-section">
          <p>WORKSPACE</p>
          <div className="nav-item active">💬 Chat with PDF</div>
          <div className="nav-item">📚 My Documents</div>
          <div className="nav-item">🕘 Recent Chats</div>
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

      <main className="main">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace / </span>
            <strong>Chat with PDF</strong>
          </div>
          <span className="status">● AI Assistant</span>
        </header>

        <section className="chat-area">
          <div className="welcome">
            <div className="welcome-icon">✦</div>
            <h1>Your Personal Study Assistant</h1>
            <p>Choose your knowledge source. Ask questions. Learn faster.</p>

            <div className="upload-card">
              <div className="pdf-icon">📄</div>

              <h3>Knowledge Base and Document Selection</h3>

              <p>Select where StudyMate should search for answers.</p>

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
                onChange={(event) => setSelectedKB(event.target.value)}
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
                  {loadingKBs ? 'Loading Knowledge Bases...' : 'Select a Knowledge Base'}
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
                disabled={!selectedKB || loadingDocuments || uploading || asking}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #ccc',
                  marginBottom: '12px'
                }}
              >
                <option value="">All Documents in this Knowledge Base</option>

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

                {file && (
                  <p>{file.name}</p>
                )}

                <small>PDF documents only · Maximum 20 MB</small>
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
                      padding: '14px 18px',
                      borderRadius: '16px',
                      backgroundColor: isUser ? '#DBEAFE' : '#DCFCE7',
                      border: isUser
                        ? '1px solid #93C5FD'
                        : '1px solid #86EFAC',
                      color: '#202124',
                      overflowWrap: 'anywhere',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)'
                    }}
                  >
                    <strong style={{ display: 'block', marginBottom: '7px' }}>
                      {isUser ? 'You' : 'StudyMate'}
                    </strong>

                    <p
                      className="message-text"
                      style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
                    >
                      {message.text}
                    </p>

                    {message.sources?.length > 0 && (
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
                        <ul style={{ margin: '6px 0 0', paddingLeft: '20px' }}>
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

            {uploading && (
              <div
                className="message-row assistant-row"
                style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', marginBottom: '18px' }}
              >
                <div
                  className="message-bubble assistant"
                  style={{ maxWidth: 'min(75%, 760px)', padding: '14px 18px', borderRadius: '16px', backgroundColor: '#DCFCE7',border: '1px solid #86EFAC' }}
                >
                  <strong>StudyMate</strong>
                  <p>Processing your PDF. Preparing your Knowledge Base...</p>
                </div>
              </div>
            )}

            {asking && (
              <div
                className="message-row assistant-row"
                style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', marginBottom: '18px' }}
              >
                <div
                  className="message-bubble assistant"
                  style={{ maxWidth: 'min(75%, 760px)', padding: '14px 18px', borderRadius: '16px', backgroundColor: '#DCFCE7',border: '1px solid #86EFAC' }}
                >
                  <strong>StudyMate</strong>
                  <p>Thinking... Searching the selected document and generating an answer.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <footer className="chat-footer">
          {error && (
            <p className="error-message">{error}</p>
          )}

          <form className="chat-input" onSubmit={sendMessage}>
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
              disabled={!canAsk || !question.trim() || uploading || asking}
            >
              {asking ? '...' : '➤'}
            </button>
          </form>

          <p>
            StudyMate AI can make mistakes. Verify important information.
          </p>
        </footer>
      </main>
    </div>
  )
}

export default App
