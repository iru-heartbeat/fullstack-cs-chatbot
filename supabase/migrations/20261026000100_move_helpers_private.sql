-- RLS ヘルパー関数を API 非公開の private スキーマへ移す
-- （public のままだと /rest/v1/rpc/ から誰でも呼べてしまうため。ポリシーは関数を oid で参照するので自動で追従する）
create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.is_operator() set schema private;
alter function public.is_admin() set schema private;

revoke execute on function private.is_operator() from public, anon;
revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_operator() to authenticated;
grant execute on function private.is_admin() to authenticated;
