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
  /** 0.1 to 0.9. Never fully opaque: with the tile colours gone the board stops saying what can be built where. */
  opacity: number;
}

const STORAGE_KEY = "riptide-rising:map-layer:v1";
export const DEFAULT_MAP_LAYER: MapLayerSettings = { visible: true, opacity: 0.45 };
const MIN_OPACITY = 0.1;
const MAX_OPACITY = 0.9;

export function loadMapLayerSettings(): MapLayerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MAP_LAYER };
    const parsed = JSON.parse(raw) as Partial<MapLayerSettings>;
    return {
      visible: typeof parsed.visible === "boolean" ? parsed.visible : DEFAULT_MAP_LAYER.visible,
      opacity:
        typeof parsed.opacity === "number" && Number.isFinite(parsed.opacity)
          ? Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, parsed.opacity))
          : DEFAULT_MAP_LAYER.opacity
    };
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
    slider.step = "5";
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
