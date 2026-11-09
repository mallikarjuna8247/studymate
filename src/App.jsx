
import { useRef, useState } from 'react'
import './App.css'

const API_URL = 'http://127.0.0.1:8000'

function App() {
  const [file, setFile] = useState(null)
  const [uploaded, setUploaded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [asking, setAsking] = useState(false)
  const [question, setQuestion] = useState('')
  const [error, setError] = useState('')

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Hello! I am StudyMate. Upload a PDF document and ask me questions about its contents.'
    }
  ])

  const fileInput = useRef(null)

  const handleFile = (event) => {
    const selectedFile = event.target.files[0]

    if (!selectedFile) return

    if (selectedFile.type !== 'application/pdf') {
      setError('Please select a PDF file.')
      setFile(null)
      setUploaded(false)
      return
    }

    setFile(selectedFile)
    setUploaded(false)
    setError('')
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

      setMessages((prev) => [
        ...prev,
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

    if (!userQuestion || asking) return

    if (!uploaded) {
      setError('Please upload and process a PDF before asking questions.')
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
      const response = await fetch(`${API_URL}/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question: userQuestion
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Unable to generate an answer.')
      }

      const sourceText = data.sources?.length
        ? '\n\nSources:\n' + data.sources
            .map((source) => `${source.document}, page ${source.page}`)
            .join('\n')
        : ''

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.answer + sourceText
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

        <button className="new-chat">+ New Chat</button>

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
            <p>Upload your PDF. Ask questions. Learn faster.</p>

            <div className="upload-card">
              <div className="pdf-icon">📄</div>

              <h3>
                {file ? file.name : 'Upload your PDF document'}
              </h3>

              <p>
                {uploaded
                  ? 'PDF successfully processed and indexed.'
                  : file
                    ? 'PDF selected. Ready for processing.'
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
                onClick={() => fileInput.current.click()}
                disabled={uploading || asking}
              >
                {file ? 'Change PDF' : 'Browse PDF'}
              </button>

              {file && (
                <button
                  className="upload-button"
                  onClick={uploadPDF}
                  disabled={uploading || asking || uploaded}
                >
                  {uploading
                    ? 'Processing PDF...'
                    : uploaded
                      ? 'PDF Processed'
                      : 'Upload and Process'}
                </button>
              )}

              <small>PDF documents only · Maximum 20 MB</small>

              {uploaded && (
                <p className="success-message">
                  ✓ Document ready for questions
                </p>
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

            {asking && (
              <div className="message assistant">
                <div className="message-avatar">✦</div>
                <div className="message-content">
                  <strong>StudyMate</strong>
                  <p>Thinking... Searching your document and generating an answer.</p>
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
                  ? 'Ask anything about your PDF...'
                  : 'Upload a PDF before asking a question...'
              }
              disabled={!uploaded || asking}
            />

            <button
              type="submit"
              disabled={!uploaded || !question.trim() || asking}
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
