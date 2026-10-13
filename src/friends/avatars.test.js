// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AVATARS, avatarKey, avatarInitial, avatarLetter, avatarSrc } from "./avatars";
import { Avatar } from "./Avatar.jsx";

describe("avatar choices", () => {
  it("offers the initialed ball first, then dog, cat, fox, owl, frog and star", () => {
    expect(AVATARS.map((a) => a.key)).toEqual(["ball", "dog", "cat", "fox", "owl", "frog", "star"]);
  });

  it("falls back to the ball for no choice or an unknown one", () => {
    for (const v of [null, undefined, "", "ball", "dragon", "DOG", 7, {}]) expect(avatarKey(v)).toBe("ball");
    for (const k of ["dog", "cat", "fox", "owl", "frog", "star"]) expect(avatarKey(k)).toBe(k);
  });

  it("points at the shipped file for each", () => {
    expect(avatarSrc("fox")).toBe("/avatars/fox.webp");
    expect(avatarSrc(undefined)).toBe("/avatars/ball.webp");
  });
});

describe("the ball's letter", () => {
  it("is the first letter of the name, upper-cased", () => {
    expect(avatarInitial("Deb")).toBe("D");
    expect(avatarInitial("  zoe ")).toBe("Z");
    expect(avatarInitial("élodie")).toBe("É");
    expect(avatarInitial("李雷")).toBe("李");
    expect(avatarInitial("2Pac")).toBe("2");
  });

  it("skips leading symbols and emoji, and is empty when there is no letter at all", () => {
    expect(avatarInitial("😀 Bo")).toBe("B");
    expect(avatarInitial("")).toBe("");
    expect(avatarInitial("   ")).toBe("");
    expect(avatarInitial(null)).toBe("");
    expect(avatarInitial(undefined)).toBe("");
    expect(avatarInitial("!!!")).toBe("");
  });

  it("appears only on the crystal ball", () => {
    expect(avatarLetter(null, "Deb")).toBe("D");
    expect(avatarLetter("ball", "Deb")).toBe("D");
    for (const k of ["dog", "cat", "fox", "owl", "frog", "star"]) expect(avatarLetter(k, "Deb")).toBe("");
  });
});

describe("<Avatar>", () => {
  const html = (props) => renderToStaticMarkup(createElement(Avatar, props));

  it("lays the letter over the picture as separate text, never in the image", () => {
    const out = html({ name: "Deb" });
    expect(out).toContain('src="/avatars/ball.webp"');
    expect(out).toContain('alt=""');
    expect(out).toMatch(/<span class="fr-avatar-letter">D<\/span>/);
    expect(out.match(/<img/g)).toHaveLength(1);
  });

  it("shows the plain ball when the name is missing", () => {
    for (const name of [undefined, "", "  ", "?!"]) {
      const out = html({ name });
      expect(out).toContain("/avatars/ball.webp");
      expect(out).not.toContain("fr-avatar-letter");
    }
  });

  it("draws an animal with no letter, whatever the name", () => {
    const out = html({ name: "Deb", avatar: "owl" });
    expect(out).toContain('src="/avatars/owl.webp"');
    expect(out).toContain('data-avatar="owl"');
    expect(out).not.toContain("fr-avatar-letter");
  });

  it("sizes from one number and stays out of the accessibility tree", () => {
    const out = html({ name: "Deb", size: 28 });
    expect(out).toContain("--av:28px");
    expect(out).toContain('width="28"');
    expect(out).toContain('aria-hidden="true"');
  });
});

describe("the Friends dot's source (badge.js)", () => {
  beforeEach(() => vi.resetModules());

  const withClient = async ({ session, inbox }) => {
    const call = vi.fn(async () => inbox);
    vi.doMock("./client", () => ({
      call,
      supabase: { auth: { getSession: async () => ({ data: { session } }) } },
    }));
    return { call, badge: await import("./badge.js") };
  };

  it("reads the server's unread count, the puzzles waiting and the player's profile", async () => {
    const me = { id: "u1", display_name: "Deb", avatar: "cat" };
    const friends = [{ incoming: { puzzle_id: "p1" } }, { incoming: { puzzle_id: "p2" }, unseen_result: { puzzle_id: "p3" } }, { incoming: null }];
    const { call, badge } = await withClient({ session: { user: {} }, inbox: { unread: 3, me, friends } });
    expect(await badge.fetchActivity()).toEqual({ unread: 3, waiting: 2, results: 1, me });
    expect(await badge.fetchUnread()).toBe(3);
    expect(call).toHaveBeenCalledWith("get_friends_inbox");
  });

  it("asks the server nothing, and shows no dot, when nobody is signed in", async () => {
    const { call, badge } = await withClient({ session: null, inbox: { unread: 5 } });
    expect(await badge.fetchActivity()).toBeNull();
    expect(await badge.fetchUnread()).toBe(0);
    expect(call).not.toHaveBeenCalled();
  });
});
