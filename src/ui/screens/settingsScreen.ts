import { ACHIEVEMENTS } from "@levels/achievements";
import type { PlayerProgress } from "@levels/progression";
import { getCurrentUser, linkGoogleAccount, sanitiseName, signOutPlayer } from "@services/auth";
import { isCloudConfigured, readFirebaseConfig } from "@services/env";
import { REGISTRY_SCHEMA_VERSION, getRegistration, mirrorToCloud } from "@services/playerRegistry";
import { el } from "./screenHelpers";

/**
 * Profile, account and badge case.
 *
 * The display name is the only thing here a player must set, and it is
 * editable without an account because an anonymous session still appears
 * on the leaderboard. Google sign-in is presented as what it actually
 * does — carry progress between devices — rather than as a gate.
 */
export interface SettingsActions {
  onBack: () => void;
  onNameChange: (name: string) => void;
  onResetProgress: () => void;
  onSignIn: () => void;
  onRefresh: () => void;
  /** Open the email sheet to correct the address given before the first level. */
  onEditDetails: () => void;
}

export function renderSettingsScreen(root: HTMLElement, progress: PlayerProgress, actions: SettingsActions): void {
  const user = getCurrentUser();
  const unlocked = new Set(progress.achievements);
  const registration = getRegistration();

  const nameInput = el("input", {
    className: "text-input",
    attrs: {
      type: "text",
      maxlength: "24",
      value: progress.displayName,
      "aria-label": "Display name",
      placeholder: "Coastkeeper"
    }
  }) as HTMLInputElement;

  const nameStatus = el("span", { className: "field-status", text: "" });

  const accountNote = el("p", { className: "settings-note", text: accountSummary() });

  function accountSummary(): string {
    if (!isCloudConfigured()) return "This build runs offline. Progress is saved on this device only.";
    if (!user) return "Connecting…";
    if (user.hasProvider) {
      return user.email
        ? `Signed in as ${user.email}. Your progress syncs across devices.`
        : "Signed in. Your progress syncs across devices.";
    }
    return "Playing as a guest. Your progress is saved here and posted to the leaderboard, but it won't follow you to another device.";
  }

  const screen = el("div", {
    className: "screen settings-screen",
    children: [
      el("div", {
        className: "screen-header",
        children: [
          el("button", { className: "link-button", text: "← Back", on: { click: () => actions.onBack() } }),
          el("h2", { className: "screen-title", text: "Profile" })
        ]
      }),

      el("section", {
        className: "settings-block",
        children: [
          el("label", { className: "field-label", text: "Leaderboard name" }),
          el("div", {
            className: "field-row",
            children: [
              nameInput,
              el("button", {
                className: "btn btn-small",
                text: "Save",
                on: {
                  click: () => {
                    const clean = sanitiseName(nameInput.value);
                    nameInput.value = clean;
                    actions.onNameChange(clean);
                    nameStatus.textContent = "Saved";
                    window.setTimeout(() => (nameStatus.textContent = ""), 2000);
                  }
                }
              })
            ]
          }),
          nameStatus
        ]
      }),

      // The address collected before the first level. Shown back rather than
      // left invisible: a player who typed an address into a form is entitled
      // to see what the game now holds about them, and to fix a typo.
      el("section", {
        className: "settings-block",
        children: [
          el("label", { className: "field-label", text: "Your details" }),
          el("p", {
            className: "settings-note",
            text: registration
              ? registration.declaredEmail
              : "You haven't given this yet. You'll be asked once, before your first level."
          }),
          el("button", {
            className: "btn btn-small",
            text: registration ? "Edit your details" : "Add your details",
            on: { click: () => actions.onEditDetails() }
          })
        ]
      }),

      el("section", {
        className: "settings-block",
        children: [
          el("label", { className: "field-label", text: "Account" }),
          accountNote,
          // Guests get the full front door: email/password or Google, on
          // the dedicated screen. Offering only Google here would quietly
          // exclude anyone who does not have (or want to use) a Google
          // account.
          isCloudConfigured() && user && !user.hasProvider
            ? el("button", {
                className: "btn btn-primary",
                text: "Sign in or create an account",
                on: { click: () => actions.onSignIn() }
              })
            : null,
          isCloudConfigured() && user && !user.hasProvider
            ? el("button", {
                className: "btn",
                text: "Quick sign-in with Google",
                on: {
                  click: async (event) => {
                    const button = event.currentTarget as HTMLButtonElement;
                    button.disabled = true;
                    button.textContent = "Opening…";
                    const outcome = await linkGoogleAccount();
                    button.disabled = false;
                    if (outcome.ok) actions.onRefresh();
                    else {
                      button.textContent = "Sign in with Google";
                      accountNote.textContent = outcome.reason;
                    }
                  }
                }
              })
            : null,
          isCloudConfigured() && user && user.hasProvider
            ? el("button", {
                className: "btn",
                text: "Sign out",
                on: {
                  click: async () => {
                    await signOutPlayer();
                    actions.onRefresh();
                  }
                }
              })
            : null
        ]
      }),

      cloudStatusBlock(registration),

      el("section", {
        className: "settings-block",
        children: [
          el("label", { className: "field-label", text: `Badges — ${unlocked.size} of ${ACHIEVEMENTS.length}` }),
          el("div", {
            className: "badge-grid",
            children: ACHIEVEMENTS.map((achievement) =>
              el("div", {
                className: `badge${unlocked.has(achievement.id) ? " unlocked" : ""}`,
                attrs: { title: achievement.description },
                children: [
                  el("span", { className: "badge-icon", text: achievement.icon, attrs: { "aria-hidden": "true" } }),
                  el("span", {
                    className: "badge-text",
                    children: [
                      el("b", { text: achievement.name }),
                      // Locked badges still show what they are for — a
                      // hidden goal cannot motivate anyone.
                      el("span", { text: achievement.description })
                    ]
                  })
                ]
              })
            )
          })
        ]
      }),

      el("section", {
        className: "settings-block danger",
        children: [
          el("label", { className: "field-label", text: "Danger zone" }),
          el("p", { className: "settings-note", text: "Clears every level record, star and badge stored on this device." }),
          el("button", {
            className: "btn btn-danger",
            text: "Reset local progress",
            on: {
              click: (event) => {
                const button = event.currentTarget as HTMLButtonElement;
                // Two-step rather than a `confirm()` dialog: same
                // protection, no modal, and it matches the rest of the UI.
                if (button.dataset.armed !== "true") {
                  button.dataset.armed = "true";
                  button.textContent = "Tap again to confirm";
                  window.setTimeout(() => {
                    button.dataset.armed = "false";
                    button.textContent = "Reset local progress";
                  }, 4000);
                  return;
                }
                actions.onResetProgress();
              }
            }
          })
        ]
      })
    ]
  });

  root.appendChild(screen);
}

