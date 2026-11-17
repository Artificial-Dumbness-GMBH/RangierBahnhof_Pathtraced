import * as THREE from './lib/three.module.js';

const vertexShader = `out vec2 bildUv;
void main() { bildUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const fragmentShader = /* glsl */ `
in vec2 bildUv;
out vec4 ausgabe;
uniform sampler2D dreiecke, knoten, atlas, vorher;
uniform mat4 inverseProjektion, kameraWelt;
uniform vec2 aufloesung;
uniform vec3 sonnenRichtung, sonnenFarbe;
uniform float samples, saat;
uniform bool nebelAktiv;
uint rng;
float zufall() {
  rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5;
  return float(rng) / 4294967296.0;
}
vec4 daten(sampler2D t, int i) {
  int b = textureSize(t, 0).x;
  return texelFetch(t, ivec2(i % b, i / b), 0);
}
bool boxTreffer(vec3 o, vec3 d, vec3 unten, vec3 oben, float ende) {
  vec3 inv = 1.0 / mix(d, vec3(1e-20), lessThan(abs(d), vec3(1e-20)));
  vec3 a = (unten - o) * inv, b = (oben - o) * inv;
  vec3 nah = min(a,b), fern = max(a,b);
  return max(max(nah.x,nah.y),max(nah.z,0.0)) <= min(min(fern.x,fern.y),min(fern.z,ende));
}
// BVH mit maximal acht Dreiecken pro Blatt. Auch Schattenstrahlen verwenden
// die vollständige Geometrie, einschließlich der InstancedMeshes.
int treffer(vec3 o, vec3 d, out float distanz, out vec2 bary, bool schatten) {
  int stapel[64]; int anzahl = 1; stapel[0] = 0;
  int gefunden = -1; distanz = 1e20;
  while (anzahl > 0) {
    int k = stapel[--anzahl];
    vec4 a = daten(knoten,k*2), b = daten(knoten,k*2+1);
    if (!boxTreffer(o,d,a.xyz,b.xyz,distanz)) continue;
    if (a.w >= 0.0) { stapel[anzahl++] = int(a.w); stapel[anzahl++] = int(b.w); continue; }
    int start = int(-a.w-1.0);
    for (int j=0; j<8; j++) {
      if (j >= int(b.w)) break;
      int t = (start+j)*11;
      vec3 v = daten(dreiecke,t).xyz;
      vec3 e1 = daten(dreiecke,t+1).xyz-v, e2 = daten(dreiecke,t+2).xyz-v;
      vec3 p = cross(d,e2); float det = dot(e1,p);
      if (abs(det)<1e-9) continue;
      vec3 s = o-v; float u = dot(s,p)/det;
      vec3 q = cross(s,e1); float w = dot(d,q)/det;
      float l = dot(e2,q)/det;
      if (u<0.0 || w<0.0 || u+w>1.0 || l<0.001 || l>=distanz) continue;
      distanz=l; bary=vec2(u,w); gefunden=start+j;
      if (schatten) return gefunden;
    }
  }
  return gefunden;
}
vec3 halbkugel(vec3 n) {
  float phi = 6.2831853*zufall(), r = sqrt(zufall());
  vec3 t = normalize(cross(abs(n.y)<0.99 ? vec3(0,1,0) : vec3(1,0,0),n));
  return normalize(t*(r*cos(phi))+cross(n,t)*(r*sin(phi))+n*sqrt(1.0-r*r));
}
vec3 himmel(vec3 d) { return mix(vec3(0.72,0.83,0.91),vec3(0.22,0.45,0.72),sqrt(max(d.y,0.0))); }
void main() {
  rng = uint(gl_FragCoord.x)*1973u + uint(gl_FragCoord.y)*9277u + uint(saat)*26699u + 1u;
  vec2 uv = bildUv + (vec2(zufall(),zufall())-0.5)/aufloesung;
  vec4 v = inverseProjektion*vec4(uv*2.0-1.0,1.0,1.0);
  vec3 d = normalize(mat3(kameraWelt)*v.xyz), o = kameraWelt[3].xyz;
  vec3 licht=vec3(0), gewicht=vec3(1);
  for (int bounce=0; bounce<5; bounce++) {
    float l; vec2 bary; int hit=treffer(o,d,l,bary,false);
    // Bodennaher Nebel auf dem Kamerastrahl, mit geometrischen Sonnenschatten.
    if (bounce==0 && nebelAktiv) {
      float start=0.0, ende=min(l,240.0);
      if (abs(d.y)>0.0001) {
        float a=-o.y/d.y, b=(21.0-o.y)/d.y;
        start=max(start,min(a,b)); ende=min(ende,max(a,b));
      } else if (o.y<0.0 || o.y>21.0) ende=0.0;
      if (ende>start) {
        float schritt=(ende-start)/12.0;
        float offset=zufall();
        for(int j=0;j<12;j++) {
          vec3 p=o+d*(start+(float(j)+offset)*schritt);
          float rho=(0.037+0.01*sin(p.x*0.1+p.z*0.15)*sin(p.z*0.21-p.x*0.04))*exp(-0.17*p.y);
          float tau=exp(-rho*(1.0-smoothstep(12.0,21.0,p.y))*schritt);
          float sl; vec2 sb;
          float sicht=treffer(p,sonnenRichtung,sl,sb,true)<0 ? 1.0 : 0.0;
          licht+=gewicht*(1.0-tau)*(vec3(0.24,0.36,0.49)+sonnenFarbe/2.9*sicht*(0.55+0.75*pow(0.5+0.5*dot(d,sonnenRichtung),4.0)));
          gewicht*=tau;
        }
      }
    }
    if(hit<0) { licht+=gewicht*himmel(d); break; }
    int t=hit*11;
    vec3 n=normalize(daten(dreiecke,t+3).xyz*(1.0-bary.x-bary.y)+daten(dreiecke,t+4).xyz*bary.x+daten(dreiecke,t+5).xyz*bary.y);
    if(dot(n,d)>0.0) n=-n;
    vec4 farbe=daten(dreiecke,t+8), emission=daten(dreiecke,t+9), karte=daten(dreiecke,t+10);
    vec3 albedo=farbe.rgb;
    vec3 emissiv=emission.rgb;
    if(karte.x>=0.0) {
      vec4 ab=daten(dreiecke,t+6); vec2 c=daten(dreiecke,t+7).xy;
      vec2 texUv=ab.xy*(1.0-bary.x-bary.y)+ab.zw*bary.x+c*bary.y;
      texUv=mix(clamp(texUv,0.0,1.0),fract(texUv),karte.zw);
      float raster=karte.y;
      vec2 tile=vec2(mod(karte.x,raster),floor(karte.x/raster));
      // Ein Pixel Rand pro Kachel verhindert Überbluten benachbarter Karten.
      vec2 atlasUv=(tile*258.0+1.0+texUv*255.0+0.5)/(raster*258.0);
      vec3 s=texture(atlas,atlasUv).rgb;
      vec3 texel=mix(s/12.92,pow((s+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),s));
      albedo*=texel;
    }
    licht+=gewicht*emissiv;
    vec3 p=o+d*l+n*0.003;
    // Diffuse/reflektierende Mischung; die Auswahlwahrscheinlichkeit kürzt
    // sich mit dem jeweiligen BRDF-Gewicht heraus.
    float metall=farbe.a, rau=emission.a;
    float fresnel=0.04+0.96*pow(1.0-max(dot(-d,n),0.0),5.0);
    float spiegel=mix(fresnel,1.0,metall);
    if(zufall()<spiegel) {
      d=normalize(mix(reflect(d,n),halbkugel(n),rau*rau));
      if(dot(d,n)<=0.0) break;
      gewicht*=mix(vec3(1),albedo,metall);
    } else {
      float sl; vec2 sb;
      // Kleine Sonnenscheibe für weiche Schatten.
      vec3 sd=normalize(sonnenRichtung+halbkugel(sonnenRichtung)*0.00465);
      if(treffer(p,sd,sl,sb,true)<0) licht+=gewicht*albedo*sonnenFarbe*max(dot(n,sd),0.0)/3.14159265;
      gewicht*=albedo;
      d=halbkugel(n);
    }
    o=p;
    if(bounce>=2) {
      float chance=clamp(max(gewicht.r,max(gewicht.g,gewicht.b)),0.1,0.95);
      if(zufall()>chance) break;
      gewicht/=chance;
    }
  }
  vec3 alt = samples>0.0 ? texture(vorher,bildUv).rgb : vec3(0);
  ausgabe=vec4(alt+(licht-alt)/(samples+1.0),1);
}`;

function datenTextur(werte, breite) {
  const hoehe = Math.max(1, Math.ceil(werte.length / 4 / breite));
  const daten = new Float32Array(breite * hoehe * 4);
  daten.set(werte);
  const t = new THREE.DataTexture(daten, breite, hoehe, THREE.RGBAFormat, THREE.FloatType);
  t.needsUpdate = true;
  return t;
}

/** Eigenständiger WebGL2-Pathtracer; keine externen Laufzeitabhängigkeiten. */
export class Pathtracing {
  constructor(zeichner) {
    this.zeichner = zeichner;
    this.samples = 0;
    this.saat = 0;
    this.signatur = '';
    this.meshCache = new Map();
    this.maps = [];
    this.groesse = new THREE.Vector2();
    this.ziele = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.FloatType, depthBuffer: false,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    }));
    this.uniforms = {
      dreiecke: { value: null }, knoten: { value: null }, atlas: { value: null },
      vorher: { value: this.ziele[0].texture },
      inverseProjektion: { value: null }, kameraWelt: { value: null },
      aufloesung: { value: new THREE.Vector2(1, 1) },
      sonnenRichtung: { value: new THREE.Vector3() }, sonnenFarbe: { value: new THREE.Color() },
      samples: { value: 0 }, saat: { value: 0 }, nebelAktiv: { value: false },
    };
    this.kamera = new THREE.Camera();
    this.szene = new THREE.Scene();
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, uniforms: this.uniforms, vertexShader, fragmentShader,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.szene.add(this.quad);
    this.ausgabe = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, uniforms: { bild: { value: null } }, vertexShader,
      fragmentShader: `in vec2 bildUv; out vec4 ausgabe; uniform sampler2D bild;
        #define gl_FragColor ausgabe
        void main() { ausgabe=vec4(texture(bild,bildUv).rgb,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`, depthTest: false, depthWrite: false,
    });
  }

  passeGroesseAn() {
    this.zeichner.getDrawingBufferSize(this.groesse);
    // Begrenzte interne Auflösung hält den Modus auch auf integrierten GPUs nutzbar.
    const faktor = Math.min(1, 960 / this.groesse.x, 540 / this.groesse.y);
    const b = Math.max(1, Math.floor(this.groesse.x * faktor));
    const h = Math.max(1, Math.floor(this.groesse.y * faktor));
    for (const ziel of this.ziele) ziel.setSize(b, h);
    this.uniforms.aufloesung.value.set(b, h);
    this.samples = 0;
  }

  aktualisiere(szene) {
    szene.updateMatrixWorld(true);
    const meshes = [];
    szene.traverseVisible(o => {
      if (o.isMesh && !o.isSprite && !o.userData.ohneSchatten) meshes.push(o);
    });
    const schluessel = meshes.map(o => [o.id, o.geometry.uuid, o.geometry.attributes.position?.version, o.geometry.attributes.normal?.version,
      o.geometry.attributes.uv?.version, o.geometry.index?.version, o.geometry.drawRange.start, o.geometry.drawRange.count,
      ...o.matrixWorld.elements, o.count ?? '', o.instanceMatrix?.version ?? '', o.instanceColor?.version ?? '',
      ...(Array.isArray(o.material) ? o.material : [o.material]).flatMap(m =>
        [m.uuid, m.visible, m.color?.getHex(), m.emissive?.getHex(), m.emissiveIntensity, m.roughness, m.metalness, m.opacity, m.map?.version, m.map?.repeat.toArray(), m.map?.offset.toArray(), m.map?.rotation])].join(','));
    const signatur = schluessel.join(';');
    if (signatur === this.signatur) return false;
    this.signatur = signatur;
    const maps = [...new Set(meshes.flatMap(o => (Array.isArray(o.material) ? o.material : [o.material]).map(m => m.map).filter(m => m?.image)))];
    if (maps.length !== this.maps.length || maps.some((m,i) => m !== this.maps[i])) this.meshCache.clear();
    this.maps = maps;
    const dreiecke = [];
    const lebend = new Set(meshes.map(o => o.id));
    for (const id of this.meshCache.keys()) if (!lebend.has(id)) this.meshCache.delete(id);
    const v = new THREE.Vector3(), n = new THREE.Vector3(), uv = new THREE.Vector2();
    const matrix = new THREE.Matrix4(), instanz = new THREE.Matrix4(), normal = new THREE.Matrix3();
    const farbe = new THREE.Color(), instanzFarbe = new THREE.Color();
    for (const [meshIndex, o] of meshes.entries()) {
      const cache = this.meshCache.get(o.id);
      if (cache?.signatur === schluessel[meshIndex]) { dreiecke.push(...cache.dreiecke); continue; }
      const anfang = dreiecke.length;
      const g = o.geometry, pos = g.attributes.position, normals = g.attributes.normal;
      if (!pos) continue;
      for (let k = 0; k < (o.isInstancedMesh ? o.count : 1); k++) {
        matrix.copy(o.matrixWorld);
        if (o.isInstancedMesh) { o.getMatrixAt(k, instanz); matrix.multiply(instanz); }
        normal.getNormalMatrix(matrix);
        instanzFarbe.setRGB(1, 1, 1);
        if (o.instanceColor) o.getColorAt(k, instanzFarbe);
        const ende = Math.min(g.index?.count ?? pos.count, g.drawRange.start + g.drawRange.count);
        for (let i = g.drawRange.start; i < ende; i += 3) {
          const gruppe = g.groups.find(gr => i >= gr.start && i < gr.start + gr.count);
          const m = Array.isArray(o.material) ? o.material[gruppe?.materialIndex ?? 0] : o.material;
          if (!m || !m.visible || (m.transparent && m.opacity < 0.5)) continue;
          const t = new Float32Array(44);
          farbe.copy(m.color ?? instanzFarbe).multiply(instanzFarbe);
          const map = m.map;
          let mapId = -1;
          if (map?.image) { mapId = maps.indexOf(map); if (mapId < 0) { mapId = maps.length; maps.push(map); } map.updateMatrix(); }
          for (let j = 0; j < 3; j++) {
            const index = g.index ? g.index.getX(i+j) : i+j;
            v.fromBufferAttribute(pos,index).applyMatrix4(matrix).toArray(t,j*4);
            if (normals) n.fromBufferAttribute(normals,index).applyNormalMatrix(normal).toArray(t,12+j*4);
            if (g.attributes.uv) {
              uv.fromBufferAttribute(g.attributes.uv,index);
              if (map) uv.applyMatrix3(map.matrix);
              // CanvasTexture wird von WebGL standardmäßig vertikal gespiegelt.
              if (map?.flipY) uv.y=1-uv.y;
              uv.toArray(t,24+j*2);
            }
          }
          if (!normals) {
            const a=new THREE.Vector3().fromArray(t), b=new THREE.Vector3().fromArray(t,4), c=new THREE.Vector3().fromArray(t,8);
            n.subVectors(b,a).cross(c.sub(a)).normalize();
            for(let j=0;j<3;j++) n.toArray(t,12+j*4);
          }
          farbe.toArray(t,32); t[35]=m.metalness ?? 0;
          if (m.emissive) m.emissive.clone().multiplyScalar(m.emissiveIntensity ?? 1).toArray(t,36);
          if (m.isMeshBasicMaterial) { farbe.toArray(t,36); t.fill(0,32,35); }
          t[39]=m.roughness ?? 1;
          t[40]=mapId; t[42]=map?.wrapS === THREE.RepeatWrapping ? 1 : 0; t[43]=map?.wrapT === THREE.RepeatWrapping ? 1 : 0;
          dreiecke.push(t);
        }
      }
      // Existierende Dreiecke behalten ihre Identität: bei Fahrzeugbewegungen
      // können BVH und Texturatlas weiterverwendet werden.
      const neu = dreiecke.slice(anfang);
      if (cache && cache.dreiecke.length === neu.length) {
        neu.forEach((t,i) => { cache.dreiecke[i].set(t); dreiecke[anfang+i]=cache.dreiecke[i]; });
      }
      this.meshCache.set(o.id, { signatur: schluessel[meshIndex], dreiecke: dreiecke.slice(anfang) });
    }
    const raster = Math.max(1, Math.ceil(Math.sqrt(maps.length)));
    const atlasSignatur = maps.map(m => `${m.uuid}:${m.version}`).join(',');
    let atlas = this.uniforms.atlas.value;
    if (atlasSignatur !== this.atlasSignatur || !atlas) {
      const canvas = document.createElement('canvas'); canvas.width=canvas.height=raster*258;
      if (canvas.width > this.zeichner.capabilities.maxTextureSize) throw new Error('Texturatlas überschreitet die GPU-Grenze.');
      const ctx=canvas.getContext('2d');
      maps.forEach((m,i) => ctx.drawImage(m.image,(i%raster)*258+1,Math.floor(i/raster)*258+1,256,256));
      atlas?.dispose();
      atlas=new THREE.CanvasTexture(canvas); atlas.flipY=false; atlas.generateMipmaps=false;
      this.atlasSignatur=atlasSignatur;
    }
    for (const t of dreiecke) t[41]=raster;
    const gleicheTopologie = this.primitive?.length === dreiecke.length && dreiecke.every((t,i)=>t===this.primitive[i]);
    let nodes=[], sortiert=[];
    function baue(ts) {
      const id=nodes.length/8, a=[Infinity,Infinity,Infinity], b=[-Infinity,-Infinity,-Infinity];
      for(const t of ts) for(let j=0;j<3;j++) for(let k=0;k<3;k++) { a[k]=Math.min(a[k],t[j*4+k]); b[k]=Math.max(b[k],t[j*4+k]); }
      nodes.push(...a,0,...b,0);
      if(ts.length<=8) { nodes[id*8+3]=-sortiert.length-1; nodes[id*8+7]=ts.length; sortiert.push(...ts); }
      else {
        const achse=[0,1,2].sort((x,y)=>(b[y]-a[y])-(b[x]-a[x]))[0];
        ts.sort((x,y)=>(x[achse]+x[achse+4]+x[achse+8])-(y[achse]+y[achse+4]+y[achse+8]));
        const mitte=Math.floor(ts.length/2);
        nodes[id*8+3]=baue(ts.slice(0,mitte)); nodes[id*8+7]=baue(ts.slice(mitte));
      }
      return id;
    }
    if (gleicheTopologie) {
      nodes=this.nodes; sortiert=this.sortiert;
      // Rückwärts durch den Baum: erst Blätter, dann Eltern aktualisieren.
      for(let id=nodes.length/8-1;id>=0;id--) {
        const off=id*8, links=nodes[off+3], rechts=nodes[off+7];
        for(let achse=0;achse<3;achse++) {
          let a=Infinity,b=-Infinity;
          if(links<0) {
            const start=-links-1;
            for(let j=0;j<rechts;j++) for(let e=0;e<3;e++) {
              const wert=sortiert[start+j][e*4+achse]; a=Math.min(a,wert); b=Math.max(b,wert);
            }
          } else {
            a=Math.min(nodes[links*8+achse],nodes[rechts*8+achse]);
            b=Math.max(nodes[links*8+4+achse],nodes[rechts*8+4+achse]);
          }
          nodes[off+achse]=a; nodes[off+4+achse]=b;
        }
      }
    } else {
      this.primitive=dreiecke.slice();
      baue(dreiecke);
      this.nodes=nodes; this.sortiert=sortiert;
    }
    const werte=new Float32Array(sortiert.length*44);
    sortiert.forEach((t,i)=>werte.set(t,i*44));
    const breite=Math.min(2048,this.zeichner.capabilities.maxTextureSize);
    if(Math.ceil(werte.length/4/breite)>this.zeichner.capabilities.maxTextureSize) throw new Error('Szene überschreitet die GPU-Grenze.');
    for(const [name, daten] of [['dreiecke',werte],['knoten',nodes]]) {
      const alt=this.uniforms[name].value;
      if(alt && alt.image.data.length>=daten.length && alt.image.width===breite) {
        alt.image.data.set(daten); alt.needsUpdate=true;
      } else {
        alt?.dispose(); this.uniforms[name].value=datenTextur(daten,breite);
      }
    }
    this.uniforms.atlas.value=atlas;
    return true;
  }

  zeichne(szene,kamera,sonne,nebel) {
    const geaendert=this.aktualisiere(szene);
    kamera.updateMatrixWorld();
    const ansicht=[...kamera.matrixWorld.elements,...kamera.projectionMatrix.elements,
      ...sonne.position.toArray(),...sonne.target.position.toArray(),sonne.color.getHex(),sonne.intensity,nebel].join(',');
    if(geaendert || ansicht!==this.ansicht) this.samples=0;
    this.ansicht=ansicht;
    const u=this.uniforms;
    u.inverseProjektion.value=kamera.projectionMatrixInverse; u.kameraWelt.value=kamera.matrixWorld;
    u.sonnenRichtung.value.subVectors(sonne.position,sonne.target.position).normalize();
    u.sonnenFarbe.value.copy(sonne.color).multiplyScalar(sonne.intensity);
    u.nebelAktiv.value=nebel; u.samples.value=this.samples; u.saat.value=++this.saat;
    const ziel=this.ziele[1], vorher=this.ziele[0]; u.vorher.value=vorher.texture;
    try {
      this.quad.material=this.material;
      this.zeichner.setRenderTarget(ziel); this.zeichner.render(this.szene,this.kamera);
      this.zeichner.setRenderTarget(null);
      this.quad.material=this.ausgabe; this.ausgabe.uniforms.bild.value=ziel.texture;
      this.zeichner.render(this.szene,this.kamera);
    } finally { this.zeichner.setRenderTarget(null); }
    this.ziele.reverse(); this.samples=Math.min(this.samples+1,4096);
    // Schilder, Nummern und transparente Gleismarkierungen bleiben bedienbar.
    // Sie werden als UI-Overlay gezeichnet und gehören nicht zur Lichtsimulation.
    const versteckt=[];
    const hintergrund=szene.background, autoClear=this.zeichner.autoClear;
    szene.traverse(o=> { if(o.isMesh && o.visible && !o.userData.ohneSchatten) { o.visible=false; versteckt.push(o); } });
    try {
      szene.background=null; this.zeichner.autoClear=false; this.zeichner.clearDepth();
      this.zeichner.render(szene,kamera);
    } finally {
      for(const o of versteckt) o.visible=true;
      szene.background=hintergrund; this.zeichner.autoClear=autoClear;
    }
  }

  dispose() {
    for(const ziel of this.ziele) ziel.dispose();
    for(const name of ['dreiecke','knoten','atlas']) this.uniforms[name].value?.dispose();
    this.meshCache.clear(); this.maps=[]; this.primitive=null; this.sortiert=null; this.nodes=null;
    this.material.dispose(); this.ausgabe.dispose(); this.quad.geometry.dispose();
  }
}
