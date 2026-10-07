import {
  linkGoogleAccount,
  MIN_PASSWORD_LENGTH,
  sendPasswordReset,
  signInWithEmail,
  signUpWithEmail,
  storedDisplayName,
  validateEmail,
  validatePassword
} from "@services/auth";
import { isCloudConfigured } from "@services/env";
import { el } from "./screenHelpers";

/**
 * Sign in / create account.
 *
 * Three things this screen is deliberate about.
 *
 * **It never handles a password beyond passing it to Firebase Auth.** The
 * value goes straight from the input into `signUpWithEmail`/
 * `signInWithEmail`, which hand it to the SDK. It is never logged, never
 * put in application state, never written to Firestore, and the input is
 * cleared on success. Firebase stores the hash; this app stores the email
 * and nothing more. That is not caution for its own sake — a password this
 * code cannot see is a password this code cannot leak.
 *
 * **Guest play stays available.** A sign-up wall in front of a browser game
 * is the most reliable way to lose a first-time player, and the anonymous
 * session already gets a real uid, a real save and a leaderboard entry.
 * Creating an account is presented as what it actually buys — the save
 * following you to another device — rather than as the price of entry.
 * (If you would rather force it, deleting the "Play as guest" button and
 * having AppShell open this route on boot is the whole change.)
 *
 * **Signing up mid-session keeps your progress.** See `signUpWithEmail`:
 * it links the new credential to the anonymous uid rather than minting a
 * fresh one.
 */
export interface AuthActions {
  /** Signed in or signed up successfully. The shell re-syncs and moves on. */
  onAuthenticated: () => void;
  /** Continue without an account. */
  onGuest: () => void;
  onBack: () => void;
}

type Mode = "signin" | "signup";

