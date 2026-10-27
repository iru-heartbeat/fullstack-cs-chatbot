import { test } from "node:test";
import assert from "node:assert/strict";
import { getBusinessStatus, type BusinessHoursRow } from "./business-hours.ts";

// シードと同じ: 平日 10:00-18:00、土日休み
const HOURS: BusinessHoursRow[] = [
  { day_of_week: 0, open_time: null, close_time: null, is_closed: true },
  ...[1, 2, 3, 4, 5].map((d) => ({ day_of_week: d, open_time: "10:00:00", close_time: "18:00:00", is_closed: false })),
  { day_of_week: 6, open_time: null, close_time: null, is_closed: true },
];
// JST で指定した時刻を Date にする（2026-10-26 は月曜）
const jst = (s: string) => new Date(`${s}+09:00`);

test("平日の営業時間内は営業中", () => {
  assert.deepEqual(getBusinessStatus(jst("2026-10-26T10:00:00"), HOURS, []), { isOpen: true, nextOpenAt: null });
  assert.equal(getBusinessStatus(jst("2026-10-26T17:59:59"), HOURS, []).isOpen, true);
});

test("終了ちょうどは時間外で、次は翌日 10:00", () => {
  const s = getBusinessStatus(jst("2026-10-26T18:00:00"), HOURS, []);
  assert.equal(s.isOpen, false);
  assert.equal(s.nextOpenAt, jst("2026-10-27T10:00:00").toISOString());
});

test("開始前は同日の開始時刻が次の営業開始", () => {
  const s = getBusinessStatus(jst("2026-10-26T09:59:00"), HOURS, []);
  assert.equal(s.nextOpenAt, jst("2026-10-26T10:00:00").toISOString());
});

test("金曜夜は翌週月曜の朝まで時間外", () => {
  const s = getBusinessStatus(jst("2026-10-30T20:00:00"), HOURS, []);
  assert.equal(s.isOpen, false);
  assert.equal(s.nextOpenAt, jst("2026-11-02T10:00:00").toISOString());
});

test("祝日は営業しない（翌営業日に繰り越す）", () => {
  const s = getBusinessStatus(jst("2026-10-26T12:00:00"), HOURS, ["2026-10-26", "2026-10-27"]);
  assert.equal(s.isOpen, false);
  assert.equal(s.nextOpenAt, jst("2026-10-28T10:00:00").toISOString());
});

test("UTC では前日でも JST の日付で判定する（JST 0:30 = UTC 前日 15:30）", () => {
  // JST 月曜 0:30 は時間外、同日 10:00 が次の開始
  const s = getBusinessStatus(new Date("2026-10-25T15:30:00Z"), HOURS, []);
  assert.equal(s.isOpen, false);
  assert.equal(s.nextOpenAt, jst("2026-10-26T10:00:00").toISOString());
});

test("終了 ≦ 開始の行は休業扱い、全休業なら次の営業開始は null", () => {
  const bad = HOURS.map((h) => (h.is_closed ? h : { ...h, open_time: "18:00:00", close_time: "10:00:00" }));
  assert.deepEqual(getBusinessStatus(jst("2026-10-26T12:00:00"), bad, []), { isOpen: false, nextOpenAt: null });
});
