// Gleisplan: die Geometrie des Bahnhofs.
//
// Drei Stumpfgleise A, B, C enden links an Prellböcken. Rechts laufen sie in
// einer Dreiwegweiche zusammen und gehen in das gemeinsame Ausziehgleis über.
// Jede Fahrstraße (A, B, C) ist eine Kurve vom Ende des Ausziehgleises bis
// zum Prellbock; eine Position darauf wird durch die Bogenlänge u beschrieben
// (u = 0 am Ende des Ausziehgleises, u wächst in Richtung Prellbock).
//
// Koordinaten: x entlang der Gleise (Prellböcke links), z quer dazu
// (A hinten, C vorne), y nach oben. Einheit: Meter.

export const DETAILGRENZE = 10;
export const GLEISE = ['A', 'B', 'C'];

export const MASSE = {
  SPUR: 1.5,            // Abstand der beiden Schienen
  GLEISABSTAND: 6.4,    // Abstand der Stumpfgleise voneinander
  TAKT: 9.0,            // Platzbedarf eines Waggons (Länge über Puffer)
  LOK: 10.8,            // Länge der Lok über Puffer
  ERSTER_PLATZ: 5.0,    // Mitte des ersten Waggons, gemessen vom Prellbock
  WEICHE: 22,           // Länge des Weichenbereichs
  AUSZIEH: 24,          // Länge des Ausziehgleises
  SCHIENE_OBEN: 0.43,   // Höhe der Schienenoberkante über dem Boden
};

const glatt = (t) => t * t * (3 - 2 * t);

export class Gleisplan {
  constructor(kapazitaet) {
    this.kapazitaet = kapazitaet;
    this.gross = kapazitaet > DETAILGRENZE;
    const stumpf = kapazitaet * MASSE.TAKT + 4;
    const gesamt = stumpf + MASSE.WEICHE + MASSE.AUSZIEH;
    this.xPrellbock = -gesamt / 2;
    this.xKurve = this.xPrellbock + stumpf;      // hier beginnt der Weichenbereich
    this.xWeiche = this.xKurve + MASSE.WEICHE;   // ab hier nur noch ein Gleis
    this.xEnde = this.xWeiche + MASSE.AUSZIEH;
    this.laenge = gesamt;

    // Bogenlängen-Tabellen für die gebogenen Weichenabschnitte.
    this.tabellen = {};
    this.uPrellbock = {};
    const schritt = 0.1;
    for (const g of GLEISE) {
      const xs = [this.xWeiche];
      const us = [MASSE.AUSZIEH];
      let x = this.xWeiche;
      let u = MASSE.AUSZIEH;
      let zAlt = 0;
      while (x > this.xKurve + 1e-9) {
        const xNeu = Math.max(this.xKurve, x - schritt);
        const zNeu = this.zVon(g, xNeu);
        u += Math.hypot(x - xNeu, zNeu - zAlt);
        xs.push(xNeu);
        us.push(u);
        x = xNeu;
        zAlt = zNeu;
      }
      this.tabellen[g] = { xs, us };
      this.uPrellbock[g] = u + stumpf;
    }
  }

  /** Mittellinie des Gleises g an der Stelle x. */
  zVon(g, x) {
    const z0 = g === 'A' ? -MASSE.GLEISABSTAND : g === 'C' ? MASSE.GLEISABSTAND : 0;
    if (x <= this.xKurve) return z0;
    if (x >= this.xWeiche) return 0;
    return z0 * (1 - glatt((x - this.xKurve) / MASSE.WEICHE));
  }

  /** Punkt auf der Fahrstraße g bei Bogenlänge u. */
  punkt(g, u) {
    if (u <= MASSE.AUSZIEH) return { x: this.xEnde - u, z: 0 };
    const { xs, us } = this.tabellen[g];
    const uMax = us[us.length - 1];
    if (u >= uMax) return { x: this.xKurve - (u - uMax), z: this.zVon(g, this.xKurve) };
    let lo = 0;
    let hi = us.length - 1;
    while (hi - lo > 1) {
      const mitte = (lo + hi) >> 1;
      if (us[mitte] <= u) lo = mitte; else hi = mitte;
    }
    const t = (u - us[lo]) / (us[hi] - us[lo]);
    const x = xs[lo] + (xs[hi] - xs[lo]) * t;
    return { x, z: this.zVon(g, x) };
  }

  /** Bogenlänge der Mitte des Stellplatzes i auf Gleis g (0 = am Prellbock). */
  uPlatz(g, i) {
    return this.uPrellbock[g] - MASSE.ERSTER_PLATZ - i * MASSE.TAKT;
  }
}
