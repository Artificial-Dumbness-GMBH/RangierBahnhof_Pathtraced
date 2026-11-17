// Hauptprogramm der 3D-Ansicht: verbindet Szene, Rangierbetrieb, Stellpult
// und das Java-Programm.
//
// Zwei Betriebsarten:
//   "Selbst rangieren" – Waggons per Klick verschieben (läuft ganz im Browser).
//   "Algorithmus"      – das Java-Programm führt sortiere() aus und meldet
//                        alle Verschiebungen; sie werden hier nachgefahren.

import * as THREE from './lib/three.module.js';
import { Gleisplan, GLEISE, MASSE } from './gleisplan.js';
import { Welt } from './szene.js';
import { Lok, Waggon, farbeVon } from './fahrzeuge.js';
import { Rangierbetrieb } from './rangierfahrt.js';
import { Kamerafuehrung } from './kamera.js';

const $ = (id) => document.getElementById(id);

const welt = new Welt($('szene'));
const kamera = new Kamerafuehrung(welt.kamera, $('szene'));
const lok = new Lok();
welt.fahrzeuge.add(lok.gruppe);

const waggonLager = new Map();   // Nummer -> Waggon (wird wiederverwendet)

const zustand = {
  modus: 'hand',
  start: [],
  plan: null,
  betrieb: null,
  waggons: [],
  logisch: { A: [], B: [], C: [] },
  zaehler: 0,
  gewaehlt: null,
  schwebend: null,
  geschafft: false,
  laeuft: true,
  haltNachZug: false,
  lauf: null,
  tempo: 2,
  verbunden: false,
  kennung: null,
  kameraArt: 'uebersicht',
};

// ------------------------------------------------------------ Merkzettel

function merke(name, wert) {
  try { localStorage.setItem('rangierbahnhof.' + name, String(wert)); } catch (e) { /* ohne Speicher geht es auch */ }
}

function erinnere(name) {
  try { return localStorage.getItem('rangierbahnhof.' + name); } catch (e) { return null; }
}

// ------------------------------------------------------------ Aufstellen

function wuerfle(anzahl) {
  const alle = Array.from({ length: 100 }, (_, i) => i + 1);
  let nummern;
  do {
    for (let i = alle.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [alle[i], alle[j]] = [alle[j], alle[i]];
    }
    nummern = alle.slice(0, anzahl);
  } while (nummern.every((n, i) => i === 0 || nummern[i - 1] < n));   // nicht schon sortiert beginnen
  return nummern;
}

/** Baut den Bahnhof für eine Startbelegung (Nummern vom Prellbock nach vorne). */
function baueAuf(start) {
  zustand.start = [...start];
  const neuePlanung = !zustand.plan || zustand.plan.kapazitaet !== start.length;
  if (neuePlanung) {
    zustand.plan = new Gleisplan(start.length);
    welt.baue(zustand.plan);
    zustand.betrieb = new Rangierbetrieb(zustand.plan, lok, welt);
  }
  for (const w of zustand.waggons) welt.fahrzeuge.remove(w.gruppe);
  zustand.waggons = start.map((nummer) => {
    if (!waggonLager.has(nummer)) {
      const w = new Waggon(nummer);
      w.gruppe.userData.waggon = w;
      waggonLager.set(nummer, w);
    }
    const w = waggonLager.get(nummer);
    welt.fahrzeuge.add(w.gruppe);
    return w;
  });
  stelleStartHer();
  if (neuePlanung) stelleKameraEin(zustand.kameraArt === 'lok' ? 'uebersicht' : zustand.kameraArt, 0.01);
}

/** Setzt alles auf die Startbelegung zurück. */
function stelleStartHer() {
  zustand.lauf = null;
  zustand.laeuft = true;
  zustand.haltNachZug = false;
  zustand.geschafft = false;
  zustand.zaehler = 0;
  zustand.logisch = { A: [...zustand.start], B: [], C: [] };
  waehle(null);
  for (const w of zustand.waggons) w.gleis = 'A';
  zustand.betrieb.stelleAuf(zustand.waggons);
  $('befehl').textContent = ' ';
  zeigeGrundmeldung();
  zeichneGleisbild();
  zeichneZaehler();
  stelleTastenEin();
}

