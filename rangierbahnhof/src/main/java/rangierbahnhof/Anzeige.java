package rangierbahnhof;

/**
 * Die Anzeige verbindet den Rangierbahnhof mit der 3D-Ansicht im Browser.
 *
 * Vorgegeben – diese Klasse wird nicht verändert. Für die Aufgabe genügt es
 * zu wissen, dass die Methode zeigeVerschiebung(...) aufgerufen werden muss,
 * nachdem ein Waggon verschoben wurde. Die 3D-Ansicht lässt dann die
 * Rangierlok genau diese Fahrt ausführen.
 */
public class Anzeige {

    /**
     * Die Anzeige wird darüber informiert, dass der vorderste Waggon von
     * pVon soeben nach pNach verschoben wurde.
     *
     * @param pVon  das Gleis, von dem der Waggon abgezogen wurde
     * @param pNach das Gleis, auf dem der Waggon jetzt vorne steht
     */
    public void zeigeVerschiebung(Stack<Waggon> pVon, Stack<Waggon> pNach) {
        // Hier steht absichtlich nichts: Die eigentliche Arbeit übernimmt
        // die Technik im Paket "intern", sobald das Programm über die Klasse
        // Main gestartet wird.
    }
}
