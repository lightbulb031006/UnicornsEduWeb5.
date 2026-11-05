/**
 * Builds app/favicon.ico (+ icon.png, apple-icon.png) from logo source.
 * 1) Trim uniform border (optional, default on).
 * 2) Scale to a capped prep size, then cover → 512×512 PNG (same bytes written as icon.png).
 * 3) favicon.ico via png2icons from that same 512×512 buffer — mọi lớp ICO (16…256px) scale từ
 *    cùng nguồn với icon.png; lớp lớn nhất trong ICO là 256px (chuẩn ICO + nhẹ hơn BMP thuần).
 *    Fallback: png-to-ico(256) nếu png2icons lỗi.
 * Env:
 *   FAVICON_TRIM_THRESHOLD (default 14; 0 = off)
 *   FAVICON_PREP_MAX — cap long edge before square crop (default 1536)
 *   FAVICON_ZOOM (default 1.35, max 3)
 *   APPLE_TOUCH_SIZE — apple-icon side (default 180)
 * Run: node scripts/png-to-favicon-ico.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const require = createRequire(import.meta.url);
const png2icons = require("png2icons");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const inputPath = path.join(root, "image", "logo", "logo.png");
const inputFallback = path.join(root, "app", "icon.png");
const src = fs.existsSync(inputPath) ? inputPath : inputFallback;

const outIco = path.join(root, "app", "favicon.ico");
const outIconPng = path.join(root, "app", "icon.png");
const outApplePng = path.join(root, "app", "apple-icon.png");

const TRIM_THRESHOLD = (() => {
  const raw = process.env.FAVICON_TRIM_THRESHOLD;
  if (raw === "0" || raw === "") return 0;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return Math.min(100, n);
  return 14;
})();

const ZOOM = Math.min(
  3,
  Math.max(1, Number(process.env.FAVICON_ZOOM) || 1.35),
);

const PREP_MAX = Math.min(
  4096,
  Math.max(768, Number(process.env.FAVICON_PREP_MAX) || 1536),
);

const APPLE_TOUCH = Math.min(
  512,
  Math.max(120, Number(process.env.APPLE_TOUCH_SIZE) || 180),
);

const OUTPUT_ICON = 512;

const pngOut = {
  compressionLevel: 9,
  effort: 10,
  adaptiveFiltering: true,
};

let working = await fs.promises.readFile(src);

if (TRIM_THRESHOLD > 0) {
  try {
    working = await sharp(working)
      .trim({ threshold: TRIM_THRESHOLD })
      .png()
      .toBuffer();
  } catch (e) {
    console.warn(
      "trim() skipped (image may touch edges or lack uniform border):",
      e?.message ?? e,
    );
  }
}

const meta = await sharp(working).metadata();
const w0 = meta.width ?? 256;
const h0 = meta.height ?? 256;
const long0 = Math.max(w0, h0);

let prepLong = Math.round(long0 * ZOOM);
prepLong = Math.min(PREP_MAX, Math.max(long0, prepLong));

const square512 = await sharp(working)
  .resize({
    width: prepLong,
    height: prepLong,
    fit: "inside",
    withoutEnlargement: false,
    kernel: sharp.kernel.lanczos3,
  })
  .resize(OUTPUT_ICON, OUTPUT_ICON, {
    fit: "cover",
    position: "centre",
    kernel: sharp.kernel.lanczos3,
  })
  .png(pngOut)
  .toBuffer();

/** Cùng buffer 512×512 với icon.png — favicon.ico sinh từ buffer này (png2icons), không còn nhánh 256 tách rời. */
let icoBuf = png2icons.createICO(
  square512,
  png2icons.BICUBIC,
  0,
  true,
  false,
);

if (!icoBuf) {
  console.warn("png2icons.createICO failed, falling back to png-to-ico @ 256px");
  const square256 = await sharp(square512)
    .resize(256, 256, { kernel: sharp.kernel.lanczos3 })
    .png(pngOut)
    .toBuffer();
  icoBuf = await pngToIco(square256);
}

const appleBuf = await sharp(square512)
  .resize(APPLE_TOUCH, APPLE_TOUCH, {
    kernel: sharp.kernel.lanczos3,
  })
  .png(pngOut)
  .toBuffer();

fs.writeFileSync(outIco, icoBuf);
fs.writeFileSync(outIconPng, square512);
fs.writeFileSync(outApplePng, appleBuf);

console.log(
  "Wrote",
  outIco,
  `(${(icoBuf.length / 1024).toFixed(1)} KB)`,
  outIconPng,
  `(${(square512.length / 1024).toFixed(1)} KB, ${OUTPUT_ICON}×${OUTPUT_ICON})`,
  outApplePng,
  `(${(appleBuf.length / 1024).toFixed(1)} KB)`,
  `— source ${w0}×${h0}, prep≤${PREP_MAX}, zoom=${ZOOM}, trim=${TRIM_THRESHOLD}; ICO layers from same ${OUTPUT_ICON}px PNG (max embedded 256px)`,
);
