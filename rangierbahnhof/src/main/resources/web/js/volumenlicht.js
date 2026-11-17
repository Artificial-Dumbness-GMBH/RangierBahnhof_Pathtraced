import * as THREE from './lib/three.module.js';

const fragmentShader = /* glsl */ `
  uniform sampler2D bild;
  uniform sampler2D tiefe;
  uniform highp sampler2DShadow sonnenschatten;
  uniform mat4 inverseProjektion;
  uniform mat4 kameraWelt;
  uniform mat4 schattenMatrix;
  uniform vec3 sonnenRichtung;
  uniform vec3 sonnenFarbe;
  in vec2 bildUv;
  out vec4 ausgabe;
  #define gl_FragColor ausgabe

  float sonnenSichtbarkeit(vec3 punkt) {
    vec3 uvz = (schattenMatrix * vec4(punkt, 1.0)).xyz;
    if (any(lessThan(uvz, vec3(0.0))) || any(greaterThan(uvz, vec3(1.0)))) return 1.0;
    return texture(sonnenschatten, vec3(uvz.xy, uvz.z - 0.00035));
  }

  vec4 marschiere(vec3 ursprung, vec3 richtung, float strecke) {
    const float nebelHoehe = 21.0;
    const int schritte = 20;
    float anfang = 0.0;
    float ende = min(strecke, 240.0);

    // Nur den bodennahen Nebel zwischen Kamera und der ersten Oberfläche abtasten.
    if (abs(richtung.y) > 0.0001) {
      float unten = -ursprung.y / richtung.y;
      float oben = (nebelHoehe - ursprung.y) / richtung.y;
      anfang = max(anfang, min(unten, oben));
      ende = min(ende, max(unten, oben));
    } else if (ursprung.y < 0.0 || ursprung.y > nebelHoehe) {
      ende = 0.0;
    }
    if (ende <= anfang) return vec4(0.0, 0.0, 0.0, 1.0);

    float schrittweite = (ende - anfang) / float(schritte);
    // Pro Pixel unterschiedliche Startpunkte vermeiden sichtbare Stufen im Nebel.
    float offset = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float vorwaerts = 0.5 + 0.5 * dot(richtung, sonnenRichtung);
    float streuung = 0.55 + 0.75 * pow(vorwaerts, 4.0);
    vec3 himmelslicht = vec3(0.24, 0.36, 0.49);
    vec3 licht = vec3(0.0);
    float durchlass = 1.0;
    for (int i = 0; i < schritte; i++) {
      vec3 punkt = ursprung + richtung * (anfang + (float(i) + offset) * schrittweite);
      float struktur = sin(punkt.x * 0.10 + punkt.z * 0.15) * sin(punkt.z * 0.21 - punkt.x * 0.04);
      float dichte = (0.037 + 0.010 * struktur) * exp(-0.17 * punkt.y);
      dichte *= 1.0 - smoothstep(12.0, nebelHoehe, punkt.y);
      float durchSchritt = exp(-dichte * schrittweite);
      vec3 streulicht = himmelslicht + sonnenFarbe * (streuung * sonnenSichtbarkeit(punkt));
      licht += durchlass * (1.0 - durchSchritt) * streulicht;
      durchlass *= durchSchritt;
    }
    return vec4(licht, durchlass);
  }

  void main() {
    float z = texture(tiefe, bildUv).r * 2.0 - 1.0;
    vec4 sicht = inverseProjektion * vec4(bildUv * 2.0 - 1.0, z, 1.0);
    vec3 strahl = mat3(kameraWelt) * (sicht.xyz / sicht.w);
    float strecke = length(strahl);
    vec4 nebel = marschiere(kameraWelt[3].xyz, strahl / strecke, strecke);
    ausgabe = vec4(texture(bild, bildUv).rgb * nebel.a + nebel.rgb, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Zeichnet volumetrisches Licht anhand der Szenentiefe und der Schattenkarte. */
export class Volumenlicht {
  constructor(zeichner) {
    this.zeichner = zeichner;
    this.ziel = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
    });
    this.pufferGroesse = new THREE.Vector2();
    this.kamera = new THREE.Camera();
    this.szene = new THREE.Scene();
    this.uniforms = {
      bild: { value: this.ziel.texture },
      tiefe: { value: this.ziel.depthTexture },
      sonnenschatten: { value: null },
      inverseProjektion: { value: null },
      kameraWelt: { value: null },
      schattenMatrix: { value: null },
      sonnenRichtung: { value: new THREE.Vector3() },
      sonnenFarbe: { value: null },
    };
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        out vec2 bildUv;
        void main() {
          bildUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    const flaeche = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    flaeche.frustumCulled = false;
    this.szene.add(flaeche);
  }

  passeGroesseAn() {
    const groesse = this.zeichner.getDrawingBufferSize(this.pufferGroesse);
    this.ziel.setSize(groesse.x, groesse.y);
  }

  zeichne(szene, kamera, sonne) {
    this.zeichner.setRenderTarget(this.ziel);
    try {
      this.zeichner.render(szene, kamera);
    } finally {
      this.zeichner.setRenderTarget(null);
    }
    const u = this.uniforms;
    u.sonnenschatten.value = sonne.shadow.map.depthTexture;
    u.inverseProjektion.value = kamera.projectionMatrixInverse;
    u.kameraWelt.value = kamera.matrixWorld;
    u.schattenMatrix.value = sonne.shadow.matrix;
    u.sonnenRichtung.value.subVectors(sonne.position, sonne.target.position).normalize();
    u.sonnenFarbe.value = sonne.color;
    this.zeichner.render(this.szene, this.kamera);
  }
}
