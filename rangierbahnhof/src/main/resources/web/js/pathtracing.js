import * as THREE from './lib/three.module.js';

import { denoiser, upscaler } from './bildfilter.js';

const vertexShader = `out vec2 bildUv;
void main() { bildUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const fragmentShader = /* glsl */ `
in vec2 bildUv;
out vec4 ausgabe;
uniform sampler2D dreiecke, knoten, atlas, vorher;
uniform mat4 inverseProjektion, kameraWelt;
uniform vec2 aufloesung;
uniform vec3 mondRichtung, mondFarbe;
const int maxLampen = 7;
uniform int lampenAnzahl;
uniform vec4 lampenPosition[maxLampen];
uniform vec4 lampenFarbe[maxLampen];
uniform vec4 lampenRichtung[maxLampen];
uniform float samples, saat;
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
int treffer(vec3 o, vec3 d, out float distanz, out vec2 bary, bool schatten, float reichweite) {
  int stapel[64]; int anzahl = 1; stapel[0] = 0;
  int gefunden = -1; distanz = reichweite;
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
vec3 himmel(vec3 d) { return mix(vec3(0.033,0.053,0.105),vec3(0.009,0.015,0.039),sqrt(max(d.y,0.0))); }
vec3 atlasProbe(float index, float raster, vec2 uv) {
  vec2 tile = vec2(mod(index,raster),floor(index/raster));
  return texture(atlas,(tile*258.0+1.5+uv*255.0)/(raster*258.0)).rgb;
}
// Lokale Lampen beleuchten auch metallische Flächen direkt. Der
// GGX-Term nutzt dieselben Rauheits- und Metallkarten wie die Reflexionsstrahlen.
vec3 lampenLicht(vec3 p, vec3 n, vec3 v, vec3 albedo, float metall, float rau) {
  vec3 summe = vec3(0.0);
  float nv = max(dot(n,v), 0.001);
  float alpha2 = pow(max(rau, 0.08), 4.0);
  vec3 f0 = mix(vec3(0.04), albedo, metall);
  for (int i=0; i<maxLampen; i++) {
    if (i>=lampenAnzahl) break;
    vec3 delta = lampenPosition[i].xyz - p;
    float abstand = length(delta);
    float reichweite = lampenFarbe[i].w;
    if (abstand>=reichweite || abstand<0.01) continue;
    vec3 l = delta / abstand;
    float nl = dot(n,l);
    if (nl<=0.0) continue;
    float kegel = 1.0;
    if (lampenRichtung[i].w>=0.0) {
      kegel = smoothstep(lampenRichtung[i].w, lampenPosition[i].w, dot(-l,lampenRichtung[i].xyz));
      if (kegel<=0.0) continue;
    }
    float distanz;
    vec2 bary;
    // Beim Signal endet der Schattenstrahl vor dem eigenen Glaskolben.
    float lichtRadius = lampenRichtung[i].w<0.0 ? 0.45 : 0.015;
    if (treffer(p,l,distanz,bary,true,abstand-lichtRadius)>=0) continue;
    vec3 h = normalize(l+v);
    float nh = max(dot(n,h),0.0), vh = clamp(dot(v,h),0.0,1.0);
    float nenner = nh*nh*(alpha2-1.0)+1.0;
    float d = alpha2 / (3.14159265*nenner*nenner);
    float vis = 0.5 / max(nl*sqrt(nv*nv*(1.0-alpha2)+alpha2)
      + nv*sqrt(nl*nl*(1.0-alpha2)+alpha2),0.001);
    vec3 f = f0 + (1.0-f0)*pow(1.0-vh,5.0);
    vec3 diffus = (1.0-f)*(1.0-metall)*albedo/3.14159265;
    float auslauf = pow(max(1.0-pow(abstand/reichweite,4.0),0.0),2.0);
    summe += (diffus+d*vis*f)*nl*kegel*auslauf*lampenFarbe[i].rgb/max(abstand*abstand,0.1);
  }
  return summe;
}
void main() {
  rng = uint(gl_FragCoord.x)*1973u + uint(gl_FragCoord.y)*9277u + uint(saat)*26699u + 1u;
  vec2 uv = bildUv + (vec2(zufall(),zufall())-0.5)/aufloesung;
  vec4 v = inverseProjektion*vec4(uv*2.0-1.0,1.0,1.0);
  vec3 d = normalize(mat3(kameraWelt)*v.xyz), o = kameraWelt[3].xyz;
  float sichttiefe = 0.0;
  vec3 licht=vec3(0), gewicht=vec3(1);
  for (int bounce=0; bounce<5; bounce++) {
    float l; vec2 bary; int hit=treffer(o,d,l,bary,false,1e20);
    if(hit<0) { licht+=gewicht*himmel(d); break; }
    if (bounce==0) sichttiefe = -dot(d,kameraWelt[2].xyz)*l;
    int t=hit*11;
    vec3 n=normalize(daten(dreiecke,t+3).xyz*(1.0-bary.x-bary.y)+daten(dreiecke,t+4).xyz*bary.x+daten(dreiecke,t+5).xyz*bary.y);
    if(dot(n,d)>0.0) n=-n;
    vec4 farbe=daten(dreiecke,t+8), emission=daten(dreiecke,t+9), karte=daten(dreiecke,t+10);
    vec3 albedo=farbe.rgb;
    float metall=farbe.a, rau=emission.a;
    vec3 hitNormal=n;
    if(karte.x>=0.0) {
      vec4 ab=daten(dreiecke,t+6), c=daten(dreiecke,t+7);
      vec2 texUv=ab.xy*(1.0-bary.x-bary.y)+ab.zw*bary.x+c.xy*bary.y;
      texUv=mix(clamp(texUv,0.0,1.0),fract(texUv),karte.zw);
      vec3 s=atlasProbe(karte.x,karte.y,texUv);
      albedo*=mix(s/12.92,pow((s+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),s));
      if (c.z>=0.0) {
        vec3 eigenschaften=atlasProbe(c.z,karte.y,texUv);
        rau*=eigenschaften.g;
        metall*=eigenschaften.b;
      }
      if (c.w>=0.0) {
        vec2 uv1=ab.zw-ab.xy, uv2=c.xy-ab.xy;
        vec3 e1=daten(dreiecke,t+1).xyz-daten(dreiecke,t).xyz;
        vec3 e2=daten(dreiecke,t+2).xyz-daten(dreiecke,t).xyz;
        float det=uv1.x*uv2.y-uv1.y*uv2.x;
        vec3 tng=(e1*uv2.y-e2*uv1.y)*sign(det);
        tng-=n*dot(n,tng);
        if (dot(tng,tng)>1e-12) {
          tng=normalize(tng);
          vec3 bit=normalize(cross(n,tng));
          // Der Atlas speichert Canvas-Pixel von oben nach unten.
          bit*= -sign(dot(bit,(e2*uv1.x-e1*uv2.x)*sign(det)));
          vec3 norm=atlasProbe(c.w,karte.y,texUv)*2.0-1.0;
          vec3 perturbed=normalize(mat3(tng,bit,n)*norm);
          if (dot(perturbed,d)<0.0) n=perturbed;
        }
      }
    }
    licht+=gewicht*emission.rgb;
    vec3 p=o+d*l+hitNormal*0.003;
    licht += gewicht*lampenLicht(p,n,-d,albedo,metall,rau);
    // Die Auswahlwahrscheinlichkeit kürzt sich mit dem BRDF-Gewicht heraus.
    float fresnel=0.04+0.96*pow(1.0-max(dot(-d,n),0.0),5.0);
    float spiegel=mix(fresnel,1.0,metall);
    if(zufall()<spiegel) {
      d=normalize(mix(reflect(d,n),halbkugel(n),rau*rau));
      if(dot(d,n)<=0.0) break;
      gewicht*=mix(vec3(1),albedo,metall);
    } else {
      float sl; vec2 sb;
      // Die kleine Mondscheibe erzeugt weiche Schatten.
      vec3 sd=normalize(mondRichtung+halbkugel(mondRichtung)*0.00465);
      if(treffer(p,sd,sl,sb,true,1e20)<0) licht+=gewicht*albedo*mondFarbe*max(dot(n,sd),0.0)/3.14159265;
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
  ausgabe=vec4(alt+(licht-alt)/(samples+1.0),sichttiefe);
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
      mondRichtung: { value: new THREE.Vector3() }, mondFarbe: { value: new THREE.Color() },
      lampenAnzahl: { value: 0 },
      lampenPosition: { value: Array.from({ length: 7 }, () => new THREE.Vector4()) },
      lampenFarbe: { value: Array.from({ length: 7 }, () => new THREE.Vector4()) },
      lampenRichtung: { value: Array.from({ length: 7 }, () => new THREE.Vector4()) },
      samples: { value: 0 }, saat: { value: 0 },
    };
    this.lichtOrt = new THREE.Vector3();
    this.lichtRichtung = new THREE.Vector3();
    this.kamera = new THREE.Camera();
    this.szene = new THREE.Scene();
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, uniforms: this.uniforms, vertexShader, fragmentShader,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.szene.add(this.quad);
    this.gefiltert = this.ziele[0].clone();
    this.denoiser = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader, fragmentShader: denoiser,
      uniforms: { bild: { value: null }, samples: { value: 1 } },
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.ausgabe = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader, fragmentShader: upscaler,
      uniforms: { bild: { value: this.gefiltert.texture } }, depthTest: false, depthWrite: false,
    });
  }

  passeGroesseAn() {
    this.zeichner.getDrawingBufferSize(this.groesse);
    // Begrenzte interne Auflösung hält den Modus auch auf integrierten GPUs nutzbar.
    const faktor = Math.min(0.75, 960 / this.groesse.x, 540 / this.groesse.y);
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
        [m.uuid, m.visible, m.color?.getHex(), m.emissive?.getHex(), m.emissiveIntensity, m.roughness, m.metalness, m.opacity, m.map?.uuid, m.map?.version, m.roughnessMap?.uuid, m.roughnessMap?.version, m.normalMap?.uuid, m.normalMap?.version, m.map?.repeat.toArray(), m.map?.offset.toArray(), m.map?.rotation])].join(','));
    const signatur = schluessel.join(';');
    if (signatur === this.signatur) return false;
    this.signatur = signatur;
    const maps = [...new Set(meshes.flatMap(o => (Array.isArray(o.material) ? o.material : [o.material])
      .flatMap(m => [m.map, m.roughnessMap, m.normalMap]).filter(m => m?.image)))];
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
          const mapId = maps.indexOf(map);
          if (mapId >= 0) map.updateMatrix();
          t[30] = maps.indexOf(m.roughnessMap);
          t[31] = maps.indexOf(m.normalMap);
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

  zeichne(szene, kamera, mond, lampen) {
    const geaendert=this.aktualisiere(szene);
    kamera.updateMatrixWorld();
    const ansicht=[...kamera.matrixWorld.elements,...kamera.projectionMatrix.elements,
      ...mond.position.toArray(),...mond.target.position.toArray(),mond.color.getHex(),mond.intensity,
      ...lampen.flatMap(lampe => [...lampe.matrixWorld.elements, lampe.color.getHex(), lampe.intensity,
        lampe.distance, lampe.angle, lampe.penumbra, ...lampe.target?.matrixWorld.elements ?? []])].join(',');
    if(geaendert || ansicht!==this.ansicht) this.samples=0;
    this.ansicht=ansicht;
    const u=this.uniforms;
    u.inverseProjektion.value=kamera.projectionMatrixInverse; u.kameraWelt.value=kamera.matrixWorld;
    u.mondRichtung.value.subVectors(mond.position,mond.target.position).normalize();
    u.mondFarbe.value.copy(mond.color).multiplyScalar(mond.intensity);
    u.lampenAnzahl.value = Math.min(lampen.length, u.lampenPosition.value.length);
    for (let i = 0; i < u.lampenAnzahl.value; i++) {
      const lampe = lampen[i];
      lampe.getWorldPosition(this.lichtOrt);
      const { x, y, z } = this.lichtOrt;
      const innen = lampe.isSpotLight ? Math.cos(lampe.angle * (1 - lampe.penumbra)) : 0;
      u.lampenPosition.value[i].set(x, y, z, innen);
      const { r, g, b } = lampe.color;
      u.lampenFarbe.value[i].set(r * lampe.intensity, g * lampe.intensity, b * lampe.intensity, lampe.distance);
      const richtung = u.lampenRichtung.value[i];
      if (lampe.isSpotLight) {
        lampe.target.getWorldPosition(this.lichtRichtung).sub(this.lichtOrt).normalize();
        richtung.set(this.lichtRichtung.x, this.lichtRichtung.y, this.lichtRichtung.z, Math.cos(lampe.angle));
      } else {
        richtung.set(0, 0, 0, -1);
      }
    }
    u.samples.value=this.samples; u.saat.value=++this.saat;
    const ziel=this.ziele[1], vorher=this.ziele[0]; u.vorher.value=vorher.texture;
    try {
      this.quad.material=this.material;
      this.zeichner.setRenderTarget(ziel); this.zeichner.render(this.szene,this.kamera);
      this.gefiltert.setSize(ziel.width, ziel.height);
      this.denoiser.uniforms.bild.value = ziel.texture;
      this.denoiser.uniforms.samples.value = this.samples + 1;
      this.quad.material = this.denoiser;
      this.zeichner.setRenderTarget(this.gefiltert);
      this.zeichner.render(this.szene, this.kamera);
      this.zeichner.setRenderTarget(null);
      this.quad.material=this.ausgabe;
      this.zeichner.render(this.szene,this.kamera);
    } finally { this.zeichner.setRenderTarget(null); }
    this.ziele.reverse(); this.samples=Math.min(this.samples+1,4096);
    // Schilder, Effekte und transparente Gleismarkierungen bleiben sichtbar.
    // Sie werden als UI-Overlay gezeichnet und gehören nicht zur Lichtsimulation.
    const versteckt=[];
    const hintergrund=szene.background, autoClear=this.zeichner.autoClear;
    szene.traverse(o=> { if(o.visible && ((o.isMesh && !o.userData.ohneSchatten) || o.userData.lichtHalo)) { o.visible=false; versteckt.push(o); } });
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
    this.gefiltert.dispose(); this.denoiser.dispose();
    this.material.dispose(); this.ausgabe.dispose(); this.quad.geometry.dispose();
  }
}
