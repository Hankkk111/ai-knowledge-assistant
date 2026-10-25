import { useState, useRef, useEffect } from "react";
import type { Message } from "./types";
import { ApiError, MAX_QUERY_LENGTH, sendMessage } from "./api";

// Show the remaining-characters hint once the query gets close to the limit.
const LENGTH_HINT_THRESHOLD = MAX_QUERY_LENGTH - 200;

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // A blank or whitespace-only question is ignored on submit, so don't
  // present the button as clickable for one.
  const canSubmit = !loading && input.trim().length > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const query = input.trim();
    if (!query || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: query }]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await sendMessage(query);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.answer, sources: res.sources },
      ]);
    } catch (err) {
      // 4xx responses carry a specific reason from the API (e.g. the query is
      // too long); show it so the user knows what to change. Anything else is
      // a network or server failure.
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        setError(err.message);
      } else {
        setError("Couldn't reach the knowledge base. Check the API and try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink text-paper flex flex-col">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1 className="font-serif text-lg tracking-tight">Knowledge Assistant</h1>
          <span className="text-xs text-paper/50 font-mono">
            {messages.length === 0 ? "ready" : `${messages.length} messages`}
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-2xl mx-auto flex flex-col gap-8">
          {messages.length === 0 && (
            <p className="text-paper/40 font-serif text-lg leading-relaxed">
              Ask a question about your documents. Answers are grounded in the
              sources you've indexed, with citations attached.
            </p>
          )}

          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === "user" ? (
                <p className="text-paper/90">
                  <span className="text-amber font-mono text-xs mr-2">you</span>
                  {msg.content}
                </p>
              ) : (
                <div>
                  <p className="font-serif text-lg leading-relaxed text-paper">
                    {msg.content}
                  </p>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 border-l-2 border-amber/40 pl-3 flex flex-col gap-1.5">
                      {msg.sources.map((s, j) => (
                        <p key={j} className="text-xs text-paper/50 font-mono leading-relaxed">
                          {s.snippet}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <p className="text-paper/40 font-mono text-xs">searching…</p>
          )}

          {error && (
            <p className="text-red-400/80 text-sm">{error}</p>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      <form onSubmit={handleSubmit} className="border-t border-white/10 px-6 py-4">
        <div className="max-w-2xl mx-auto flex gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask something…"
            aria-label="Question"
            maxLength={MAX_QUERY_LENGTH}
            className="flex-1 bg-panel border border-white/10 rounded-sm px-4 py-2.5 text-paper placeholder:text-paper/30 outline-none focus:border-amber/50 transition-colors"
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-5 py-2.5 bg-amber text-ink font-medium rounded-sm hover:bg-amber/90 disabled:opacity-40 transition-colors"
          >
            Ask
          </button>
        </div>
        {input.length >= LENGTH_HINT_THRESHOLD && (
          <p className="max-w-2xl mx-auto mt-2 text-xs text-paper/50 font-mono text-right">
            {MAX_QUERY_LENGTH - input.length} characters left
          </p>
        )}
      </form>
    </div>
  );
}
