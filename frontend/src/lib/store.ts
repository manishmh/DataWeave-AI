'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthProvider';
import {
  getCachedConversation,
  loadGuestMessages,
  saveGuestMessages,
  clearGuestMessages,
  getOrCreateConversation,
  fetchMessages,
  persistMessage,
  type StoredMessage,
} from '@/lib/chatHistory';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp?: string;
  citations?: { page: number; text: string }[];
  trace?: any[];
}

const newId = () => Math.random().toString(36).substring(2, 11);
const toStored = (m: ChatMessage): StoredMessage => ({
  id: m.id,
  role: m.role,
  content: m.content,
  citations: (m.citations ?? []) as any,
  trace: (m.trace ?? []) as any,
});

/**
 * Per-PDF chat store.
 *  - Guests          → localStorage only (demo account stays pristine).
 *  - Logged-in users → Supabase, with the recent-5 cache giving instant open.
 *
 * Persistence is deliberately kept OUT of the setMessages updater: React runs
 * state updaters twice under StrictMode, so a DB insert there would double every
 * message. We mirror the thread in a ref and persist exactly once per addMessage.
 */
export function useChatStore(pdfId: string) {
  const supabase = useMemo(() => createClient(), []);
  const { user, isGuest, loading: authLoading } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const messagesRef = useRef<ChatMessage[]>([]);
  const conversationIdRef = useRef<string | null>(null);
  const convoPromiseRef = useRef<Promise<string | null> | null>(null);

  // Single place that keeps state + ref in lockstep.
  const applyMessages = useCallback((arr: ChatMessage[]) => {
    messagesRef.current = arr;
    setMessages(arr);
  }, []);

  // ---- load -------------------------------------------------------------
  useEffect(() => {
    if (!pdfId || authLoading || !user) return;
    let cancelled = false;

    conversationIdRef.current = null;
    convoPromiseRef.current = null;
    setIsLoaded(false);

    (async () => {
      if (isGuest) {
        if (!cancelled) {
          applyMessages(loadGuestMessages(pdfId) as ChatMessage[]);
          setIsLoaded(true);
        }
        return;
      }

      // Instant paint from the recent-5 cache, then reconcile with Supabase.
      const cached = getCachedConversation(user.id, pdfId);
      if (cached && !cancelled) applyMessages(cached as ChatMessage[]);

      const { data: convo } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', user.id)
        .eq('pdf_id', pdfId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (convo?.id) {
        conversationIdRef.current = convo.id;
        const remote = await fetchMessages(supabase, convo.id);
        if (!cancelled) applyMessages(remote as ChatMessage[]);
      } else if (!cached && !cancelled) {
        applyMessages([]);
      }
      if (!cancelled) setIsLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfId, user, isGuest, authLoading, supabase, applyMessages]);

  // ---- lazily create the conversation on first message ------------------
  const ensureConversation = useCallback(
    async (title: string): Promise<string | null> => {
      if (!user) return null;
      if (conversationIdRef.current) return conversationIdRef.current;
      if (!convoPromiseRef.current) {
        convoPromiseRef.current = getOrCreateConversation(supabase, user.id, pdfId, title).then(
          (c) => {
            conversationIdRef.current = c?.id ?? null;
            return c?.id ?? null;
          }
        );
      }
      return convoPromiseRef.current;
    },
    [supabase, user, pdfId]
  );

  // ---- add + persist (exactly once) -------------------------------------
  const addMessage = useCallback(
    (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
      const newMsg: ChatMessage = { ...msg, id: newId(), timestamp: new Date().toISOString() };
      const next = [...messagesRef.current, newMsg];
      applyMessages(next);

      const storedNext = next.map(toStored);
      if (isGuest) {
        saveGuestMessages(pdfId, storedNext);
        return;
      }
      if (!user) return;

      const title = next.length === 1 && newMsg.role === 'user' ? newMsg.content.slice(0, 80) : null;
      void ensureConversation(title ?? 'Conversation').then((convId) => {
        if (!convId) return;
        void persistMessage(supabase, {
          conversationId: convId,
          userId: user.id,
          pdfId,
          title,
          role: newMsg.role,
          content: newMsg.content,
          citations: newMsg.citations as any,
          trace: newMsg.trace as any,
          allMessages: storedNext,
        });
      });
    },
    [isGuest, user, pdfId, supabase, ensureConversation, applyMessages]
  );

  // ---- clear ------------------------------------------------------------
  const clearChat = useCallback(() => {
    applyMessages([]);
    if (isGuest) {
      clearGuestMessages(pdfId);
      return;
    }
    const convId = conversationIdRef.current;
    conversationIdRef.current = null;
    convoPromiseRef.current = null;
    if (convId) {
      void supabase.from('conversations').delete().eq('id', convId);
    }
  }, [isGuest, pdfId, supabase, applyMessages]);

  return { messages, addMessage, clearChat, isLoaded };
}
