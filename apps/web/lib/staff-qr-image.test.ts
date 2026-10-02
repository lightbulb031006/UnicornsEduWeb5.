import { describe, expect, it } from "vitest";
import {
  STAFF_QR_SCANNABLE_PIXEL,
  buildStaffQrDisplaySrc,
  staffQrServerUrl,
} from "./staff-qr-image";

const DRIVE_VIEW =
  "https://drive.google.com/file/d/11-i19EMVIDCXXSsuFpiddbbVNpCraxpw/view?usp=drivesdk";

describe("staffQrServerUrl", () => {
  it("requests the given pixel size and encodes the payload", () => {
    expect(staffQrServerUrl("https://example.net/pay", 64)).toBe(
      "https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=https%3A%2F%2Fexample.net%2Fpay",
    );
  });

  it("truncates fractional pixels and floors below 1 to 1", () => {
    expect(staffQrServerUrl("x", 512.9)).toContain("512x512");
    expect(staffQrServerUrl("x", 0)).toContain("1x1");
  });
});

describe("buildStaffQrDisplaySrc", () => {
  it("returns null for blank input", () => {
    expect(buildStaffQrDisplaySrc("   ", 64)).toBeNull();
    expect(buildStaffQrDisplaySrc("", STAFF_QR_SCANNABLE_PIXEL)).toBeNull();
  });

  it("always generates a QR from the stored link, including Drive / imgur / png", () => {
    const drive = buildStaffQrDisplaySrc(DRIVE_VIEW, 64);
    expect(drive).toBe(staffQrServerUrl(DRIVE_VIEW, 64));
    expect(new URL(drive!).hostname).toBe("api.qrserver.com");
    expect(drive).not.toMatch(/drive\.google\.com\/uc\?export=view/);

    const imgur = "https://i.imgur.com/abc.jpg";
    expect(buildStaffQrDisplaySrc(imgur, 64)).toBe(staffQrServerUrl(imgur, 64));

    const png = "https://cdn.example.com/qr.png?v=1";
    expect(buildStaffQrDisplaySrc(png, 64)).toBe(staffQrServerUrl(png, 64));
  });

  it("requests a large overlay image instead of stretching a thumbnail", () => {
    const link = "https://example.net/pay-me";
    const overlay = buildStaffQrDisplaySrc(link, STAFF_QR_SCANNABLE_PIXEL);
    expect(overlay).toBe(staffQrServerUrl(link, STAFF_QR_SCANNABLE_PIXEL));
    expect(overlay).toContain("512x512");
    expect(overlay).not.toContain("64x64");
  });
});
