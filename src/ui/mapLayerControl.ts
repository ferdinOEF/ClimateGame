/**
 * The switch and opacity slider for the OpenStreetMap layer.
 *
 * Stacked directly above the map credit, which is the one thing on screen
 * already about "the map under the board" (`.map-corner` in hud.css places
 * the pair). Drawn only on maps that ship a layer.
 *
 * The choice is remembered on this device. It is a viewing preference, not
 * progress, so it lives in its own localStorage key rather than in the player
 * profile, and a browser that refuses storage simply gets the defaults back.
 */

export interface MapLayerSettings {
  visible: boolean;
  /**
   * 0.1 to 1. Full opacity is safe: the strength per terrain (see
   * terrainMeshManager) keeps water, sand and wetland in their own colours even
   * at 100%, so the board never stops saying what can be built where.
   */
  opacity: number;
}

/**
 * v4 since the default went from 32% to 21% (v3 defaulted to 32%; v2 was
 * 45%, then 75%, then 23%).
 *
 * A setting is only saved when the player touches the switch or the slider.
 * A saved value equal to the default of its own version (32% in v3, 23% in
 * v2) most likely means they only flicked the switch and never moved the
 * slider, so it migrates to the new default (keeping their on/off); any
 * other value was chosen, and is kept.
 */
const STORAGE_KEY = "riptide-rising:map-layer:v4";
const LEGACY: readonly { key: string; oldDefault: number }[] = [
  { key: "riptide-rising:map-layer:v3", oldDefault: 0.32 },
  { key: "riptide-rising:map-layer:v2", oldDefault: 0.23 }
];
/** 21%: the streets and roads read under the tiles while the board's own colours lead. */
export const DEFAULT_MAP_LAYER: MapLayerSettings = { visible: true, opacity: 0.21 };
const MIN_OPACITY = 0.1;
const MAX_OPACITY = 1;

function parse(raw: string, oldDefault: number | null): MapLayerSettings {
  const parsed = JSON.parse(raw) as Partial<MapLayerSettings>;
  let opacity =
    typeof parsed.opacity === "number" && Number.isFinite(parsed.opacity)
      ? Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, parsed.opacity))
      : DEFAULT_MAP_LAYER.opacity;
  if (oldDefault !== null && Math.abs(opacity - oldDefault) < 0.005) opacity = DEFAULT_MAP_LAYER.opacity;
  return {
    visible: typeof parsed.visible === "boolean" ? parsed.visible : DEFAULT_MAP_LAYER.visible,
    opacity
  };
}

export function loadMapLayerSettings(): MapLayerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return parse(raw, null);
    for (const { key, oldDefault } of LEGACY) {
      const legacy = localStorage.getItem(key);
      if (legacy) return parse(legacy, oldDefault);
    }
    return { ...DEFAULT_MAP_LAYER };
  } catch {
    return { ...DEFAULT_MAP_LAYER };
  }
}

function saveMapLayerSettings(settings: MapLayerSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or storage disabled: the setting lasts for this level only.
  }
}

export class MapLayerControl {
  private readonly el: HTMLElement;
  private settings: MapLayerSettings;

  constructor(container: HTMLElement, onChange: (settings: MapLayerSettings) => void, prepend = false) {
    this.settings = loadMapLayerSettings();

    this.el = document.createElement("div");
    this.el.className = "map-layer-control";

    const toggleLabel = document.createElement("label");
    toggleLabel.className = "map-layer-toggle";
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = this.settings.visible;
    const toggleText = document.createElement("span");
    toggleText.textContent = "Street map";
    toggleLabel.append(toggle, toggleText);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "map-layer-opacity";
    slider.min = String(MIN_OPACITY * 100);
    slider.max = String(MAX_OPACITY * 100);
    // Steps of 1, so the 21% default sits exactly on the track rather than
    // the thumb snapping to 30 while the layer is drawn at 32.
    slider.step = "1";
    slider.value = String(Math.round(this.settings.opacity * 100));
    slider.setAttribute("aria-label", "Street map opacity");
    slider.disabled = !this.settings.visible;

    const update = (next: Partial<MapLayerSettings>): void => {
      this.settings = { ...this.settings, ...next };
      slider.disabled = !this.settings.visible;
      saveMapLayerSettings(this.settings);
      onChange(this.settings);
    };
    toggle.addEventListener("change", () => update({ visible: toggle.checked }));
    slider.addEventListener("input", () => update({ opacity: Number(slider.value) / 100 }));

    this.el.append(toggleLabel, slider);
    if (prepend) container.prepend(this.el);
    else container.appendChild(this.el);
  }

  get current(): MapLayerSettings {
    return this.settings;
  }

  dispose(): void {
    this.el.remove();
  }
}
