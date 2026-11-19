// Fahrzeuge: die Rangierlok und vier Bauarten von Güterwaggons.
// Alle Modelle bestehen aus einfachen Grundkörpern; ihre Beschriftungen und
// Oberflächen werden zur Laufzeit auf eine Zeichenfläche gemalt, es gibt also
// keine Bilddateien. Die Modelle zeigen mit +x zum Ausziehgleis.

import * as THREE from './lib/three.module.js';
import { pbrMaterial } from './pbr.js';
import { MASSE } from './gleisplan.js';

const Y0 = MASSE.SCHIENE_OBEN;
const SCHRIFT = 'Bahnschrift, "DIN Alternate", "Arial Narrow", Arial, sans-serif';

const FARBEN = [
  '#b8432f', '#2c6da3', '#d8a016', '#3c8d57', '#7b4ea3',
  '#d76c26', '#1f9a9a', '#6f7782', '#c0407a', '#8a6a3a',
];

/** Die Farbe des Waggons mit der angegebenen Nummer. */
export function farbeVon(nummer) {
  return FARBEN[(((nummer - 1) % FARBEN.length) + FARBEN.length) % FARBEN.length];
}

// ---------------------------------------------------------------- Hilfen

function textur(breite, hoehe, male) {
  const flaeche = document.createElement('canvas');
  flaeche.width = breite;
  flaeche.height = hoehe;
  male(flaeche.getContext('2d'), breite, hoehe);
  const t = new THREE.CanvasTexture(flaeche);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const lager = new Map();
function einmal(name, erzeuge) {
  if (!lager.has(name)) lager.set(name, erzeuge());
  return lager.get(name);
}

function stoff(farbe, rauheit = 0.75, metall = 0.05, karte = null) {
  return new THREE.MeshStandardMaterial({ color: farbe, roughness: rauheit, metalness: metall, map: karte });
}

const matDunkel = () => einmal('dunkel', () => stoff(0x26282a, 0.8, 0.2));
const matStahl = () => einmal('stahl', () => pbrMaterial(0x8b9095, 'stahl'));
const matGlas = () => einmal('glas', () => stoff(0x1b2a33, 0.15, 0.4));

/** Eine eigene Kachelung einer gemeinsam genutzten Oberfläche. */
function gekachelt(karte, wiederholungen) {
  const kopie = karte.clone();
  kopie.repeat.set(wiederholungen, 1);
  kopie.needsUpdate = true;
  return kopie;
}

function koerper(geometrie, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometrie, material);
  m.position.set(x, y, z);
  return m;
}

function quader(b, h, t, material, x, y, z) {
  return koerper(new THREE.BoxGeometry(b, h, t), material, x, y, z);
}

/** Ein Zylinder, dessen Achse entlang x liegt. */
function walzeX(radius, laenge, material, x, y, z, segmente = 20) {
  const g = new THREE.CylinderGeometry(radius, radius, laenge, segmente);
  g.rotateZ(Math.PI / 2);
  return koerper(g, material, x, y, z);
}

/** Ein gewölbtes Dach: halber Zylinder entlang x, flach gedrückt. */
function tonnendach(laenge, breite, hoehe, material, x, y) {
  const g = new THREE.CylinderGeometry(1, 1, laenge, 18, 1, false, -Math.PI / 2, Math.PI);
  g.rotateZ(-Math.PI / 2);
  g.rotateX(-Math.PI / 2);
  const m = koerper(g, material, x, y, 0);
  m.scale.set(1, hoehe, breite / 2);
  return m;
}

