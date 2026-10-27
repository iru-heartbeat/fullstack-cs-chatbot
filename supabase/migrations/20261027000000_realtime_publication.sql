-- 機能 #4: Realtime 購読の有効化（要件 W 系のリアルタイム表示、O-04 の土台）
--
-- Supabase Realtime（postgres_changes）は supabase_realtime publication に
-- 載っているテーブルの変更だけを配信する。配信時は RLS が適用されるため、
-- 顧客は自分の会話・メッセージだけ、オペレーターは全件を受け取る
-- （ポリシーは init_schema で定義済み。ここでは変更しない）。
-- 何度流しても失敗しないよう、未登録の場合のみ追加する。

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end
$$;