// --------------------------------------------------------- Verschiebung

/** Verschiebt den vordersten Waggon von Gleis von nach Gleis nach. */
function verschiebe(von, nach, beiEnde) {
  const quelle = zustand.logisch[von];
  if (quelle.length === 0) return false;
  const nummer = quelle.pop();
  zustand.logisch[nach].push(nummer);
  waggonLager.get(nummer).gleis = nach;
  zustand.zaehler++;
  $('befehl').textContent = `verschiebeWaggon(gleis${von}, gleis${nach});`;
  zeichneGleisbild();
  zeichneZaehler();
  zustand.betrieb.reihe(von, nach, null, beiEnde);
  stelleTastenEin();
  return true;
}

function istSortiert() {
  const belegt = GLEISE.filter((g) => zustand.logisch[g].length > 0);
  if (belegt.length !== 1) return false;
  const reihe = zustand.logisch[belegt[0]];
  return reihe.every((n, i) => i === 0 || reihe[i - 1] < n);
}

// ------------------------------------------------------ Selbst rangieren

function waehle(gleis) {
  if (zustand.gewaehlt) {
    const alt = zustand.logisch[zustand.gewaehlt];
    if (alt.length > 0) waggonLager.get(alt[alt.length - 1]).setzeAuswahl(false);
  }
  for (const w of zustand.waggons) w.setzeAuswahl(false);
  zustand.gewaehlt = gleis;
  if (gleis) {
    const reihe = zustand.logisch[gleis];
    waggonLager.get(reihe[reihe.length - 1]).setzeAuswahl(true);
  }
  zeichneGleisbild();
}

function klickeGleis(gleis) {
  if (zustand.modus !== 'hand') return;
  if (zustand.gewaehlt === null) {
    const reihe = zustand.logisch[gleis];
    if (reihe.length === 0) {
      melde(`Gleis ${gleis} ist leer. Zuerst ein Gleis mit Waggons wählen.`);
      return;
    }
    waehle(gleis);
    melde(`Waggon ${reihe[reihe.length - 1]} gewählt. Jetzt das Zielgleis anklicken.`);
    return;
  }
  if (zustand.gewaehlt === gleis) {
    waehle(null);
    zeigeGrundmeldung();
    return;
  }
  const von = zustand.gewaehlt;
  waehle(null);
  verschiebe(von, gleis, () => {
    if (zustand.geschafft && !zustand.betrieb.beschaeftigt) zeigeHandErfolg();
    stelleTastenEin();
  });
  zustand.geschafft = istSortiert();
  if (zustand.geschafft) zeigeHandErfolg(); else zeigeGrundmeldung();
}

function zeigeHandErfolg() {
  melde(`Sortiert mit ${zustand.zaehler} Verschiebungen. Geht es mit weniger?`, 'gut');
}

// ----------------------------------------------------------- Algorithmus

async function fuehreAlgorithmusAus() {
  if (!zustand.verbunden) {
    melde('Keine Verbindung zum Java-Programm. In VS Code die Klasse Main starten.', 'schlecht');
    return;
  }
  stelleStartHer();
  melde('sortiere() läuft …');
  let ergebnis;
  try {
    const antwort = await fetch('/api/sortiere?start=' + zustand.start.join(','), { method: 'POST', cache: 'no-store' });
    if (!antwort.ok) throw new Error(await antwort.text());
    ergebnis = await antwort.json();
  } catch (fehler) {
    melde('Das Java-Programm hat nicht geantwortet. Läuft die Klasse Main noch?', 'schlecht');
    return;
  }
  zeichneCheckliste(ergebnis.checkliste);
  const lauf = { zuege: ergebnis.zuege, index: 0, ergebnis, fertig: false };
  zustand.lauf = lauf;
  zeichneZaehler();
  if (lauf.zuege.length === 0) {
    zeigeErgebnis(lauf);
  } else {
    melde('Die Lok fährt die gemeldeten Verschiebungen nach.');
    spieleNaechsten(lauf);
  }
  stelleTastenEin();
}

