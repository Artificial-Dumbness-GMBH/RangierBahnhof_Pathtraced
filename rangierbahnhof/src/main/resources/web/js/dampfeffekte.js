import * as THREE from './lib/three.module.js';

const RAUCHDAUER = 4;
const PILZDAUER = 12;
const vertexShader = /* glsl */ `
varying vec3 lokal;
varying vec4 clipOrt;
void main() {
  lokal = position;
  clipOrt = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = clipOrt;
}`;

const fragmentShader = /* glsl */ `
varying vec3 lokal;
varying vec4 clipOrt;
uniform vec3 auge;
uniform float alter, deckkraft, variante;
uniform bool pilz, pfadtiefe;
uniform sampler2D szenentiefe;
uniform vec2 clipGrenzen;

float hash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float rauschen(vec3 p) {
  vec3 z = floor(p), u = fract(p);
  u = u*u*(3.0-2.0*u);
  return mix(mix(mix(hash3(z), hash3(z+vec3(1,0,0)), u.x),
                 mix(hash3(z+vec3(0,1,0)), hash3(z+vec3(1,1,0)), u.x), u.y),
             mix(mix(hash3(z+vec3(0,0,1)), hash3(z+vec3(1,0,1)), u.x),
                 mix(hash3(z+vec3(0,1,1)), hash3(z+vec3(1)), u.x), u.y), u.z);
}

void main() {
  // Die Rückseite des Einheitswürfels ist der Austritt, auch bei einer Kamera im Rauch.
  vec3 strahl = normalize(lokal - auge);
  vec3 inv = 1.0 / mix(strahl, vec3(1e-8), lessThan(abs(strahl), vec3(1e-8)));
  vec3 nah = min((-1.0-auge)*inv, (1.0-auge)*inv);
  float start = max(0.0, max(nah.x, max(nah.y, nah.z)));
  float ende = length(lokal - auge);
  vec4 tiefe = texture2D(szenentiefe, 0.5 + 0.5 * clipOrt.xy / clipOrt.w);
  float n = clipGrenzen.x, f = clipGrenzen.y;
  float z = pfadtiefe ? (tiefe.a > 0.0 ? tiefe.a : f) : n*f/(f-tiefe.r*(f-n));
  ende = min(ende, z * ende / clipOrt.w);
  if (ende <= start) discard;
  int anzahl = pilz ? 44 : 16;
  float schritt = (ende-start) / float(anzahl);
  vec3 farbe = vec3(0.0);
  float alpha = 0.0;
  for (int i=0; i<44; i++) {
    if (i >= anzahl || alpha > 0.985) break;
    vec3 p = auge + strahl * (start + (float(i)+0.5)*schritt);
    float radius = length(p.xz);
    float form = 1.0-length(p);
    if (pilz) {
      float hut = 1.0-length(vec3(p.x/0.89,(p.y-0.49)/0.43,p.z/0.89));
      float stiel = 1.0-length(vec3(p.x/0.23,(p.y+0.22)/0.79,p.z/0.23));
      float fuss = 1.0-length(vec3(p.x/0.75,(p.y+0.89)/0.11,p.z/0.75));
      form = max(hut,max(stiel,fuss));
    }
    if (form < -0.12) continue;
    vec3 q = p*4.5 + vec3(variante,-alter*0.33,0.0);
    float wirbel = 0.68*rauschen(q) + 0.32*rauschen(q*2.2);
    float dichte = smoothstep(0.0,0.55,form + (wirbel-0.49)*0.75);
    float deckung = 1.0-exp(-dichte * schritt * (pilz ? 6.5 : 2.8) * deckkraft);
    vec3 licht = mix(vec3(0.14,0.18,0.22),vec3(0.70,0.76,0.81),wirbel);
    if (pilz) {
      float glut = exp(-alter*0.38) * (1.35-0.55*radius);
      licht = mix(vec3(0.09,0.075,0.07),vec3(0.54,0.43,0.35),wirbel)
            + vec3(4.8,1.45,0.19)*glut*(0.45+wirbel);
    }
    farbe += (1.0-alpha)*deckung*licht;
    alpha += (1.0-alpha)*deckung;
  }
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(farbe / alpha, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Dampfeffekte {
  constructor(szene, lok) {
    this.lok = lok;
    this.takt = 0;
    this.waerme = 0;
    this.szenentiefe = { value: null };
    this.pfadtiefe = { value: false };
    this.clipGrenzen = { value: new THREE.Vector2() };
    const geometrie = new THREE.BoxGeometry(2, 2, 2);
    const volumen = pilz => {
      const uniforms = {
        szenentiefe: this.szenentiefe, pfadtiefe: this.pfadtiefe, clipGrenzen: this.clipGrenzen,
        auge: { value: new THREE.Vector3() }, pilz: { value: pilz },
        alter: { value: 0 }, deckkraft: { value: 1 }, variante: { value: 0 },
      };
      const objekt = new THREE.Mesh(geometrie, new THREE.ShaderMaterial({
        vertexShader, fragmentShader, uniforms, transparent: true,
        side: THREE.BackSide, depthWrite: false, depthTest: false,
      }));
      objekt.visible = false;
      objekt.userData.ohneSchatten = true;
      objekt.onBeforeRender = (renderer, scene, kamera) => {
        kamera.getWorldPosition(uniforms.auge.value);
        objekt.worldToLocal(uniforms.auge.value);
      };
      szene.add(objekt);
      return objekt;
    };
    this.pilz = volumen(true);
    this.rauch = Array.from({ length: 24 }, () => volumen(false));
    this.tiefenMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    this.tiefe = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) });
    this.bildgroesse = new THREE.Vector2();
  }

  get sichtbar() { return this.pilz.visible || this.rauch.some(w => w.visible); }

  setzeTiefe(textur, kamera, pfad) {
    this.szenentiefe.value = textur;
    this.pfadtiefe.value = pfad;
    this.clipGrenzen.value.set(kamera.near, kamera.far);
  }

  rasterTiefe(zeichner, szene, kamera) {
    const ziel = zeichner.getRenderTarget();
    const groesse = this.bildgroesse;
    if (ziel) groesse.set(ziel.width, ziel.height);
    else zeichner.getDrawingBufferSize(groesse);
    this.tiefe.setSize(Math.max(1, Math.ceil(groesse.x/2)), Math.max(1, Math.ceil(groesse.y/2)));
    const versteckt = [];
    const material = szene.overrideMaterial, hintergrund = szene.background;
    const schatten = zeichner.shadowMap.autoUpdate;
    szene.traverseVisible(o => {
      if (o.isSprite || o.userData.ohneSchatten) versteckt.push(o);
    });
    try {
      for (const o of versteckt) o.visible = false;
      szene.overrideMaterial = this.tiefenMaterial;
      szene.background = null;
      zeichner.shadowMap.autoUpdate = false;
      zeichner.setRenderTarget(this.tiefe);
      zeichner.render(szene, kamera);
    } finally {
      for (const o of versteckt) o.visible = true;
      szene.overrideMaterial = material;
      szene.background = hintergrund;
      zeichner.shadowMap.autoUpdate = schatten;
      zeichner.setRenderTarget(ziel);
    }
    this.setzeTiefe(this.tiefe.depthTexture, kamera, false);
  }

  explodiere() {
    this.lok.gruppe.getWorldPosition(this.pilz.position);
    this.boden = this.pilz.position.y;
    this.pilz.material.uniforms.alter.value = 0;
    this.pilz.material.uniforms.variante.value = Math.random()*30;
    this.pilz.visible = true;
    this.waerme = 0;
    this.takt = 0;
    this.schritt(0, 0);
  }

  schritt(dt, fahrzeit) {
    if (this.pilz.visible) {
      const u = this.pilz.material.uniforms;
      const t = u.alter.value += dt;
      const breite = 4 + 74*(1-Math.exp(-t*0.95));
      const hoehe = 3 + 46*(1-Math.exp(-t*0.72));
      this.pilz.scale.set(breite, hoehe, breite);
      this.pilz.position.y = this.boden + hoehe;
      u.deckkraft.value = 1 - THREE.MathUtils.smoothstep(t, 6, PILZDAUER);
      this.pilz.visible = t < PILZDAUER;
    }
    for (const w of this.rauch) {
      if (!w.visible) continue;
      const u = w.material.uniforms;
      const t = u.alter.value += dt;
      w.position.x += 0.7*dt;
      w.position.y += (2.3+this.waerme)*dt;
      w.scale.setScalar(0.45 + t*0.72);
      u.deckkraft.value = 0.87*(1-t/RAUCHDAUER);
      w.visible = t < RAUCHDAUER;
    }
    this.waerme = THREE.MathUtils.clamp(this.waerme + (fahrzeit > 0 ? fahrzeit/22 : -dt/12), 0, 1);
    if (fahrzeit <= 0 || !this.lok.gruppe.visible) return;
    this.takt -= dt;
    if (this.takt > 0) return;
    this.takt = 0.4 - 0.21*this.waerme;
    const w = this.rauch.find(wolke => !wolke.visible);
    if (!w) return;
    this.lok.gruppe.localToWorld(w.position.copy(this.lok.schornstein));
    w.scale.setScalar(0.45);
    w.material.uniforms.alter.value = 0;
    w.material.uniforms.deckkraft.value = 0.87;
    w.material.uniforms.variante.value = Math.random()*30;
    w.visible = true;
  }
}
