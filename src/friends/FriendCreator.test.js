import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FriendCreator from "./FriendCreator.jsx";

vi.mock("./client", () => ({ api: { getDraft: vi.fn(async () => null), wordBank: vi.fn(async () => []) } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
const clue = (side) => document.querySelector(`button[aria-label^="Clue on the ${side}"]`);
const input = () => document.querySelector('.fr-sheet-input');
const activate = async (button) => {
  // Native pointer/keyboard activation focuses the button before firing click.
  await act(async () => { button.focus(); button.click(); });
};
const type = async (text) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input(), text);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
};
beforeEach(async () => {
  localStorage.clear();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(React.createElement(FriendCreator, {
    kit: { AdminPreviewCard: () => null, DragGhost: () => null },
    friend: { friendship_id: "synthetic-focus-test", friend_name: "Test" },
  })));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = ""; localStorage.clear(); vi.unstubAllGlobals();
});
it("refocuses an already-open empty clue on every activation", async () => {
  for (let i = 0; i < 3; i++) {
    await activate(clue("top"));
    expect(document.activeElement).toBe(input());
    expect(clue("top").getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  }
});
it("keeps exact text, selection and clue context when reactivated", async () => {
  await activate(clue("right"));
  await type("Ice cream ");
  input().setSelectionRange(2, 5);
  await activate(clue("right"));
  expect(document.activeElement).toBe(input());
  expect(input().value).toBe("Ice cream ");
  expect([input().selectionStart, input().selectionEnd]).toEqual([2, 5]);
  expect(document.querySelector('[role="dialog"]').getAttribute("aria-label")).toBe("Right clue");
  expect(clue("right").textContent).toBe("ICE CREAM ");
});
it("still closes with Done or Escape and reopens with saved text", async () => {
  await activate(clue("top")); await type("ice cream ");
  await activate(document.querySelector('.fr-sheet-done'));
  expect(input()).toBeNull();
  await activate(clue("top"));
  expect(document.activeElement).toBe(input()); expect(input().value).toBe("ICE CREAM");
  await act(async () => input().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(input()).toBeNull();
  await activate(clue("left"));
  expect(input().value).toBe(""); expect(document.activeElement).toBe(input());
  await activate(clue("top")); expect(input().value).toBe("ICE CREAM");
});
