-- RLS 動作確認（機能 #1）。Supabase ダッシュボードの SQL Editor に貼って実行する。
-- テスト用データは最後にわざと例外を出して全部ロールバックされる。実行結果は「エラー」として表示されるが正常。
-- auth.users には触れない（オペレーター側の検証は #2 のログイン実装後に実ユーザーで行う）。

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  ca uuid; cb uuid; n int; r text := '';
begin
  insert into public.conversations (customer_id) values (a) returning id into ca;
  insert into public.conversations (customer_id) values (b) returning id into cb;
  insert into public.messages (conversation_id, sender_type, body) values (ca,'customer','Aの質問'),(cb,'customer','Bの質問');

  -- 顧客A としてアクセス
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.conversations; r := r || format('[顧客A] 見える会話=%s (期待1) ', n);
  select count(*) into n from public.messages;      r := r || format('見えるメッセージ=%s (期待1) ', n);
  select count(*) into n from public.faq;           r := r || format('FAQ=%s (期待0) ', n);
  select count(*) into n from public.operators;     r := r || format('operators=%s (期待0) ', n);
  select count(*) into n from public.business_hours;r := r || format('営業時間=%s (期待7) ', n);
  begin insert into public.conversations (customer_id) values (b); r := r || E'\n  他人名義で会話作成=成功(NG) ';
  exception when others then r := r || E'\n  他人名義で会話作成=拒否(OK) '; end;
  begin insert into public.conversations (customer_id,status) values (a,'escalated'); r := r || '状態を偽装して作成=成功(NG) ';
  exception when others then r := r || '状態を偽装して作成=拒否(OK) '; end;
  begin insert into public.messages (conversation_id,sender_type,body) values (ca,'ai','偽AI'); r := r || 'AIを偽装=成功(NG) ';
  exception when others then r := r || 'AIを偽装=拒否(OK) '; end;
  begin insert into public.messages (conversation_id,sender_type,body) values (cb,'customer','他人の会話に投稿'); r := r || '他人の会話に投稿=成功(NG) ';
  exception when others then r := r || '他人の会話に投稿=拒否(OK) '; end;
  begin insert into public.messages (conversation_id,sender_type,body) values (ca,'customer','自分の会話に投稿'); r := r || '自分の会話に投稿=成功(OK) ';
  exception when others then r := r || '自分の会話に投稿=拒否(NG) '; end;
  update public.conversations set status='closed'; get diagnostics n = row_count; r := r || format('会話の状態を更新できた行=%s (期待0) ', n);
  begin insert into public.operators (id,name) values (a,'なりすまし'); r := r || 'operators追加=成功(NG) ';
  exception when others then r := r || 'operators追加=拒否(OK) '; end;
  begin insert into public.faq (question,answer) values ('q','a'); r := r || 'FAQ追加=成功(NG) ';
  exception when others then r := r || 'FAQ追加=拒否(OK) '; end;
  r := r || 'is_operator()=' || private.is_operator()::text || ' (期待false) ';
  reset role;

  -- 未ログイン(anon)としてアクセス
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  set local role anon;
  begin select count(*) into n from public.conversations; r := r || format(E'\n[anon] 会話=%s (期待0) ', n);
  exception when others then r := r || E'\n[anon] 会話=アクセス拒否(OK) '; end;
  begin select count(*) into n from public.faq; r := r || format('FAQ=%s (期待0) ', n);
  exception when others then r := r || 'FAQ=アクセス拒否(OK) '; end;
  begin select count(*) into n from public.business_hours; r := r || format('営業時間=%s (期待0) ', n);
  exception when others then r := r || '営業時間=アクセス拒否(OK) '; end;
  begin perform private.is_operator(); r := r || 'private関数=呼べた(NG) ';
  exception when others then r := r || 'private関数=拒否(OK) '; end;
  reset role;

  r := r || E'\n[RLS有効] ' || (select string_agg(relname || '=' || relrowsecurity::text, ', ' order by relname)
         from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r');

  raise exception E'RLS検証結果:\n%', r;
end $$;
