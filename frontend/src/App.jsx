
import { useEffect, useRef, useState } from 'react'
import './App.css'

const API_URL = 'http://127.0.0.1:8000'

function App() {
  const [knowledgeBases, setKnowledgeBases] = useState([])
  const [selectedKB, setSelectedKB] = useState('')
  const [documents, setDocuments] = useState([])

  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [asking, setAsking] = useState(false)
  const [loadingKBs, setLoadingKBs] = useState(true)

  const [question, setQuestion] = useState('')
  const [error, setError] = useState('')

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Hello! I am StudyMate. Select a Knowledge Base, choose your documents, and ask questions about their contents.'
    }
  ])

  const fileInput = useRef(null)

  const currentKB = knowledgeBases.find(
    (kb) => (kb.id || kb.knowledge_base_id) === selectedKB
  )

  const completedDocuments = documents.filter(
    (doc) => doc.status === 'COMPLETED'
  )

  const uploaded = completedDocuments.length > 0

  // Load available Knowledge Bases when the application starts.
  useEffect(() => {
    const loadKnowledgeBases = async () => {
      try {
        setLoadingKBs(true)

        const response = await fetch(`${API_URL}/knowledge-bases`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.detail || 'Unable to load Knowledge Bases.')
        }

        const list = Array.isArray(data)
          ? data
          : data.knowledge_bases || data.items || []

        setKnowledgeBases(list)

        if (list.length > 0) {
          const discoveryKB = list.find((kb) =>
            (kb.name || '').toLowerCase().includes('discovery agent')
          )

          setSelectedKB(
            discoveryKB?.id ||
            discoveryKB?.knowledge_base_id ||
            list[0].id ||
            list[0].knowledge_base_id
          )
        }
      } catch (err) {
        setError(err.message || 'Unable to connect to the backend.')
      } finally {
        setLoadingKBs(false)
      }
    }

    loadKnowledgeBases()
  }, [])

  // Load documents whenever the selected Knowledge Base changes.
  useEffect(() => {
    if (!selectedKB) {
      setDocuments([])
      return
    }

    const loadDocuments = async () => {
      try {
        setError('')

        const response = await fetch(
          `${API_URL}/knowledge-bases/${selectedKB}/documents`
        )

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.detail || 'Unable to load documents.')
        }

        setDocuments(data.documents || [])
      } catch (err) {
        setError(err.message || 'Unable to load documents.')
        setDocuments([])
      }
    }

    loadDocuments()
  }, [selectedKB])

  // Upload the selected PDF into the currently selected Knowledge Base.
  const uploadPDF = async (selectedFile) => {
    if (!selectedKB) {
      setError('Please select a Knowledge Base first.')
      return
    }

    if (!selectedFile) {
      setError('Please select a PDF first.')
      return
    }

    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a PDF file.')
      return
    }

    if (selectedFile.size > 20 * 1024 * 1024) {
      setError('The PDF must be smaller than 20 MB.')
      return
    }

    setUploading(true)
    setError('')
    setFile(selectedFile)

    try {
      const formData = new FormData()

      // The FastAPI endpoint expects a list named "files".
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

      // Refresh the document list from the database.
      const documentsResponse = await fetch(
        `${API_URL}/knowledge-bases/${selectedKB}/documents`
      )

      const documentsData = await documentsResponse.json()

      if (!documentsResponse.ok) {
        throw new Error(
          documentsData.detail || 'Unable to refresh the document list.'
        )
      }

      setDocuments(documentsData.documents || [])

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Upload completed for ${selectedFile.name}. Your document status is now available in the Knowledge Base document list.`
        }
      ])
    } catch (err) {
      setError(err.message || 'Unable to upload the PDF.')
    } finally {
      setUploading(false)
    }
  }

  const handleFile = (event) => {
    const selectedFile = event.target.files?.[0]

    if (!selectedFile) return

    uploadPDF(selectedFile)

    // Allow selecting the same PDF again if needed.
    event.target.value = ''
  }

  const handleKnowledgeBaseChange = (event) => {
    const newKB = event.target.value

    setSelectedKB(newKB)
    setFile(null)
    setQuestion('')
    setError('')

    setMessages([
      {
        role: 'assistant',
        text: 'Knowledge Base changed. Ask a question about the documents available in this Knowledge Base.'
      }
    ])
  }

  // Ask a question using only the selected Knowledge Base.
  const sendMessage = async (event) => {
    event.preventDefault()

    const userQuestion = question.trim()

    if (!userQuestion || asking) return

    if (!selectedKB) {
      setError('Please select a Knowledge Base.')
      return
    }

    if (!uploaded) {
      setError('Please upload a PDF or select a Knowledge Base containing a completed document.')
      return
    }

    setMessages((prev) => [
      ...prev,
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
            question: userQuestion
          })
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Unable to generate an answer.')
      }

      const sourceText = Array.isArray(data.sources) && data.sources.length
        ? '\n\nSources:\n' + data.sources
            .map((source) => {
              const documentName =
                source.document || source.filename || 'Unknown document'

              return `${documentName}, page ${source.page ?? 'N/A'}`
            })
            .join('\n')
        : '\n\nSources: No source details were returned.'

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: (data.answer || 'No answer was returned.') + sourceText
        }
      ])
    } catch (err) {
      setError(err.message || 'Unable to connect to the backend.')
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">✦</span>
          <h2>StudyMate</h2>
        </div>

        <button
          className="new-chat"
          onClick={() => {
            setMessages([
              {
                role: 'assistant',
                text: 'Hello! Ask me a question about the selected Knowledge Base.'
              }
            ])
            setQuestion('')
            setError('')
          }}
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
          <span className="status">AI Assistant</span>
        </header>

        <section className="chat-area">
          <div className="welcome">
            <div className="welcome-icon">✦</div>
            <h1>Your Personal Study Assistant</h1>
            <p>Upload your PDF. Ask questions. Learn faster.</p>

            <div className="upload-card">
              <h3>Select a Knowledge Base</h3>

              <select
                value={selectedKB}
                onChange={handleKnowledgeBaseChange}
                disabled={loadingKBs || uploading || asking}
              >
                <option value="">
                  {loadingKBs
                    ? 'Loading Knowledge Bases...'
                    : 'Select Knowledge Base'}
                </option>

                {knowledgeBases.map((kb) => (
                  <option
                    key={kb.id || kb.knowledge_base_id}
                    value={kb.id || kb.knowledge_base_id}
                  >
                    {kb.name}
                  </option>
                ))}
              </select>

              <p>
                {currentKB
                  ? `Selected: ${currentKB.name}`
                  : 'Select a Knowledge Base to continue.'}
              </p>

              <div className="pdf-icon">📄</div>

              <h3>
                {file ? file.name : 'Upload your PDF document'}
              </h3>

              <p>
                {uploading
                  ? 'Uploading and processing your PDF. Please wait...'
                  : uploaded
                    ? `${completedDocuments.length} completed document(s) available in this Knowledge Base.`
                    : 'Select a PDF document to get started.'}
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
                {uploading
                  ? 'Processing PDF...'
                  : 'Browse PDF'}
              </button>

              <small>PDF documents only · Maximum 20 MB</small>

              {uploading && (
                <p className="processing-message">
                  Extracting text, generating embeddings and indexing your document...
                </p>
              )}

              {uploaded && (
                <p className="success-message">
                  ✓ Documents ready for questions
                </p>
              )}
            </div>

            <div className="document-list">
              <h3>Documents in this Knowledge Base</h3>

              {documents.length === 0 ? (
                <p>No documents found in this Knowledge Base.</p>
              ) : (
                documents.map((doc) => (
                  <div className="document-item" key={doc.id}>
                    <span>📄 {doc.filename}</span>
                    <small>Status: {doc.status}</small>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="messages">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`message ${message.role}`}
              >
                <div className="message-avatar">
                  {message.role === 'assistant' ? '✦' : 'S'}
                </div>

                <div className="message-content">
                  <strong>
                    {message.role === 'assistant' ? 'StudyMate' : 'You'}
                  </strong>
                  <p className="message-text">{message.text}</p>
                </div>
              </div>
            ))}

            {uploading && (
              <div className="message assistant">
                <div className="message-avatar">✦</div>
                <div className="message-content">
                  <strong>StudyMate</strong>
                  <p>Processing your PDF. Preparing your Knowledge Base...</p>
                </div>
              </div>
            )}

            {asking && (
              <div className="message assistant">
                <div className="message-avatar">✦</div>
                <div className="message-content">
                  <strong>StudyMate</strong>
                  <p>Searching the selected Knowledge Base...</p>
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
                uploaded
                  ? 'Ask anything about your Knowledge Base...'
                  : 'Select a Knowledge Base with completed documents...'
              }
              disabled={!uploaded || uploading || asking}
            />

            <button
              type="submit"
              disabled={
                !uploaded ||
                !question.trim() ||
                uploading ||
                asking
              }
            >
              {asking ? '...' : '➤'}
            </button>
          </form>

          <p>StudyMate AI can make mistakes. Verify important information.</p>
        </footer>
      </main>
    </div>
  )
}

export default App
