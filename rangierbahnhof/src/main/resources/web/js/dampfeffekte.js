import * as THREE from './lib/three.module.js';

const FARBEN = { dampf: 0xe4efff, rauch: 0x647183, feuer: 0xff993b, blitz: 0xffedb6 };

export class Dampfeffekte {
  constructor(szene, textur, lok) {
    this.lok = lok;
    this.ort = new THREE.Vector3();
    this.takt = 0;
    this.waerme = 0;
    // Ein fester Vorrat hält auch bei viel Dampf die Zahl der Sprites begrenzt.
    this.wolken = Array.from({ length: 64 }, () => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: textur, transparent: true, depthWrite: false,
      }));
      sprite.visible = false;
      szene.add(sprite);
      return { sprite, alter: 0, dauer: 0, tempo: new THREE.Vector3() };
    });
  }

  wolke(art, dauer, groesse, x, y, z) {
    const w = this.wolken.find(({ sprite }) => !sprite.visible);
    if (!w) return;
    w.alter = 0;
    w.dauer = dauer;
    w.groesse = groesse;
    w.art = art;
    w.tempo.set(x, y, z);
    w.sprite.position.copy(this.ort);
    w.sprite.scale.setScalar(groesse);
    w.sprite.material.color.setHex(FARBEN[art]);
    w.sprite.material.blending = art === 'feuer' || art === 'blitz'
      ? THREE.AdditiveBlending : THREE.NormalBlending;
    w.sprite.material.opacity = 1;
    w.sprite.visible = true;
  }

  explodiere() {
    this.ort.copy(this.lok.gruppe.position);
    this.ort.y += 2.5;
    this.wolke('blitz', 0.36, 8.5, 0, 1.5, 0);
    for (let i = 0; i < 30; i++) {
      const winkel = i * 2.4;
      const tempo = 2 + Math.random() * 7;
      this.wolke(i < 18 ? 'feuer' : 'rauch', i < 18 ? 0.85 : 3.2, 1.7 + Math.random() * 2.6,
        Math.cos(winkel) * tempo, 1.6 + Math.random() * 6, Math.sin(winkel) * tempo);
    }
    this.waerme = 0;
    this.takt = 0;
  }

  schritt(dt, fahrzeit) {
    for (const w of this.wolken) {
      if (!w.sprite.visible) continue;
      w.alter += dt;
      if (w.alter >= w.dauer) {
        w.sprite.visible = false;
        continue;
      }
      const fortschritt = w.alter / w.dauer;
      w.sprite.position.addScaledVector(w.tempo, dt);
      w.sprite.scale.setScalar(w.groesse * (1 + fortschritt * (w.art === 'blitz' ? 0.5 : 1.8)));
      w.sprite.material.opacity = (w.art === 'dampf' ? 0.86 : 1) * (1 - fortschritt);
    }

    if (fahrzeit > 0) {
      this.waerme = Math.min(1, this.waerme + fahrzeit / 22);
    } else {
      this.waerme = Math.max(0, this.waerme - dt / 12);
      return;
    }

    this.takt -= dt;
    if (this.takt > 0) return;
    this.takt = 0.45 - this.waerme * 0.35;
    this.ort.copy(this.lok.schornstein);
    this.lok.gruppe.localToWorld(this.ort);
    this.wolke('dampf', 1.3 + this.waerme * 2, 0.9 + this.waerme * 0.95,
      0.45 + Math.random() * 0.45, 2.6 + this.waerme, (Math.random() - 0.5) * 1.1);
  }
}
