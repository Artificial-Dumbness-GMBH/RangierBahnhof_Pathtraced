package rangierbahnhof;

/**
 * Ein Güterwaggon des Rangierbahnhofs. Zur Vereinfachung wird jeder Waggon
 * nur durch seine Nummer beschrieben.
 *
 * AUFGABE: Implementieren Sie die Klasse nach dem Implementationsdiagramm
 * (Ordner "diagramm"). Jede Stelle, an der etwas fehlt, ist mit TODO markiert.
 */
public class Waggon {

    // TODO: Attribut für die Nummer des Waggons deklarieren (siehe Diagramm).
    private int nummer;
    /**
     * Ein Waggon mit der Nummer pNummer wird erzeugt.
     *
     * @param pNummer die Nummer des Waggons
     */
    public Waggon(int pNummer) {
        // TODO: Die übergebene Nummer im Attribut speichern.
        nummer = pNummer;
    }

    /**
     * Die Anfrage liefert die Nummer des Waggons.
     *
     * @return die Nummer des Waggons
     */
    public int getNummer() {
        // TODO: Die Nummer zurückgeben.
        return nummer; // Platzhalter, damit das Projekt startet – bitte ersetzen
    }
}
