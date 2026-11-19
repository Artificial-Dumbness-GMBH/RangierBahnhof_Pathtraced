import * as THREE from './lib/three.module.js';

export const reliefAktiv = { value: false };

const groesse = 128;
const profile = {
  gras:     { tiefe: 0.055, rauheit: 0.94, metall: 0 },
  schotter: { tiefe: 0.16, rauheit: 0.88, metall: 0 },
  ziegel:   { tiefe: 0.055, rauheit: 0.82, metall: 0 },
  holz:     { tiefe: 0.045, rauheit: 0.77, metall: 0 },
  lack:     { tiefe: 0.015, rauheit: 0.28, metall: 0.43 },
  stahl:    { tiefe: 0.020, rauheit: 0.23, metall: 0.90 },
};

// Versetzte, wiederholbare Steine mit abgerundeten Kuppen und tiefen Fugen.
function schotterTiefe(u, v) {
  const raster = 8;
  const x = u * raster, y = v * raster;
  const spalte = Math.floor(x), zeile = Math.floor(y);
  let distanz = 2;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const sx = spalte + i, sy = zeile + j;
      const k = ((sx + raster) % raster) + raster * ((sy + raster) % raster);
      const dx = x - sx - (0.25 + 0.5 * ((k * 37) % 67) / 67);
      const dy = y - sy - (0.25 + 0.5 * ((k * 53 + 19) % 71) / 71);
      distanz = Math.min(distanz, Math.hypot(dx, dy) / (0.42 + 0.20 * ((k * 29) % 59) / 59));
    }
  }
  return 0.13 + 0.84 * Math.min(1, distanz ** 1.45);
}

function tiefeBei(art, x, y) {
  x = (x + groesse) % groesse;
  y = (y + groesse) % groesse;
  const u = x / groesse;
  const v = y / groesse;
  const welle = (a, b) => Math.sin(2 * Math.PI * (a * u + b * v));
  const korn = 0.5 + 0.23 * welle(17, 11) + 0.18 * welle(31, -23);
  if (art === 'ziegel') {
    const zeile = Math.floor(y / 16);
    return y % 16 < 2 || (x + (zeile % 2 ? 0 : 16)) % 32 < 2 ? 0.92 : 0.13 + korn * 0.24;
  }
  if (art === 'holz') return x % 8 < 1 ? 0.85 : 0.18 + 0.19 * korn + 0.15 * welle(24, 1);
  if (art === 'stahl' || art === 'lack') return 0.36 + 0.15 * korn + 0.12 * welle(0, 29);
  if (art === 'gras') return 0.22 + 0.38 * korn + 0.15 * welle(9, 7);
  return schotterTiefe(u, v);
}

const kacheln = new Map();
const folgeTexturen = new WeakMap();