function spieleNaechsten(lauf) {
  if (zustand.lauf !== lauf || lauf.fertig) return;
  if (lauf.index >= lauf.zuege.length) {
    zeigeErgebnis(lauf);
    return;
  }
  const zug = lauf.zuege[lauf.index++];
  verschiebe(zug[0], zug[1], () => {
    if (zustand.lauf !== lauf) return;
    if (lauf.index >= lauf.zuege.length) {
      zeigeErgebnis(lauf);
    } else if (zustand.haltNachZug) {
      zustand.haltNachZug = false;
      zustand.laeuft = false;
      stelleTastenEin();
    } else {
      spieleNaechsten(lauf);
    }
  });
}

function zeigeErgebnis(lauf) {
  lauf.fertig = true;
  zustand.laeuft = true;
  zustand.haltNachZug = false;
  melde(lauf.ergebnis.meldung, lauf.ergebnis.sortiert ? 'gut' : 'schlecht');
  stelleTastenEin();
}

function laufOffen() {
  return zustand.lauf !== null && !zustand.lauf.fertig;
}

// -------------------------------------------------------------- Anzeigen

function melde(text, art = '') {
  const feld = $('meldung');
  feld.textContent = text;
  feld.className = 'meldung' + (art ? ' ' + art : '');
}

function zeigeGrundmeldung() {
  if (zustand.modus === 'hand') {
    melde('Ein Gleis anklicken (oder Taste A, B, C): Der vorderste Waggon wird gewählt. Dann das Zielgleis anklicken.');
  } else {
    melde('„sortiere() ausführen“ startet die Methode im Java-Programm mit dieser Belegung.');
  }
}

function zeichneZaehler() {
  $('zaehlerZahl').textContent = String(zustand.zaehler);
  const einzahl = zustand.zaehler === 1;
  $('zaehlerText').textContent = zustand.lauf
    ? `von ${zustand.lauf.zuege.length} Verschiebungen`
    : einzahl ? 'Verschiebung' : 'Verschiebungen';
}

const reihen = {};

function baueGleisbild() {
  for (const gleis of GLEISE) {
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'gleis';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = gleis;
    const strecke = document.createElement('span');
    strecke.className = 'strecke';
    knopf.append(name, strecke);
    knopf.addEventListener('click', () => klickeGleis(gleis));
    $('gleisReihen').append(knopf);
    reihen[gleis] = { knopf, strecke };
  }
}

function zeichneGleisbild() {
  for (const gleis of GLEISE) {
    const { knopf, strecke } = reihen[gleis];
    const nummern = zustand.logisch[gleis];
    strecke.replaceChildren();
    for (const nummer of nummern) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.style.background = farbeVon(nummer);
      chip.textContent = String(nummer);
      strecke.append(chip);
    }
    const marke = document.createElement('span');
    marke.className = 'marke';
    marke.textContent = nummern.length > 0 ? 'top()' : 'isEmpty()';
    strecke.append(marke);
    knopf.classList.toggle('gewaehlt', zustand.gewaehlt === gleis);
    knopf.disabled = zustand.modus !== 'hand';
    const inhalt = nummern.length > 0 ? `Waggons ${nummern.join(', ')} (vom Prellbock nach vorne)` : 'leer';
    knopf.setAttribute('aria-label', `Gleis ${gleis}: ${inhalt}`);
  }
}

