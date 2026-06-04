-- =====================================================================
-- Chat history schema + Row Level Security for the PDF agent.
-- Run this in the Supabase dashboard → SQL Editor (once).
--
-- Model: one conversation per (user, pdf). Messages belong to a conversation.
-- RLS ensures every user can only see/modify their own rows.
-- =====================================================================

-- ---- conversations -------------------------------------------------
create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  pdf_id      text,                       -- which document this chat is about
  title       text,                       -- display title (first question, usually)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);
create index if not exists conversations_user_pdf_idx
  on public.conversations (user_id, pdf_id);

-- ---- messages ------------------------------------------------------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null check (role in ('user', 'agent')),
  content         text not null default '',
  citations       jsonb not null default '[]'::jsonb,
  trace           jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);

-- ---- keep conversations.updated_at fresh on new messages -----------
create or replace function public.touch_conversation()
returns trigger language plpgsql as $$
begin
  update public.conversations
     set updated_at = now()
   where id = new.conversation_id;
  return new;
end $$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- ---- Row Level Security -------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages       enable row level security;

-- conversations: owner-only access
drop policy if exists "own conversations" on public.conversations;
create policy "own conversations" on public.conversations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- messages: owner-only access
drop policy if exists "own messages" on public.messages;
create policy "own messages" on public.messages
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =====================================================================
-- DEMO / GUEST SEED  (run AFTER the demo user exists)
-- ---------------------------------------------------------------------
-- 1) Create the demo user first: Authentication → Users → Add user
--    email = guest@nexusdata.app, password = (your NEXT_PUBLIC_DEMO_PASSWORD),
--    and tick "Auto Confirm User".
-- 2) Then run the block below to give it a couple of dummy conversations
--    so the /guest experience shows a populated app immediately.
-- =====================================================================
do $$
declare
  demo_id uuid;
  conv_id uuid;
begin
  select id into demo_id from auth.users where email = 'guest@nexusdata.app';
  if demo_id is null then
    raise notice 'Demo user guest@nexusdata.app not found — create it first, then re-run this block.';
    return;
  end if;

  -- Only seed once.
  if exists (select 1 from public.conversations where user_id = demo_id) then
    raise notice 'Demo data already present — skipping.';
    return;
  end if;

  insert into public.conversations (user_id, pdf_id, title)
  values (demo_id, 'demo-doc', 'Sample: Cyber Ireland 2022 report')
  returning id into conv_id;

  insert into public.messages (conversation_id, user_id, role, content, citations) values
    (conv_id, demo_id, 'user',  'How many cybersecurity professionals are employed in Ireland?', '[]'::jsonb),
    (conv_id, demo_id, 'agent', 'There are approximately 7,351 cybersecurity professionals (full-time equivalents) working across Ireland''s cybersecurity sector. [Page 16]',
       '[{"page":16,"text":"...approximately 7,351 cybersecurity professionals (FTE) across Ireland''s sector."}]'::jsonb),
    (conv_id, demo_id, 'user',  'What is the projected 2030 target?', '[]'::jsonb),
    (conv_id, demo_id, 'agent', 'The report sets a 2030 target of 17,000 professionals — about a 131% increase on the 2022 baseline. [Page 16]',
       '[{"page":16,"text":"2030 ambition of 17,000 professionals."}]'::jsonb);

  raise notice 'Seeded demo data for guest@nexusdata.app';
end $$;