// Oberflächen in Graustufen; die Farbe kommt vom Material.
const texBretter = () => einmal('bretter', () => {
  const t = textur(256, 64, (c, b, h) => {
    c.fillStyle = '#f2f2f2';
    c.fillRect(0, 0, b, h);
    for (let x = 0; x < b; x += 16) {
      c.fillStyle = 'rgba(0,0,0,0.28)';
      c.fillRect(x, 0, 2, h);
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.fillRect(x + 2, 0, 1, h);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
});

const texWellblech = () => einmal('wellblech', () => {
  const t = textur(256, 64, (c, b, h) => {
    for (let x = 0; x < b; x += 16) {
      const verlauf = c.createLinearGradient(x, 0, x + 16, 0);
      verlauf.addColorStop(0, '#c9c9c9');
      verlauf.addColorStop(0.45, '#ffffff');
      verlauf.addColorStop(1, '#b4b4b4');
      c.fillStyle = verlauf;
      c.fillRect(x, 0, 16, h);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
});

function texRad(farbeMitte) {
  return einmal('rad' + farbeMitte, () => textur(128, 128, (c) => {
    c.fillStyle = '#1c1d1f';
    c.fillRect(0, 0, 128, 128);
    c.translate(64, 64);
    c.fillStyle = '#9a9ea3';
    c.beginPath(); c.arc(0, 0, 63, 0, 7); c.fill();
    c.fillStyle = farbeMitte;
    c.beginPath(); c.arc(0, 0, 53, 0, 7); c.fill();
    c.fillStyle = '#16171a';
    for (let i = 0; i < 6; i++) {
      c.rotate(Math.PI / 3);
      c.beginPath(); c.arc(31, 0, 10, 0, 7); c.fill();
    }
    c.fillStyle = '#b9bcc0';
    c.beginPath(); c.arc(0, 0, 12, 0, 7); c.fill();
  }));
}

function texNummernschild(nummer) {
  return textur(256, 256, (c) => {
    c.fillStyle = '#f7f5ee';
    c.beginPath(); c.roundRect(6, 6, 244, 244, 26); c.fill();
    c.lineWidth = 10;
    c.strokeStyle = '#1d211c';
    c.stroke();
    c.fillStyle = '#1d211c';
    c.font = `700 ${nummer > 99 ? 108 : nummer > 9 ? 150 : 190}px ${SCHRIFT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(nummer), 128, 140);
  });
}

function texMarke(nummer, farbe, gewaehlt) {
  return textur(192, 192, (c) => {
    c.beginPath(); c.arc(96, 96, 88, 0, 7);
    c.fillStyle = gewaehlt ? '#f2c200' : '#fbfaf5';
    c.fill();
    c.lineWidth = 16;
    c.strokeStyle = farbe;
    c.stroke();
    c.lineWidth = 4;
    c.strokeStyle = '#1d211c';
    c.beginPath(); c.arc(96, 96, 94, 0, 7); c.stroke();
    c.fillStyle = '#1d211c';
    c.font = `700 ${nummer > 99 ? 72 : nummer > 9 ? 96 : 120}px ${SCHRIFT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(nummer), 96, 104);
  });
}

function texSchrift(text, breite, hoehe, hintergrund, farbe) {
  return textur(breite, hoehe, (c, b, h) => {
    c.fillStyle = hintergrund;
    c.fillRect(0, 0, b, h);
    c.fillStyle = farbe;
    c.font = `700 ${Math.round(h * 0.62)}px ${SCHRIFT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, b / 2, h * 0.56);
  });
}

// -------------------------------------------------------------- Fahrzeug

/** Ein Fahrzeug, das sich entlang einer Fahrstraße aufstellen lässt. */
export class Fahrzeug {
  constructor(gruppe, { achsstand, raeder, radius, stangen = [] }) {
    this.gruppe = gruppe;
    this.achsstand = achsstand;
    this.raeder = raeder;
    this.radius = radius;
    this.stangen = stangen;
    this.winkel = 0;
    this.u = null;
    gruppe.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  /** Stellt das Fahrzeug mit seiner Mitte bei Bogenlänge u auf das Gleis. */
  setze(plan, gleis, u) {
    const vorn = plan.punkt(gleis, u - this.achsstand / 2);
    const hinten = plan.punkt(gleis, u + this.achsstand / 2);
    this.gruppe.position.set((vorn.x + hinten.x) / 2, 0, (vorn.z + hinten.z) / 2);
    this.gruppe.rotation.y = Math.atan2(-(vorn.z - hinten.z), vorn.x - hinten.x);
    if (this.u !== null) this.rolle(u - this.u);
    this.u = u;
  }

  /** Vergisst die letzte Position, damit ein Sprung die Räder nicht dreht. */
  vergissPosition() {
    this.u = null;
  }

  rolle(strecke) {
    this.winkel += strecke / this.radius;
    for (const rad of this.raeder) rad.rotation.z = this.winkel;
    for (const s of this.stangen) {
      const w = this.winkel + s.versatz;
      s.koerper.position.x = s.x + Math.cos(w) * s.kurbel;
      s.koerper.position.y = s.y + Math.sin(w) * s.kurbel;
    }
  }
}

function baueRadsatz(gruppe, raeder, x, radius, farbeMitte) {
  const geo = einmal('radgeo' + radius, () => {
    const g = new THREE.CylinderGeometry(radius, radius, 0.13, 28);
    g.rotateX(Math.PI / 2);
    return g;
  });
  const matSeite = einmal('radrand', () => stoff(0x3a3c40, 0.5, 0.5));
  const matFlaeche = einmal('radflaeche' + farbeMitte, () => stoff(0xffffff, 0.6, 0.2, texRad(farbeMitte)));
  for (const z of [-MASSE.SPUR / 2, MASSE.SPUR / 2]) {
    const rad = new THREE.Mesh(geo, [matSeite, matFlaeche, matFlaeche]);
    rad.position.set(x, Y0 + radius, z);
    gruppe.add(rad);
    raeder.push(rad);
  }
  const achse = new THREE.CylinderGeometry(0.07, 0.07, MASSE.SPUR, 8);
  achse.rotateX(Math.PI / 2);
  gruppe.add(koerper(achse, matDunkel(), x, Y0 + radius, 0));
}

function bauePuffer(gruppe, laenge, y) {
  for (const seite of [-1, 1]) {
    for (const z of [-0.88, 0.88]) {
      gruppe.add(walzeX(0.085, 0.42, matDunkel(), seite * (laenge / 2 + 0.21), y, z, 10));
      gruppe.add(walzeX(0.24, 0.07, matStahl(), seite * (laenge / 2 + 0.45), y, z, 16));
    }
    gruppe.add(quader(0.3, 0.14, 0.14, matDunkel(), seite * (laenge / 2 + 0.15), y - 0.02, 0));
  }
}

// --------------------------------------------------------------- Waggons

const RAHMEN = 7.8;       // Länge des Untergestells
const DECK = Y0 + 1.16;   // Oberkante des Untergestells

function baueUntergestell(gruppe, raeder) {
  gruppe.add(quader(RAHMEN, 0.28, 2.5, matDunkel(), 0, DECK - 0.14, 0));
  for (const x of [-2.5, 2.5]) {
    baueRadsatz(gruppe, raeder, x, 0.46, '#34373b');
    for (const z of [-1.02, 1.02]) {
      gruppe.add(quader(0.9, 0.5, 0.1, matDunkel(), x, Y0 + 0.62, z));   // Achshalter
      gruppe.add(quader(1.5, 0.08, 0.1, matDunkel(), x, Y0 + 0.84, z));  // Blattfeder
    }
  }
  bauePuffer(gruppe, RAHMEN, Y0 + 1.0);
}

function baueSchilder(gruppe, nummer, y, zAussen, x = 0) {
  const mat = new THREE.MeshStandardMaterial({ map: texNummernschild(nummer), roughness: 0.6 });
  const geo = einmal('schildgeo', () => new THREE.PlaneGeometry(1.25, 1.25));
  const vorn = koerper(geo, mat, x, y, zAussen + 0.015);
  const hinten = koerper(geo, mat, -x, y, -zAussen - 0.015);
  hinten.rotation.y = Math.PI;
  gruppe.add(vorn, hinten);
}

function baueGedeckt(gruppe, nummer, farbe) {
  const wand = stoff(farbe, 0.8, 0.02, gekachelt(texBretter(), 7));
  gruppe.add(quader(7.5, 2.55, 2.75, wand, 0, DECK + 1.275, 0));
  gruppe.add(tonnendach(7.75, 2.95, 0.42, einmal('dachgrau', () => stoff(0xb7bbbe, 0.7, 0.1)), 0, DECK + 2.55));
  const tuer = stoff(new THREE.Color(farbe).multiplyScalar(0.78), 0.8, 0.02);
  for (const z of [-1.4, 1.4]) {
    gruppe.add(quader(1.9, 2.25, 0.06, tuer, 0.9, DECK + 1.2, z));
    gruppe.add(quader(4.1, 0.08, 0.08, matDunkel(), 0.2, DECK + 2.4, z));  // Laufschiene der Schiebetür
  }
  baueSchilder(gruppe, nummer, DECK + 1.45, 1.375, -2.35);
  return DECK + 2.97;
}

function baueContainer(gruppe, nummer, farbe) {
  gruppe.add(quader(RAHMEN, 0.12, 2.7, matDunkel(), 0, DECK + 0.06, 0));
  const blech = stoff(farbe, 0.55, 0.25, gekachelt(texWellblech(), 18));
  gruppe.add(quader(7.2, 2.6, 2.5, blech, 0, DECK + 1.42, 0));
  const kante = stoff(new THREE.Color(farbe).multiplyScalar(0.6), 0.6, 0.2);
  for (const x of [-3.6, 3.6]) {
    for (const z of [-1.25, 1.25]) {
      gruppe.add(quader(0.16, 2.64, 0.16, kante, x, DECK + 1.42, z));
    }
  }
  for (const z of [-1.25, 1.25]) {
    gruppe.add(quader(7.3, 0.14, 0.14, kante, 0, DECK + 2.71, z));
    gruppe.add(quader(7.3, 0.14, 0.14, kante, 0, DECK + 0.17, z));
  }
  baueSchilder(gruppe, nummer, DECK + 1.42, 1.25, 0);
  return DECK + 2.75;
}

function baueKessel(gruppe, nummer, farbe) {
  const mitte = DECK + 1.5;
  const lack = stoff(farbe, 0.38, 0.25);
  gruppe.add(walzeX(1.2, 6.2, lack, 0, mitte, 0, 28));
  for (const seite of [-1, 1]) {
    const kappe = koerper(new THREE.SphereGeometry(1.2, 24, 14), lack, seite * 3.1, mitte, 0);
    kappe.scale.x = 0.42;
    gruppe.add(kappe);
    gruppe.add(quader(0.5, 0.5, 2.1, matDunkel(), seite * 2.2, DECK + 0.25, 0));   // Sattel
    gruppe.add(walzeX(1.215, 0.12, matDunkel(), seite * 1.9, mitte, 0, 28));       // Spannband
  }
  gruppe.add(koerper(new THREE.CylinderGeometry(0.42, 0.46, 0.38, 18), lack, 0, mitte + 1.3, 0));
  gruppe.add(koerper(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 18), matDunkel(), 0, mitte + 1.52, 0));
  gruppe.add(quader(2.6, 0.05, 0.7, matDunkel(), 0, mitte + 1.2, 0.0));   // Laufsteg
  for (const x of [-0.25, 0.25]) {
    gruppe.add(quader(0.05, 2.5, 0.05, matDunkel(), x + 1.6, DECK + 1.25, 1.26));
  }
  for (let i = 0; i < 6; i++) {
    gruppe.add(quader(0.5, 0.04, 0.04, matDunkel(), 1.6, DECK + 0.3 + i * 0.42, 1.26));
  }
  baueSchilder(gruppe, nummer, mitte, 1.21, -0.9);
  return mitte + 1.56;
}

function baueOffen(gruppe, nummer, farbe) {
  const wand = stoff(farbe, 0.85, 0.02, gekachelt(texBretter(), 7));
  const rand = stoff(new THREE.Color(farbe).multiplyScalar(0.62), 0.8, 0.05);
  gruppe.add(quader(7.6, 0.12, 2.7, matDunkel(), 0, DECK + 0.06, 0));
  for (const z of [-1.3, 1.3]) {
    gruppe.add(quader(7.6, 1.5, 0.1, wand, 0, DECK + 0.87, z));
    gruppe.add(quader(7.7, 0.1, 0.16, rand, 0, DECK + 1.65, z));
    for (let i = 0; i < 6; i++) {
      gruppe.add(quader(0.1, 1.5, 0.06, rand, -3.3 + i * 1.32, DECK + 0.87, z + Math.sign(z) * 0.07));
    }
  }
  for (const x of [-3.75, 3.75]) {
    gruppe.add(quader(0.1, 1.5, 2.6, wand, x, DECK + 0.87, 0));
    gruppe.add(quader(0.16, 0.1, 2.76, rand, x, DECK + 1.65, 0));
  }
  // Ladung: je nach Nummer Kohle, Kies oder Sand
  const ladungen = [0x1f2022, 0x8d8a84, 0xc9a86a];
  const ladung = new THREE.MeshStandardMaterial({
    color: ladungen[nummer % ladungen.length], roughness: 1, flatShading: true,
  });
  const haufen = koerper(new THREE.SphereGeometry(1, 11, 7), ladung, 0, DECK + 1.15, 0);
  haufen.scale.set(3.55, 0.85, 1.2);
  gruppe.add(haufen);
  baueSchilder(gruppe, nummer, DECK + 0.88, 1.42, 0);
  return DECK + 2.0;
}

const BAUARTEN = [baueGedeckt, baueContainer, baueKessel, baueOffen];

/** Ein Güterwaggon mit Nummer; Bauart und Farbe hängen von der Nummer ab. */
export class Waggon extends Fahrzeug {
  constructor(nummer) {
    const gruppe = new THREE.Group();
    const raeder = [];
    const farbe = farbeVon(nummer);
    baueUntergestell(gruppe, raeder);
    const hoehe = BAUARTEN[(nummer - 1) % BAUARTEN.length](gruppe, nummer, farbe);
    super(gruppe, { achsstand: 5.0, raeder, radius: 0.46 });
    this.nummer = nummer;

    // Schwebende Nummernmarke: dreht sich immer zur Kamera und bleibt so aus
    // jeder Richtung lesbar, auch von oben.
    this.texNormal = texMarke(nummer, farbe, false);
    this.texGewaehlt = texMarke(nummer, farbe, true);
    this.marke = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texNormal }));
    this.hoehe = hoehe;
    this.gewaehlt = false;
    this.marke.position.set(0, hoehe + 1.55, 0);
    this.marke.scale.set(2.3, 2.3, 1);
    gruppe.add(this.marke);
  }

  setzeAuswahl(gewaehlt) {
    this.gewaehlt = gewaehlt;
    this.marke.material.map = gewaehlt ? this.texGewaehlt : this.texNormal;
  }

  /** Passt die Nummernmarke an die Kamera an, damit sie lesbar bleibt. */
  zeigeMarke(welt) {
    const groesse = welt.lesbareGroesse(this.marke, this.gewaehlt ? 3.0 : 2.3, this.gewaehlt ? 0.044 : 0.034);
    this.marke.position.y = this.hoehe + 0.4 + groesse / 2;
  }
}

// ------------------------------------------------------------------- Lok

/** Die Rangierlok: Diesellok mit langem Vorbau, Führerhaus und Kuppelstangen. */
export class Lok extends Fahrzeug {
  constructor() {
    const g = new THREE.Group();
    const raeder = [];
    const laenge = 9.6;
    const rot = stoff(0xb3261e, 0.45, 0.2);
    const rotDunkel = stoff(0x8c1d17, 0.5, 0.2);
    const grau = stoff(0xc4c7c9, 0.6, 0.15);
    const gelb = stoff(0xf0c010, 0.5, 0.1);
    const boden = Y0 + 1.37;   // Oberkante des Umlaufs

    // Rahmen, Umlauf, Pufferbohlen
    g.add(quader(laenge, 0.5, 2.6, matDunkel(), 0, Y0 + 1.07, 0));
    g.add(quader(laenge, 0.07, 2.95, einmal('umlauf', () => stoff(0x4a4d50, 0.8, 0.2)), 0, boden - 0.035, 0));
    const warn = einmal('warn', () => {
      const t = textur(128, 32, (c, b, h) => {
        c.fillStyle = '#f0c010';
        c.fillRect(0, 0, b, h);
        c.fillStyle = '#1d211c';
        for (let x = -h; x < b; x += 26) {
          c.beginPath();
          c.moveTo(x, h); c.lineTo(x + 13, h); c.lineTo(x + 13 + h, 0); c.lineTo(x + h, 0);
          c.fill();
        }
      });
      return stoff(0xffffff, 0.6, 0.1, t);
    });
    for (const seite of [-1, 1]) {
      g.add(quader(0.18, 0.62, 2.9, warn, seite * (laenge / 2 - 0.02), Y0 + 1.03, 0));
    }
    bauePuffer(g, laenge, Y0 + 1.0);

    // Langer Vorbau (Motor) in Richtung der Waggons
    const vorbauL = 5.4;
    const vorbauX = -1.7;
    g.add(quader(vorbauL, 1.6, 2.0, rot, vorbauX, boden + 0.8, 0));
    g.add(tonnendach(vorbauL, 2.0, 0.3, rot, vorbauX, boden + 1.6));
    const lamellen = einmal('lamellen', () => {
      const t = textur(256, 64, (c, b, h) => {
        c.fillStyle = '#8c1d17';
        c.fillRect(0, 0, b, h);
        c.fillStyle = 'rgba(0,0,0,0.5)';
        for (let x = 6; x < b; x += 10) c.fillRect(x, 6, 4, h - 12);
      });
      return stoff(0xffffff, 0.6, 0.2, t);
    });
    for (const z of [-1.01, 1.01]) {
      const feld = koerper(new THREE.PlaneGeometry(3.4, 0.85), lamellen, vorbauX - 0.4, boden + 0.95, z);
      if (z < 0) feld.rotation.y = Math.PI;
      g.add(feld);
    }
    const grill = einmal('grill', () => {
      const t = textur(128, 128, (c, b, h) => {
        c.fillStyle = '#2a2c2e';
        c.fillRect(0, 0, b, h);
        c.fillStyle = '#6d7175';
        for (let y = 8; y < h; y += 12) c.fillRect(8, y, b - 16, 5);
      });
      return stoff(0xffffff, 0.6, 0.3, t);
    });
    const kuehler = koerper(new THREE.PlaneGeometry(1.5, 1.15), grill, vorbauX - vorbauL / 2 - 0.01, boden + 0.85, 0);
    kuehler.rotation.y = -Math.PI / 2;
    g.add(kuehler);
    g.add(koerper(new THREE.CylinderGeometry(0.13, 0.16, 0.75, 12), matDunkel(), -3.1, boden + 2.2, 0));

    // Führerhaus
    const hausX = 2.25;
    g.add(quader(2.5, 2.75, 2.8, rot, hausX, boden + 1.375, 0));
    g.add(quader(2.9, 0.12, 3.05, grau, hausX, boden + 2.81, 0));
    g.add(tonnendach(2.9, 3.05, 0.22, grau, hausX, boden + 2.87));
    for (const z of [-1.405, 1.405]) {
      const fenster = koerper(new THREE.PlaneGeometry(1.55, 0.95), matGlas(), hausX, boden + 2.0, z);
      if (z < 0) fenster.rotation.y = Math.PI;
      g.add(fenster);
      const name = koerper(new THREE.PlaneGeometry(1.3, 0.42),
        new THREE.MeshStandardMaterial({ map: texSchrift('Lok 1', 256, 84, '#f7f5ee', '#1d211c'), roughness: 0.6 }),
        hausX, boden + 0.85, z + Math.sign(z) * 0.002);
      if (z < 0) name.rotation.y = Math.PI;
      g.add(name);
    }
    for (const seite of [-1, 1]) {
      for (const z of [-0.78, 0.78]) {
        const fenster = koerper(new THREE.PlaneGeometry(0.85, 0.8), matGlas(), hausX + seite * 1.255, boden + 2.1, z);
        fenster.rotation.y = seite * Math.PI / 2;
        g.add(fenster);
      }
    }

    // Kurzer Vorbau zum Ausziehgleis hin
    g.add(quader(1.25, 1.25, 2.0, rotDunkel, 4.12, boden + 0.625, 0));

    // Lampen
    const licht = einmal('licht', () => new THREE.MeshStandardMaterial({
      color: 0xfff3c4, emissive: 0xffe9a0, emissiveIntensity: 1.6, roughness: 0.3,
    }));
    const lampe = einmal('lampengeo', () => {
      const geo = new THREE.CylinderGeometry(0.15, 0.15, 0.06, 14);
      geo.rotateZ(Math.PI / 2);
      return geo;
    });
    for (const z of [-0.7, 0.7]) {
      g.add(koerper(lampe, licht, vorbauX - vorbauL / 2 - 0.03, boden + 0.25, z));
      g.add(koerper(lampe, licht, 4.76, boden + 0.25, z));
    }
    g.add(koerper(lampe, licht, vorbauX - vorbauL / 2 - 0.03, boden + 1.5, 0));
    g.add(koerper(lampe, licht, hausX + 1.26, boden + 2.62, 0));

    // Geländer
    for (const z of [-1.4, 1.4]) {
      g.add(walzeX(0.035, 5.5, gelb, vorbauX - 0.05, boden + 1.0, z, 8));
      for (let x = -4.4; x <= 1.0; x += 1.35) {
        g.add(koerper(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8), gelb, x, boden + 0.5, z));
      }
      g.add(quader(0.5, 0.06, 0.3, matDunkel(), 1.15, Y0 + 0.75, z + Math.sign(z) * 0.05));   // Tritt
      g.add(quader(0.5, 0.06, 0.3, matDunkel(), 3.35, Y0 + 0.75, z + Math.sign(z) * 0.05));
    }

    // Drei Radsätze mit Kuppelstangen
    const radius = 0.6;
    for (const x of [-2.3, 0, 2.3]) baueRadsatz(g, raeder, x, radius, '#a3231c');
    const stangen = [];
    for (const z of [-0.86, 0.86]) {
      const stange = quader(5.0, 0.13, 0.06, matStahl(), 0, Y0 + radius, z);
      g.add(stange);
      stangen.push({ koerper: stange, x: 0, y: Y0 + radius, kurbel: 0.27, versatz: z > 0 ? 0 : Math.PI / 2 });
    }

    super(g, { achsstand: 4.6, raeder, radius, stangen });
    this.rolle(0);
  }
}
