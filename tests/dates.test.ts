import { describe, expect, it } from "vitest";
import { currentMonthKey, todayStr } from "@/lib/dates";

describe("日期以台灣時區計算", () => {
  it("UTC 還是前一天的晚上，台灣已經是隔天早上", () => {
    // 2026-11-02 18:30 UTC = 2026-11-03 02:30 台灣
    expect(todayStr(new Date("2026-11-02T18:30:00Z"))).toBe("2026-11-03");
    expect(currentMonthKey(new Date("2026-10-31T17:00:00Z"))).toBe("2026-11");
  });
  it("台灣白天與 UTC 同一天", () => {
    expect(todayStr(new Date("2026-11-03T02:00:00Z"))).toBe("2026-11-03");
  });
});
