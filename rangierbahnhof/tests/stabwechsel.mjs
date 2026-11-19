import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Dampfbetrieb } from '../src/main/resources/web/js/dampfbetrieb.js';

function aufbauen(t, zufall) {
  const felder = new Map();
  t.mock.method(Math, 'random', () => zufall);
  globalThis.window = { addEventListener() {} };
  globalThis.document = {
    getElementById(id) {
      if (!felder.has(id)) felder.set(id, { setAttribute() {} });
      return felder.get(id);
    },
  };
  t.after(() => { delete globalThis.document; delete globalThis.window; });
  let explosionen = 0, abbrueche = 0, gespeichert;
  const welt = { fuelleDepot() {}, dampfeffekte: { explodiere() { explosionen++; } } };
  const dampf = new Dampfbetrieb({ gruppe: { visible: true } }, welt, '{"brennstoff":0}',
    stand => { gespeichert = JSON.parse(stand); }, () => { abbrueche++; });
  return { dampf, ergebnis: () => ({ explosionen, abbrueche, gespeichert }) };
}

test('Genau 0,001 wechselt den Stab regulär, weitere Klicks würfeln nicht', t => {
  const { dampf, ergebnis } = aufbauen(t, 0.001);
  assert.equal(dampf.kaufe(), true);
  assert.equal(dampf.fahrbereit, true);
  assert.equal(dampf.kaufe(), false);
  assert.equal(Math.random.mock.callCount(), 1);
  assert.equal(ergebnis().gespeichert.faesser, 1);
  assert.equal(ergebnis().explosionen, 0);
});

test('Ein Wert unter 0,001 löst eine Kernschmelze und genau einen Abbruch aus', t => {
  const { dampf, ergebnis } = aufbauen(t, 0.000999);
  assert.equal(dampf.kaufe(), true);
  assert.equal(dampf.fahrbereit, false);
  assert.equal(dampf.ursache, 'Kernschmelze beim Stabwechsel');
  assert.equal(dampf.kaufe(), false);
  assert.equal(Math.random.mock.callCount(), 1);
  assert.equal(ergebnis().gespeichert.brennstoff, 0);
  assert.equal(ergebnis().gespeichert.ausgaben, dampf.preis);
  assert.equal(ergebnis().explosionen, 1);
  assert.equal(ergebnis().abbrueche, 1);
  dampf.repariere();
  assert.equal(dampf.zerstoert, false);
  assert.equal(dampf.ursache, null);
});

test('Autobuy stoppt die laufende Fahrt am Stabwechsel', t => {
  const { dampf, ergebnis } = aufbauen(t, 0);
  dampf.brennstoff = 1;
  dampf.setzeAutobuy(true);
  const fahrt = { beschaeftigt: true, schritt: dt => dt };
  assert.equal(dampf.fahre(fahrt, 90), 1);
  assert.equal(dampf.fahre(fahrt, 90), 0);
  assert.equal(ergebnis().gespeichert.faesser, 1);
  assert.equal(ergebnis().abbrueche, 1);
});