export function renderAuthScreen(root: HTMLElement, actions: AuthActions, initialMode: Mode = "signin"): void {
  let mode: Mode = initialMode;
  let busy = false;

  const emailInput = el("input", {
    className: "text-input",
    attrs: {
      type: "email",
      // Lets a password manager recognise the field, and gets phones to
      // show the right keyboard.
      autocomplete: "email",
      inputmode: "email",
      placeholder: "you@example.com",
      "aria-label": "Email address"
    }
  }) as HTMLInputElement;

  const passwordInput = el("input", {
    className: "text-input",
    attrs: {
      type: "password",
      autocomplete: "current-password",
      placeholder: "Your password",
      "aria-label": "Password"
    }
  }) as HTMLInputElement;

  const nameInput = el("input", {
    className: "text-input",
    attrs: {
      type: "text",
      maxlength: "24",
      value: storedDisplayName(),
      placeholder: "Coastkeeper",
      "aria-label": "Leaderboard name"
    }
  }) as HTMLInputElement;

  const nameField = el("div", {
    className: "auth-field",
    children: [el("label", { className: "field-label", text: "Leaderboard name" }), nameInput]
  });

  // `role="alert"` so a screen reader announces a failure rather than
  // leaving it as silent red text somebody never hears.
  const message = el("p", { className: "auth-message", attrs: { role: "alert" } });

  const submitButton = el("button", {
    className: "btn btn-primary",
    attrs: { type: "submit" }
  }) as HTMLButtonElement;

  const toggleButton = el("button", { className: "link-button", attrs: { type: "button" } }) as HTMLButtonElement;
  const title = el("h2", { className: "screen-title" });
  const blurb = el("p", { className: "auth-blurb" });

  function setMessage(text: string, kind: "error" | "info" | "" = "error"): void {
    message.textContent = text;
    message.className = `auth-message${kind ? ` ${kind}` : ""}`;
  }

  function setBusy(next: boolean): void {
    busy = next;
    submitButton.disabled = next;
    submitButton.textContent = next
      ? mode === "signup"
        ? "Creating account…"
        : "Signing in…"
      : mode === "signup"
        ? "Create account"
        : "Sign in";
  }

  function paintMode(): void {
    title.textContent = mode === "signup" ? "Create an account" : "Sign in";
    blurb.textContent =
      mode === "signup"
        ? "Your progress on this device carries over, and from then on it follows you to any browser you sign in from."
        : "Welcome back. Anything you've played on this device will be merged into your account.";
    toggleButton.textContent =
      mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account";
    nameField.hidden = mode !== "signup";
    passwordInput.setAttribute("autocomplete", mode === "signup" ? "new-password" : "current-password");
    passwordInput.placeholder = mode === "signup" ? `At least ${MIN_PASSWORD_LENGTH} characters` : "Your password";
    setMessage("", "");
    setBusy(false);
  }

  async function submit(): Promise<void> {
    if (busy) return;
    setMessage("", "");

    const email = emailInput.value;
    const password = passwordInput.value;

    // Validate before the round trip, so a typo is caught in the form
    // rather than coming back as an SDK error code.
    const emailError = validateEmail(email);
    if (emailError) {
      setMessage(emailError);
      emailInput.focus();
      return;
    }
    if (mode === "signup") {
      const passwordError = validatePassword(password);
      if (passwordError) {
        setMessage(passwordError);
        passwordInput.focus();
        return;
      }
    } else if (password.length === 0) {
      setMessage("Enter your password.");
      passwordInput.focus();
      return;
    }

    setBusy(true);
    const result =
      mode === "signup"
        ? await signUpWithEmail(email, password, nameInput.value)
        : await signInWithEmail(email, password);
    setBusy(false);

    if (!result.ok) {
      setMessage(result.reason);
      return;
    }

    // Drop the password from the DOM the moment it is no longer needed.
    passwordInput.value = "";
    actions.onAuthenticated();
  }

  const form = el("form", {
    className: "auth-form",
    attrs: { novalidate: "true" },
    on: {
      submit: (event) => {
        // The form element is what makes Enter submit and what password
        // managers look for; preventDefault stops the page navigating.
        event.preventDefault();
        void submit();
      }
    },
    children: [
      el("div", {
        className: "auth-field",
        children: [el("label", { className: "field-label", text: "Email" }), emailInput]
      }),
      el("div", {
        className: "auth-field",
        children: [el("label", { className: "field-label", text: "Password" }), passwordInput]
      }),
      nameField,
      message,
      submitButton,
      el("button", {
        className: "link-button auth-forgot",
        attrs: { type: "button" },
        text: "Forgot your password?",
        on: {
          click: async () => {
            const outcome = await sendPasswordReset(emailInput.value);
            setMessage(outcome.message, outcome.ok ? "info" : "error");
          }
        }
      })
    ]
  });

  const screen = el("div", {
    className: "screen auth-screen",
    children: [
      el("div", {
        className: "screen-header",
        children: [
          el("button", { className: "link-button", text: "← Back", on: { click: () => actions.onBack() } }),
          title
        ]
      }),

      !isCloudConfigured()
        ? el("div", {
            className: "board-empty",
            children: [
              el("div", { className: "board-empty-title", text: "Accounts aren't set up for this build" }),
              el("p", {
                className: "board-empty-body",
                text: "There's no Firebase project connected, so there's nothing to sign in to. Your progress is still saved on this device. See docs/DEPLOY.md to connect one."
              }),
              el("button", { className: "btn btn-primary", text: "Keep playing", on: { click: () => actions.onGuest() } })
            ]
          })
        : el("div", {
            className: "auth-card",
            children: [
              blurb,
              form,
              el("div", { className: "auth-divider", children: [el("span", { text: "or" })] }),
              el("button", {
                className: "btn",
                text: "Continue with Google",
                on: {
                  click: async (event) => {
                    const button = event.currentTarget as HTMLButtonElement;
                    button.disabled = true;
                    const outcome = await linkGoogleAccount();
                    button.disabled = false;
                    if (outcome.ok) actions.onAuthenticated();
                    else setMessage(outcome.reason);
                  }
                }
              }),
              toggleButton,
              el("button", {
                className: "link-button auth-guest",
                text: "Play as guest instead",
                on: { click: () => actions.onGuest() }
              })
            ]
          })
    ]
  });

  toggleButton.addEventListener("click", () => {
    mode = mode === "signup" ? "signin" : "signup";
    paintMode();
  });

  root.appendChild(screen);
  paintMode();
  emailInput.focus();
}
