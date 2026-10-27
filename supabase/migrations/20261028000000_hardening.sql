-- hardening（要件 8.3）
--  1) 連投制限：顧客は 1 分に 10 メッセージまで（API コスト保護）
--  2) 担当者ルールの DB 強制：他のオペレーターが担当している会話は、返信も状態変更もできない（O-07）

-- ---------------------------------------------------------------
-- 1) 連投制限（顧客メッセージの insert 時にトリガーで検査）
--    ブラウザから Supabase へ直接 insert される経路も含めて止めるため、アプリではなく DB に置く。
--    security definer + private スキーマ：RLS 越しに件数を数え、API からは呼べないようにする。
-- ---------------------------------------------------------------
create function private.limit_customer_message_rate() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  if new.sender_type <> 'customer' then
    return new;
  end if;

  select count(*) into recent
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where m.sender_type = 'customer'
    and m.created_at > now() - interval '1 minute'
    and c.customer_id = (
      select customer_id from public.conversations where id = new.conversation_id
    );

  if recent >= 10 then
    raise exception 'rate_limit_exceeded' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.limit_customer_message_rate() from public, anon, authenticated;

create trigger messages_limit_customer_rate
  before insert on public.messages
  for each row execute function private.limit_customer_message_rate();

-- ---------------------------------------------------------------
-- 2) 担当者ルール
--    返信：自分が担当で、対応中（operator_handling）の会話にだけ insert できる
--    更新：未割り当て、または自分が担当の会話だけ（管理者は全件）。
--          「対応する」「完了」「再オープン」はすべてこの範囲で行える。
--    ※ AI・エスカレーションの状態変更は service role（RLS を通らない）なので影響しない。
-- ---------------------------------------------------------------
drop policy messages_operator_insert on public.messages;
create policy messages_operator_insert on public.messages
  for insert to authenticated
  with check (
    private.is_operator()
    and sender_type = 'operator'
    and sender_operator_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.status = 'operator_handling'
        and c.assigned_operator_id = (select auth.uid())
    )
  );

drop policy conversations_operator_update on public.conversations;
create policy conversations_operator_update on public.conversations
  for update to authenticated
  using (
    private.is_operator()
    and (assigned_operator_id is null
         or assigned_operator_id = (select auth.uid())
         or private.is_admin())
  )
  with check (
    private.is_operator()
    and (assigned_operator_id is null
         or assigned_operator_id = (select auth.uid())
         or private.is_admin())
  );
