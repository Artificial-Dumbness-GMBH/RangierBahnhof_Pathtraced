import { Dampfeffekte } from './dampfeffekte.js';

const BRENNZEIT = 90; // Simulationssekunden pro Brennstab
const AUFSCHLAG_CENT = 3500;
const ERSATZKURS = { usdProPfund: 91.55, datum: '2026-10-30', aktuell: false };
const GELD = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD' });
const DATUM = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'UTC' });
const geld = (cent) => GELD.format(cent / 100);
const feld = (id) => document.getElementById(id);

export class Dampfbetrieb {
  constructor(lok, welt, gespeichert, speichere) {
    this.lok = lok;
    this.welt = welt;
    this.effekte = new Dampfeffekte(welt.szene, welt.haloTextur, lok);
    this.speichere = () => speichere(JSON.stringify({
      brennstoff: this.brennstoff, faesser: this.faesser, ausgaben: this.ausgaben,
      autobuy: this.autobuy,
    }));

    let stand;
    try { stand = JSON.parse(gespeichert); } catch { /* Neuer Spielstand */ }
    this.brennstoff = Number.isFinite(stand?.brennstoff)
      ? Math.min(BRENNZEIT, Math.max(0, stand.brennstoff)) : BRENNZEIT;
    this.faesser = Number.isSafeInteger(stand?.faesser) && stand.faesser >= 0 ? stand.faesser : 0;
    this.ausgaben = Number.isSafeInteger(stand?.ausgaben) && stand.ausgaben >= 0 ? stand.ausgaben : 0;
    this.autobuy = stand?.autobuy === true;
    feld('autobuy').setAttribute('aria-pressed', String(this.autobuy));
    this.kurs = ERSATZKURS;
    feld('brennstab').max = BRENNZEIT;
    this.zeige();
    this.zeigePreis();
    window.addEventListener('pagehide', this.speichere);
  }

  get zerstoert() { return !this.lok.gruppe.visible; }
  get fahrbereit() { return !this.zerstoert && this.brennstoff > 0; }
  get preis() { return Math.round(this.kurs.usdProPfund * 100) + AUFSCHLAG_CENT; }

  fahre(betrieb, sekunden, bis = Infinity) {
    if (!this.fahrbereit || !betrieb.beschaeftigt) return 0;
    const faesserVorher = this.faesser;
    let rest = sekunden;
    while (rest > 0 && this.fahrbereit && betrieb.beschaeftigt && performance.now() < bis) {
      const dauer = Math.min(rest, this.brennstoff);
      const genutzt = betrieb.schritt(dauer);
      rest -= genutzt;
      this.brennstoff = Math.max(0, this.brennstoff - genutzt);
      if (this.brennstoff < 0.000001) {
        this.brennstoff = 0;
        if (this.autobuy) this.bucheBrennstab();
      }
      if (genutzt <= 0) break;
    }
    if (this.faesser !== faesserVorher) this.zeigeKauf();
    else this.zeige();
    return sekunden - rest;
  }

  setzeAutobuy(aktiv) {
    this.autobuy = aktiv;
    feld('autobuy').setAttribute('aria-pressed', String(aktiv));
    if (this.kaufeAutomatisch()) return true;
    this.speichere();
    return false;
  }

  kaufeAutomatisch() {
    return this.autobuy && this.kaufe();
  }

  kaufe() {
    if (this.zerstoert || this.brennstoff > 0) return false;
    this.bucheBrennstab();
    this.zeigeKauf();
    return true;
  }

  bucheBrennstab() {
    this.ausgaben += this.preis;
    this.faesser++;
    this.brennstoff = BRENNZEIT;
  }

  zeigeKauf() {
    this.welt.fuelleDepot(this.faesser);
    this.speichere();
    this.zeige();
    this.zeigePreis();
  }

  sprenge() {
    this.effekte.explodiere();
    this.brennstoff = 0;
    this.lok.gruppe.visible = false;
    this.speichere();
    this.zeige();
  }

  repariere() {
    this.lok.gruppe.visible = true;
    this.zeige();
  }

  zeige() {
    const prozent = Math.ceil(this.brennstoff / BRENNZEIT * 100);
    if (this.prozent !== prozent) {
      this.prozent = prozent;
      feld('brennstab').value = this.brennstoff;
      feld('brennstabProzent').textContent = prozent + ' %';
    }
    const status = this.zerstoert ? 'Lok zerstört' : this.fahrbereit ? 'Dampflok bereit' : 'Brennstab verbraucht';
    if (this.status !== status) {
      this.status = status;
      feld('lokstatus').textContent = status;
      feld('brennstabKaufen').disabled = this.zerstoert || this.brennstoff > 0;
      feld('az5').disabled = this.zerstoert;
    }
  }

  zeigePreis() {
    const spot = geld(Math.round(this.kurs.usdProPfund * 100));
    const datum = DATUM.format(new Date(this.kurs.datum));
    const quelle = this.kurs.aktuell ? 'Cameco-Monatskurs' : 'Zuletzt bekannter Monatskurs';
    feld('brennstabKaufen').textContent = 'Brennstab kaufen · ' + geld(this.preis);
    feld('depotstand').textContent = 'Atommüll-Depot · ' + this.faesser + (this.faesser === 1 ? ' Fass' : ' Fässer');
    feld('urankurs').textContent = `${quelle} vom ${datum} · ${spot}/lb + ${geld(AUFSCHLAG_CENT)} Spielaufschlag`;
    feld('uranausgaben').textContent = 'Ausgaben im Spiel · ' + geld(this.ausgaben);
  }

  async aktualisierePreis() {
    if (this.preisAnfrageLaeuft) return;
    this.preisAnfrageLaeuft = true;
    try {
      const antwort = await fetch('/api/uranpreis', {
        cache: 'no-store', signal: AbortSignal.timeout(7000),
      });
      if (!antwort.ok) throw new Error('Kurs nicht verfügbar');
      const kurs = await antwort.json();
      if (!Number.isFinite(kurs.usdProPfund) || kurs.usdProPfund <= 0
          || !Number.isFinite(Date.parse(kurs.datum)) || kurs.datum < this.kurs.datum) {
        throw new Error('Ungültiger Kurs');
      }
      this.kurs = kurs;
    } catch {
      this.kurs = { ...this.kurs, aktuell: false };
    } finally {
      this.preisAnfrageLaeuft = false;
    }
    this.zeigePreis();
  }
}