function zeichneCheckliste(punkte) {
  const liste = $('checklistePunkte');
  const kasten = $('checkliste');
  liste.replaceChildren();
  if (!punkte) {
    $('checklisteTitel').textContent = 'Checkliste';
    const leer = document.createElement('li');
    leer.className = 'leer';
    leer.style.display = 'block';
    leer.textContent = 'Erscheint, sobald sortiere() ausgeführt wurde.';
    liste.append(leer);
    kasten.open = true;
    return;
  }
  const erfuellt = punkte.filter((punkt) => punkt.status === 'ok').length;
  const alles = erfuellt === punkte.length;
  $('checklisteTitel').textContent = alles
    ? 'Checkliste: alles erfüllt'
    : `Checkliste: ${erfuellt} von ${punkte.length} erfüllt`;
  kasten.open = !alles;   // ist alles erfüllt, bleibt der Blick auf die Gleise frei
  for (const punkt of punkte) {
    const zeile = document.createElement('li');
    zeile.className = punkt.status;
    const lampe = document.createElement('span');
    lampe.className = 'lampe' + (punkt.status === 'ok' ? ' gruen' : punkt.status === 'fehler' ? ' rot' : '');
    const titel = document.createElement('span');
    titel.textContent = punkt.titel;
    zeile.append(lampe, titel);
    if (punkt.hinweis) {
      const hinweis = document.createElement('p');
      hinweis.className = 'hinweis';
      hinweis.textContent = punkt.hinweis;
      zeile.append(hinweis);
    }
    liste.append(zeile);
  }
}

function stelleTastenEin() {
  const algo = zustand.modus === 'algo';
  $('modusHand').setAttribute('aria-pressed', String(!algo));
  $('modusAlgo').setAttribute('aria-pressed', String(algo));
  $('tastenAlgo').hidden = !algo;
  $('tastenHand').hidden = algo;
  $('checkliste').hidden = !algo;
  const offen = laufOffen();
  $('pause').disabled = !offen;
  $('pause').textContent = zustand.laeuft ? 'Pause' : 'Weiter';
  $('einSchritt').disabled = !offen;
  $('zumEnde').disabled = !offen;
  $('zumEndeHand').disabled = !(zustand.betrieb && zustand.betrieb.beschaeftigt);
}

function setzeModus(modus) {
  zustand.modus = modus;
  merke('modus', modus);
  stelleStartHer();
}

// ---------------------------------------------------------------- Kamera

function stelleKameraEin(art, dauer = 0.9) {
  zustand.kameraArt = art;
  const plan = zustand.plan;
  kamera.folgt = null;
  // Die Punkte, die in Übersicht und Draufsicht im Bild sein müssen.
  const ecken = [];
  for (const x of [plan.xPrellbock - 4.4, plan.xEnde + 1.6]) {
    for (const z of [-MASSE.GLEISABSTAND - 3, MASSE.GLEISABSTAND + 3]) {
      for (const y of [0, 6.5]) ecken.push(new THREE.Vector3(x, y, z));
    }
  }
  const rand = { links: 0.02, rechts: 0.02, oben: 0.11, unten: 0.07 };
  if (art === 'uebersicht') {
    const ziel = new THREE.Vector3(0, 1, 0);
    kamera.fahreZu({ ziel, abstand: kamera.passenderAbstand(ecken, ziel, 51, -9, rand), neigung: 51, drehung: -9 }, dauer);
  } else if (art === 'oben') {
    const ziel = new THREE.Vector3(0, 0, -1);
    kamera.fahreZu({ ziel, abstand: kamera.passenderAbstand(ecken, ziel, 2.5, 0, rand), neigung: 2.5, drehung: 0 }, dauer);
  } else if (art === 'lok') {
    kamera.fahreZu({ ziel: lok.gruppe.position.clone().setY(2), abstand: 50, neigung: 64, drehung: -24 }, dauer);
    kamera.folgt = () => new THREE.Vector3(lok.gruppe.position.x, 2, lok.gruppe.position.z);
  }
  for (const knopf of document.querySelectorAll('[data-kamera]')) {
    knopf.setAttribute('aria-pressed', String(knopf.dataset.kamera === art));
  }
}

kamera.beiEingriff = (was) => {
  $('hinweisMaus').hidden = true;   // der Hinweis hat seinen Zweck erfüllt
  if (zustand.kameraArt === 'lok' && was !== 'verschoben') return;   // beim Folgen darf gedreht und gezoomt werden
  kamera.folgt = null;
  zustand.kameraArt = 'frei';
  for (const knopf of document.querySelectorAll('[data-kamera]')) knopf.setAttribute('aria-pressed', 'false');
};

