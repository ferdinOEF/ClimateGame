/**
 * Section 34b.10: the test hooks (`window.__panjimForTest` and the rest) and the telemetry's console lines are on only
 * in a development build or with `?qa=1` in the address, so every tool that opens the game asks for them. `qaUrl` adds
 * `qa=1` to a game URL's query, before its hash route ("http://localhost:4173/#/play/x" ->
 * "http://localhost:4173/?qa=1#/play/x"); a URL that has it already is left as it is.
 */
export function qaUrl(url: string): string {
  if (/[?&]qa=1(?:[&#]|$)/.test(url)) return url;
  const at = url.indexOf("#");
  const base = at < 0 ? url : url.slice(0, at);
  const hash = at < 0 ? "" : url.slice(at);
  return `${base}${base.includes("?") ? "&" : "?"}qa=1${hash}`;
}
