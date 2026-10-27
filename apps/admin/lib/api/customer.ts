import { createClient } from "@supabase/supabase-js";

// ウィジェットは顧客サイトに埋め込まれ別オリジンから呼ぶ。許可するのは ALLOWED_ORIGINS（カンマ区切り）に
// 載っている埋め込み元のみ（8.3）。認証は Cookie ではなく Bearer トークンなので、CORS は
// 「他サイトのページから勝手に呼ばせない」ための層で、会話の保護そのものは RLS とトークンが担う。
//   - 未設定の本番環境: どのオリジンも許可しない（設定漏れで全公開にならないよう安全側に倒す）
//   - 開発環境(NODE_ENV!=="production"): localhost / 127.0.0.1 は常に許可
//   - "*" を指定すると全許可（デモ用。本番では使わない）
function isAllowedOrigin(origin: string, request: Request): boolean {
  if (origin === new URL(request.url).origin) return true; // 管理画面と同一オリジンのデモページなど
  const allowed = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (allowed.includes("*") || allowed.includes(origin)) return true;
  return (
    process.env.NODE_ENV !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  );
}

export function corsHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
  const origin = request.headers.get("origin");
  if (origin && isAllowedOrigin(origin, request)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function json(request: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(request) });
}

export function preflight(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export type CustomerConversation = {
  id: string;
  status: string;
  category: string | null;
};

// 顧客として会話を読めるか確認する（RLS により他人の会話は見えない）。
// 失敗時は返すべき Response を返す。
export async function authenticateCustomer(
  request: Request,
): Promise<CustomerConversation | Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const body = await request.json().catch(() => null);
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : null;
  if (!token || !conversationId) return json(request, { error: "bad_request" }, 400);

  const asCustomer = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data: conv } = await asCustomer
    .from("conversations")
    .select("id, status, category")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return json(request, { error: "not_found" }, 404);
  return conv;
}
