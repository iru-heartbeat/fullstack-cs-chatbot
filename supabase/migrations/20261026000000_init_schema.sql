-- 機能 #1: テーブル定義と RLS（要件 7.1, 8.3）
--
-- 顧客は Supabase の「匿名サインイン」で auth.uid() を持つ（ログイン画面なし）。
-- オペレーターは operators テーブルに載っているユーザー。
-- 顧客の状態変更（AI 解決・エスカレーション等）はサーバー側（service role）が行う。

-- ---------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------
create table public.operators (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  role       text not null default 'operator' check (role in ('operator', 'admin')),
  created_at timestamptz not null default now()
);

create table public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid not null,  -- 顧客の匿名ユーザーの auth.uid()
  status               text not null default 'ai_handling' check (status in (
                         'ai_handling', 'resolved_by_ai', 'escalated',
                         'queued', 'operator_handling', 'closed')),
  category             text,
  assigned_operator_id uuid references public.operators (id) on delete set null,
  is_after_hours       boolean not null default false,
  customer_email       text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  closed_at            timestamptz
);

create table public.messages (
  id                 uuid primary key default gen_random_uuid(),
  conversation_id    uuid not null references public.conversations (id) on delete cascade,
  sender_type        text not null check (sender_type in ('customer', 'ai', 'operator', 'system')),
  sender_operator_id uuid references public.operators (id) on delete set null,
  body               text not null check (char_length(body) between 1 and 1000),
  used_faq_ids       uuid[] not null default '{}',
  created_at         timestamptz not null default now()
);

create table public.faq (
  id         uuid primary key default gen_random_uuid(),
  category   text,
  question   text not null,
  answer     text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_hours (
  day_of_week smallint primary key check (day_of_week between 0 and 6), -- 0=日曜
  open_time   time,
  close_time  time,
  is_closed   boolean not null default false
);

create table public.holidays (
  date date primary key,
  name text not null
);

create index conversations_customer_idx on public.conversations (customer_id);
create index conversations_status_idx   on public.conversations (status, created_at);
create index messages_conversation_idx  on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------
-- updated_at の自動更新
-- ---------------------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger conversations_set_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();
create trigger faq_set_updated_at before update on public.faq
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- RLS 用ヘルパー（operators を RLS 越しに参照するため security definer）
-- ---------------------------------------------------------------
create function public.is_operator() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.operators where id = (select auth.uid()));
$$;

create function public.is_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.operators
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------
-- RLS 有効化（ポリシーを書いたものだけが許可される）
-- ---------------------------------------------------------------
alter table public.operators      enable row level security;
alter table public.conversations  enable row level security;
alter table public.messages       enable row level security;
alter table public.faq            enable row level security;
alter table public.business_hours enable row level security;
alter table public.holidays       enable row level security;

-- operators：オペレーターは全員の名前を見られる。追加・変更・削除は管理者のみ
create policy operators_select on public.operators
  for select to authenticated using (public.is_operator());
create policy operators_admin_write on public.operators
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- conversations：顧客は自分の会話のみ。作成時は ai_handling 固定
create policy conversations_customer_select on public.conversations
  for select to authenticated using (customer_id = (select auth.uid()));
create policy conversations_customer_insert on public.conversations
  for insert to authenticated
  with check (
    customer_id = (select auth.uid())
    and status = 'ai_handling'
    and assigned_operator_id is null
    and category is null
  );
create policy conversations_operator_select on public.conversations
  for select to authenticated using (public.is_operator());
create policy conversations_operator_update on public.conversations
  for update to authenticated using (public.is_operator()) with check (public.is_operator());

-- messages：顧客は自分の会話の中で、顧客として送るメッセージだけ作れる
create policy messages_customer_select on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.customer_id = (select auth.uid())
  ));
create policy messages_customer_insert on public.messages
  for insert to authenticated
  with check (
    sender_type = 'customer'
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.customer_id = (select auth.uid())
    )
  );
create policy messages_operator_select on public.messages
  for select to authenticated using (public.is_operator());
create policy messages_operator_insert on public.messages
  for insert to authenticated
  with check (
    public.is_operator()
    and sender_type = 'operator'
    and sender_operator_id = (select auth.uid())
  );

-- faq：オペレーターのみ（顧客は直接読めない。AI はサーバー側で参照する）
create policy faq_operator_all on public.faq
  for all to authenticated using (public.is_operator()) with check (public.is_operator());

-- business_hours / holidays：ログイン済み（匿名含む）は読める。変更はオペレーター
create policy business_hours_select on public.business_hours
  for select to authenticated using (true);
create policy business_hours_operator_write on public.business_hours
  for all to authenticated using (public.is_operator()) with check (public.is_operator());
create policy holidays_select on public.holidays
  for select to authenticated using (true);
create policy holidays_operator_write on public.holidays
  for all to authenticated using (public.is_operator()) with check (public.is_operator());
