import { describe, expect, it } from "vitest";
import { extractYouTubeVideoId, youtubeThumbnailUrl } from "@/lib/youtube";

describe("youtube helpers", () => {
  it("extracts ids from official recording URLs, not from lesson text", () => {
    expect(
      extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9wgXcQ"),
    ).toBe("dQw4w9wgXcQ");
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9wgXcQ")).toBe(
      "dQw4w9wgXcQ",
    );
    expect(extractYouTubeVideoId("dQw4w9wgXcQ")).toBe("dQw4w9wgXcQ");
    expect(
      extractYouTubeVideoId("Buổi học có video trên youtube trong mô tả"),
    ).toBeNull();
    expect(extractYouTubeVideoId("")).toBeNull();
  });

  it("builds a static thumbnail URL for list posters", () => {
    expect(youtubeThumbnailUrl("dQw4w9wgXcQ")).toBe(
      "https://i.ytimg.com/vi/dQw4w9wgXcQ/hqdefault.jpg",
    );
  });
});
