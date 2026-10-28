import { describe, expect, it } from "vitest";
import { checkName, isRude, NAME_HINT, NAME_REFUSED, NAME_SHAPE, tidyName } from "../src/core/nameFilter";
import { punctuationProblems } from "./helpers/uiStrings";

/** Section 35.3: the board's name filter, shared by the client and the server. */
describe("the name filter", () => {
  it("lets ordinary names and handles through, including names that contain a rude word's letters", () => {
    for (const good of [
      "Maya",
      "@maya_goa",
      "Ana Maria",
      "rui.dsouza",
      "Kshitij",
      "Chodankar",
      "Assam Rao",
      "Hancock",
      "Dickson",
      "Sussex",
      "Scunthorpe Town",
      "Cassandra",
      "Analisa",
      "grapes",
      "Titus",
      "Pisces",
      "Ravi 99",
      "Priyá",
      "प्रिया",
      "Jo"
    ]) {
      expect(checkName(good), good).toEqual({ ok: true, name: tidyName(good) });
    }
  });

  it("refuses rude words, however they are spelt", () => {
    for (const bad of [
      "fuck",
      "FuCk_you",
      "f u c k",
      "f.u.c.k",
      "fuuuuck",
      "5h1t",
      "shitty",
      "@bitch.lol",
      "big ass",
      "chutiya",
      "Chutiye_99",
      "bhenchod",
      "madarchod",
      "randi",
      "gandu",
      "harami",
      "bhadvo",
      "randecho",
      "zhavnyo",
      "lauda lassan",
      "nazi"
    ]) {
      const check = checkName(bad);
      expect(check.ok, bad).toBe(false);
      if (!check.ok) expect(check.message).toBe(NAME_REFUSED);
      expect(isRude(bad), bad).toBe(true);
    }
  });

  it("asks for 2 to 30 letters or numbers", () => {
    for (const shape of ["a", " b ", "x".repeat(31), "Maya!", "name#1", "<script>", "...", "@_", "emoji 😀", "tab\tname\u0000"]) {
      const check = checkName(shape);
      expect(check.ok, shape).toBe(false);
      if (!check.ok) expect(check.message).toBe(NAME_SHAPE);
    }
    expect(checkName("x".repeat(30)).ok).toBe(true);
    expect(checkName("  Two   spaces  ")).toEqual({ ok: true, name: "Two spaces" });
  });

  it("says so in plain words", () => {
    expect(NAME_HINT).toBe("2 to 30 letters or numbers. Shown only on the board.");
    expect(NAME_REFUSED).toBe("Please choose another name.");
    for (const s of [NAME_HINT, NAME_REFUSED, NAME_SHAPE]) expect(punctuationProblems(s)).toEqual([]);
  });
});
