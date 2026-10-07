import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, sanitiseName, validateEmail, validatePassword } from "../src/services/auth";

/**
 * Credential validation only — the pure half of the auth module.
 *
 * Nothing here touches Firebase. These functions exist so a player learns
 * what is wrong with their input before a network round trip, in words
 * they can act on; Firebase Auth remains the actual authority and enforces
 * its own rules server-side regardless of what passes here.
 */

describe("validateEmail", () => {
  it("accepts ordinary addresses", () => {
    for (const email of [
      "fiona@example.com",
      "a@b.co",
      "first.last@sub.domain.org",
      "user+tag@example.co.uk",
      "ferdin@oneearth.world"
    ]) {
      expect(validateEmail(email), `rejected ${email}`).toBeNull();
    }
  });

  it("catches the typos people actually make", () => {
    expect(validateEmail("")).toBeTruthy();
    expect(validateEmail("   ")).toBeTruthy();
    expect(validateEmail("fiona")).toBeTruthy();
    expect(validateEmail("fiona@")).toBeTruthy();
    expect(validateEmail("@example.com")).toBeTruthy();
    expect(validateEmail("fiona@example")).toBeTruthy(); // no dot in the domain
    expect(validateEmail("fiona example@x.com")).toBeTruthy(); // stray space
    expect(validateEmail("a@b@c.com")).toBeTruthy(); // two @
  });

  it("trims surrounding whitespace rather than rejecting it", () => {
    // Pasting an address commonly brings a trailing space with it. That is
    // a formatting artefact, not a mistake worth blocking on.
    expect(validateEmail("  fiona@example.com  ")).toBeNull();
  });

  it("rejects an address too long to store", () => {
    expect(validateEmail(`${"a".repeat(250)}@example.com`)).toBeTruthy();
  });

  it("returns a message a player can act on, not a code", () => {
    const message = validateEmail("fiona");
    expect(message).toBeTruthy();
    expect(message).not.toMatch(/auth\//);
    expect(message!.length).toBeGreaterThan(10);
  });
});

describe("validatePassword", () => {
  it("requires the stated minimum length", () => {
    expect(validatePassword("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
    expect(validatePassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toBeTruthy();
    expect(validatePassword("")).toBeTruthy();
  });

  it("asks for more than Firebase's own floor of six", () => {
    // The extra characters cost a player nothing and materially raise the
    // bar on a guessing attack.
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThan(6);
    expect(validatePassword("abc123")).toBeTruthy();
  });

  it("does not impose composition rules", () => {
    // Length beats character-class requirements, which mostly push people
    // toward predictable substitutions and a written-down password.
    expect(validatePassword("correct horse battery staple")).toBeNull();
    expect(validatePassword("all lowercase and long enough")).toBeNull();
  });

  it("rejects an absurdly long password before the SDK does", () => {
    expect(validatePassword("a".repeat(2000))).toBeTruthy();
  });

  it("names the requirement in the message", () => {
    expect(validatePassword("short")).toContain(String(MIN_PASSWORD_LENGTH));
  });
});

describe("sanitiseName", () => {
  it("keeps ordinary names intact", () => {
    expect(sanitiseName("Fiona")).toBe("Fiona");
    expect(sanitiseName("Coast Keeper 99")).toBe("Coast Keeper 99");
  });

  it("strips control characters that would break the leaderboard layout", () => {
    expect(sanitiseName("Fio\u0000na")).toBe("Fiona");
    expect(sanitiseName("Line\nBreak")).toBe("LineBreak");
    expect(sanitiseName("Tab\tSeparated")).toBe("TabSeparated");
  });

  it("collapses padding used to shove other rows around", () => {
    expect(sanitiseName("A          B")).toBe("A B");
    expect(sanitiseName("   Trimmed   ")).toBe("Trimmed");
  });

  it("caps length to the ceiling the security rules enforce", () => {
    expect(sanitiseName("x".repeat(100)).length).toBe(24);
  });

  it("falls back to a default rather than returning an empty name", () => {
    // firestore.rules rejects a zero-length displayName, so an all-
    // whitespace entry must not reach it.
    expect(sanitiseName("")).toBe("Coastkeeper");
    expect(sanitiseName("    ")).toBe("Coastkeeper");
    expect(sanitiseName("\u0000\u0001")).toBe("Coastkeeper");
  });
});
