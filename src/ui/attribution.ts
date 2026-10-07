/**
 * The map credit, shown on any board whose geography came from real map data.
 *
 * NOT OPTIONAL, AND NOT ONLY ABOUT PICTURES
 *
 * Panaji ships as flat coloured hexes with no map imagery in the build at all,
 * which makes it tempting to think the credit is no longer owed. It is. The
 * coastline, the Mandovi, the estuary fringe, the sand and the sixteen
 * landmark positions were all read out of OpenStreetMap, so the board is a
 * derived database, and the Open Database Licence asks for the credit on one
 * of those exactly as it does on a rendered tile. The licence is free to use
 * and costs this one thing.
 *
 * Wired to the map's own `source.attribution` rather than typed into a
 * stylesheet, so a board cannot acquire real geography without the credit that
 * pays for it.
 *
 * It is deliberately small, low-contrast and in the corner, which is both the
 * convention for map credits and the most it can be without competing with the
 * game. It is not hidden, not behind a menu, and not faded out with the place
 * labels when the camera pulls back.
 */

export class MapAttribution {
  private readonly el: HTMLElement;

  constructor(container: HTMLElement, text: string, href = "https://www.openstreetmap.org/copyright") {
    this.el = document.createElement("div");
    this.el.className = "map-attribution";

    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    // `noopener` because this opens a third-party page from a game that holds
    // a signed-in session.
    link.rel = "noopener noreferrer";
    link.textContent = text;
    this.el.appendChild(link);

    container.appendChild(this.el);
  }

  dispose(): void {
    this.el.remove();
  }
}
