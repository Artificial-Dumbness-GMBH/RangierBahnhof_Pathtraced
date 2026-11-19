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
  return mat;
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
  return baueSchilder(gruppe, nummer, DECK + 1.45, 1.375, -2.35);
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
  return baueSchilder(gruppe, nummer, DECK + 1.42, 1.25, 0);
}

function baueKessel(gruppe, nummer, farbe) {
  const mitte = DECK + 1.5;
  const lack = pbrMaterial(farbe, 'lack');
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
  return baueSchilder(gruppe, nummer, mitte, 1.21, -0.9);
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
  return baueSchilder(gruppe, nummer, DECK + 0.88, 1.42, 0);
}

const BAUARTEN = [baueGedeckt, baueContainer, baueKessel, baueOffen];

/** Ein Güterwaggon mit Nummer; Bauart und Farbe hängen von der Nummer ab. */
export class Waggon extends Fahrzeug {
  constructor(nummer) {
    const gruppe = new THREE.Group();
    const raeder = [];
    const farbe = farbeVon(nummer);
    baueUntergestell(gruppe, raeder);
    const schild = BAUARTEN[(nummer - 1) % BAUARTEN.length](gruppe, nummer, farbe);
    super(gruppe, { achsstand: 5.0, raeder, radius: 0.46 });
    this.nummer = nummer;
    this.schild = schild;
  }

  setzeAuswahl(gewaehlt) {
    this.schild.emissive.setHex(gewaehlt ? 0xc99315 : 0);
  }
}

/** Für lange Züge nutzen alle Waggons dieselben zwei Zeichenvorgänge. */
export class WaggonFlotte {
  constructor(plan) {
    this.gruppe = new THREE.Group();
    const material = stoff(0xffffff);
    const unterbau = new THREE.BoxGeometry(8.4, 0.75, 2.32).translate(0, Y0 + 0.54, 0);
    const aufbau = new THREE.BoxGeometry(7.5, 2.55, 2.65).translate(0, DECK + 1.03, 0);
    this.rahmen = new THREE.InstancedMesh(unterbau, matDunkel(), plan.kapazitaet);
    this.aufbauten = new THREE.InstancedMesh(aufbau, material, plan.kapazitaet);
    for (const teil of [this.rahmen, this.aufbauten]) {
      teil.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      teil.boundingSphere = new THREE.Sphere(new THREE.Vector3(), plan.laenge / 2 + 15);
      teil.receiveShadow = true;
      this.gruppe.add(teil);
    }
  }

  entsorge() {
    for (const teil of [this.rahmen, this.aufbauten]) {
      teil.geometry.dispose();
      teil.dispose();
    }
    this.aufbauten.material.dispose();
  }
}

export class WaggonUebersicht extends Fahrzeug {
  constructor(nummer, flotte, index) {
    super(new THREE.Object3D(), { achsstand: 5, raeder: [], radius: 0.46 });
    this.nummer = nummer;
    this.flotte = flotte;
    this.index = index;
    this.farbe = new THREE.Color(farbeVon(nummer));
    this.setzeAuswahl(false);
  }

  setze(plan, gleis, u) {
    super.setze(plan, gleis, u);
    this.gruppe.updateMatrix();
    for (const teil of [this.flotte.rahmen, this.flotte.aufbauten]) {
      teil.setMatrixAt(this.index, this.gruppe.matrix);
      teil.instanceMatrix.addUpdateRange(this.index * 16, 16);
      teil.instanceMatrix.needsUpdate = true;
    }
  }

  setzeAuswahl(gewaehlt) {
    const { aufbauten } = this.flotte;
    aufbauten.setColorAt(this.index, gewaehlt ? new THREE.Color(0xe5b524) : this.farbe);
    aufbauten.instanceColor.addUpdateRange(this.index * 3, 3);
    aufbauten.instanceColor.needsUpdate = true;
  }
}

// ------------------------------------------------------------------- Lok

