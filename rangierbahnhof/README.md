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
