/**
 * Shrinks apps/web/image/logo/logo.png for Next/Image (max edge + PNG zlib).
 * Does not trim by default (designer padding preserved). Set UI_LOGO_TRIM=1 to trim like favicon.
 * Env: UI_LOGO_MAX_EDGE (default 1600), UI_LOGO_TRIM (0|1, default 0)
 * Run from apps/web: node scripts/optimize-ui-logo.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const targetPath = path.join(root, "image", "logo", "logo.png");

const MAX_EDGE = Math.min(
  4096,
  Math.max(512, Number(process.env.UI_LOGO_MAX_EDGE) || 1600),
);

const TRIM =
  process.env.UI_LOGO_TRIM === "1" || process.env.UI_LOGO_TRIM === "true";

const TRIM_THRESHOLD = Math.min(
  100,
  Math.max(1, Number(process.env.UI_LOGO_TRIM_THRESHOLD) || 14),
);

let buf = await fs.promises.readFile(targetPath);

if (TRIM) {
  try {
    buf = await sharp(buf)
      .trim({ threshold: TRIM_THRESHOLD })
      .png()
      .toBuffer();
  } catch (e) {
    console.warn("trim skipped:", e?.message ?? e);
  }
}

const meta = await sharp(buf).metadata();
const w0 = meta.width ?? 0;
const h0 = meta.height ?? 0;
const long0 = Math.max(w0, h0);

let pipeline = sharp(buf);

if (long0 > MAX_EDGE) {
  pipeline = pipeline.resize({
    width: w0 >= h0 ? MAX_EDGE : undefined,
    height: h0 > w0 ? MAX_EDGE : undefined,
    fit: "inside",
    withoutEnlargement: true,
    kernel: sharp.kernel.lanczos3,
  });
}

const out = await pipeline
  .png({
    compressionLevel: 9,
    effort: 10,
    adaptiveFiltering: true,
  })
  .toBuffer();

const before = (await fs.promises.stat(targetPath)).size;
await fs.promises.writeFile(targetPath, out);
const after = out.length;

console.log(
  `Optimized ${targetPath}: ${before} → ${after} bytes (${w0}×${h0}, maxEdge=${MAX_EDGE}, trim=${TRIM})`,
);
