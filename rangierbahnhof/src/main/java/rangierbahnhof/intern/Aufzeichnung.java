package rangierbahnhof.intern;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import rangierbahnhof.Anzeige;
import rangierbahnhof.Rangierbahnhof;
import rangierbahnhof.Stack;
import rangierbahnhof.Waggon;

/**
 * Eine Anzeige, die jede gemeldete Verschiebung mitschreibt und dabei prüft,
 * ob sie wirklich stattgefunden hat. Aus dem Mitschnitt spielt die 3D-Ansicht
 * anschließend die Rangierfahrten ab.
 *
 * Technik der 3D-Ansicht – nicht Teil der Aufgabe.
 */
final class Aufzeichnung extends Anzeige {

    /** Obergrenze, damit eine Endlosschleife das Programm nicht blockiert. */
    private static final int MIN_ZUGLIMIT = 5000;

    static final char[] NAMEN = { 'A', 'B', 'C' };
    private static final String[][] KUERZEL = {
        { "AA", "AB", "AC" }, { "BA", "BB", "BC" }, { "CA", "CB", "CC" }
    };

    private final List<Stack<Waggon>> gleise = new ArrayList<>();
    private final List<List<Waggon>> erwartet = new ArrayList<>();
    private final List<String> zuege = new ArrayList<>();
    private int zuglimit;
    private volatile boolean abgebrochen = false;

    /**
     * Verbindet die Aufzeichnung mit einem fertig befüllten Rangierbahnhof.
     * Erst danach werden Verschiebungen geprüft und mitgeschrieben.
     */
    void verbinde(Rangierbahnhof pBahnhof) {
        gleise.clear();
        erwartet.clear();
        zuege.clear();
        gleise.add(pBahnhof.getGleisA());
        gleise.add(pBahnhof.getGleisB());
        gleise.add(pBahnhof.getGleisC());
        int anzahl = 0;
        for (Stack<Waggon> gleis : gleise) {
            List<Waggon> waggons = inhaltVon(gleis);
            erwartet.add(waggons);
            anzahl += waggons.size();
        }
        // Die Auswahlsortierung verschiebt in jedem Durchgang alle übrigen Waggons zweimal.
        zuglimit = Math.max(MIN_ZUGLIMIT, anzahl * (anzahl + 1));
    }

    /** Sorgt dafür, dass die nächste gemeldete Verschiebung den Lauf beendet. */
    void brichAb() {
        abgebrochen = true;
    }

    List<String> getZuege() {
        return zuege;
    }

    /** Der Zustand, der sich aus den gemeldeten Verschiebungen ergibt. */
    List<List<Waggon>> getErwartet() {
        return erwartet;
    }

    @Override
    public void zeigeVerschiebung(Stack<Waggon> pVon, Stack<Waggon> pNach) {
        if (gleise.isEmpty()) {
            zuege.add("??"); // noch nicht verbunden: nur mitzählen
            return;
        }
        if (abgebrochen) {
            throw new RangierFehler("Zeitlimit überschritten – vermutlich eine Endlosschleife.");
        }
        int von = indexVon(pVon);
        int nach = indexVon(pNach);
        if (von < 0 || nach < 0) {
            throw new RangierFehler("verschiebeWaggon(...) wurde mit einem Stack aufgerufen, der keines "
                    + "der drei Gleise gleisA, gleisB, gleisC ist.");
        }
        List<Waggon> quelle = erwartet.get(von);
        if (quelle.isEmpty()) {
            throw new RangierFehler("Eine Verschiebung von Gleis " + NAMEN[von] + " wurde gemeldet, obwohl Gleis "
                    + NAMEN[von] + " leer war. Die Anzeige darf nur informiert werden, wenn wirklich ein "
                    + "Waggon verschoben wurde.");
        }
        Waggon waggon = quelle.get(quelle.size() - 1);
        if (von != nach) {
            if (pNach.top() != waggon) {
                throw new RangierFehler("Verschiebung von Gleis " + NAMEN[von] + " nach Gleis " + NAMEN[nach]
                        + " gemeldet, aber der vorderste Waggon von Gleis " + NAMEN[von]
                        + " steht nicht vorne auf Gleis " + NAMEN[nach]
                        + ". Fehlt push(...) oder wurde die Anzeige zu früh informiert?");
            }
            if (pVon.top() == waggon) {
                throw new RangierFehler("Verschiebung von Gleis " + NAMEN[von] + " nach Gleis " + NAMEN[nach]
                        + " gemeldet, aber der Waggon steht immer noch auf Gleis " + NAMEN[von]
                        + ". Fehlt pop()?");
            }
        }
        quelle.remove(quelle.size() - 1);
        erwartet.get(nach).add(waggon);
        zuege.add(KUERZEL[von][nach]);
        if (zuege.size() > zuglimit) {
            throw new RangierFehler("Mehr als " + zuglimit + " Verschiebungen – vermutlich eine Endlosschleife.");
        }
    }

    private int indexVon(Stack<Waggon> pGleis) {
        for (int i = 0; i < gleise.size(); i++) {
            if (gleise.get(i) == pGleis) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Liest den Inhalt eines Stacks aus, ohne ihn zu verändern: Alle Waggons
     * werden heruntergenommen und in derselben Reihenfolge wieder aufgelegt.
     *
     * @return die Waggons vom Prellbock (Index 0) bis nach vorne
     */
    static List<Waggon> inhaltVon(Stack<Waggon> pGleis) {
        List<Waggon> vonObenNachUnten = new ArrayList<>();
        while (!pGleis.isEmpty()) {
            vonObenNachUnten.add(pGleis.top());
            pGleis.pop();
        }
        List<Waggon> vonUntenNachOben = new ArrayList<>(vonObenNachUnten);
        Collections.reverse(vonUntenNachOben);
        for (Waggon waggon : vonUntenNachOben) {
            pGleis.push(waggon);
        }
        return vonUntenNachOben;
    }
}