kamera.beiKlick = (e) => {
  const gleis = welt.gleisBei(e.clientX, e.clientY, zustand.waggons);
  if (gleis) klickeGleis(gleis);
};

kamera.beiBewegung = (e, zieht) => {
  const flaeche = $('szene');
  flaeche.classList.toggle('greift', zieht);
  if (zieht || zustand.modus !== 'hand') {
    zustand.schwebend = null;
    flaeche.classList.remove('zeigt');
    return;
  }
  zustand.schwebend = welt.gleisBei(e.clientX, e.clientY, zustand.waggons);
  flaeche.classList.toggle('zeigt', zustand.schwebend !== null);
};

$('szene').addEventListener('pointerup', () => $('szene').classList.remove('greift'));
$('szene').addEventListener('pointerleave', () => { zustand.schwebend = null; });

// ------------------------------------------------------------ Verbindung

async function pruefeVerbindung() {
  let kennung = null;
  try {
    const abbruch = new AbortController();
    const wecker = setTimeout(() => abbruch.abort(), 900);
    const antwort = await fetch('/api/status', { cache: 'no-store', signal: abbruch.signal });
    clearTimeout(wecker);
    if (antwort.ok) kennung = (await antwort.json()).kennung;
  } catch (fehler) {
    kennung = null;
  }
  const verbunden = kennung !== null;
  const neuGestartet = verbunden && zustand.kennung !== null && zustand.kennung !== kennung;
  zustand.verbunden = verbunden;
  if (verbunden) zustand.kennung = kennung;
  $('verbindungLampe').className = 'lampe ' + (verbunden ? 'gruen' : 'rot');
  $('verbindungText').textContent = verbunden ? 'Java-Programm verbunden' : 'Java-Programm läuft nicht';
  if (neuGestartet && zustand.modus === 'algo') fuehreAlgorithmusAus();
}

// ---------------------------------------------------------------- Tempo

function setzeTempo(regler) {
  zustand.tempo = 0.5 * Math.pow(32, regler / 100);
  const zahl = zustand.tempo >= 10 ? Math.round(zustand.tempo) : Math.round(zustand.tempo * 10) / 10;
  $('tempoWert').textContent = String(zahl).replace('.', ',') + '×';
}

// ------------------------------------------------------------ Bedienung

$('modusHand').addEventListener('click', () => setzeModus('hand'));
$('modusAlgo').addEventListener('click', () => setzeModus('algo'));
$('wuerfeln').addEventListener('click', () => baueAuf(wuerfle(Number($('anzahl').value))));
$('anzahl').addEventListener('change', () => {
  merke('anzahl', $('anzahl').value);
  baueAuf(wuerfle(Number($('anzahl').value)));
});
$('vonVorn').addEventListener('click', () => stelleStartHer());
$('ausfuehren').addEventListener('click', () => fuehreAlgorithmusAus());
$('pause').addEventListener('click', () => {
  zustand.laeuft = !zustand.laeuft;
  zustand.haltNachZug = false;
  if (zustand.laeuft && laufOffen() && !zustand.betrieb.beschaeftigt) spieleNaechsten(zustand.lauf);
  stelleTastenEin();
});
$('einSchritt').addEventListener('click', () => {
  if (!laufOffen()) return;
  zustand.haltNachZug = true;
  zustand.laeuft = true;
  if (!zustand.betrieb.beschaeftigt) spieleNaechsten(zustand.lauf);
  stelleTastenEin();
});
$('zumEnde').addEventListener('click', () => {
  if (!laufOffen()) return;
  zustand.haltNachZug = false;
  zustand.laeuft = true;
  if (!zustand.betrieb.beschaeftigt) spieleNaechsten(zustand.lauf);
  zustand.betrieb.springeAnsEnde();
  stelleTastenEin();
});
$('zumEndeHand').addEventListener('click', () => {
  zustand.betrieb.springeAnsEnde();
  stelleTastenEin();
});
$('tempo').addEventListener('input', () => {
  setzeTempo(Number($('tempo').value));
  merke('tempo', $('tempo').value);
});
for (const knopf of document.querySelectorAll('[data-kamera]')) {
  knopf.addEventListener('click', () => stelleKameraEin(knopf.dataset.kamera));
}

