// Rangierbetrieb: setzt eine Verschiebung "vorderster Waggon von Gleis X nach
// Gleis Y" in die Fahrten der Lok um.
//
// Ablauf einer Verschiebung:
//   1. Die Lok fährt (falls nötig über das Ausziehgleis) an den vordersten
//      Waggon von Gleis X heran und kuppelt an.
//   2. Sie zieht den Waggon über die Weiche hinaus auf das Ausziehgleis.
//   3. Die Weiche wird auf Gleis Y gestellt.
//   4. Die Lok schiebt den Waggon auf Gleis Y, bis er am letzten Waggon (oder
//      am Prellbock) steht, und kuppelt ab.

import { GLEISE, MASSE } from './gleisplan.js';

const KUPPEL = (MASSE.TAKT + MASSE.LOK) / 2;                           // Abstand Lokmitte–Waggonmitte
const U_LOK_FREI = MASSE.AUSZIEH - 1 - MASSE.LOK / 2;                 // Lok allein vor der Weiche
const U_ZUG_FREI = MASSE.AUSZIEH - 1 - MASSE.TAKT - MASSE.LOK / 2;    // Lok mit Waggon vor der Weiche
const TEMPO_MS = 42;                                                  // Fahrgeschwindigkeit bei Tempo 1

const glatt = (t) => t * t * (3 - 2 * t);

export class Rangierbetrieb {
  constructor(plan, lok, welt) {
    this.plan = plan;
    this.lok = lok;
    this.welt = welt;
    this.gleise = { A: [], B: [], C: [] };   // die sichtbar abgestellten Waggons
    this.warteschlange = [];
    this.aktuell = null;
    this.lokGleis = 'B';
    this.lokU = U_LOK_FREI;
  }

  /** Stellt alle Waggons auf Gleis A auf (erster am Prellbock), Lok aufs Ausziehgleis. */
  stelleAuf(waggons) {
    this.gleise = { A: [...waggons], B: [], C: [] };
    this.warteschlange = [];
    this.aktuell = null;
    this.lokGleis = 'B';
    this.lokU = U_LOK_FREI;
    this.stelleAllesHin();
    this.welt.setzeFahrstrasse('B');
  }

  get beschaeftigt() {
    return this.aktuell !== null || this.warteschlange.length > 0;
  }

  /** Reiht eine Verschiebung ein. beiStart/beiEnde werden passend aufgerufen. */
  reihe(von, nach, beiStart = null, beiEnde = null) {
    this.warteschlange.push({ von, nach, beiStart, beiEnde });
  }

  /** Lässt die Zeit dt (Sekunden, bereits mit dem Tempo multipliziert) vergehen. */
  schritt(dt) {
    let rest = dt;
    let wache = 0;
    while (rest > 0 && wache++ < 200) {
      if (!this.aktuell) {
        const auftrag = this.warteschlange.shift();
        if (!auftrag) return;
        this.beginne(auftrag);
        if (!this.aktuell) continue;
      }
      const a = this.aktuell;
      const teil = a.teile[a.index];
      if (!teil) {
        this.beende();
        continue;
      }
      if (!teil.begonnen) {
        teil.begonnen = true;
        teil.zeit = 0;
        if (teil.beimStart) teil.beimStart();
      }
      teil.zeit += rest;
      if (teil.art === 'fahrt') {
        const anteil = Math.min(1, teil.zeit / teil.dauer);
        const u = teil.von + (teil.nach - teil.von) * glatt(anteil);
        this.lok.setze(this.plan, teil.gleis, u);
        if (a.gekuppelt) a.waggon.setze(this.plan, teil.gleis, u + KUPPEL);
        this.lokU = u;
      }
      if (teil.zeit >= teil.dauer) {
        rest = teil.zeit - teil.dauer;
        if (teil.amEnde) teil.amEnde();
        a.index++;
      } else {
        rest = 0;
      }
    }
  }

