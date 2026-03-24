'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Send, Bot, User, FileText, ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react';
import { api, PDFMeta, QueryResponse } from '@/lib/api';
import { useChatStore, ChatMessage } from '@/lib/store';

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const pdfId = params.pdfId as string;
  
  const { messages, addMessage, clearChat, isLoaded } = useChatStore(pdfId);
  const [currentPdf, setCurrentPdf] = useState<PDFMeta | null>(null);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [expandedTraces, setExpandedTraces] = useState<Record<string, boolean>>({});
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch PDF details on load
  useEffect(() => {
    const fetchPdf = async () => {
      try {
        const pdfs = await api.getPDFs();
        const found = pdfs.find(p => p.id === pdfId);
        if (found) {
          setCurrentPdf(found);
        } else {
          router.push('/library');
        }
      } catch (err) {
        console.error('Failed to fetch PDF details:', err);
      }
    };
    if (pdfId) fetchPdf();
  }, [pdfId, router]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const toggleTrace = (msgId: string) => {
    setExpandedTraces(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userQuery = input.trim();
    setInput('');
    
    // Add user message
    addMessage({
      role: 'user',
      content: userQuery,
    });
    
    setIsTyping(true);
    
    try {
      // Call backend agent
      const response = await api.queryAgent(pdfId, userQuery);
      
      // Add agent response
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

  if (!isLoaded || !currentPdf) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="spinner" />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: '900px', margin: '0 auto' }}>
      
      {/* Header */}
      <div className="glass-panel" style={{ padding: '16px 24px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ padding: '8px', background: 'var(--accent-glow)', borderRadius: '8px', color: 'var(--accent-color)' }}>
            <FileText size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>{currentPdf.name}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
              Agentic Analysis Session
            </p>
          </div>
        </div>
        
        <button 
          onClick={clearChat}
          className="glass-button" 
          title="Clear Conversation"
          style={{ padding: '8px', color: 'var(--text-secondary)' }}
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Chat Messages Area */}
      <div 
        className="glass-panel" 
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '24px',
          marginBottom: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}
      >
        {messages.length === 0 ? (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-secondary)', maxWidth: '400px' }}>
            <Bot size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', color: 'var(--text-primary)' }}>Agent is ready</h3>
            <p>Ask anything about this document. The agent will read tables, perform mathematical calculations, and provide verifiable citations.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id} 
              style={{ 
                display: 'flex', 
                gap: '16px',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%'
              }}
            >
              {msg.role === 'agent' && (
                <div style={{ 
                  width: '36px', height: '36px', borderRadius: '10px', 
                  background: 'linear-gradient(135deg, var(--accent-color), var(--accent-secondary))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Bot size={20} color="white" />
                </div>
              )}
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ 
                  padding: '16px', 
                  borderRadius: '16px',
                  background: msg.role === 'user' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${msg.role === 'user' ? 'rgba(139, 92, 246, 0.4)' : 'var(--panel-border)'}`,
                  borderTopRightRadius: msg.role === 'user' ? '4px' : '16px',
                  borderTopLeftRadius: msg.role === 'agent' ? '4px' : '16px',
                }}>
                  <div style={{ fontSize: '0.95rem', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {msg.content}
                  </div>
                  
                  {/* Citations */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>SOURCES</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {msg.citations.map((cit, idx) => (
                          <div key={idx} style={{ 
                            background: 'rgba(255,255,255,0.05)', 
                            padding: '4px 8px', 
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            border: '1px solid rgba(255,255,255,0.1)'
                          }}>
                            <span style={{ color: 'var(--accent-secondary)' }}>Page {cit.page}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Reasoning Trace Toggle */}
                  {msg.trace && msg.trace.length > 0 && (
                    <div style={{ marginTop: '12px' }}>
                      <button 
                        onClick={() => toggleTrace(msg.id)}
                        style={{ 
                          background: 'none', border: 'none', 
                          color: 'var(--text-secondary)', fontSize: '0.8rem',
                          display: 'flex', alignItems: 'center', gap: '4px',
                          cursor: 'pointer', padding: 0
                        }}
                      >
                        {expandedTraces[msg.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {expandedTraces[msg.id] ? 'Hide reasoning trace' : `View reasoning trace (${msg.trace.length} steps)`}
                      </button>
                      
                      {expandedTraces[msg.id] && (
                        <div style={{ 
                          marginTop: '12px', padding: '12px', 
                          background: 'rgba(0,0,0,0.3)', borderRadius: '8px',
                          border: '1px solid rgba(255,255,255,0.05)',
                          fontSize: '0.85rem', fontFamily: 'monospace',
                          display: 'flex', flexDirection: 'column', gap: '12px'
                        }}>
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
              </div>

              {msg.role === 'user' && (
                <div style={{ 
                  width: '36px', height: '36px', borderRadius: '10px', 
                  background: 'rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <User size={20} color="var(--text-secondary)" />
                </div>
              )}
            </div>
          ))
        )}
        
        {isTyping && (
          <div style={{ display: 'flex', gap: '16px', alignSelf: 'flex-start', maxWidth: '85%' }}>
            <div style={{ 
              width: '36px', height: '36px', borderRadius: '10px', 
              background: 'linear-gradient(135deg, var(--accent-color), var(--accent-secondary))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0
            }}>
              <Bot size={20} color="white" />
            </div>
            <div style={{ 
              padding: '16px', borderRadius: '16px', background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--panel-border)', borderTopLeftRadius: '4px',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <Loader2 size={16} className="spinner" style={{ color: 'var(--accent-secondary)' }} />
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Agent is analyzing...</span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
        <input 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about this document..."
          disabled={isTyping}
          style={{
            width: '100%',
            padding: '16px 60px 16px 24px',
            borderRadius: '16px',
            background: 'var(--panel-bg)',
            border: '1px solid var(--panel-border)',
            color: 'white',
            fontSize: '1rem',
            outline: 'none',
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(12px)',
          }}
        />
        <button 
          type="submit"
          disabled={!input.trim() || isTyping}
          style={{
            position: 'absolute',
            right: '8px',
            top: '8px',
            bottom: '8px',
            width: '44px',
            borderRadius: '12px',
            background: input.trim() && !isTyping ? 'linear-gradient(135deg, var(--accent-color), var(--accent-secondary))' : 'rgba(255,255,255,0.1)',
            border: 'none',
            color: input.trim() && !isTyping ? 'white' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: input.trim() && !isTyping ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s ease'
          }}
        >
          <Send size={18} />
        </button>
      </form>
      
    </div>
  );
}
