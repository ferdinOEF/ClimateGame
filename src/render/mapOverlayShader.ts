import * as THREE from "three";

/*
 * The OpenStreetMap street-map layer as a patch on MeshStandardMaterial,
 * shared by the terrain and by the decorative skirt around the board.
 */

/**
 * The OpenStreetMap layer, as shader uniforms shared by every terrain material.
 *
 * One object, referenced by all five materials, so a toggle or an opacity
 * change is one write that every terrain type sees on its next frame. The
 * placeholder texture is a single white pixel: a sampler has to be bound to
 * something, and opacity 0 means it is never mixed in anyway.
 */
export const OVERLAY_PLACEHOLDER = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
OVERLAY_PLACEHOLDER.needsUpdate = true;

export interface OverlayUniforms {
  uOsmMap: { value: THREE.Texture };
  /** World x, z of the image's north-west corner, then its width and depth. */
  uOsmRect: { value: THREE.Vector4 };
  uOsmOpacity: { value: number };
}

/**
 * Projects the map layer onto the tops of the hexes, by world position.
 *
 * Patched into the standard material rather than drawn as a separate plane,
 * for three reasons:
 *
 *   - It sits on each hex at that hex's own height, so it follows the terrain
 *     steps, the water swell and the settle animation without any of them
 *     knowing it exists.
 *   - It goes in before lighting, so a storm darkens the map with the board
 *     and the sun shades it like any other surface.
 *   - Elements, creatures, monuments and hazard overlays are separate meshes
 *     above the terrain, so they draw on top of it for free. A plane floating
 *     above the hexes would have had to be pushed back under all of them with
 *     depth tricks, and would have looked flat over the stepped terrain.
 *
 * The sampling is by world x/z, against the rectangle the map generator wrote
 * from the same projection that placed the hexes — which is what makes the
 * layer line up. Only top faces take it (`vOsmTop`): a hex wall drawn with the
 * map would smear one column of pixels down its whole height.
 *
 * The tile colour still shows through at `1 - opacity`, so terrain stays
 * readable with the layer on, and the per-instance tint (the flood telegraph's
 * darkening) is mixed with it rather than lost.
 */
export function patchForOverlay(
  material: THREE.MeshStandardMaterial,
  uniforms: OverlayUniforms,
  strength: number,
  options: { fadeAttribute?: boolean } = {}
): void {
  // Per material, so each terrain type mixes the map in by its own amount.
  const uOsmStrength = { value: strength };
  /*
   * `fadeAttribute`: the mesh carries a per-instance `aFade` (0 at the board,
   * rising to 1 at the outer edge of the skirt around it). The map fades out
   * with it, and samples are clamped to the image's edge, because the skirt
   * reaches past the picture on the south and east.
   */
  const fade = options.fadeAttribute === true;
  // Three caches compiled programs by `onBeforeCompile.toString()`, which is
  // the same text with or without the fade. Without its own key a skirt mesh
  // could be handed the terrain's program, which has no `aFade` at all.
  material.customProgramCacheKey = () => (fade ? "osm-overlay-fade" : "osm-overlay");
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uOsmStrength });
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec2 vOsmWorld;\nvarying float vOsmTop;\nvarying float vOsmFade;\n${fade ? "attribute float aFade;" : ""}`
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 osmWorld = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          osmWorld = instanceMatrix * osmWorld;
        #endif
        osmWorld = modelMatrix * osmWorld;
        vOsmWorld = osmWorld.xz;
        vOsmTop = step( 0.5, normal.y );
        vOsmFade = ${fade ? "aFade" : "0.0"};`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `${fade ? "#define OSM_FADE\n" : ""}#include <common>\nuniform sampler2D uOsmMap;\nuniform vec4 uOsmRect;\nuniform float uOsmOpacity;\nuniform float uOsmStrength;\nvarying vec2 vOsmWorld;\nvarying float vOsmTop;\nvarying float vOsmFade;`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        if ( uOsmOpacity > 0.0 && vOsmTop > 0.5 ) {
          vec2 osmUv = ( vOsmWorld - uOsmRect.xy ) / uOsmRect.zw;
          // Image row 0 is the north edge, the smallest world z: flip v.
          vec2 osmSample = clamp( vec2( osmUv.x, 1.0 - osmUv.y ), 0.0, 1.0 );
          #ifdef OSM_FADE
            // The skirt reaches past the picture on the south and east. Past
            // its edge, sample a coarse mipmap level instead of smearing the
            // last row of pixels: that is the map's regional colour, blurred,
            // so its tones carry on into the hills and sea with no line where
            // the picture stops. The map also thins out ring by ring.
            vec2 osmOut = max( -osmUv, osmUv - 1.0 );
            float osmOutside = max( max( osmOut.x, osmOut.y ), 0.0 );
            float osmLod = clamp( osmOutside * 500.0 + vOsmFade * 2.0, 0.0, 7.0 );
            vec3 osm = textureLod( uOsmMap, osmSample, osmLod ).rgb;
            float osmMix = clamp( uOsmOpacity * uOsmStrength, 0.0, 1.0 ) * ( 1.0 - 0.75 * vOsmFade );
            diffuseColor.rgb = mix( diffuseColor.rgb, osm, osmMix );
          #else
            if ( osmUv.x >= 0.0 && osmUv.x <= 1.0 && osmUv.y >= 0.0 && osmUv.y <= 1.0 ) {
              vec3 osm = texture2D( uOsmMap, osmSample ).rgb;
              diffuseColor.rgb = mix( diffuseColor.rgb, osm, clamp( uOsmOpacity * uOsmStrength, 0.0, 1.0 ) );
            }
          #endif
        }`
      );
  };
}