  beginne(auftrag) {
    const { von, nach } = auftrag;
    const quelle = this.gleise[von];
    if (auftrag.beiStart) auftrag.beiStart();
    if (quelle.length === 0) {           // nichts zu verschieben
      if (auftrag.beiEnde) auftrag.beiEnde();
      return;
    }
    const waggon = quelle[quelle.length - 1];
    const a = { auftrag, waggon, teile: [], index: 0, gekuppelt: false, abgestellt: false };
    const fahrt = (gleis, start, ziel) => {
      if (Math.abs(ziel - start) < 0.01) return;
      a.teile.push({ art: 'fahrt', gleis, von: start, nach: ziel, dauer: Math.max(0.25, Math.abs(ziel - start) / TEMPO_MS + 0.3) });
    };
    const weiche = (gleis) => {
      a.teile.push({ art: 'halt', dauer: 0.25, beimStart: () => { this.welt.setzeFahrstrasse(gleis); this.lokGleis = gleis; } });
    };

    let u = this.lokU;
    if (this.lokGleis !== von) {
      if (u > U_LOK_FREI) {
        fahrt(this.lokGleis, u, U_LOK_FREI);
        u = U_LOK_FREI;
      }
      weiche(von);
    }
    const uAnWaggon = this.plan.uPlatz(von, quelle.length - 1) - KUPPEL;
    fahrt(von, u, uAnWaggon);
    a.teile.push({ art: 'halt', dauer: 0.16, amEnde: () => { quelle.pop(); a.gekuppelt = true; } });
    fahrt(von, uAnWaggon, U_ZUG_FREI);
    if (nach !== von) weiche(nach);
    const platz = nach === von ? quelle.length - 1 : this.gleise[nach].length;
    const uZiel = this.plan.uPlatz(nach, platz) - KUPPEL;
    fahrt(nach, U_ZUG_FREI, uZiel);
    a.teile.push({ art: 'halt', dauer: 0.14, amEnde: () => this.stelleAb(a) });
    this.aktuell = a;
  }

  stelleAb(a) {
    if (a.abgestellt) return;
    if (!a.gekuppelt) this.gleise[a.auftrag.von].pop();
    a.gekuppelt = false;
    a.abgestellt = true;
    this.gleise[a.auftrag.nach].push(a.waggon);
    this.lokGleis = a.auftrag.nach;
  }

  beende() {
    const a = this.aktuell;
    this.aktuell = null;
    if (a.auftrag.beiEnde) a.auftrag.beiEnde();
  }

  /** Führt alle offenen Verschiebungen sofort aus, ohne die Fahrten zu zeigen. */
  springeAnsEnde() {
    let letztesGleis = null;
    if (this.aktuell) {
      const a = this.aktuell;
      this.stelleAb(a);
      letztesGleis = a.auftrag.nach;
      this.aktuell = null;
      if (a.auftrag.beiEnde) a.auftrag.beiEnde();
    }
    // beiEnde kann neue Aufträge einreihen, deshalb eine Schleife statt forEach
    let wache = 0;
    while (this.warteschlange.length > 0 && wache++ < 100000) {
      const auftrag = this.warteschlange.shift();
      if (auftrag.beiStart) auftrag.beiStart();
      const quelle = this.gleise[auftrag.von];
      if (quelle.length > 0) {
        this.gleise[auftrag.nach].push(quelle.pop());
        letztesGleis = auftrag.nach;
      }
      if (auftrag.beiEnde) auftrag.beiEnde();
    }
    if (letztesGleis) {
      this.lokGleis = letztesGleis;
      this.lokU = this.plan.uPlatz(letztesGleis, this.gleise[letztesGleis].length - 1) - KUPPEL;
      this.welt.setzeFahrstrasse(letztesGleis);
    }
    this.stelleAllesHin();
  }

  stelleAllesHin() {
    for (const gleis of GLEISE) {
      this.gleise[gleis].forEach((waggon, i) => {
        waggon.vergissPosition();
        waggon.setze(this.plan, gleis, this.plan.uPlatz(gleis, i));
      });
    }
    this.lok.vergissPosition();
    this.lok.setze(this.plan, this.lokGleis, this.lokU);
  }
}
