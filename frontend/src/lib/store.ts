'use client';

import { useState, useEffect } from 'react';

// Store messages per PDF ID
export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  // Agent specific
  citations?: { page: number; text: string }[];
  trace?: any[];
}

export function useChatStore(pdfId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (!pdfId) return;
    const key = `nexus_chat_${pdfId}`;
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        setMessages(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load chat history:', e);
    }
    setIsLoaded(true);
  }, [pdfId]);

  // Save to localStorage when messages change
  useEffect(() => {
    if (!isLoaded || !pdfId) return;
    const key = `nexus_chat_${pdfId}`;
    try {
      localStorage.setItem(key, JSON.stringify(messages));
    } catch (e) {
      console.error('Failed to save chat history:', e);
    }
  }, [messages, isLoaded, pdfId]);

  const addMessage = (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMsg: ChatMessage = {
      ...msg,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newMsg]);
  };

  const clearChat = () => {
    setMessages([]);
  };

  return {
    messages,
    addMessage,
    clearChat,
    isLoaded,
  };
}