/**
 * Cloud status, and a button that actually tests it.
 *
 * This exists because "is it saving to Firebase?" is a question with a bad
 * answer everywhere else. The game is designed to degrade silently when the
 * cloud is unavailable — the registration mirror catches its own failures, the
 * leaderboard writes are fire-and-forget — which is right for a player and
 * useless for whoever is setting up a playtest and needs to know whether the
 * Firebase console will have anything in it.
 *
 * So this block states what the build is pointed at, whether a session has a
 * uid yet, and offers a real round trip rather than an inference. The button
 * does not simulate anything: it performs the same `setDoc` the registration
 * does and reports exactly what came back, including the error text, because
 * the two failures worth distinguishing — Anonymous auth not enabled in the
 * console, and a rules rejection — look identical from the outside and read
 * very differently in that message.
 */
function cloudStatusBlock(registration: ReturnType<typeof getRegistration>): HTMLElement {
  const config = readFirebaseConfig();
  const status = el("p", { className: "settings-note", attrs: { role: "status" } });

  function describe(): string {
    if (!config) return "No Firebase project is configured for this build, so nothing is sent anywhere. Everything is saved on this device. See docs/DEPLOY.md to connect one.";
    const account = getCurrentUser();
    const session = account ? `signed in (${account.isAnonymous ? "guest session" : "account"})` : "not signed in yet";
    return `Project ${config.projectId} — ${session}.`;
  }

  status.textContent = describe();

  const testButton = el("button", {
    className: "btn btn-small",
    text: "Test the connection",
    on: {
      click: async (event) => {
        const button = event.currentTarget as HTMLButtonElement;
        button.disabled = true;
        button.textContent = "Testing…";

        // Writes the real registration rather than a throwaway document, so a
        // pass means the thing that matters actually works — and so a test run
        // never leaves debris in the collection.
        const target = registration ?? {
          declaredEmail: "test@example.com",
          registeredAt: new Date().toISOString(),
          schemaVersion: REGISTRY_SCHEMA_VERSION
        };
        const outcome = await mirrorToCloud(target);

        button.disabled = false;
        button.textContent = "Test the connection";
        status.textContent =
          outcome.status === "written"
            ? `Wrote to playtesters/ in ${config?.projectId ?? "the project"}. It should be visible in the Firebase console now.`
            : outcome.status === "offline"
              ? "Could not get a session. Check that Anonymous sign-in is enabled under Authentication in the Firebase console."
              : outcome.rateLimited
                ? "Rejected because the last write was under five seconds ago — the rules rate-limit rewrites. Wait a moment and try again."
                : `The write was rejected: ${outcome.reason}`;
      }
    }
  });

  return el("section", {
    className: "settings-block",
    children: [
      el("label", { className: "field-label", text: "Cloud status" }),
      status,
      config ? testButton : null
    ]
  });
}
