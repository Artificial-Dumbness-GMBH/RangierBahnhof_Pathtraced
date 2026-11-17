# Rangierbahnhof

Auf einem Rangierbahnhof stehen Güterwaggons durcheinander auf Gleis A. Eine
Rangierlok soll sie so umsetzen, dass sie am Ende nach Nummern geordnet auf
einem Gleis stehen. Dafür hat sie drei Stumpfgleise A, B und C. Weil jedes
Gleis an einem Prellbock endet, kommt die Lok immer nur an den vordersten
Waggon heran: Jedes Gleis verhält sich wie ein **Stack**.

Sie programmieren die Klassen `Waggon` und `Rangierbahnhof`. Alles andere ist
vorgegeben, auch die 3D-Ansicht, in der die Lok Ihre Verschiebungen nachfährt.

## Starten

1. In VS Code über *Datei → Ordner öffnen* diesen Ordner öffnen (den Ordner,
   in dem die Datei `pom.xml` liegt). Benötigt wird die Erweiterung
   *Extension Pack for Java*.
2. Die Datei `src/main/java/rangierbahnhof/Main.java` öffnen und über der
   Methode `main` auf **Run** klicken (oder F5 drücken).
3. In der Konsole erscheint die Checkliste, und im Browser öffnet sich die
   3D-Ansicht. Falls sich kein Browser öffnet: Die Adresse steht in der
   Konsole (normalerweise `http://127.0.0.1:8765/`).

Nach jeder Änderung am Programm einfach erneut auf **Run** klicken. Das alte
Programm beendet sich von selbst, und die geöffnete Browser-Seite verbindet
sich neu.

## Die Aufgabe

Das Implementationsdiagramm liegt im Ordner `diagramm`. Jede Stelle, an der
etwas fehlt, ist im Quelltext mit `TODO` markiert. Arbeiten Sie in dieser
Reihenfolge; die Checkliste zeigt nach jedem Start, wie weit Sie sind:

1. **Klasse `Waggon`**: Attribut, Konstruktor und `getNummer()`.
2. **Klasse `Rangierbahnhof`**: die drei Attribute `gleisA`, `gleisB`,
   `gleisC`, der Konstruktor und die drei get-Methoden.
3. **`fuegeWaggonHinzu(...)`**: stellt einen Waggon vorne auf Gleis A ab.
4. **`istLeer(...)`**: prüft, ob auf einem Gleis kein Waggon steht.
5. **`verschiebeWaggon(...)`**: rangiert den vordersten Waggon eines Gleises
   auf ein anderes Gleis.
6. **`sortiere()`**: Ihr Algorithmus. Am Ende stehen alle Waggons auf einem
   einzigen Gleis, die kleinste Nummer am Prellbock, die größte ganz vorne.

Von der vorgegebenen Klasse `Stack` brauchen Sie nur die Methoden `isEmpty()`,
`push(...)`, `pop()` und `top()`.

## Die 3D-Ansicht

**Selbst rangieren.** Bevor Sie programmieren, können Sie das Problem von Hand
lösen: ein Gleis anklicken (der vorderste Waggon wird gewählt), dann das
Zielgleis anklicken. Das geht in der 3D-Szene, im Gleisbild unten oder mit den
Tasten A, B und C. Der Zähler zeigt, wie viele Verschiebungen Sie gebraucht
haben. Dieser Teil funktioniert schon, bevor Sie eine Zeile programmiert haben.

**Algorithmus.** Die Taste *sortiere() ausführen* startet Ihre Methode im
Java-Programm mit der angezeigten Startbelegung. Die Lok fährt anschließend
jede gemeldete Verschiebung nach. Mit *Pause*, *Ein Schritt* (auch Pfeiltaste
rechts) und *Zum Ende* steuern Sie den Ablauf, mit dem Regler das Tempo. Die
Checkliste oben rechts zeigt, welche Methoden schon richtig arbeiten, und gibt
bei Fehlern einen Hinweis mit Zeilennummer.

**Ansicht.** Ziehen mit der Maus dreht die Kamera, das Mausrad zoomt, Ziehen
mit der rechten Maustaste verschiebt. Oben rechts gibt es drei feste
Blickwinkel.

**Volumenlicht.** Raymarching berechnet den bodennahen Nebel und das darin
gestreute Sonnenlicht. Gebäude und Fahrzeuge werfen Schatten in den Nebel.
Der Schalter **Volumenlicht** blendet den Effekt aus und ein, wenn der
Browser ihn unterstützt.

## Wenn etwas nicht klappt

- *„Java-Programm läuft nicht“* (rote Lampe oben links): die Klasse `Main`
  in VS Code starten. Das Selbst-Rangieren geht auch ohne.
- *Die Checkliste meldet eine Endlosschleife*: das Programm in VS Code
  stoppen (rotes Quadrat), den Fehler beheben und neu starten.
- *Im Terminal starten* (statt über Run): `mvn compile exec:java`

## Pathtracing

Der Schalter **Pathtracing** aktiviert einen progressiven WebGL2-Renderer.
Bei ruhender Kamera verfeinert sich das zunächst körnige Bild mit jedem Frame.
Kamera-, Fahrzeug-, Material- und Größenänderungen starten die Akkumulation neu.
Der Schalterzustand wird lokal gespeichert. Standardmäßig bleibt der bisherige
Renderer aktiv. **Volumenlicht** schaltet in beiden Renderern den Bodennebel um.
Die Schalter erscheinen auf GPUs mit `EXT_color_buffer_float`.

Der Pathtracer berechnet Dreieckschnittpunkte über eine BVH, direkte Sonne mit
weichen Schatten, Himmelslicht, emissive Materialien und bis zu fünf Pfadsegmente
mit diffusen und näherungsweise rauen metallischen Reflexionen. Er übernimmt
instanzierte Geometrie, Materialfarben, Instanzfarben und Farbtexturen aus der
bestehenden Szene. Bewegte Geometrie aktualisiert die BVH, ohne sie neu aufzubauen.
Die interne Auflösung ist auf 960 × 540 Pixel begrenzt. Es gibt keinen Denoiser;
mehr Samples reduzieren das Rauschen. Die Geschwindigkeit hängt stark von der GPU ab.
Schilder, Waggonnummern als Sprites und Gleismarkierungen bleiben lesbare Overlays;
sie sind nicht Teil der Lichtsimulation. Transparenz, Normalmaps und physikalische
Glasbrechung werden nicht simuliert. Der Nebel wird auf dem Kamerastrahl integriert.

### Browsertest

Bei laufendem Java-Server:

```sh
cd rangierbahnhof/tests
npm install
npx playwright install chromium
TEST_URL=http://127.0.0.1:8765 npm test
```

Alternativ die Webdateien mit `python3 -m http.server 8080 --directory
rangierbahnhof/src/main/resources/web` aus dem Repository-Ordner ausliefern;
`npm test` verwendet standardmäßig Port 8080. Ein installiertes Chromium kann mit
`CHROMIUM_PATH=/usr/bin/chromium` gewählt werden. Die Testabhängigkeit Playwright
wird nur für diesen Test benötigt, nicht zum Starten des Projekts.

Der Test prüft Shaderfehler, endliche und sichtbare GPU-Ausgabe, Akkumulation,
Rücksetzung bei Kamera-, Lok- und Nebeländerungen, Wiederverwendung von BVH und
Atlas sowie das Umschalten beider Renderer. Er nutzt für Software-WebGL eine
reduzierte Auflösung von 160 × 90 Pixeln. Die Beurteilung von Bildqualität und
GPU-Leistung bei voller Auflösung erfolgt zusätzlich interaktiv im Browser.
