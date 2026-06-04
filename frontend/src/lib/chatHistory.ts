/**
 * chatHistory.ts
 * --------------
 * Persistence for chat conversations.
 *
 *  - Logged-in users  → Supabase (conversations + messages tables, RLS-scoped),
 *    with the 5 most-recently-updated conversations mirrored to localStorage so
 *    they open instantly. The cache is refreshed whenever a message is added.
 *  - Guests           → localStorage only (keeps the shared demo account clean;
 *    guest chats are ephemeral and never written to the DB).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CitationItem, TraceStep } from '@/lib/api';

export interface StoredMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  citations: CitationItem[];
  trace: TraceStep[];
}

export interface ConversationMeta {
  id: string;
  pdf_id: string | null;
  title: string | null;
  updated_at: string;
}

interface CachedConversation extends ConversationMeta {
  messages: StoredMessage[];
}

const RECENT_LIMIT = 5;
const cacheKey = (userId: string) => `chatcache:${userId}`;
const guestKey = (pdfId: string) => `guestchat:${pdfId}`;

// ---------------------------------------------------------------------------
// localStorage helpers (safe on server / when storage is unavailable)
// ---------------------------------------------------------------------------
function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — ignore */
  }
}

// ---------------------------------------------------------------------------
// Recent-conversations cache (logged-in users)
// ---------------------------------------------------------------------------
export function getCachedConversation(userId: string, pdfId: string): StoredMessage[] | null {
  const convos = readJSON<CachedConversation[]>(cacheKey(userId), []);
  const hit = convos.find((c) => c.pdf_id === pdfId);
  return hit ? hit.messages : null;
}

function upsertCache(userId: string, convo: CachedConversation): void {
  let convos = readJSON<CachedConversation[]>(cacheKey(userId), []);
  convos = convos.filter((c) => c.id !== convo.id);
  convos.unshift(convo); // most-recent first
  if (convos.length > RECENT_LIMIT) convos = convos.slice(0, RECENT_LIMIT);
  writeJSON(cacheKey(userId), convos);
}

export function getRecentCached(userId: string): CachedConversation[] {
  return readJSON<CachedConversation[]>(cacheKey(userId), []);
}

// ---------------------------------------------------------------------------
// Guest (localStorage-only) store
// ---------------------------------------------------------------------------
export function loadGuestMessages(pdfId: string): StoredMessage[] {
  return readJSON<StoredMessage[]>(guestKey(pdfId), []);
}

export function saveGuestMessages(pdfId: string, messages: StoredMessage[]): void {
  writeJSON(guestKey(pdfId), messages);
}

export function clearGuestMessages(pdfId: string): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(guestKey(pdfId));
}

// ---------------------------------------------------------------------------
// Supabase-backed store (logged-in users)
// ---------------------------------------------------------------------------

/** Find the conversation for (user, pdf), creating it if absent. */
export async function getOrCreateConversation(
  supabase: SupabaseClient,
  userId: string,
  pdfId: string,
  title?: string
): Promise<ConversationMeta | null> {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id, pdf_id, title, updated_at')
    .eq('user_id', userId)
    .eq('pdf_id', pdfId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as ConversationMeta;

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, pdf_id: pdfId, title: title ?? null })
    .select('id, pdf_id, title, updated_at')
    .single();

  if (error) {
    console.error('createConversation failed', error);
    return null;
  }
  return created as ConversationMeta;
}

/** Load all messages for a conversation, oldest first. */
export async function fetchMessages(
  supabase: SupabaseClient,
  conversationId: string
): Promise<StoredMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, citations, trace')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('fetchMessages failed', error);
    return [];
  }
  return (data ?? []) as StoredMessage[];
}

/** Persist one message, then refresh the localStorage cache for this convo. */
export async function persistMessage(
  supabase: SupabaseClient,
  params: {
    conversationId: string;
    userId: string;
    pdfId: string;
    title: string | null;
    role: 'user' | 'agent';
    content: string;
    citations?: CitationItem[];
    trace?: TraceStep[];
    allMessages: StoredMessage[]; // current in-memory thread, for the cache mirror
  }
): Promise<void> {
  const { error } = await supabase.from('messages').insert({
    conversation_id: params.conversationId,
    user_id: params.userId,
    role: params.role,
    content: params.content,
    citations: params.citations ?? [],
    trace: params.trace ?? [],
  });
  if (error) {
    console.error('persistMessage failed', error);
    return;
  }

  upsertCache(params.userId, {
    id: params.conversationId,
    pdf_id: params.pdfId,
    title: params.title,
    updated_at: new Date().toISOString(),
    messages: params.allMessages,
  });
}

/** Recent conversations for a user (cache-first, then Supabase). */
export async function fetchRecentConversations(
  supabase: SupabaseClient,
  userId: string,
  limit = 20
): Promise<ConversationMeta[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, pdf_id, title, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('fetchRecentConversations failed', error);
    return getRecentCached(userId);
  }
  return (data ?? []) as ConversationMeta[];
}
