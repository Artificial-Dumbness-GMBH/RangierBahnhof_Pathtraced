// Kamerasteuerung: Die Kamera kreist um einen Zielpunkt.
// Ziehen dreht, Rechtsklick-Ziehen (oder Umschalt + Ziehen) verschiebt,
// das Mausrad zoomt. Auf Touch-Geräten: ein Finger dreht, zwei Finger zoomen.

import * as THREE from './lib/three.module.js';

const GRAD = Math.PI / 180;

export class Kamerafuehrung {
  constructor(kamera, flaeche) {
    this.kamera = kamera;
    this.flaeche = flaeche;
    this.ziel = new THREE.Vector3(0, 1, 0);
    this.abstand = 120;
    this.maximalerAbstand = 420;
    this.neigung = 58 * GRAD;   // 0 = senkrecht von oben
    this.drehung = 0;           // 0 = Blick von vorne (aus +z)
    this.fahrt = null;          // sanfter Übergang zu einer Voreinstellung
    this.folgt = null;          // Funktion, die den Ort der Lok liefert
    this.beiKlick = null;
    this.beiBewegung = null;
    this.beiEingriff = null;
    this.zeiger = new Map();
    this.richte();

    flaeche.addEventListener('pointerdown', (e) => this.zeigerAb(e));
    flaeche.addEventListener('pointermove', (e) => this.zeigerBewegt(e));
    flaeche.addEventListener('pointerup', (e) => this.zeigerAuf(e));
    flaeche.addEventListener('pointercancel', (e) => this.zeiger.delete(e.pointerId));
    flaeche.addEventListener('wheel', (e) => this.rad(e), { passive: false });
    flaeche.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  richte() {
    const s = Math.sin(this.neigung);
    this.kamera.position.set(
      this.ziel.x + this.abstand * s * Math.sin(this.drehung),
      this.ziel.y + this.abstand * Math.cos(this.neigung),
      this.ziel.z + this.abstand * s * Math.cos(this.drehung));
    this.kamera.lookAt(this.ziel);
    const nah = Math.max(1, this.abstand / 1500);
    if (this.kamera.near !== nah) {
      this.kamera.near = nah;
      this.kamera.updateProjectionMatrix();
    }
  }

  /** Fährt sanft zu einer neuen Einstellung. */
  fahreZu({ ziel, abstand, neigung, drehung }, dauer = 0.9) {
    this.fahrt = {
      zeit: 0, dauer,
      von: { ziel: this.ziel.clone(), abstand: this.abstand, neigung: this.neigung, drehung: this.drehung },
      nach: { ziel: ziel.clone(), abstand, neigung: neigung * GRAD, drehung: drehung * GRAD },
    };
  }

  /**
   * Der kleinste Abstand, bei dem alle Punkte im Bild liegen, wenn die
   * Kamera mit der angegebenen Neigung und Drehung auf ziel blickt.
   * rand: freizuhaltender Anteil des Bildes an den vier Seiten.
   */
  passenderAbstand(punkte, ziel, neigung, drehung, rand) {
    const probe = this.kamera.clone();
    const n = neigung * GRAD;
    const d = drehung * GRAD;
    let nah = 10;
    let fern = Math.max(700, this.maximalerAbstand);
    for (let i = 0; i < 24; i++) {
      const mitte = (nah + fern) / 2;
      probe.position.set(
        ziel.x + mitte * Math.sin(n) * Math.sin(d),
        ziel.y + mitte * Math.cos(n),
        ziel.z + mitte * Math.sin(n) * Math.cos(d));
      probe.lookAt(ziel);
      probe.updateMatrixWorld(true);
      const passt = punkte.every((p) => {
        const v = p.clone().project(probe);
        return v.z > -1 && v.z < 1 && v.x >= -1 + 2 * rand.links && v.x <= 1 - 2 * rand.rechts
          && v.y >= -1 + 2 * rand.unten && v.y <= 1 - 2 * rand.oben;
      });
      if (passt) fern = mitte; else nah = mitte;
    }
    return fern;
  }

  schritt(dt) {
    if (this.fahrt) {
      const f = this.fahrt;
      f.zeit += dt;
      const t = Math.min(1, f.zeit / f.dauer);
      const k = t * t * (3 - 2 * t);
      this.ziel.lerpVectors(f.von.ziel, f.nach.ziel, k);
      this.abstand = f.von.abstand + (f.nach.abstand - f.von.abstand) * k;
      this.neigung = f.von.neigung + (f.nach.neigung - f.von.neigung) * k;
      this.drehung = f.von.drehung + (f.nach.drehung - f.von.drehung) * k;
      if (t >= 1) this.fahrt = null;
    } else if (this.folgt) {
      const ort = this.folgt();
      this.ziel.lerp(ort, Math.min(1, dt * 4));
    }
    this.richte();
  }

  // ------------------------------------------------------------ Eingaben

  zeigerAb(e) {
    this.flaeche.setPointerCapture(e.pointerId);
    this.zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, taste: e.button, umschalt: e.shiftKey });
    this.zweiFingerAbstand = null;
  }

  zeigerBewegt(e) {
    const z = this.zeiger.get(e.pointerId);
    if (!z) {
      if (this.beiBewegung) this.beiBewegung(e, false);
      return;
    }
    const dx = e.clientX - z.x;
    const dy = e.clientY - z.y;
    z.x = e.clientX;
    z.y = e.clientY;
    const weit = Math.hypot(e.clientX - z.startX, e.clientY - z.startY) > 5;
    if (!weit) return;
    z.gezogen = true;
    this.fahrt = null;
    if (this.beiBewegung) this.beiBewegung(e, true);

    if (this.zeiger.size >= 2) {
      const [a, b] = [...this.zeiger.values()];
      const abstand = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.zweiFingerAbstand) this.zoome(this.zweiFingerAbstand / abstand);
      this.zweiFingerAbstand = abstand;
      return;
    }
    if (z.taste === 2 || z.taste === 1 || z.umschalt) {
      // verschieben: entlang der Blickrichtung am Boden
      const masz = this.abstand * 0.0016;
      const cos = Math.cos(this.drehung);
      const sin = Math.sin(this.drehung);
      this.ziel.x -= (dx * cos + dy * sin) * masz;
      this.ziel.z -= (-dx * sin + dy * cos) * masz;
      if (this.beiEingriff) this.beiEingriff('verschoben');
    } else {
      this.drehung -= dx * 0.005;
      this.neigung = Math.min(86 * GRAD, Math.max(2 * GRAD, this.neigung - dy * 0.005));
      if (this.beiEingriff) this.beiEingriff('gedreht');
    }
  }

  zeigerAuf(e) {
    const z = this.zeiger.get(e.pointerId);
    this.zeiger.delete(e.pointerId);
    if (z && !z.gezogen && z.taste === 0 && this.beiKlick) this.beiKlick(e);
  }

  rad(e) {
    e.preventDefault();
    this.fahrt = null;
    this.zoome(Math.exp(e.deltaY * 0.0012));
    if (this.beiEingriff) this.beiEingriff('gezoomt');
  }

  zoome(faktor) {
    // Eine weit herausgezoomte Voreinstellung darf beim ersten Scrollen nicht springen.
    const maximum = Math.max(this.abstand, this.maximalerAbstand);
    this.abstand = Math.min(maximum, Math.max(14, this.abstand * faktor));
  }
}
