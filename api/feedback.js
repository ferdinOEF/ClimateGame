// Section 35.4: /api/feedback (Vercel Node function): POST the form after the game, without a name.
// The handler is in server/; this file only hands it the request.
import { feedbackHandler } from "./_lib/server.mjs";

export default feedbackHandler;
