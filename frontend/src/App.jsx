
import { useEffect, useRef, useState } from 'react'
import './App.css'

const API_URL = 'http://127.0.0.1:8000'

function App() {
  const [file, setFile] = useState(null)
  const [uploaded, setUploaded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [asking, setAsking] = useState(false)
  const [question, setQuestion] = useState('')
  const [error, setError] = useState('')
  const [pdfUrl, setPdfUrl] = useState('')
  const [documentInfo, setDocumentInfo] = useState(null)

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Hello! I am StudyMate. Upload a PDF and I will help you understand its contents, find important information, and answer your questions with page references.'
    }
  ])

  const fileInput = useRef(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, asking])

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    }
  }, [pdfUrl])

  const handleFile = (event) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) return

    setError('')

    if (
      selectedFile.type !== 'application/pdf' &&
      !selectedFile.name.toLowerCase().endsWith('.pdf')
    ) {
      setError('Please select a valid PDF document.')
      event.target.value = ''
      return
    }

    if (selectedFile.size > 20 * 1024 * 1024) {
      setError('PDF size must not exceed 20 MB.')
      event.target.value = ''
      return
    }

    setFile(selectedFile)
    setUploaded(false)
    setDocumentInfo(null)

    setMessages([
      {
        role: 'assistant',
        text: 'Your PDF is selected. Upload it to start asking questions.'
      }
    ])
  }

  const uploadPDF = async () => {
    if (!file) {
      setError('Please select a PDF first.')
      return
    }

    setUploading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'PDF upload failed.')
      }

      setUploaded(true)
      setDocumentInfo(data)

      const newPdfUrl = URL.createObjectURL(file)
      setPdfUrl(previousUrl => {
        if (previousUrl) URL.revokeObjectURL(previousUrl)
        return newPdfUrl
      })

      setMessages([
        {
          role: 'assistant',
          text: `Successfully processed ${data.original_filename}. ${data.pages_processed} pages and ${data.chunks_created} chunks indexed. You can now ask questions.`
        }
      ])
    } catch (err) {
      setError(err.message || 'Unable to connect to the backend.')
    } finally {
      setUploading(false)
    }
  }

  const sendMessage = async (event) => {
    event.preventDefault()

    const userQuestion = question.trim()

    if (!userQuestion || !uploaded || asking) return

    setQuestion('')
    setError('')

    setMessages(previous => [
      ...previous,
      { role: 'user', text: userQuestion }
    ])

    setAsking(true)

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ question: userQuestion })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Unable to answer your question.')
      }

      setMessages(previous => [
        ...previous,
        {
          role: 'assistant',
          text: data.answer,
          sources: data.sources || []
        }
      ])
    } catch (err) {
      setMessages(previous => [
        ...previous,
        {
          role: 'assistant',
          text: `I couldn't process your question. ${err.message || 'Please check the backend connection.'}`
        }
      ])
    } finally {
      setAsking(false)
    }
  }

  const newChat = () => {
    setQuestion('')
    setError('')
    setMessages([
      {
        role: 'assistant',
        text: uploaded
          ? 'Your document is ready. What would you like to learn from it?'
          : 'Hello! Upload a PDF and I will help you understand its contents.'
      }
    ])
  }

  const formatFileSize = (size) => {
    return size < 1024 * 1024
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / (1024 * 1024)).toFixed(2)} MB`
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">✦</div>
          <div>
            <h2>StudyMate</h2>
            <span>AI Learning Workspace</span>
          </div>
        </div>

        <button className="new-chat-button" onClick={newChat}>
          <span>＋</span> New Chat
        </button>

        <div className="sidebar-section">
          <p className="sidebar-label">WORKSPACE</p>

          <div className="nav-item active">
            <span>▤</span> Chat with PDF
          </div>

          <div className="nav-item">
            <span>▧</span> My Documents
          </div>

          <div className="nav-item">
            <span>◷</span> Recent Chats
          </div>
        </div>

        <div className="sidebar-spacer" />

        <div className="sidebar-tip">
          <div className="tip-icon">✧</div>
          <strong>Study smarter</strong>
          <p>Ask questions, explore ideas, and learn from your documents.</p>
        </div>

        <div className="profile">
          <div className="profile-avatar">S</div>
          <div>
            <strong>Student</strong>
            <span>Personal Workspace</span>
          </div>
          <span className="profile-menu">•••</span>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <div className="breadcrumb">Workspace <span>/</span> Chat with PDF</div>
            <h3>Document Assistant</h3>
          </div>

          <div className="topbar-status">
            <span className="online-dot" />
            AI Assistant
          </div>
        </header>

        <section className="chat-area">
          {!uploaded && (
            <div className="welcome-section">
              <div className="welcome-symbol">✦</div>
              <span className="eyebrow">YOUR AI LEARNING COMPANION</span>
              <h1>Learn anything from<br />your <span>PDF documents.</span></h1>
              <p className="welcome-description">
                Upload your study material, ask questions, and get
                answers grounded in your documents.
              </p>

              <div className="upload-card">
                <div className="upload-icon">PDF</div>

                <h3>{file ? file.name : 'Upload your PDF document'}</h3>

                <p>
                  {file
                    ? `${formatFileSize(file.size)} · Ready to upload`
                    : 'Choose a document from your computer to get started.'}
                </p>

                <input
                  ref={fileInput}
                  type="file"
                  accept=".pdf,application/pdf"
                  hidden
                  onChange={handleFile}
                />

                <div className="upload-actions">
                  <button
                    className="secondary-button"
                    onClick={() => fileInput.current?.click()}
                    disabled={uploading}
                  >
                    {file ? 'Change PDF' : 'Browse files'}
                  </button>

                  {file && (
                    <button
                      className="primary-button"
                      onClick={uploadPDF}
                      disabled={uploading}
                    >
                      {uploading ? 'Processing...' : 'Upload PDF'}
                    </button>
                  )}
                </div>

                {uploading && <div className="progress-track"><div /></div>}

                <div className="upload-footer">
                  <span>✓ PDF documents only</span>
                  <span>Maximum 20 MB</span>
                </div>
              </div>

              <div className="feature-row">
                <div><span>✦</span> AI-powered answers</div>
                <div><span>▤</span> Page references</div>
                <div><span>⌕</span> Smart document search</div>
              </div>
            </div>
          )}

          {uploaded && (
            <div className="document-banner">
              <div className="document-icon">PDF</div>
              <div className="document-details">
                <strong>{documentInfo?.original_filename || file?.name}</strong>
                <span>
                  {documentInfo?.pages_processed} pages · {documentInfo?.chunks_created} chunks indexed
                </span>
              </div>
              <span className="indexed-badge">✓ Indexed</span>
              <button
                className="change-document"
                onClick={() => fileInput.current?.click()}
              >
                Change
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,application/pdf"
                hidden
                onChange={handleFile}
              />
            </div>
          )}

          <div className="messages-container">
            {messages.map((message, index) => (
              <div key={index} className={`message-row ${message.role}`}>
                <div className={`message-avatar ${message.role}`}>
                  {message.role === 'assistant' ? '✦' : 'S'}
                </div>

                <div className="message-body">
                  <div className="message-heading">
                    <strong>
                      {message.role === 'assistant' ? 'StudyMate' : 'You'}
                    </strong>
                    {message.role === 'assistant' && (
                      <span className="ai-label">AI ASSISTANT</span>
                    )}
                  </div>

                  <div className="message-text">{message.text}</div>

                  {message.sources?.length > 0 && (
                    <div className="sources-panel">
                      <span className="sources-heading">SOURCES</span>
                      <div className="source-list">
                        {message.sources.map((source, sourceIndex) => (
                          <a
                            className="source-link"
                            key={`${source.document}-${source.page}-${sourceIndex}`}
                            href={pdfUrl ? `${pdfUrl}#page=${source.page}` : undefined}
                            target="_blank"
                            rel="noreferrer"
                            title="Open cited PDF page"
                          >
                            <span>▤</span>
                            <span>
                              {source.document} · Page {source.page}
                            </span>
                            {pdfUrl && <span className="source-arrow">↗</span>}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {asking && (
              <div className="message-row assistant">
                <div className="message-avatar assistant">✦</div>
                <div className="message-body">
                  <div className="message-heading">
                    <strong>StudyMate</strong>
                  </div>
                  <div className="typing-indicator">
                    <span /><span /><span />
                    <small>Searching your document...</small>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </section>

        <footer className="chat-footer">
          {error && <div className="error-message">{error}</div>}

          <form className="chat-input" onSubmit={sendMessage}>
            <input
              value={question}
              onChange={event => setQuestion(event.target.value)}
              placeholder={
                uploaded
                  ? 'Ask anything about your PDF...'
                  : 'Upload a PDF to start asking questions...'
              }
              disabled={!uploaded || asking}
            />

            <button
              type="submit"
              disabled={!uploaded || !question.trim() || asking}
              aria-label="Send question"
            >
              ➤
            </button>
          </form>

          <p className="footer-note">
            StudyMate AI can make mistakes. Verify important information in your source document.
          </p>
        </footer>
      </main>
    </div>
  )
}

export default App