function textur(pixel) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = groesse;
  const ctx = canvas.getContext('2d');
  const bild = ctx.createImageData(groesse, groesse);
  for (let y = 0; y < groesse; y++) {
    for (let x = 0; x < groesse; x++) {
      bild.data.set([...pixel(x, y).map(wert => Math.round(255 * wert)), 255], (y * groesse + x) * 4);
    }
  }
  ctx.putImageData(bild, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function kachel(art) {
  if (kacheln.has(art)) return kacheln.get(art);
  const profil = profile[art];
  const daten = textur((x, y) => {
    const tiefe = tiefeBei(art, x, y);
    return [tiefe, profil.rauheit * (0.79 + 0.21 * tiefe), profil.metall * (1 - 0.2 * tiefe)];
  });
  const normal = textur((x, y) => {
    const dx = tiefeBei(art, x + 1, y) - tiefeBei(art, x - 1, y);
    const dy = tiefeBei(art, x, y - 1) - tiefeBei(art, x, y + 1);
    const laenge = Math.hypot(dx, dy, 1);
    return [0.5 + 0.5 * dx / laenge, 0.5 + 0.5 * dy / laenge, 0.5 + 0.5 / laenge];
  });
  const albedo = textur((x, y) => {
    const tiefe = tiefeBei(art, x, y);
    if (art === 'schotter') {
      const wert = 1 - 0.44 * tiefe;
      return [0.76 * wert, 0.72 * wert, 0.66 * wert];
    }
    const wert = 0.80 + 0.19 * (1 - tiefe);
    return [wert, wert, wert];
  });
  albedo.colorSpace = THREE.SRGBColorSpace;
  for (const t of [daten, normal, albedo]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  const paket = { daten, normal, albedo };
  kacheln.set(art, paket);
  return paket;
}

const parallaxShader = /* glsl */ `
uniform bool reliefAktiv;
uniform float reliefTiefe;

mat3 reliefBasis(vec3 position, vec3 n, vec2 dx, vec2 dy) {
  vec3 px = dFdx(position);
  vec3 py = dFdy(position);
  vec3 a = cross(py, n);
  vec3 b = cross(n, px);
  vec3 t = a * dx.x + b * dy.x;
  vec3 bit = a * dx.y + b * dy.y;
  float norm = inversesqrt(max(max(dot(t,t), dot(bit,bit)), 1e-20));
  return mat3(t * norm, bit * norm, n);
}

// xyz enthält die Texturkoordinate und die Tiefe des Schnittpunkts.
vec3 marschiereRelief(vec2 uv, vec3 blick, float relief, vec2 dx, vec2 dy) {
  vec2 versatz = blick.xy * relief / max(blick.z, 0.25);
  const float schicht = 1.0 / 24.0;
  vec2 schritt = versatz * schicht;
  float tiefe = 0.0;
  float abstand = textureGrad(roughnessMap, uv, dx, dy).r;
  float vorher = abstand;
  for (int i = 0; i < 24; i++) {
    if (abstand <= 0.0) break;
    vorher = abstand;
    uv -= schritt;
    tiefe += schicht;
    abstand = textureGrad(roughnessMap, uv, dx, dy).r - tiefe;
  }
  float anteil = -abstand / max(vorher - abstand, 1e-5);
  return vec3(uv + schritt * anteil, tiefe - schicht * anteil);
}

// Ein zweiter Strahl läuft vom gefundenen Punkt zum Scheinwerfer.
// Höhere Stellen der Tiefenkarte können diesen Lichtstrahl abschatten.
float reliefSchatten(vec3 treffer, vec3 licht, float relief, vec2 dx, vec2 dy) {
  if (licht.z <= 0.0) return 1.0;
  vec2 weg = licht.xy * relief / max(licht.z, 0.16);
  float schritt = treffer.z / 12.0;
  float blockiert = 0.0;
  for (int i = 1; i <= 12; i++) {
    float hoehe = float(i) * schritt;
    float tiefe = textureGrad(roughnessMap, treffer.xy + weg * hoehe, dx, dy).r;
    blockiert = max(blockiert, treffer.z - hoehe - tiefe);
  }
  return 1.0 - 0.85 * smoothstep(0.02, 0.18, blockiert);
}
`;

export function pbrMaterial(farbe, art, karte = null) {
  const paket = kachel(art);
  const map = karte ?? paket.albedo;
  let texturen = folgeTexturen.get(map);
  if (!texturen) {
    texturen = new Map();
    folgeTexturen.set(map, texturen);
  }
  if (!texturen.has(art)) {
    const angleichen = vorlage => {
      if (map === paket.albedo) return vorlage;
      const t = vorlage.clone();
      t.wrapS = map.wrapS;
      t.wrapT = map.wrapT;
      t.repeat.copy(map.repeat);
      return t;
    };
    texturen.set(art, { daten: angleichen(paket.daten), normal: angleichen(paket.normal) });
  }
  const { daten, normal } = texturen.get(art);
  const material = new THREE.MeshStandardMaterial({
    color: farbe, map, roughnessMap: daten, metalnessMap: daten, normalMap: normal,
    roughness: 1, metalness: profile[art].metall > 0 ? 1 : 0,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.reliefAktiv = reliefAktiv;
    shader.uniforms.reliefTiefe = { value: profile[art].tiefe };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <roughnessmap_pars_fragment>', '#include <roughnessmap_pars_fragment>\n' + parallaxShader)
      .replace('#include <map_fragment>', /* glsl */ `
        vec2 reliefDx = dFdx(vMapUv);
        vec2 reliefDy = dFdy(vMapUv);
        vec2 materialUv = vMapUv;
        vec3 reliefTreffer = vec3(materialUv, 0.0);
        mat3 basis = mat3(1.0);
        float tiefe = 0.0;
        if (reliefAktiv) {
          float pixelbreite = max(length(reliefDx), length(reliefDy));
          tiefe = reliefTiefe * (1.0 - smoothstep(0.045, 0.17, pixelbreite));
          if (tiefe > 0.0) {
            basis = reliefBasis(-vViewPosition, normalize(vNormal), reliefDx, reliefDy);
            reliefTreffer = marschiereRelief(vMapUv, normalize(vViewPosition) * basis, tiefe, reliefDx, reliefDy);
            materialUv = reliefTreffer.xy;
          }
        }
        diffuseColor *= textureGrad(map, materialUv, reliefDx, reliefDy);
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * textureGrad(roughnessMap, materialUv, reliefDx, reliefDy).g;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * textureGrad(metalnessMap, materialUv, reliefDx, reliefDy).b;')
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
        'getSpotLightInfo( spotLight, geometryPosition, directLight );', /* glsl */ `
          getSpotLightInfo( spotLight, geometryPosition, directLight );
          if (tiefe > 0.0 && directLight.visible) {
            directLight.color *= reliefSchatten(reliefTreffer, directLight.direction * basis, tiefe, reliefDx, reliefDy);
          }
        `))
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replaceAll(
        'texture2D( normalMap, vNormalMapUv )', 'textureGrad( normalMap, materialUv, reliefDx, reliefDy )'));
  };
  return material;
}
