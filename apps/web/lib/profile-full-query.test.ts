import { describe, expect, it, vi } from "vitest";
import {
  isSameTabNavigation,
  retryUnlessUnauthorized,
} from "./profile-full-query";

vi.mock("@/lib/apis/auth.api", () => ({ getFullProfile: vi.fn() }));

const click = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
};

describe("retryUnlessUnauthorized", () => {
  it("stops on 401", () => {
    expect(retryUnlessUnauthorized(0, { response: { status: 401 } })).toBe(
      false,
    );
  });

  it("retries other errors up to twice", () => {
    const err = { response: { status: 500 } };
    expect(retryUnlessUnauthorized(0, err)).toBe(true);
    expect(retryUnlessUnauthorized(1, err)).toBe(true);
    expect(retryUnlessUnauthorized(2, err)).toBe(false);
    expect(retryUnlessUnauthorized(0, new Error("network"))).toBe(true);
  });
});

describe("isSameTabNavigation", () => {
  it("is true for a plain left click on a same-tab link", () => {
    expect(isSameTabNavigation(click, null)).toBe(true);
    expect(isSameTabNavigation(click, "_self")).toBe(true);
  });

  it("is false when the link opens elsewhere or the click is not plain", () => {
    expect(isSameTabNavigation(click, "_blank")).toBe(false);
    expect(isSameTabNavigation({ ...click, button: 1 }, null)).toBe(false);
    expect(isSameTabNavigation({ ...click, metaKey: true }, null)).toBe(false);
    expect(isSameTabNavigation({ ...click, ctrlKey: true }, null)).toBe(false);
    expect(isSameTabNavigation({ ...click, shiftKey: true }, null)).toBe(false);
    expect(
      isSameTabNavigation({ ...click, defaultPrevented: true }, null),
    ).toBe(false);
  });
});
