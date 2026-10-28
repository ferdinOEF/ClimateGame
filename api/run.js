// Section 35.4: /api/run (Vercel Node function): POST a run's reach and completion, without a name.
// The handler is in server/; this file only hands it the request.
import { runHandler } from "./_lib/server.mjs";

export default runHandler;
