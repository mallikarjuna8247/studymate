import { useState } from "react";
import {
  GraduationCap,
  Plus,
  Send,
  Paperclip,
  MessageSquare,
} from "lucide-react";
import "./App.css";

function App() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);

  const handleSubmit = (e) => {
    e.preventDefault();

    const userQuestion = question.trim();

    if (!userQuestion) return;

    setMessages((previous) => [
      ...previous,
      { role: "user", content: userQuestion },
      {
        role: "assistant",
        content:
          "Your message was received! We will connect the Python backend in our next development step.",
      },
    ]);

    setQuestion("");
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>
          <GraduationCap /> StudyMate
        </h2>

        <button
          className="new-chat"
          onClick={() => setMessages([])}
        >
          <Plus size={18} /> New chat
        </button>

        <p className="history-title">Recent chats</p>

        <div className="history-item">
          <MessageSquare size={16} /> Current session
        </div>
      </aside>

      <main className="chat-area">
        <header className="topbar">
          StudyMate Assistant
        </header>

        {messages.length === 0 ? (
          <section className="welcome">
            <GraduationCap size={48} />
            <h1>What would you like to learn?</h1>
            <p>
              Upload your documents and ask questions about them.
            </p>
          </section>
        ) : (
          <section className="messages">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`message ${message.role}`}
              >
                <strong>
                  {message.role === "user"
                    ? "You"
                    : "StudyMate"}
                </strong>

                <p>{message.content}</p>
              </div>
            ))}
          </section>
        )}

        <form className="chat-input" onSubmit={handleSubmit}>
          <button type="button" title="Document upload coming next">
            <Paperclip size={20} />
          </button>

          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask StudyMate anything..."
          />

          <button
            type="submit"
            className="send-button"
            disabled={!question.trim()}
          >
            <Send size={20} />
          </button>
        </form>
      </main>
    </div>
  );
}

export default App;