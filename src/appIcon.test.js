// The home-screen icon (no network). Run: npm run test:unit
//
// Its files carry a date in their names, so a new icon is never hidden by a
// same-named file a phone already cached. The link preview, push notifications
// and browser tab keep their own files.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PNG_SIGNATURE = "89504e470d0a1a0a";
const RGB = 2; // The PNG colour type with no alpha channel: home-screen icons must be opaque.

const manifest = JSON.parse(readFileSync(resolve("public/manifest.webmanifest"), "utf8"));
const html = readFileSync(resolve("index.html"), "utf8");
const linkHref = (rel) => html.match(new RegExp(`<link rel="${rel}"[^>]*\\shref="([^"]+)"`))?.[1];
const appleHref = linkHref("apple-touch-icon");
const publicFile = (href) => resolve("public", href.replace(/^\//, ""));

// A PNG opens with its signature, then the IHDR chunk: length, "IHDR", width,
// height, bit depth, colour type.
function pngHeader(file) {
  const bytes = readFileSync(file);
  return {
    signature: bytes.toString("hex", 0, 8),
    chunk: bytes.toString("latin1", 12, 16),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colourType: bytes[25],
  };
}
const opaquePng = (width, height) => ({ signature: PNG_SIGNATURE, chunk: "IHDR", width, height, colourType: RGB });

// The chunk names in order, up to IEND. Each chunk is length, name, data, CRC.
function pngChunks(file) {
  const bytes = readFileSync(file);
  const names = [];
  for (let at = 8; at + 8 <= bytes.length; at += 12 + bytes.readUInt32BE(at)) {
    names.push(bytes.toString("latin1", at + 4, at + 8));
    if (names.at(-1) === "IEND") break;
  }
  return names;
}

describe("app icon", () => {
  it("every manifest icon is an opaque PNG of its declared size", () => {
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const { src, sizes } of manifest.icons) {
      expect(existsSync(publicFile(src)), src).toBe(true);
      const [width, height] = sizes.split("x").map(Number);
      expect(pngHeader(publicFile(src)), src).toEqual(opaquePng(width, height));
    }
  });

  it("offers any and maskable at both 192 and 512", () => {
    for (const sizes of ["192x192", "512x512"]) {
      for (const purpose of ["any", "maskable"]) {
        expect(manifest.icons.some((i) => i.sizes === sizes && i.purpose === purpose), `${purpose} ${sizes}`).toBe(true);
      }
    }
  });

  it("names a file maskable exactly when its purpose is maskable", () => {
    for (const { src, purpose } of manifest.icons) expect(src.includes("-maskable-"), src).toBe(purpose === "maskable");
  });

  it("no icon carries a tRNS chunk, which could make an RGB PNG transparent", () => {
    for (const href of [...manifest.icons.map((i) => i.src), appleHref]) {
      const chunks = pngChunks(publicFile(href));
      expect(chunks.at(-1), href).toBe("IEND");
      expect(chunks, href).not.toContain("tRNS");
    }
  });

  it("every icon address carries a version stamp", () => {
    for (const href of [...manifest.icons.map((i) => i.src), appleHref]) expect(href).toMatch(/-\d{8}-/);
  });

  it("the apple-touch-icon is an opaque 180 PNG, the same one iOS finds at the root path", () => {
    expect(existsSync(publicFile(appleHref)), appleHref).toBe(true);
    expect(pngHeader(publicFile(appleHref))).toEqual(opaquePng(180, 180));
    expect(readFileSync(publicFile(appleHref)).equals(readFileSync(resolve("public/apple-touch-icon.png")))).toBe(true);
  });

  it("leaves other branding on its own files", () => {
    const srcs = manifest.icons.map((i) => i.src);
    for (const old of ["/icon-192.png", "/icon-512.png", "/icon-maskable-512.png"]) expect(srcs).not.toContain(old);
    expect(readFileSync(resolve("api/og.js"), "utf8")).toContain("/icon-512.png");
    expect(readFileSync(resolve("public/push-sw.js"), "utf8")).toContain("/icon-192.png");
    expect(linkHref("icon")).toBe("/favicon.png");
    for (const href of ["/icon-192.png", "/icon-512.png", "/favicon.png"]) expect(existsSync(publicFile(href)), href).toBe(true);
  });
});
