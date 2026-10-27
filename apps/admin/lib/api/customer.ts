import { createClient } from "@supabase/supabase-js";

// ウィジェットは顧客サイトに埋め込まれ別オリジンから呼ぶため CORS を許可する。
// 認証は Cookie ではなく Bearer トークンなので、Origin 全許可でも他人の会話は触れない。
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: CORS });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
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
  if (!token || !conversationId) return json({ error: "bad_request" }, 400);

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
  if (!conv) return json({ error: "not_found" }, 404);
  return conv;
}
