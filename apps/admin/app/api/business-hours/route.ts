import { json } from "@/lib/api/customer";
import { getCurrentBusinessStatus } from "@/lib/business-hours";
import { createAdminClient } from "@/lib/supabase/admin";

// cacheComponents 有効下では Route Handler は既定で動的（"use cache" を付けない限りキャッシュされない）。
// 営業状況は時刻で変わるので毎回サーバーで判定する。
// H-03 / W-08: 営業中か・次の営業開始をウィジェットに返す（認証不要・個人情報なし）
export async function GET(request: Request) {
  return json(request, await getCurrentBusinessStatus(createAdminClient()));
}
