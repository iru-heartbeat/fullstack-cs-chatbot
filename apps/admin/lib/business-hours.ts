import type { SupabaseClient } from "@supabase/supabase-js";

// H-01〜H-03: 営業時間の判定。タイムゾーンは Asia/Tokyo（夏時間なしの UTC+9 固定）。
// 判定ロジックは DB に触れない純粋関数にして、時刻と設定を渡せばテストできるようにしている。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SEARCH_DAYS = 14; // 次の営業開始を探す最大日数（全休業設定でも打ち切るため）

/** business_hours テーブルの1行（day_of_week: 0=日曜）。time 列は "10:00:00" 形式で届く */
export type BusinessHoursRow = {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
};

export type BusinessStatus = {
  isOpen: boolean;
  /** 次に営業が始まる時刻（ISO 8601）。営業中は null。見つからなければ null */
  nextOpenAt: string | null;
};

function parseMinutes(time: string | null): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(time ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// JST の日付を Date の UTC フィールドとして扱うため、9時間ずらした Date を使う
function jstDateString(shifted: Date): string {
  return shifted.toISOString().slice(0, 10);
}

/**
 * 営業中か、次の営業開始はいつかを返す。
 * @param holidays 祝日・休業日の "YYYY-MM-DD"（JST の日付）
 * 開始 ≦ 現在 < 終了 を営業中とする（終了ちょうどは時間外）。
 * 終了 ≦ 開始（日跨ぎ）の行は設定ミスとみなして休業扱いにする。
 */
export function getBusinessStatus(
  now: Date,
  hours: BusinessHoursRow[],
  holidays: string[],
): BusinessStatus {
  const holidaySet = new Set(holidays);
  const byDay = new Map(hours.map((h) => [h.day_of_week, h]));
  const shiftedNow = new Date(now.getTime() + JST_OFFSET_MS);
  const nowMinutes = shiftedNow.getUTCHours() * 60 + shiftedNow.getUTCMinutes();
  // JST 当日 0:00 を表す UTC エポック（ずらした座標系）
  const todayStart = Date.UTC(
    shiftedNow.getUTCFullYear(),
    shiftedNow.getUTCMonth(),
    shiftedNow.getUTCDate(),
  );

  for (let offset = 0; offset <= SEARCH_DAYS; offset++) {
    const day = new Date(todayStart + offset * DAY_MS);
    if (holidaySet.has(jstDateString(day))) continue;
    const row = byDay.get(day.getUTCDay());
    if (!row || row.is_closed) continue;
    const open = parseMinutes(row.open_time);
    const close = parseMinutes(row.close_time);
    if (open === null || close === null || close <= open) continue;

    if (offset === 0 && nowMinutes >= open && nowMinutes < close) {
      return { isOpen: true, nextOpenAt: null };
    }
    if (offset === 0 && nowMinutes >= open) continue; // 本日は終了済み
    const openAt = new Date(day.getTime() + open * 60_000 - JST_OFFSET_MS);
    return { isOpen: false, nextOpenAt: openAt.toISOString() };
  }
  return { isOpen: false, nextOpenAt: null };
}

/** DB の設定を読んで現在の営業状況を返す（サーバー側専用。H-03） */
export async function getCurrentBusinessStatus(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<BusinessStatus> {
  const today = jstDateString(new Date(now.getTime() + JST_OFFSET_MS));
  const [hours, holidays] = await Promise.all([
    admin.from("business_hours").select("day_of_week, open_time, close_time, is_closed"),
    admin.from("holidays").select("date").gte("date", today),
  ]);
  if (hours.error || holidays.error) {
    // 設定を読めないときは営業中扱い（顧客を「翌営業日」と誤案内して待たせるより安全）
    console.error("[business-hours] load failed", hours.error?.message ?? holidays.error?.message);
    return { isOpen: true, nextOpenAt: null };
  }
  return getBusinessStatus(
    now,
    (hours.data ?? []) as BusinessHoursRow[],
    (holidays.data ?? []).map((h) => h.date as string),
  );
}
