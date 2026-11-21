import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatDuration,
  formatNumber,
  formatPercent,
  titleCase,
} from "../utils/format";

describe("format helpers", () => {
  it("formats numbers with grouping", () => {
    expect(formatNumber(1234)).toBe("1,234");
    expect(formatNumber(null)).toBe("—");
  });

  it("formats percentages", () => {
    expect(formatPercent(89.921)).toBe("89.9%");
    expect(formatPercent(12.345, 2)).toBe("12.35%");
  });

  it("formats byte sizes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(0)).toBe("—");
  });

  it("formats durations", () => {
    expect(formatDuration(2.74)).toBe("2.7s");
    expect(formatDuration(75)).toBe("1m 15s");
    expect(formatDuration(null)).toBe("—");
  });

  it("humanises status keys", () => {
    expect(titleCase("newly_detected")).toBe("Newly Detected");
    expect(titleCase("in_progress")).toBe("In Progress");
  });
});
