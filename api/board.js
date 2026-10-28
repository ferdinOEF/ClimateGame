// Section 35.4: /api/board (Vercel Node function): GET the top 10 or a place, POST a finished run, PATCH a rename.
// The handler is in server/; this file only hands it the request.
import { boardHandler } from "./_lib/server.mjs";

export default boardHandler;
