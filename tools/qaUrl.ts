/**
 * Section 34b.10: the test hooks (`window.__panjimForTest` and the rest) and the telemetry's console lines are on only
 * in a development build or with `?qa=1` in the address, so every tool that opens the game asks for them. `qaUrl` adds
 * `qa=1` to a game URL's query, before its hash route ("http://localhost:4173/#/play/x" ->
 * "http://localhost:4173/?qa=1#/play/x"); a URL that has it already is left as it is.
 *
 * Section 35.3: it also adds `noname=1`, so Play Panjim opens on its start popup as before (the name card skipped,
 * honoured only with the test hooks on); a tool that shoots the name card leaves it out. Section 39: and `noguide=1`, so
 * Play Panjim starts after How to play without the guided start (a tool that shoots the guide leaves it out).
 *
 * Section 41.6.4: and `tag=FestTesters`, the test tag (Section 38.4b), so a tool pointed at a deployment (the
 * walkthrough's `--url=`) never posts a run or a board row as a real player's.
 */
export function qaUrl(url: string): string {
  // A URL with the hooks on already still gets the test tag.
  if (/[?&]qa=1(?:[&#]|$)/.test(url)) return /[?&]tag=/.test(url) ? url : url.replace(/([?&]qa=1)(?=[&#]|$)/, "$1&tag=FestTesters");
  const flags = "qa=1&tag=FestTesters&noname=1&noguide=1";
  const at = url.indexOf("#");
  const base = at < 0 ? url : url.slice(0, at);
  const hash = at < 0 ? "" : url.slice(at);
  return `${base}${base.includes("?") ? "&" : "?"}${flags}${hash}`;
}
