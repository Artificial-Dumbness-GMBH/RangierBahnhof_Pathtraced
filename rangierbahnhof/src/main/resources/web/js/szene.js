// Szene: Himmel, Licht, Gelände, Gleisanlage und Bahnhofsgebäude.
// Die Gleisanlage wird aus dem Gleisplan erzeugt und neu gebaut, sobald sich
// die Anzahl der Waggons (und damit die Gleislänge) ändert.

import * as THREE from './lib/three.module.js';
import { GLEISE, MASSE } from './gleisplan.js';
import { Volumenlicht } from './volumenlicht.js';

const Y0 = MASSE.SCHIENE_OBEN;
const D = MASSE.GLEISABSTAND;
const SCHRIFT = 'Bahnschrift, "DIN Alternate", "Arial Narrow", Arial, sans-serif';

function zufall(saat) {
  let a = saat >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function textur(breite, hoehe, male, kacheln = false) {
  const flaeche = document.createElement('canvas');
  flaeche.width = breite;
  flaeche.height = hoehe;
  male(flaeche.getContext('2d'), breite, hoehe);
  const t = new THREE.CanvasTexture(flaeche);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (kacheln) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Eine gesprenkelte Fläche, zum Beispiel für Gras oder Schotter. */
function gesprenkelt(grund, flecken, anzahl, groesse, saat) {
  return textur(256, 256, (c, b, h) => {
    const r = zufall(saat);
    c.fillStyle = grund;
    c.fillRect(0, 0, b, h);
    for (let i = 0; i < anzahl; i++) {
      c.fillStyle = flecken[Math.floor(r() * flecken.length)];
      const s = groesse * (0.5 + r());
      c.fillRect(r() * b, r() * h, s, s);
    }
  }, true);
}

function matt(farbe, karte = null) {
  return new THREE.MeshLambertMaterial({ color: farbe, map: karte });
}

function quader(b, h, t, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(b, h, t), material);
  m.position.set(x, y, z);
  return m;
}

/** Ein Satteldach: First entlang x, Unterkante bei y = 0. */
function satteldach(laenge, breite, hoehe, material) {
  const l = laenge / 2;
  const b = breite / 2;
  const ecken = [
    // vordere Dachfläche (+z)
    -l, 0, b, l, 0, b, l, hoehe, 0, -l, 0, b, l, hoehe, 0, -l, hoehe, 0,
    // hintere Dachfläche (-z)
    l, 0, -b, -l, 0, -b, -l, hoehe, 0, l, 0, -b, -l, hoehe, 0, l, hoehe, 0,
    // Giebel
    -l, 0, -b, -l, 0, b, -l, hoehe, 0,
    l, 0, b, l, 0, -b, l, hoehe, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(ecken, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

function schildTextur(text, hintergrund, farbe, rand) {
  return textur(256, 256, (c) => {
    c.fillStyle = hintergrund;
    c.beginPath(); c.roundRect(8, 8, 240, 240, 30); c.fill();
    c.lineWidth = 12;
    c.strokeStyle = rand;
    c.stroke();
    c.fillStyle = farbe;
    c.font = `700 190px ${SCHRIFT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 128, 142);
  });
}

export class Welt {
  constructor(leinwand) {
    this.leinwand = leinwand;
    this.zeichner = new THREE.WebGLRenderer({ canvas: leinwand, antialias: true });
    this.zeichner.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.zeichner.shadowMap.enabled = true;
    this.zeichner.shadowMap.type = THREE.PCFShadowMap;
    this.zeichner.toneMapping = THREE.ACESFilmicToneMapping;
    this.zeichner.toneMappingExposure = 1.0;
    this.zeichner.outputColorSpace = THREE.SRGBColorSpace;
    this.volumenlicht = this.zeichner.extensions.has('EXT_color_buffer_float')
      ? new Volumenlicht(this.zeichner)
      : null;
    this.volumenlichtAktiv = Boolean(this.volumenlicht);

    this.szene = new THREE.Scene();
    this.szene.background = textur(4, 256, (c, b, h) => {
      const verlauf = c.createLinearGradient(0, 0, 0, h);
      verlauf.addColorStop(0, '#5f9bcf');
      verlauf.addColorStop(0.55, '#a6cde6');
      verlauf.addColorStop(1, '#dce9ee');
      c.fillStyle = verlauf;
      c.fillRect(0, 0, b, h);
    });
    this.szene.fog = new THREE.Fog(0xd3e3ea, 240, 760);

    this.kamera = new THREE.PerspectiveCamera(36, 1, 1, 1800);

    this.szene.add(new THREE.HemisphereLight(0xd4e6f6, 0x8c9070, 1.15));
    this.sonne = new THREE.DirectionalLight(0xfff0d8, 2.9);
    this.sonne.castShadow = true;
    this.sonne.shadow.mapSize.set(2048, 2048);
    this.sonne.shadow.bias = -0.0005;
    this.sonne.shadow.normalBias = 0.05;
    this.szene.add(this.sonne, this.sonne.target);

    const gras = gesprenkelt('#6d8c55', ['#63824c', '#76955d', '#5b7a47', '#7f9c66'], 2600, 5, 7);
    gras.repeat.set(170, 170);
    const boden = new THREE.Mesh(new THREE.PlaneGeometry(1700, 1700), matt(0xffffff, gras));
    boden.rotation.x = -Math.PI / 2;
    boden.receiveShadow = true;
    this.szene.add(boden);

    this.fahrzeuge = new THREE.Group();
    this.szene.add(this.fahrzeuge);
    this.anlage = null;
    this.laternen = {};
    this.flaechen = {};
    this.strahl = new THREE.Raycaster();
    this.hilfsort = new THREE.Vector3();
  }

  // ------------------------------------------------------------ Anlage

  baue(plan) {
    if (this.anlage) {
      this.szene.remove(this.anlage);
      this.anlage.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
    }
    this.plan = plan;
    this.schilder = [];
    const g = new THREE.Group();
    this.anlage = g;

    this.baueBettung(g, plan);
    this.baueSchwellen(g, plan);
    this.baueSchienen(g, plan);
    for (const gleis of GLEISE) {
      const z = plan.zVon(gleis, plan.xPrellbock);
      g.add(this.bauePrellbock(plan.xPrellbock - 0.55, z, 1));
      g.add(this.baueGleisschild(gleis, plan.xPrellbock - 3.0, z));
      this.baueLaterne(g, gleis, plan.xKurve - 1.0, z + D / 2);
      this.baueFlaeche(g, gleis, plan, z);
    }
    g.add(this.bauePrellbock(plan.xEnde + 0.55, 0, -1));
    this.baueWeg(g, plan);
    this.baueStellwerk(g, plan.xKurve + 9, -(D + 13));
    this.baueSchuppen(g, plan.xPrellbock + 15, -(D + 13));
    for (const anteil of [0.14, 0.47, 0.8]) {
      this.baueLichtmast(g, plan.xPrellbock + plan.laenge * anteil, -(D + 4.5));
    }
    this.baueBaeume(g, plan);

    g.traverse((o) => {
      if (o.isMesh && !o.userData.ohneSchatten) {
        o.castShadow = o.userData.wirftSchatten !== false;
        o.receiveShadow = true;
      }
    });
    this.szene.add(g);

    // Die Sonne steht links vorne oben; ihr Schattenbereich deckt die Anlage ab.
    const halb = plan.laenge / 2 + 32;
    this.sonne.position.set(-70, 115, 80);
    this.sonne.target.position.set(0, 0, -8);
    const s = this.sonne.shadow.camera;
    s.left = -halb; s.right = halb; s.top = 62; s.bottom = -62;
    s.near = 20; s.far = 380;
    s.updateProjectionMatrix();
    this.setzeFahrstrasse('B');
  }

  baueBettung(g, plan) {
    const schotter = gesprenkelt('#8f887d', ['#7d776d', '#a09a8e', '#6f6a62', '#b0aa9e'], 3600, 3, 3);
    const orte = [];
    const uv = [];
    const index = [];
    const x0 = plan.xPrellbock - 4.5;
    const x1 = plan.xEnde + 3.5;
    const spalten = Math.ceil(x1 - x0);
    for (let i = 0; i <= spalten; i++) {
      const x = x0 + (x1 - x0) * (i / spalten);
      const hinten = plan.zVon('A', x) - 2.5;
      const vorn = plan.zVon('C', x) + 2.5;
      const reihe = [[hinten - 0.6, 0.01], [hinten, 0.15], [vorn, 0.15], [vorn + 0.6, 0.01]];
      for (const [z, y] of reihe) {
        orte.push(x, y, z);
        uv.push(x / 5, z / 5);
      }
      if (i > 0) {
        const a = (i - 1) * 4;
        const b = i * 4;
        for (let j = 0; j < 3; j++) {
          index.push(a + j, a + j + 1, b + j + 1, a + j, b + j + 1, b + j);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(orte, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    const bettung = new THREE.Mesh(geo, matt(0xffffff, schotter));
    bettung.userData.wirftSchatten = false;
    g.add(bettung);
  }

  baueSchwellen(g, plan) {
    const eintraege = [];
    const abstand = 0.64;
    for (let x = plan.xPrellbock + 0.3; x < plan.xEnde - 0.2; x += abstand) {
      const versatz = Math.abs(plan.zVon('A', x));
      if (x >= plan.xWeiche) {
        eintraege.push([x, 0, 0, 1]);
      } else if (versatz < 2.9) {
        // im Weichenbereich: durchgehende Weichenschwellen
        eintraege.push([x, 0, 0, (2.6 + 2 * versatz) / 2.6]);
      } else {
        for (const gleis of GLEISE) {
          const z = plan.zVon(gleis, x);
          const steigung = (plan.zVon(gleis, x + 0.2) - plan.zVon(gleis, x - 0.2)) / 0.4;
          eintraege.push([x, z, -Math.atan(steigung), 1]);
        }
      }
    }
    const schwellen = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.26, 0.13, 2.6), matt(0x4f3f30), eintraege.length);
    const hilf = new THREE.Object3D();
    eintraege.forEach(([x, z, drehung, breite], i) => {
      hilf.position.set(x, 0.205, z);
      hilf.rotation.set(0, drehung, 0);
      hilf.scale.set(1, 1, breite);
      hilf.updateMatrix();
      schwellen.setMatrixAt(i, hilf.matrix);
    });
    schwellen.userData.wirftSchatten = false;
    g.add(schwellen);
  }

  baueSchienen(g, plan) {
    const eintraege = [];
    const schritt = 0.5;
    for (const gleis of GLEISE) {
      const bis = gleis === 'B' ? plan.xEnde : plan.xWeiche;
      for (let x = plan.xPrellbock; x < bis - 1e-6; x += schritt) {
        const xa = x;
        const xb = Math.min(bis, x + schritt);
        const za = plan.zVon(gleis, xa);
        const zb = plan.zVon(gleis, xb);
        const laenge = Math.hypot(xb - xa, zb - za);
        const dx = (xb - xa) / laenge;
        const dz = (zb - za) / laenge;
        for (const seite of [-1, 1]) {
          eintraege.push([
            (xa + xb) / 2 - dz * seite * MASSE.SPUR / 2,
            (za + zb) / 2 + dx * seite * MASSE.SPUR / 2,
            Math.atan2(-dz, dx), laenge * 1.04,
          ]);
        }
      }
    }
    const stahl = new THREE.MeshStandardMaterial({ color: 0x9a9792, roughness: 0.35, metalness: 0.55 });
    const schienen = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.16, 0.1), stahl, eintraege.length);
    const hilf = new THREE.Object3D();
    eintraege.forEach(([x, z, drehung, laenge], i) => {
      hilf.position.set(x, Y0 - 0.08, z);
      hilf.rotation.set(0, drehung, 0);
      hilf.scale.set(laenge, 1, 1);
      hilf.updateMatrix();
      schienen.setMatrixAt(i, hilf.matrix);
    });
    schienen.userData.wirftSchatten = false;
    g.add(schienen);
  }

  /** richtung = +1: das Gleis führt vom Prellbock aus nach +x. */
  bauePrellbock(x, z, richtung) {
    const gruppe = new THREE.Group();
    const holz = matt(0x4a4038);
    const streifen = matt(0xffffff, textur(128, 32, (c, b, h) => {
      c.fillStyle = '#f4f1e8';
      c.fillRect(0, 0, b, h);
      c.fillStyle = '#c62d24';
      for (let i = 0; i < 4; i += 2) c.fillRect(i * b / 4, 0, b / 4, h);
    }));
    const balken = quader(0.32, 0.5, 2.5, [holz, holz, holz, holz, holz, holz], 0, Y0 + 1.0, 0);
    balken.material = [streifen, streifen, holz, holz, holz, holz];
    gruppe.add(balken);
    for (const zz of [-0.75, 0.75]) {
      gruppe.add(quader(0.2, 1.3, 0.2, holz, -0.2, 0.8, zz));
      const strebe = quader(1.9, 0.16, 0.16, holz, -0.95, 0.72, zz);
      strebe.rotation.z = 0.62;
      gruppe.add(strebe);
    }
    const lampe = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xd5362b, emissive: 0xd5362b, emissiveIntensity: 1.2 }));
    lampe.position.set(0, Y0 + 1.45, 0);
    gruppe.add(lampe);
    gruppe.position.set(x, 0, z);
    if (richtung < 0) gruppe.rotation.y = Math.PI;
    return gruppe;
  }

  baueGleisschild(gleis, x, z) {
    const gruppe = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.0, 8), matt(0x6d7175));
    mast.position.y = 1.5;
    gruppe.add(mast);
    const schild = new THREE.Sprite(new THREE.SpriteMaterial({
      map: schildTextur(gleis, '#f7f5ee', '#1d211c', '#1d211c'),
    }));
    schild.position.y = 3.9;
    schild.scale.set(2.5, 2.5, 1);
    gruppe.add(schild);
    this.schilder.push(schild);
    gruppe.position.set(x, 0, z);
    return gruppe;
  }

  baueLaterne(g, gleis, x, z) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.2, 8), matt(0x2f3133));
    mast.position.set(x, 1.1, z);
    const glas = new THREE.MeshStandardMaterial({ color: 0xd5362b, emissive: 0xd5362b, emissiveIntensity: 1.4 });
    const lampe = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), glas);
    lampe.position.set(x, 2.5, z);
    lampe.userData.wirftSchatten = false;
    g.add(mast, lampe);
    this.laternen[gleis] = glas;
  }

  /** Farbige Fläche unter einem Gleis: zeigt Mauszeiger und Auswahl an. */
  baueFlaeche(g, gleis, plan, z) {
    const laenge = plan.xKurve - plan.xPrellbock + 3;
    const material = new THREE.MeshBasicMaterial({
      color: 0xf2c200, transparent: true, opacity: 0, depthWrite: false,
    });
    const flaeche = new THREE.Mesh(new THREE.PlaneGeometry(laenge, 5.0), material);
    flaeche.rotation.x = -Math.PI / 2;
    flaeche.position.set(plan.xPrellbock + laenge / 2 - 1.5, 0.165, z);
    flaeche.userData.gleis = gleis;
    flaeche.userData.ohneSchatten = true;
    g.add(flaeche);
    this.flaechen[gleis] = flaeche;
  }

  baueWeg(g, plan) {
    const kies = gesprenkelt('#c2b79d', ['#b3a88f', '#cfc5ad', '#a89e86'], 2200, 3, 11);
    kies.repeat.set(plan.laenge / 6, 0.6);
    const weg = new THREE.Mesh(new THREE.PlaneGeometry(plan.laenge + 30, 3.4), matt(0xffffff, kies));
    weg.rotation.x = -Math.PI / 2;
    weg.position.set(0, 0.02, D + 8.2);
    weg.userData.wirftSchatten = false;
    g.add(weg);
  }

  baueStellwerk(g, x, z) {
    const ziegel = textur(128, 128, (c, b, h) => {
      c.fillStyle = '#9c5a44';
      c.fillRect(0, 0, b, h);
      c.fillStyle = '#c9b8a4';
      for (let y = 0; y < h; y += 16) {
        c.fillRect(0, y, b, 2);
        for (let xx = (y / 16) % 2 ? 0 : 16; xx < b; xx += 32) c.fillRect(xx, y, 2, 16);
      }
    }, true);
    ziegel.repeat.set(5, 2);
    const haus = new THREE.Group();
    haus.add(quader(9, 3.4, 6, matt(0xffffff, ziegel), 0, 1.7, 0));
    haus.add(quader(10.6, 2.9, 7.4, matt(0xe9e2cf), 0, 4.85, 0));
    const glas = new THREE.MeshStandardMaterial({ color: 0x27414f, roughness: 0.12, metalness: 0.5 });
    const band = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 1.5), glas);
    band.position.set(0, 5.05, 3.71);
    haus.add(band);
    for (const seite of [-1, 1]) {
      const fenster = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 1.5), glas);
      fenster.position.set(seite * 5.31, 5.05, 0);
      fenster.rotation.y = seite * Math.PI / 2;
      haus.add(fenster);
    }
    for (let i = -2; i <= 2; i++) {
      haus.add(quader(0.12, 1.5, 0.08, matt(0xe9e2cf), i * 1.92, 5.05, 3.73));   // Fenstersprossen
    }
    const tuer = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.3), matt(0x3b2f27));
    tuer.position.set(-2.6, 1.15, 3.01);
    haus.add(tuer);
    const dach = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), matt(0x6f3a2e));
    dach.rotation.y = Math.PI / 4;
    dach.scale.set(12.2 / Math.SQRT2, 2.3, 9.0 / Math.SQRT2);
    dach.position.y = 6.3 + 1.15;
    haus.add(dach);
    const name = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.95),
      new THREE.MeshLambertMaterial({
        map: textur(512, 76, (c, b, h) => {
          c.fillStyle = '#1c3f7a';
          c.fillRect(0, 0, b, h);
          c.fillStyle = '#ffffff';
          c.font = `700 52px ${SCHRIFT}`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText('Stellwerk Rangierbahnhof', b / 2, h * 0.56);
        }),
      }));
    name.position.set(0.9, 2.6, 3.02);
    haus.add(name);
    haus.position.set(x, 0, z);
    g.add(haus);
  }

  baueSchuppen(g, x, z) {
    const bretter = textur(256, 64, (c, b, h) => {
      c.fillStyle = '#8a6a4a';
      c.fillRect(0, 0, b, h);
      for (let xx = 0; xx < b; xx += 16) {
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.fillRect(xx, 0, 2, h);
      }
    }, true);
    bretter.repeat.set(8, 1);
    const schuppen = new THREE.Group();
    schuppen.add(quader(16, 4.2, 7, matt(0xffffff, bretter), 0, 2.1 + 1.1, 0));
    const dach = satteldach(17.2, 8.4, 2.2, matt(0x5a5f63));
    dach.position.y = 5.3;
    schuppen.add(dach);
    schuppen.add(quader(18.5, 1.1, 2.4, matt(0xb9b6ae), 0, 0.55, 4.6));   // Laderampe
    schuppen.add(quader(16, 1.1, 7, matt(0xa9a69e), 0, 0.55, 0));        // Sockel
    for (const xx of [-4, 4]) {
      const tor = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.0), matt(0x4b3a2b));
      tor.position.set(xx, 2.6, 3.51);
      schuppen.add(tor);
    }
    // ein Stapel Ersatzschwellen neben der Rampe
    for (let lage = 0; lage < 3; lage++) {
      for (let i = 0; i < 3 - lage; i++) {
        schuppen.add(quader(2.6, 0.2, 0.3, matt(0x4f3f30), 11.5, 0.1 + lage * 0.2, 3.4 + lage * 0.17 + i * 0.34));
      }
    }
    schuppen.position.set(x, 0, z);
    g.add(schuppen);
  }

  baueLichtmast(g, x, z) {
    const grau = matt(0x70757a);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 10, 10), grau);
    mast.position.set(x, 5, z);
    g.add(mast);
    g.add(quader(0.12, 0.12, 3.0, grau, x, 9.9, z + 1.2));
    const hell = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff0b0, emissiveIntensity: 0.9 });
    for (const dz of [1.2, 2.6]) {
      g.add(quader(0.7, 0.14, 0.4, grau, x, 9.78, z + dz));
      const schein = quader(0.6, 0.03, 0.32, hell, x, 9.7, z + dz);
      schein.userData.wirftSchatten = false;
      g.add(schein);
    }
  }

  baueBaeume(g, plan) {
    const r = zufall(plan.kapazitaet * 97 + 5);
    const orte = [];
    for (let x = plan.xPrellbock - 46; x < plan.xEnde + 46; x += 7.5) {
      orte.push([x + r() * 5, -(D + 25) - r() * 12]);
      if (r() > 0.35) orte.push([x + r() * 6, -(D + 42) - r() * 30]);
    }
    for (let i = 0; i < 9; i++) {
      orte.push([plan.xPrellbock - 16 - r() * 34, -18 + r() * 44]);
      orte.push([plan.xEnde + 14 + r() * 34, -18 + r() * 44]);
    }
    const staemme = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.22, 0.34, 1, 7), matt(0x5b4636), orte.length);
    const kronen = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), orte.length * 2);
    const hilf = new THREE.Object3D();
    const farbe = new THREE.Color();
    orte.forEach(([x, z], i) => {
      const hoehe = 2.2 + r() * 2.2;
      const weite = 2.0 + r() * 1.5;
      hilf.rotation.set(0, r() * 6, 0);
      hilf.position.set(x, hoehe / 2, z);
      hilf.scale.set(1, hoehe, 1);
      hilf.updateMatrix();
      staemme.setMatrixAt(i, hilf.matrix);
      for (let k = 0; k < 2; k++) {
        const s = weite * (k === 0 ? 1 : 0.72);
        hilf.position.set(x + (k ? (r() - 0.5) * 1.4 : 0), hoehe + weite * (k === 0 ? 0.55 : 1.25), z + (k ? (r() - 0.5) * 1.4 : 0));
        hilf.scale.set(s, s * (0.85 + r() * 0.3), s);
        hilf.updateMatrix();
        kronen.setMatrixAt(i * 2 + k, hilf.matrix);
        farbe.setHSL(0.27 + r() * 0.07, 0.42 + r() * 0.15, 0.27 + r() * 0.1);
        kronen.setColorAt(i * 2 + k, farbe);
      }
    });
    g.add(staemme, kronen);
  }

  // ------------------------------------------------------------ Betrieb

  /** Schaltet die Laternen: grün für das eingestellte Gleis, sonst rot. */
  setzeFahrstrasse(gleis) {
    for (const name of GLEISE) {
      const farbe = name === gleis ? 0x35c46a : 0xd5362b;
      this.laternen[name].color.setHex(farbe);
      this.laternen[name].emissive.setHex(farbe);
    }
  }

  /** Hebt das Gleis unter dem Mauszeiger und das gewählte Gleis hervor. */
  markiere(schwebend, gewaehlt) {
    for (const name of GLEISE) {
      this.flaechen[name].material.opacity = name === gewaehlt ? 0.55 : name === schwebend ? 0.22 : 0;
    }
  }

  /** Welches Gleis liegt unter dem Bildschirmpunkt? null, wenn keines. */
  gleisBei(clientX, clientY, waggons) {
    const feld = this.leinwand.getBoundingClientRect();
    const punkt = new THREE.Vector2(
      ((clientX - feld.left) / feld.width) * 2 - 1,
      -((clientY - feld.top) / feld.height) * 2 + 1);
    this.strahl.setFromCamera(punkt, this.kamera);
    const treffer = this.strahl.intersectObjects(waggons.map((w) => w.gruppe), true);
    if (treffer.length > 0) {
      let o = treffer[0].object;
      while (o && !o.userData.waggon) o = o.parent;
      if (o) return o.userData.waggon.gleis ?? null;
    }
    const boden = this.strahl.intersectObjects(GLEISE.map((name) => this.flaechen[name]), false);
    return boden.length > 0 ? boden[0].object.userData.gleis : null;
  }

  /**
   * Hält ein Schild (Sprite) auf dem Bildschirm mindestens so groß, dass es
   * lesbar bleibt: Aus der Ferne wächst es mit, aus der Nähe hat es seine
   * natürliche Größe. Liefert die verwendete Größe in Metern.
   */
  lesbareGroesse(schild, normal, anteil = 0.034) {
    schild.getWorldPosition(this.hilfsort);
    const abstand = this.hilfsort.distanceTo(this.kamera.position);
    const mindestens = 2 * abstand * Math.tan(this.kamera.fov * Math.PI / 360) * anteil;
    const groesse = Math.max(normal, mindestens);
    schild.scale.set(groesse, groesse, 1);
    return groesse;
  }

  passeSchilderAn() {
    for (const schild of this.schilder) {
      const groesse = this.lesbareGroesse(schild, 2.5);
      schild.position.y = 2.7 + groesse / 2;
    }
  }

  passeGroesseAn() {
    const feld = this.leinwand.parentElement.getBoundingClientRect();
    const b = Math.max(1, Math.floor(feld.width));
    const h = Math.max(1, Math.floor(feld.height));
    this.zeichner.setSize(b, h, false);
    this.volumenlicht?.passeGroesseAn();
    this.kamera.aspect = b / h;
    this.kamera.updateProjectionMatrix();
  }

  zeichne() {
    if (this.volumenlichtAktiv) {
      this.volumenlicht.zeichne(this.szene, this.kamera, this.sonne);
    } else {
      this.zeichner.render(this.szene, this.kamera);
    }
  }
}
