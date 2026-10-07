import { describe, expect, it } from "vitest";
import { hasErrors, validateRegistration } from "../src/services/playerRegistry";

/**
 * The registration form is the first thing a player touches, and the only
 * thing standing between them and the game. Every rejection it issues has to
 * be one a reasonable person would accept — so these tests are mostly about
 * what the validator must NOT reject.
 *
 * It asks for one field now. The name and age validators these tests used to
 * cover are gone with the fields; `src/services/playerRegistry.ts` explains
 * why. `validateEmail` itself lives in `auth.ts` and is covered by
 * `auth.test.ts`; what is tested here is the form-shaped wrapper around it,
 * because the form, `hasErrors` and the screen all depend on the map shape
 * rather than on the message.
 *
 * Only the pure validator is covered. The store itself talks to localStorage
 * and Firestore, which would need a DOM and a project; what is worth testing
 * without either is the logic that decides whether a person gets in.
 */

describe("validateRegistration", () => {
  it("passes an ordinary address", () => {
    for (const email of [
      "asha@example.com",
      "ravi.naik@goa.gov.in",
      "maria+playtest@example.co.uk",
      "a@b.co"
    ]) {
      expect(hasErrors(validateRegistration({ email })), email).toBe(false);
    }
  });

  it("accepts an address that only needs trimming", () => {
    // The form does not trim as you type, so leading and trailing space is
    // ordinary input and must not read as an error.
    expect(hasErrors(validateRegistration({ email: "  asha@example.com  " }))).toBe(false);
  });

  it("reports a blank field", () => {
    expect(Object.keys(validateRegistration({ email: "" }))).toEqual(["email"]);
    expect(Object.keys(validateRegistration({ email: "   " }))).toEqual(["email"]);
  });

  it("rejects the shapes that are not addresses", () => {
    for (const email of ["asha", "asha@", "@example.com", "asha example.com", "asha@example"]) {
      expect(Object.keys(validateRegistration({ email })), email).toEqual(["email"]);
    }
  });

  it("keys the error by field rather than returning a bare message", () => {
    // The screen looks up `errors.email` to decide which input to mark. A
    // validator that returned a string would make that impossible, and a
    // second field is a likely enough future to keep the shape.
    const errors = validateRegistration({ email: "nope" });
    expect(errors.email).toBeTypeOf("string");
    expect(hasErrors(errors)).toBe(true);
    expect(hasErrors({})).toBe(false);
  });
});
