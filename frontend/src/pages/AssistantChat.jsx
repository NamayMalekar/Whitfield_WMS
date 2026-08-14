import { useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronDown, Database, Send, Sparkles } from 'lucide-react'
import { assistantApi } from '../services/api'
import { useWarehouse } from '../context/WarehouseContext'
import { Banner } from '../components/ui'

const OPENERS = [
  'How many units of SKU-1042 are available?',
  'What do I do with a damaged pallet at receiving?',
  'Which SKUs are below their reorder point?',
  'When do we run cycle counts?',
]

export default function AssistantChat() {
  const { active } = useWarehouse()
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sops, setSops] = useState([])
  const endRef = useRef(null)

  useEffect(() => {
    assistantApi
      .sops()
      .then(({ data }) => setSops(data))
      .catch(() => setSops([]))
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const ask = (text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const history = messages.map((message) => ({ role: message.role, content: message.content }))
    setMessages((current) => [...current, { role: 'user', content: trimmed }])
    setQuestion('')
    setBusy(true)
    setError('')

    assistantApi
      .ask({ question: trimmed, warehouse_code: active, history })
      .then(({ data }) => {
        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            content: data.answer,
            sources: data.sources,
            mode: data.mode,
            followUps: data.follow_ups,
          },
        ])
      })
      .catch((err) => setError(err.friendlyMessage))
      .finally(() => setBusy(false))
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      <section className="card flex h-[calc(100vh-11rem)] min-h-[32rem] flex-col overflow-hidden">
        <header className="border-b border-line px-5 py-4">
          <h1 className="display-md">Floor assistant</h1>
          <p className="lede mt-1">
            Procedures and live counts. Numbers come from the database, never from a guess.
          </p>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {messages.length === 0 && (
            <div className="animate-fade">
              <p className="lede">Ask anything about stock or standard procedure.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {OPENERS.map((opener) => (
                  <button
                    key={opener}
                    type="button"
                    className="btn-quiet btn-sm font-medium"
                    onClick={() => ask(opener)}
                  >
                    {opener}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`animate-rise max-w-[86%] ${message.role === 'user' ? 'ml-auto' : ''}`}
            >
              <div
                className={`rounded-2xl px-4 py-3 text-[0.9375rem] leading-relaxed ${
                  message.role === 'user' ? 'text-[color:var(--cobalt-ink)]' : 'bg-mist'
                }`}
                style={message.role === 'user' ? { background: 'var(--cobalt)' } : undefined}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>

              {message.role === 'assistant' && (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {message.mode && (
                      <span
                        className="pill tint"
                        style={{
                          color: message.mode === 'llm' ? 'var(--cobalt)' : 'var(--shipped)',
                        }}
                      >
                        {message.mode === 'llm' ? (
                          <Sparkles className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <Database className="h-3 w-3" aria-hidden="true" />
                        )}
                        {message.mode === 'llm' ? 'model' : 'from the database'}
                      </span>
                    )}
                    {(message.sources || []).map((source) => (
                      <span key={source} className="pill text-slate">
                        {source}
                      </span>
                    ))}
                  </div>

                  {(message.followUps || []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.followUps.map((followUp) => (
                        <button
                          key={followUp}
                          type="button"
                          className="btn-bare btn-sm"
                          onClick={() => ask(followUp)}
                        >
                          {followUp}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          {busy && <TypingDots />}
          {error && <Banner tone="error">{error}</Banner>}
          <div ref={endRef} />
        </div>

        <form
          className="flex gap-2 border-t border-line p-4"
          onSubmit={(event) => {
            event.preventDefault()
            ask(question)
          }}
        >
          <input
            className="field"
            placeholder={`Ask about ${active || 'the warehouse'}…`}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            aria-label="Your question"
          />
          <button type="submit" className="btn-primary" disabled={busy || !question.trim()}>
            <Send className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Ask</span>
          </button>
        </form>
      </section>

      <section className="card h-fit overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4">
          <BookOpen className="h-[1.125rem] w-[1.125rem] text-slate" aria-hidden="true" />
          <h2 className="display-md">SOP library</h2>
        </div>
        <p className="lede -mt-2 px-5 pb-4">What the assistant answers from.</p>

        <div className="divide-y divide-line border-t border-line">
          {sops.map((sop) => (
            <details key={sop.key} className="group px-5 py-3.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
                {sop.title}
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-slate transition-transform duration-300 ease-ease group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate">{sop.body}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 rounded-2xl bg-mist px-4 py-3.5" role="status">
      <span className="sr-only">Checking</span>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1.5 w-1.5 animate-halo rounded-full"
          style={{ background: 'var(--slate)', animationDelay: `${index * 160}ms` }}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}
