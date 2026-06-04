'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Send, Bot, User, ChevronDown, ChevronUp, Loader2, RefreshCw,
  Copy, Check, Sparkles, X, AtSign, FileText,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, PDFMeta } from '@/lib/api';
import { useChatStore } from '@/lib/store';

const SUGGESTED_QUESTIONS = [
  'Summarize this document in a few sentences.',
  'What are the key figures or statistics?',
  'List the main findings or conclusions.',
];

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const pdfId = params.pdfId as string;

  const { messages, addMessage, clearChat, isLoaded } = useChatStore(pdfId);
  const [currentPdf, setCurrentPdf] = useState<PDFMeta | null>(null);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [expandedTraces, setExpandedTraces] = useState<Record<string, boolean>>({});
  const [expandedCitations, setExpandedCitations] = useState<Record<string, boolean>>({});
  const [referencedPages, setReferencedPages] = useState<number[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Validate the PDF exists (and bounce to the library if it doesn't).
  useEffect(() => {
    const fetchPdf = async () => {
      try {
        const pdfs = await api.getPDFs();
        const found = pdfs.find((p) => p.id === pdfId);
        if (found) setCurrentPdf(found);
        else router.push('/library');
      } catch (err) {
        console.error('Failed to fetch PDF details:', err);
      }
    };
    if (pdfId) fetchPdf();
  }, [pdfId, router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, isTyping]);

  const toggleTrace = (msgId: string) =>
    setExpandedTraces((prev) => ({ ...prev, [msgId]: !prev[msgId] }));

  const toggleCitation = (key: string) =>
    setExpandedCitations((prev) => ({ ...prev, [key]: !prev[key] }));

  const addReference = (page: number) => {
    setReferencedPages((prev) => (prev.includes(page) ? prev : [...prev, page]));
    textareaRef.current?.focus();
  };

  const removeReference = (page: number) =>
    setReferencedPages((prev) => prev.filter((p) => p !== page));

  const sendQuery = async (raw: string) => {
    const userQuery = raw.trim();
    if (!userQuery || isTyping) return;

    // Fold any referenced pages into the prompt so the agent narrows its search.
    const refs = [...referencedPages].sort((a, b) => a - b);
    const composed = refs.length
      ? `${userQuery}\n\n(Focus on the information from page ${refs.join(', ')}.)`
      : userQuery;

    setInput('');
    setReferencedPages([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    addMessage({ role: 'user', content: composed });
    setIsTyping(true);

    try {
      const response = await api.queryAgent(pdfId, composed);
      addMessage({
        role: 'agent',
        content: response.answer,
        citations: response.citations,
        trace: response.trace,
      });
    } catch (err: any) {
      console.error(err);
      addMessage({
        role: 'agent',
        content: `Error: ${err.response?.data?.detail || 'Failed to connect to the agentic backend.'}`,
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuery(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuery(input);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const handleCopy = async (msgId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId((id) => (id === msgId ? null : id)), 1500);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  if (!isLoaded || !currentPdf) {
    return (
      <div className="center-full">
        <Loader2 size={32} className="icon-spin" style={{ color: 'var(--accent-color)' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', maxWidth: '860px', margin: '0 auto', width: '100%' }}>

      {/* Slim toolbar — no document title, just a clear-chat action */}
      {messages.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px', flexShrink: 0 }}>
          <button onClick={clearChat} className="copy-btn" title="Clear conversation">
            <RefreshCw size={14} /> Clear chat
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          marginBottom: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          minHeight: 0,
          background: 'rgba(40, 44, 52, 0.6)',
          border: '1px solid var(--panel-border)',
          borderRadius: '18px',
        }}
      >
        {messages.length === 0 ? (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-secondary)', maxWidth: '460px' }}>
            <Bot size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', color: 'var(--text-primary)' }}>Agent is ready</h3>
            <p>Ask anything about this document. The agent will read tables, perform mathematical calculations, and provide verifiable citations.</p>

            <div style={{ marginTop: '28px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.7, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Sparkles size={14} /> Try asking
              </p>
              {SUGGESTED_QUESTIONS.map((q) => (
                <button key={q} className="suggestion-chip" onClick={() => sendQuery(q)} disabled={isTyping}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                gap: '16px',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '90%',
              }}
            >
              {msg.role === 'agent' && (
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, var(--accent-color), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Bot size={20} color="white" />
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '16px',
                    background: msg.role === 'user' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${msg.role === 'user' ? 'rgba(139, 92, 246, 0.4)' : 'var(--panel-border)'}`,
                    borderTopRightRadius: msg.role === 'user' ? '4px' : '16px',
                    borderTopLeftRadius: msg.role === 'agent' ? '4px' : '16px',
                  }}
                >
                  {msg.role === 'agent' ? (
                    <div className="md">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.95rem', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{msg.content}</div>
                  )}

                  {/* Citations — click a page to reveal its source text */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600, letterSpacing: '0.05em' }}>SOURCES</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {msg.citations.map((cit, idx) => {
                          const key = `${msg.id}-${idx}`;
                          const open = !!expandedCitations[key];
                          return (
                            <button
                              key={key}
                              className={`cite-chip ${open ? 'active' : ''}`}
                              onClick={() => toggleCitation(key)}
                              title="Show source text from this page"
                            >
                              <FileText size={12} />
                              Page {cit.page}
                              {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                          );
                        })}
                      </div>

                      {/* Expanded source panels */}
                      {msg.citations.map((cit, idx) => {
                        const key = `${msg.id}-${idx}`;
                        if (!expandedCitations[key]) return null;
                        return (
                          <div key={`panel-${key}`} className="cite-panel">
                            <div className="cite-panel-head">
                              <span>Page {cit.page}</span>
                              <button
                                className="cite-ref-btn"
                                onClick={() => addReference(cit.page)}
                                title="Reference this page in your next question"
                              >
                                <AtSign size={12} /> Reference
                              </button>
                            </div>
                            <p className="cite-text">{cit.text || 'No source text available for this page.'}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Reasoning trace */}
                  {msg.trace && msg.trace.length > 0 && (
                    <div style={{ marginTop: '12px' }}>
                      <button
                        onClick={() => toggleTrace(msg.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', padding: 0 }}
                      >
                        {expandedTraces[msg.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {expandedTraces[msg.id] ? 'Hide reasoning trace' : `View reasoning trace (${msg.trace.length} steps)`}
                      </button>

                      {expandedTraces[msg.id] && (
                        <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.85rem', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {msg.trace.map((step, idx) => (
                            <div key={idx} style={{ borderBottom: idx < msg.trace!.length - 1 ? '1px dashed rgba(255,255,255,0.1)' : 'none', paddingBottom: idx < msg.trace!.length - 1 ? '12px' : 0 }}>
                              <div style={{ color: 'var(--accent-secondary)', marginBottom: '4px' }}>[{step.action}] {step.action_input}</div>
                              <div style={{ color: 'var(--text-secondary)' }}>&gt; {step.observation}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {msg.role === 'agent' && (
                  <button onClick={() => handleCopy(msg.id, msg.content)} className="copy-btn" title="Copy answer">
                    {copiedId === msg.id ? <Check size={13} /> : <Copy size={13} />}
                    {copiedId === msg.id ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>

              {msg.role === 'user' && (
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <User size={20} color="var(--text-secondary)" />
                </div>
              )}
            </div>
          ))
        )}

        {isTyping && (
          <div style={{ display: 'flex', gap: '16px', alignSelf: 'flex-start', maxWidth: '90%' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, var(--accent-color), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Bot size={20} color="white" />
            </div>
            <div style={{ padding: '16px', borderRadius: '16px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--panel-border)', borderTopLeftRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Loader2 size={16} className="icon-spin" style={{ color: 'var(--accent-secondary)' }} />
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Agent is analyzing...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Composer — open, ChatGPT-style */}
      <form onSubmit={handleSubmit} style={{ flexShrink: 0 }}>
        {referencedPages.length > 0 && (
          <div className="ref-pills">
            {referencedPages.map((p) => (
              <span key={p} className="ref-pill">
                <AtSign size={12} /> Page {p}
                <button type="button" onClick={() => removeReference(p)} aria-label={`Remove page ${p} reference`}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="composer">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about this document…"
            disabled={isTyping}
            rows={1}
            className="composer-input"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="composer-send"
            aria-label="Send"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="composer-hint">Enter to send · Shift+Enter for a new line · open a source and hit “Reference” to focus the next answer</p>
      </form>
    </div>
  );
}
