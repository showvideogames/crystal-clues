// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import MoreGames from "./MoreGames.jsx";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ""; });
it("offers six other games with local artwork and private, plain outbound links", async () => {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(React.createElement(MoreGames)));
  const links = [...host.querySelectorAll("a")];
  expect(links).toHaveLength(6);
  expect(links.map(a => a.querySelector("strong").textContent)).not.toContain('Cluevoyance');
  for (const link of links) {
    const url = new URL(link.href);
    expect(url.protocol).toBe("https:"); expect(url.search).toBe(""); expect(url.hash).toBe("");
    expect(link.rel).toBe("noopener noreferrer"); expect(link.target).toBe("_blank");
    expect(link.querySelector("img").getAttribute("src")).toMatch(/^\/game-icons\/.*\.png$/);
    expect(link.textContent).toContain("opens in a new tab");
  }
});
