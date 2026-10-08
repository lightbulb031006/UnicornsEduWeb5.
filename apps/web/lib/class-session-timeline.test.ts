import { describe, expect, it } from "vitest";
import { mergeTimelineByDateDesc } from "@/lib/class-session-timeline";

type Row = { id: string; date: string };
const s = (id: string, date: string): Row => ({ id, date });
const labels = (items: ReturnType<typeof mergeTimelineByDateDesc<Row, Row>>) =>
  items.map((entry) => `${entry.kind === "session" ? "s" : "e"}:${entry.item.id}`);

describe("mergeTimelineByDateDesc", () => {
  it("interleaves extras between sessions newest first", () => {
    const sessions = [
      s("a", "2026-10-20T00:00:00.000Z"),
      s("b", "2026-10-10T00:00:00.000Z"),
      s("c", "2026-10-02T00:00:00.000Z"),
    ];
    const extras = [s("x", "2026-10-05"), s("y", "2026-10-25"), s("z", "2026-10-01")];
    expect(labels(mergeTimelineByDateDesc(sessions, extras))).toEqual([
      "e:y",
      "s:a",
      "s:b",
      "e:x",
      "s:c",
      "e:z",
    ]);
  });

  it("puts an extra above sessions on the same day and keeps session order", () => {
    const sessions = [s("a", "2026-10-10"), s("b", "2026-10-10")];
    expect(
      labels(mergeTimelineByDateDesc(sessions, [s("x", "2026-10-10")])),
    ).toEqual(["e:x", "s:a", "s:b"]);
  });

  it("handles one side empty", () => {
    expect(labels(mergeTimelineByDateDesc([], [s("x", "2026-10-01")]))).toEqual([
      "e:x",
    ]);
    expect(labels(mergeTimelineByDateDesc([s("a", "2026-10-01")], []))).toEqual([
      "s:a",
    ]);
  });
});
