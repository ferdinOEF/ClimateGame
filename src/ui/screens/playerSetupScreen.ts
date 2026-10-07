import {
  getRegistration,
  hasErrors,
  saveRegistration,
  validateRegistration,
  type FieldErrors
} from "@services/playerRegistry";
import { isCloudConfigured } from "@services/env";
import { el } from "./screenHelpers";

/**
 * The sign-in sheet that opens when a player presses Start.
 *
 * One field: an email address. Then straight into the level.
 *
 * WHY IT IS A GATE AT ALL
 *
 * `authScreen.ts` argues at length that a sign-up wall in front of a browser
 * game loses first-time players, and it is right: that screen stays optional.
 * This one is different in kind. It exists because the game is being handed to
 * people to test and demo, and a test session with no record of who played it
 * produces feedback nobody can act on. So the cost is paid once, before the
 * first level, and never again — `AppShell` only routes here when
 * `isRegistered()` is false.
 *
 * WHY ONLY ONE FIELD
 *
 * It asked for a name and an age too, until it did not need to.
 * `playerRegistry.ts` explains the removal in full; the short version is that
 * the leaderboard name is set in Settings and the age was never read. What is
 * left is the one thing that makes a playtest contactable, which is the whole
 * reason the gate exists.
 *
 * The screen keeps all three of the things it was careful about:
 *
 * **It reports the problem on the field.** One field means one message, but it
 * still arrives attached to the input and announced by `role="alert"`, not as
 * an alert box.
 *
 * **It says what happens to the data.** The note at the bottom is not legal
 * cover, it is the thing a player deserves to read before typing an address
 * into a game. It is also accurate, which matters more: the address never
 * reaches the leaderboard.
 *
 * **It never blocks on the network.** `saveRegistration` writes locally and
 * returns; the cloud mirror is fire-and-forget. A player on hotel wifi gets
 * into the level at the same speed as everyone else.
 */
export interface PlayerSetupActions {
  /** The form was submitted and stored. The shell continues to whatever the player pressed Start on. */
  onRegistered: () => void;
  /** Back out without registering. */
  onCancel: () => void;
}

export function renderPlayerSetupScreen(root: HTMLElement, actions: PlayerSetupActions): void {
  // Prefilled when the player is editing details they already gave, which is
  // the same screen reached from Settings.
  const existing = getRegistration();
  const editing = existing !== null;

  const emailInput = el("input", {
    className: "text-input",
    attrs: {
      type: "email",
      inputmode: "email",
      autocomplete: "email",
      maxlength: "254",
      placeholder: "you@example.com",
      value: existing?.declaredEmail ?? "",
      "aria-label": "Your email address"
    }
  }) as HTMLInputElement;

  const emailError = fieldError("setup-email-error");

  const submitButton = el("button", {
    className: "btn btn-primary",
    attrs: { type: "submit" },
    text: editing ? "Save details" : "Start playing"
  }) as HTMLButtonElement;

  function paintErrors(errors: FieldErrors): void {
    setFieldError(emailInput, emailError, errors.email);
  }

  function submit(): void {
    const errors = validateRegistration({ email: emailInput.value });
    paintErrors(errors);

    if (hasErrors(errors)) {
      // Put the caret back on the problem, so a keyboard or screen reader
      // user is taken to it rather than left to hunt for it.
      emailInput.focus();
      return;
    }

    saveRegistration({ declaredEmail: emailInput.value });
    actions.onRegistered();
  }

  const form = el("form", {
    className: "auth-form setup-form",
    attrs: { novalidate: "true" },
    on: {
      submit: (event) => {
        // The form element is what makes Enter submit; preventDefault stops
        // the page navigating away from the single-page app.
        event.preventDefault();
        submit();
      }
    },
    children: [
      field("Your email", "So we can reach you about what you thought of it.", emailInput, emailError, "setup-email-error"),
      submitButton
    ]
  });

  const screen = el("div", {
    className: "screen setup-screen",
    children: [
      el("div", {
        className: "screen-header",
        children: [
          el("button", {
            className: "link-button",
            text: editing ? "← Back" : "← Not now",
            on: { click: () => actions.onCancel() }
          }),
          el("h2", { className: "screen-title", text: editing ? "Your details" : "Before you start" })
        ]
      }),

      el("div", {
        className: "auth-card setup-card",
        children: [
          el("p", {
            className: "auth-blurb",
            text: editing
              ? "Change this and it will be updated everywhere."
              : "One thing, once. Then you are on the coast and we will not ask again."
          }),
          form,
          el("p", {
            className: "setup-privacy",
            // Says exactly what happens, because it is short enough to read.
            text: isCloudConfigured()
              ? "Your email is saved on this device and to this project's playtest list. It is never shown on the leaderboard and no other player can read it. Pick a display name in Settings if you want one on the board."
              : "This build has no server attached, so your email is saved on this device only and goes nowhere else."
          })
        ]
      })
    ]
  });

  root.appendChild(screen);
  emailInput.focus();
}

/** One labelled field, wired to its own error line via `aria-describedby`. */
function field(label: string, hint: string, input: HTMLInputElement, errorNode: HTMLElement, errorId: string): HTMLElement {
  input.setAttribute("aria-describedby", errorId);
  return el("div", {
    className: "auth-field",
    children: [
      el("label", { className: "field-label", text: label }),
      el("span", { className: "field-hint", text: hint }),
      input,
      errorNode
    ]
  });
}

function fieldError(id: string): HTMLElement {
  // `role="alert"` so a screen reader announces the problem instead of
  // leaving it as red text nobody hears.
  return el("p", { className: "field-error", attrs: { id, role: "alert" }, text: "" });
}

function setFieldError(input: HTMLInputElement, node: HTMLElement, message: string | undefined): void {
  node.textContent = message ?? "";
  node.classList.toggle("visible", Boolean(message));
  // `aria-invalid` is what actually tells assistive tech the field is
  // rejected; the red border is only the sighted half of the same signal.
  if (message) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
}