/** Dampfrangierlok mit Rauchkammer, Schornstein und gekuppelten Treibrädern. */
export class Lok extends Fahrzeug {
  constructor() {
    const g = new THREE.Group();
    const raeder = [];
    const laenge = 9.6;
    const rot = pbrMaterial(0xa92720, 'lack');
    const gruenerLack = pbrMaterial(0x285e46, 'lack');
    const messing = stoff(0xd4a453, 0.43, 0.65);
    const schwarz = matDunkel();
    const umlauf = Y0 + 1.42;
    const kesselY = umlauf + 1.13;
    const schornsteinX = -3.6;

    g.add(quader(laenge, 0.35, 2.55, rot, 0, Y0 + 1.06, 0));
    g.add(quader(laenge, 0.1, 2.9, schwarz, 0, umlauf - 0.05, 0));
    for (const seite of [-1, 1]) {
      g.add(quader(0.24, 0.56, 2.85, rot, seite * (laenge / 2 - 0.12), Y0 + 1, 0));
    }
    bauePuffer(g, laenge, Y0 + 1);

    g.add(walzeX(1.04, 3.95, gruenerLack, -0.95, kesselY, 0, 28));
    g.add(walzeX(1.06, 1.42, schwarz, -3.54, kesselY, 0, 28));
    g.add(walzeX(0.87, 0.14, matStahl(), -4.29, kesselY, 0, 28));
    g.add(walzeX(0.14, 0.16, messing, -4.41, kesselY, 0));
    for (const x of [-2.6, -1.3, 0.55]) {
      g.add(walzeX(1.056, 0.075, messing, x, kesselY, 0, 28));
    }
    g.add(koerper(new THREE.CylinderGeometry(0.30, 0.42, 0.92, 20),
      schwarz, schornsteinX, kesselY + 1.46, 0));
    g.add(koerper(new THREE.CylinderGeometry(0.46, 0.30, 0.22, 20),
      schwarz, schornsteinX, kesselY + 1.94, 0));
    g.add(koerper(new THREE.CylinderGeometry(0.30, 0.30, 0.025, 20),
      stoff(0x08090a), schornsteinX, kesselY + 2.06, 0));
    g.add(koerper(new THREE.CylinderGeometry(0.34, 0.49, 0.43, 20),
      messing, -1.58, kesselY + 1.14, 0));

    const hausX = 2.37;
    g.add(quader(2.65, 2.68, 2.77, gruenerLack, hausX, umlauf + 1.34, 0));
    g.add(quader(2.93, 0.12, 3.06, schwarz, hausX, umlauf + 2.7, 0));
    g.add(tonnendach(2.93, 3.06, 0.32, schwarz, hausX, umlauf + 2.76));
    g.add(quader(1.12, 1.58, 2.56, schwarz, 4.2, umlauf + 0.79, 0));

    const licht = einmal('licht', () => new THREE.MeshStandardMaterial({
      color: 0xfff3c4, emissive: 0xffe9a0, emissiveIntensity: 1.6, roughness: 0.3,
    }));
    for (const seite of [-1, 1]) {
      const z = seite * 1.394;
      g.add(quader(1.56, 0.97, 0.035, messing, hausX, umlauf + 1.94, z));
      g.add(quader(1.43, 0.85, 0.05, matGlas(), hausX, umlauf + 1.94, z));
      g.add(quader(0.055, 0.88, 0.06, messing, hausX, umlauf + 1.94, z));
      g.add(quader(1.9, 0.08, 0.32, schwarz, 2.62, Y0 + 0.72, seite * 1.42));
      g.add(quader(0.76, 0.37, 0.44, schwarz, -3.37, Y0 + 0.67, seite * 1.02));
      for (const x of [-4.47, 4.72]) {
        g.add(walzeX(0.14, 0.18, licht, x, umlauf + 0.32, seite * 0.92, 14));
      }
    }

    const radius = 0.70;
    for (const x of [-2.3, 0, 2.3]) baueRadsatz(g, raeder, x, radius, '#a3231c');
    const stangen = [];
    for (const z of [-0.87, 0.87]) {
      const stange = quader(5.0, 0.14, 0.08, matStahl(), 0, Y0 + radius, z);
      g.add(stange);
      stangen.push({ koerper: stange, x: 0, y: Y0 + radius, kurbel: 0.27, versatz: z > 0 ? 0 : Math.PI / 2 });
    }

    super(g, { achsstand: 4.6, raeder, radius, stangen });
    this.schornstein = new THREE.Vector3(schornsteinX, kesselY + 2.13, 0);
    this.rolle(0);
  }
}
