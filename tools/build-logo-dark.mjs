// Makes the dark-theme wordmark from the light one: the "Cluevoyance" lettering
// is repainted warm off-white (keeping its anti-aliased edges), while the
// crystal ball on the left keeps its own colours and outline.
//   node tools/build-logo-dark.mjs
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => fs.existsSync(p));
const SRC = path.resolve("public/assets/cluevoyance-logo-b.png");
const OUT = path.resolve("public/assets/cluevoyance-logo-dark.png");
const INK = [244, 238, 230];   // --text in the dark theme
const TEXT_FROM_X = 345;       // the lettering starts right of the ball (1743px-wide source)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const dataUrl = `data:image/png;base64,${fs.readFileSync(SRC).toString("base64")}`;
const out = await page.evaluate(async (src, ink, fromX) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  let opaqueCorner = d.data[3];
  for (let y = 0; y < c.height; y++) {
    for (let x = fromX; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (!d.data[i + 3]) continue;
      // Dark lettering → ink; the alpha (and so the soft edges) stays as drawn.
      const lum = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3;
      const cover = Math.min(1, (255 - lum) / 200);
      d.data[i] = ink[0]; d.data[i + 1] = ink[1]; d.data[i + 2] = ink[2];
      d.data[i + 3] = Math.round(d.data[i + 3] * cover);
    }
  }
  ctx.putImageData(d, 0, 0);
  return { url: c.toDataURL("image/png"), opaqueCorner };
}, dataUrl, INK, TEXT_FROM_X);
if (out.opaqueCorner) throw new Error("expected a transparent background");
fs.writeFileSync(OUT, Buffer.from(out.url.split(",")[1], "base64"));
console.log("wrote", OUT);
await browser.close();
