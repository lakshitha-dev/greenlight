/** Derives every brand raster from the one BISTEC logo file.
 *
 *  Run by hand, not by `build`. sharp is an optional transitive dependency of
 *  Next, so a strict CI install can legitimately skip it — the outputs are
 *  committed instead, and CI never needs to regenerate them.
 *
 *      npm run brand -- "C:\path\to\bistec-logo.png"
 *
 *  The crop boxes are measured from the image at run time rather than hardcoded.
 *  The logo is a horizontal lockup — square mark, gap, then "BISTEC" stacked
 *  over "Global" — so the mark is the first run of occupied columns and the two
 *  words are the two runs of occupied rows to the right of it. If someone
 *  re-exports the logo at a different size or margin this still finds the right
 *  boxes; hardcoded offsets would silently crop the wrong pixels. */

import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, dirname } from "node:path";

const run = promisify(execFile);
const ROOT = join(import.meta.dirname, "..");
const ALPHA = 8; // anything fainter is antialiasing spill, not art

type Box = { left: number; top: number; width: number; height: number };

/** Contiguous runs of `true` in a boolean array, as inclusive [start,end]. */
function runs(occupied: boolean[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start: number | null = null;
  occupied.forEach((on, i) => {
    if (on && start === null) start = i;
    if (!on && start !== null) {
      out.push([start, i - 1]);
      start = null;
    }
  });
  if (start !== null) out.push([start, occupied.length - 1]);
  return out;
}

async function measure(src: string) {
  const { data, info } = await sharp(src)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels } = info;
  const at = (x: number, y: number) => data[(y * W + x) * channels + 3];

  const colOn: boolean[] = [];
  for (let x = 0; x < W; x++) {
    let on = false;
    for (let y = 0; y < H && !on; y++) if (at(x, y) > ALPHA) on = true;
    colOn.push(on);
  }
  const colRuns = runs(colOn);
  if (colRuns.length < 2) throw new Error("expected a mark and a wordmark, found one shape");

  const [markX0, markX1] = colRuns[0];
  const wordX0 = colRuns[1][0];
  const artX1 = colRuns[colRuns.length - 1][1];

  const rowsIn = (x0: number, x1: number) => {
    const out: boolean[] = [];
    for (let y = 0; y < H; y++) {
      let on = false;
      for (let x = x0; x <= x1 && !on; x++) if (at(x, y) > ALPHA) on = true;
      out.push(on);
    }
    return out;
  };

  const markRows = runs(rowsIn(markX0, markX1));
  const wordRows = runs(rowsIn(wordX0, artX1));
  if (wordRows.length < 2) throw new Error('expected "BISTEC" stacked over "Global"');

  const artRows = runs(rowsIn(markX0, artX1));
  const artY0 = artRows[0][0];
  const artY1 = artRows[artRows.length - 1][1];

  const mark: Box = {
    left: markX0,
    top: markRows[0][0],
    width: markX1 - markX0 + 1,
    height: markRows[markRows.length - 1][1] - markRows[0][0] + 1,
  };
  const lockup: Box = {
    left: markX0,
    top: artY0,
    width: artX1 - markX0 + 1,
    height: artY1 - artY0 + 1,
  };
  /** "BISTEC" alone, in lockup-relative coordinates. Left edge sits in the gap
   *  between mark and wordmark; bottom edge stops in the blank band above
   *  "Global", so the green word is never touched. */
  const gapMid = Math.round((markX1 + wordX0) / 2);
  const upper: Box = {
    left: gapMid - lockup.left,
    top: 0,
    width: artX1 - gapMid + 1,
    height: wordRows[1][0] - artY0, // up to, not into, the second word
  };

  return { mark, lockup, upper, source: `${W}x${H}` };
}

async function main() {
  const src = process.argv[2];
  if (!src) throw new Error("usage: npm run brand -- <path-to-bistec-logo.png>");

  const { mark, lockup, upper, source } = await measure(src);
  console.log(`source ${source}`);
  console.log(`  mark   ${mark.width}x${mark.height} at ${mark.left},${mark.top}`);
  console.log(`  lockup ${lockup.width}x${lockup.height} (${(lockup.width / lockup.height).toFixed(2)}:1)`);

  if (Math.abs(mark.width - mark.height) > 2) {
    console.warn(`  ! mark is not square (${mark.width}x${mark.height}); icons will be letterboxed`);
  }

  await mkdir(join(ROOT, "public", "brand"), { recursive: true });

  const written: Array<[string, number]> = [];
  const emit = async (rel: string, buf: Buffer) => {
    const abs = join(ROOT, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, buf);
    written.push([rel, buf.length]);
  };

  const markOnly = () => sharp(src).ensureAlpha().extract(mark);
  const lockupOnly = () => sharp(src).ensureAlpha().extract(lockup);

  // ── square mark: the piece that stays legible at 16px and carries no navy,
  //    so it needs no dark variant
  await emit(
    "app/icon.png",
    await markOnly().resize(512, 512).png({ compressionLevel: 9 }).toBuffer(),
  );

  /** iOS ignores alpha and composites onto black, which would swallow the navy
   *  arc. Solid white, with the inset doubling as clearance for the corner mask. */
  await emit(
    "app/apple-icon.png",
    await markOnly()
      .resize(146, 146)
      .extend({ top: 17, bottom: 17, left: 17, right: 17, background: "#ffffff" })
      .flatten({ background: "#ffffff" })
      .png({ compressionLevel: 9 })
      .toBuffer(),
  );

  // ── full lockup. Truecolor, not palette: the BISTEC gradient bands visibly
  //    when quantised at this width.
  const OUT_W = 440;
  await emit(
    "public/brand/bistec-lockup.png",
    await lockupOnly().resize({ width: OUT_W }).png({ compressionLevel: 9 }).toBuffer(),
  );

  /** Dark variant. "BISTEC" ends in navy #14377d, which is 1.72:1 on the dark
   *  rail — invisible. Take that word's alpha channel and re-join it to a flat
   *  near-white fill, so the letterforms keep their antialiasing, then lay it
   *  back over the untouched colour mark and green "Global". */
  const flat = await lockupOnly().png().toBuffer();
  const alpha = await sharp(flat).extract(upper).extractChannel("alpha").raw().toBuffer();
  const knockout = await sharp({
    create: { width: upper.width, height: upper.height, channels: 3, background: "#f1f3f6" },
  })
    .joinChannel(alpha, { raw: { width: upper.width, height: upper.height, channels: 1 } })
    .png()
    .toBuffer();

  /** Two passes on purpose: sharp runs resize before composite regardless of
   *  call order, so a single chain would shrink the canvas to 440px and then
   *  fail to lay a full-size knockout over it. Composite at native size, then
   *  resize the result. */
  const composited = await sharp(flat)
    .composite([{ input: knockout, left: upper.left, top: upper.top }])
    .png()
    .toBuffer();

  await emit(
    "public/brand/bistec-lockup-dark.png",
    await sharp(composited).resize({ width: OUT_W }).png({ compressionLevel: 9 }).toBuffer(),
  );

  // ── favicon. sharp cannot encode ICO; Pillow can.
  try {
    const { stdout } = await run("python", [join(ROOT, "scripts", "build-favicon.py"), src], {
      cwd: ROOT,
    });
    process.stdout.write(stdout);
  } catch {
    console.warn("  ! python/Pillow unavailable — app/favicon.ico not regenerated");
  }

  console.log("\nwrote:");
  for (const [rel, bytes] of written) {
    console.log(`  ${rel.padEnd(38)} ${(bytes / 1024).toFixed(1)} KB`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
