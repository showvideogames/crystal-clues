#!/usr/bin/env node
// Turns the original avatar artwork into the small files the app ships.
//
//   node tools/build-avatars.mjs <folder with ball.png dog.png cat.png fox.png owl.png frog.png star.png> [out folder]
//
// For each picture: trim the empty transparent margin, scale it to fit a
// square canvas of the same size and padding as every other avatar (so a
// wide frog and a tall crystal ball come out the same visual size), and save
// it as a transparent WebP at 192px, enough for 64px avatars on 3x phones.
// The letter on the crystal ball is NOT part of the picture; the app lays it
// over the ball (src/friends/Avatar.jsx).
//
// Uses the Chrome that the browser tests already use (puppeteer-core), so
// there is nothing extra to install. Output defaults to public/avatars.
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => fs.existsSync(p));

const KEYS = ["ball", "dog", "cat", "fox", "owl", "frog", "star"];
const SIZE = 192;       // output canvas, px
const PAD = 0.04;       // empty border kept around the art, as a share of the canvas
const QUALITY = 0.9;

const [, , inDir, outDir = "public/avatars"] = process.argv;
if (!inDir) {
  console.error("Usage: node tools/build-avatars.mjs <folder of originals> [out folder]");
  process.exit(1);
}
const find = (key) => {
  const hit = fs.readdirSync(inDir).find((f) => f.toLowerCase().replace(/\.(png|webp)$/, "") === key && /\.(png|webp)$/i.test(f));
  if (!hit) throw new Error(`Missing ${key}.png (or .webp) in ${inDir}`);
  return path.join(inDir, hit);
};
const sources = Object.fromEntries(KEYS.map((k) => [k, find(k)]));
if (!CHROME) throw new Error("No Chrome or Edge found for image processing.");
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  const page = await browser.newPage();
  await page.goto("about:blank");
  const report = [];
  for (const key of KEYS) {
    const b64 = fs.readFileSync(sources[key]).toString("base64");
    const mime = /\.webp$/i.test(sources[key]) ? "image/webp" : "image/png";
    const result = await page.evaluate(async (src, size, pad, quality) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const w = img.naturalWidth, h = img.naturalHeight;
      const full = document.createElement("canvas");
      full.width = w; full.height = h;
      const fctx = full.getContext("2d", { willReadFrequently: true });
      fctx.drawImage(img, 0, 0);
      const { data } = fctx.getImageData(0, 0, w, h);
      // Bounding box of everything that isn't (nearly) transparent.
      let x0 = w, y0 = h, x1 = -1, y1 = -1, transparent = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const a = data[(y * w + x) * 4 + 3];
        if (a < 8) { transparent++; continue; }
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (x1 < 0) throw new Error("The picture is empty");
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
      const inner = size * (1 - 2 * pad);
      const scale = Math.min(inner / cw, inner / ch);
      const dw = cw * scale, dh = ch * scale;
      // Halve repeatedly while far larger than the target, so the downscale stays crisp.
      let cur = document.createElement("canvas");
      cur.width = cw; cur.height = ch;
      cur.getContext("2d").drawImage(full, x0, y0, cw, ch, 0, 0, cw, ch);
      while (cur.width / 2 > dw * 1.5) {
        const next = document.createElement("canvas");
        next.width = Math.ceil(cur.width / 2); next.height = Math.ceil(cur.height / 2);
        const nctx = next.getContext("2d");
        nctx.imageSmoothingQuality = "high";
        nctx.drawImage(cur, 0, 0, next.width, next.height);
        cur = next;
      }
      const out = document.createElement("canvas");
      out.width = size; out.height = size;
      const octx = out.getContext("2d");
      octx.imageSmoothingQuality = "high";
      octx.drawImage(cur, (size - dw) / 2, (size - dh) / 2, dw, dh);
      return {
        url: out.toDataURL("image/webp", quality),
        from: `${w}x${h}`, hadTransparency: transparent > 0,
        // Where the art sits on the square canvas, for aligning overlays.
        box: { x: (size - dw) / 2 / size, y: (size - dh) / 2 / size, w: dw / size, h: dh / size },
      };
    }, `data:${mime};base64,${b64}`, SIZE, PAD, QUALITY);
    if (!result.hadTransparency) throw new Error(`${key}: the picture has no transparency; use the transparent original.`);
    const file = path.join(outDir, `${key}.webp`);
    fs.writeFileSync(file, Buffer.from(result.url.split(",")[1], "base64"));
    report.push({ key, from: result.from, bytes: fs.statSync(file).size, box: result.box });
  }
  for (const r of report) {
    console.log(`${r.key.padEnd(5)} ${r.from.padEnd(10)} → ${SIZE}x${SIZE} webp ${(r.bytes / 1024).toFixed(1)} KB  art at x ${(r.box.x * 100).toFixed(1)}% y ${(r.box.y * 100).toFixed(1)}% w ${(r.box.w * 100).toFixed(1)}% h ${(r.box.h * 100).toFixed(1)}%`);
  }
  console.log(`Total ${(report.reduce((n, r) => n + r.bytes, 0) / 1024).toFixed(1)} KB in ${outDir}`);
} finally {
  await browser.close();
}