const pathKnopf = $('pathtracing');
if (welt.pathtracing) {
  welt.pathtracingAktiv = erinnere('pathtracing') === 'true';
  pathKnopf.hidden = false;
  pathKnopf.setAttribute('aria-pressed', String(welt.pathtracingAktiv));
  pathKnopf.title = 'GPU-Pathtracing: Das Bild verfeinert sich bei ruhender Kamera. Bewegungen starten die Berechnung neu.';
  pathKnopf.addEventListener('click', () => {
    welt.pathtracingAktiv = !welt.pathtracingAktiv;
    welt.pathtracing.samples = 0;
    pathKnopf.setAttribute('aria-pressed', String(welt.pathtracingAktiv));
    merke('pathtracing', welt.pathtracingAktiv);
  });
}

const nebelKnopf = $('volumenlicht');
if (welt.volumenlicht) {
  welt.volumenlichtAktiv = erinnere('volumenlicht') !== 'false';
  nebelKnopf.hidden = false;
  nebelKnopf.setAttribute('aria-pressed', String(welt.volumenlichtAktiv));
  nebelKnopf.addEventListener('click', () => {
    welt.volumenlichtAktiv = !welt.volumenlichtAktiv;
    nebelKnopf.setAttribute('aria-pressed', String(welt.volumenlichtAktiv));
    merke('volumenlicht', welt.volumenlichtAktiv);
  });
}

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const taste = e.key.toUpperCase();
  if (GLEISE.includes(taste) && zustand.modus === 'hand') {
    klickeGleis(taste);
    e.preventDefault();
  } else if (e.key === ' ' && laufOffen() && !(e.target instanceof HTMLButtonElement)) {
    $('pause').click();
    e.preventDefault();
  } else if (e.key === 'ArrowRight' && laufOffen()) {
    $('einSchritt').click();
    e.preventDefault();
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) pruefeVerbindung();
});

new ResizeObserver(() => {
  welt.passeGroesseAn();
  if (zustand.plan && (zustand.kameraArt === 'uebersicht' || zustand.kameraArt === 'oben')) {
    stelleKameraEin(zustand.kameraArt, 0.01);
  }
}).observe($('buehne'));

// ----------------------------------------------------------------- Start

baueGleisbild();
zeichneCheckliste(null);
welt.passeGroesseAn();

const gemerkteAnzahl = Number(erinnere('anzahl'));
if (gemerkteAnzahl >= 3 && gemerkteAnzahl <= 9) $('anzahl').value = String(gemerkteAnzahl);
const gemerktesTempo = erinnere('tempo');
if (gemerktesTempo !== null && gemerktesTempo !== '') $('tempo').value = gemerktesTempo;
setzeTempo(Number($('tempo').value));
if (erinnere('modus') === 'algo') zustand.modus = 'algo';

baueAuf(wuerfle(Number($('anzahl').value)));
pruefeVerbindung();
setInterval(pruefeVerbindung, 1000);

let letzteZeit = performance.now();
function bild(jetzt) {
  const dt = Math.min(0.1, (jetzt - letzteZeit) / 1000);
  letzteZeit = jetzt;
  if (zustand.laeuft) zustand.betrieb.schritt(dt * zustand.tempo);
  kamera.schritt(dt);
  welt.markiere(zustand.schwebend, zustand.gewaehlt);
  welt.passeSchilderAn();
  for (const w of zustand.waggons) w.zeigeMarke(welt);
  welt.zeichne();
  requestAnimationFrame(bild);
}
requestAnimationFrame(bild);

// Für Neugierige und zur Fehlersuche in der Browser-Konsole erreichbar.
window.rangierbahnhof = {
  zustand, welt, kamera, lok, baueAuf, verschiebe, stelleKameraEin,
  /** Lässt die Rangierfahrt um die angegebene Zeit (Sekunden) weiterlaufen. */
  vor(sekunden) {
    for (let t = 0; t < sekunden; t += 0.02) zustand.betrieb.schritt(0.02);
  },
};
