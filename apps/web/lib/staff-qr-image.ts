/** Pixel size requested from qrserver when showing a scannable overlay. */
export const STAFF_QR_SCANNABLE_PIXEL = 512;

export function staffQrServerUrl(data: string, pixel: number): string {
  const size = Math.max(1, Math.trunc(pixel));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}

/**
 * Always encode the stored staff QR link as a generated QR — Drive / imgur /
 * `.png` / payment URLs are all payload, never an `<img>` source.
 */
export function buildStaffQrDisplaySrc(
  rawUrl: string,
  pixel: number,
): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  return staffQrServerUrl(trimmed, pixel);
}
