import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_MAP_LAYER, loadMapLayerSettings } from "../src/ui/mapLayerControl";

/** The street-map layer defaults to 21%, and the old defaults (32% in v3, 23% in v2) migrate to it. */
function stubStorage(entries: Record<string, string>): void {
  const store = new Map(Object.entries(entries));
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: store.size
  } as Storage;
}

afterEach(() => {
  delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
});

describe("street map layer settings", () => {
  it("defaults to 21%, on", () => {
    expect(DEFAULT_MAP_LAYER).toEqual({ visible: true, opacity: 0.21 });
    stubStorage({});
    expect(loadMapLayerSettings()).toEqual({ visible: true, opacity: 0.21 });
  });

  it("migrates a saved old default (32% in v3, 23% in v2) to 21%, keeping the switch", () => {
    stubStorage({ "riptide-rising:map-layer:v3": JSON.stringify({ visible: false, opacity: 0.32 }) });
    expect(loadMapLayerSettings()).toEqual({ visible: false, opacity: 0.21 });
    stubStorage({ "riptide-rising:map-layer:v2": JSON.stringify({ visible: true, opacity: 0.23 }) });
    expect(loadMapLayerSettings()).toEqual({ visible: true, opacity: 0.21 });
  });

  it("keeps an opacity the player chose", () => {
    stubStorage({ "riptide-rising:map-layer:v2": JSON.stringify({ visible: true, opacity: 0.6 }) });
    expect(loadMapLayerSettings().opacity).toBe(0.6);
    stubStorage({ "riptide-rising:map-layer:v3": JSON.stringify({ visible: true, opacity: 0.23 }) });
    expect(loadMapLayerSettings().opacity).toBe(0.23);
    stubStorage({ "riptide-rising:map-layer:v4": JSON.stringify({ visible: true, opacity: 0.32 }) });
    expect(loadMapLayerSettings().opacity).toBe(0.32);
  });

  it("a v4 save wins over older ones", () => {
    stubStorage({
      "riptide-rising:map-layer:v4": JSON.stringify({ visible: true, opacity: 0.5 }),
      "riptide-rising:map-layer:v3": JSON.stringify({ visible: false, opacity: 0.32 })
    });
    expect(loadMapLayerSettings()).toEqual({ visible: true, opacity: 0.5 });
  });

  it("falls back to the default when storage throws", () => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => {
        throw new Error("blocked");
      }
    };
    expect(loadMapLayerSettings()).toEqual(DEFAULT_MAP_LAYER);
  });
});
