package rangierbahnhof.intern;

/**
 * Wird ausgelöst, wenn beim Rangieren etwas nicht zusammenpasst (zum Beispiel
 * eine gemeldete Verschiebung, die gar nicht stattgefunden hat). Die Meldung
 * erscheint in der Checkliste.
 *
 * Technik der 3D-Ansicht – nicht Teil der Aufgabe.
 */
public class RangierFehler extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public RangierFehler(String pMeldung) {
        super(pMeldung);
    }
}
