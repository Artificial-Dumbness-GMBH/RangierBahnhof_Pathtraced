package rangierbahnhof.intern;

import java.util.ArrayList;
import java.util.List;

import rangierbahnhof.Rangierbahnhof;
import rangierbahnhof.Stack;
import rangierbahnhof.Waggon;

/**
 * Prüft Schritt für Schritt, ob die Klassen Waggon und Rangierbahnhof schon
 * richtig arbeiten, und führt zum Schluss sortiere() aus. Dabei werden alle
 * Verschiebungen mitgeschrieben, damit die 3D-Ansicht sie abspielen kann.
 *
 * Technik der 3D-Ansicht – nicht Teil der Aufgabe.
 */
final class Pruefung {

    /** So lange darf ein Prüflauf höchstens dauern (Schutz vor Endlosschleifen). */
    static final int ZEITLIMIT_MS = 4000;

    private static final String[] TITEL = {
        "Waggon: Konstruktor und getNummer()",
        "Rangierbahnhof: Konstruktor und get-Methoden",
        "fuegeWaggonHinzu(...)",
        "istLeer(...)",
        "verschiebeWaggon(...)",
        "sortiere()"
    };

    private Pruefung() {
    }

    /**
     * Führt alle Prüfschritte mit der Startbelegung pStart aus (Nummern vom
     * Prellbock nach vorne, alle auf Gleis A).
     */
    static Ergebnis pruefe(int[] pStart) {
        Lauf lauf = new Lauf(pStart);
        Thread faden = new Thread(lauf, "Pruefung");
        faden.setDaemon(true);
        faden.start();
        try {
            faden.join(ZEITLIMIT_MS);
            if (faden.isAlive()) {
                lauf.brichAb();
                faden.join(300);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        if (faden.isAlive()) {
            return lauf.ergebnisNachZeitlimit();
        }
        return lauf.ergebnis;
    }

    /** Ein einzelner Prüflauf; läuft in einem eigenen Thread. */
    private static final class Lauf implements Runnable {

        final Ergebnis ergebnis = new Ergebnis();
        private final int[] start;
        private volatile int stufe = 0;
        private volatile Aufzeichnung aufzeichnung = null;

        Lauf(int[] pStart) {
            start = pStart.clone();
            ergebnis.start = pStart.clone();
            for (String titel : TITEL) {
                ergebnis.checkliste.add(new Ergebnis.Punkt(titel));
            }
        }

        void brichAb() {
            Aufzeichnung a = aufzeichnung;
            if (a != null) {
                a.brichAb();
            }
        }

        Ergebnis ergebnisNachZeitlimit() {
            Ergebnis e = new Ergebnis();
            e.start = start.clone();
            int haengt = stufe;
            for (int i = 0; i < TITEL.length; i++) {
                Ergebnis.Punkt punkt = new Ergebnis.Punkt(TITEL[i]);
                if (i < haengt) {
                    punkt.status = Ergebnis.OK;
                } else if (i == haengt) {
                    punkt.status = Ergebnis.FEHLER;
                    punkt.hinweis = "Nach " + (ZEITLIMIT_MS / 1000) + " Sekunden noch nicht fertig – vermutlich eine "
                            + "Endlosschleife (zum Beispiel eine while-Schleife, deren Bedingung nie falsch wird). "
                            + "Bitte das Programm stoppen und nach der Korrektur neu starten.";
                }
                e.checkliste.add(punkt);
            }
            e.meldung = "Abgebrochen: " + TITEL[haengt] + " wird nicht fertig (Endlosschleife?).";
            return e;
        }

        @Override
        public void run() {
            int fehlerStufe = -1;
            for (int i = 0; i < TITEL.length; i++) {
                stufe = i;
                String hinweis;
                try {
                    hinweis = fuehreAus(i);
                } catch (Throwable t) {
                    hinweis = beschreibe(t);
                }
                Ergebnis.Punkt punkt = ergebnis.checkliste.get(i);
                if (hinweis == null) {
                    punkt.status = Ergebnis.OK;
                } else {
                    punkt.status = Ergebnis.FEHLER;
                    punkt.hinweis = hinweis;
                    fehlerStufe = i;
                    break;
                }
            }
            if (fehlerStufe < 0) {
                ergebnis.sortiert = true;
            } else if (fehlerStufe < TITEL.length - 1) {
                ergebnis.meldung = "Noch nicht startklar: " + TITEL[fehlerStufe] + " – siehe Checkliste.";
            } else {
                ergebnis.meldung = ergebnis.checkliste.get(fehlerStufe).hinweis;
            }
        }

        /** @return null, wenn der Schritt bestanden ist, sonst ein Hinweis */
        private String fuehreAus(int pStufe) {
            switch (pStufe) {
                case 0:
                    return pruefeWaggon();
                case 1:
                    return pruefeKonstruktor();
                case 2:
                    return pruefeHinzufuegen();
                case 3:
                    return pruefeIstLeer();
                case 4:
                    return pruefeVerschieben();
                default:
                    return pruefeSortieren();
            }
        }

        private String pruefeWaggon() {
            Waggon a = new Waggon(42);
            Waggon b = new Waggon(7);
            if (a.getNummer() != 42 || b.getNummer() != 7) {
                return "getNummer() liefert nicht die Nummer, die dem Konstruktor übergeben wurde (new Waggon(42)"
                        + " liefert " + a.getNummer() + ").";
            }
            return null;
        }

        private String pruefeKonstruktor() {
            Rangierbahnhof bahnhof = new Rangierbahnhof(new Aufzeichnung());
            Stack<Waggon> a = bahnhof.getGleisA();
            Stack<Waggon> b = bahnhof.getGleisB();
            Stack<Waggon> c = bahnhof.getGleisC();
            if (a == null || b == null || c == null) {
                String welche = a == null ? "getGleisA()" : b == null ? "getGleisB()" : "getGleisC()";
                return welche + " liefert null. Werden im Konstruktor drei Stacks erzeugt, und geben die "
                        + "get-Methoden die Attribute zurück?";
            }
            if (a == b || a == c || b == c) {
                return "Zwei get-Methoden liefern denselben Stack. Jedes Gleis braucht einen eigenen Stack.";
            }
            if (!a.isEmpty() || !b.isEmpty() || !c.isEmpty()) {
                return "Direkt nach dem Erzeugen müssen alle drei Gleise leer sein.";
            }
            return null;
        }

        private String pruefeHinzufuegen() {
            Rangierbahnhof bahnhof = new Rangierbahnhof(new Aufzeichnung());
            Waggon w1 = new Waggon(1);
            Waggon w2 = new Waggon(2);
            bahnhof.fuegeWaggonHinzu(w1);
            if (bahnhof.getGleisA().top() != w1) {
                return "Nach fuegeWaggonHinzu(...) steht der Waggon nicht vorne auf Gleis A.";
            }
            bahnhof.fuegeWaggonHinzu(w2);
            List<Waggon> inhalt = Aufzeichnung.inhaltVon(bahnhof.getGleisA());
            if (inhalt.size() != 2 || inhalt.get(0) != w1 || inhalt.get(1) != w2) {
                return "Nach zwei Aufrufen müssen beide Waggons auf Gleis A stehen, der zuletzt hinzugefügte vorne.";
            }
            if (!bahnhof.getGleisB().isEmpty() || !bahnhof.getGleisC().isEmpty()) {
                return "fuegeWaggonHinzu(...) darf nur Gleis A verändern.";
            }
            return null;
        }

        private String pruefeIstLeer() {
            Rangierbahnhof bahnhof = new Rangierbahnhof(new Aufzeichnung());
            if (!bahnhof.istLeer(bahnhof.getGleisB())) {
                return "istLeer(...) liefert false für ein leeres Gleis.";
            }
            bahnhof.fuegeWaggonHinzu(new Waggon(1));
            if (bahnhof.istLeer(bahnhof.getGleisA())) {
                return "istLeer(...) liefert true, obwohl auf dem Gleis ein Waggon steht.";
            }
            if (!bahnhof.istLeer(bahnhof.getGleisC())) {
                return "istLeer(...) liefert false für ein leeres Gleis.";
            }
            if (bahnhof.getGleisA().isEmpty()) {
                return "istLeer(...) darf das Gleis nicht verändern.";
            }
            return null;
        }

        private String pruefeVerschieben() {
            Aufzeichnung auf = new Aufzeichnung();
            Rangierbahnhof bahnhof = new Rangierbahnhof(auf);
            Waggon w1 = new Waggon(1);
            Waggon w2 = new Waggon(2);
            bahnhof.fuegeWaggonHinzu(w1);
            bahnhof.fuegeWaggonHinzu(w2);
            Stack<Waggon> a = bahnhof.getGleisA();
            Stack<Waggon> b = bahnhof.getGleisB();
            Stack<Waggon> c = bahnhof.getGleisC();
            auf.verbinde(bahnhof);

            bahnhof.verschiebeWaggon(a, c);
            boolean richtigVerschoben = a.top() == w1 && c.top() == w2 && b.isEmpty();
            if (auf.getZuege().isEmpty()) {
                if (richtigVerschoben) {
                    return "Der Waggon wurde richtig verschoben, aber die 3D-Ansicht wurde nicht informiert. "
                            + "Fehlt die Zeile anzeige.zeigeVerschiebung(pVon, pNach); ?";
                }
                return "verschiebeWaggon(gleisA, gleisC) hat den vordersten Waggon nicht von Gleis A nach Gleis C "
                        + "verschoben.";
            }
            if (auf.getZuege().size() > 1) {
                return "Für eine einzige Verschiebung wurde die Anzeige mehrfach informiert.";
            }
            if (!richtigVerschoben) {
                return "Nach verschiebeWaggon(gleisA, gleisC) stehen die Waggons nicht richtig: Der vorderste Waggon "
                        + "von Gleis A muss vorne auf Gleis C stehen, alle anderen bleiben, wo sie sind.";
            }

            bahnhof.verschiebeWaggon(b, a); // Gleis B ist leer: es darf nichts passieren
            if (auf.getZuege().size() != 1 || a.top() != w1 || c.top() != w2 || !b.isEmpty()) {
                return "Ist das Gleis pVon leer, darf verschiebeWaggon(...) nichts verändern.";
            }

            bahnhof.verschiebeWaggon(a, c);
            List<Waggon> inhaltC = Aufzeichnung.inhaltVon(c);
            if (!a.isEmpty() || inhaltC.size() != 2 || inhaltC.get(0) != w2 || inhaltC.get(1) != w1) {
                return "Nach zwei Verschiebungen von Gleis A nach Gleis C stehen die Waggons nicht in der "
                        + "erwarteten Reihenfolge auf Gleis C.";
            }
            return null;
        }

        private String pruefeSortieren() {
            Aufzeichnung auf = new Aufzeichnung();
            Rangierbahnhof bahnhof = new Rangierbahnhof(auf);
            List<Waggon> alle = new ArrayList<>();
            for (int nummer : start) {
                Waggon waggon = new Waggon(nummer);
                alle.add(waggon);
                bahnhof.fuegeWaggonHinzu(waggon);
            }
            auf.verbinde(bahnhof);
            aufzeichnung = auf;
            ergebnis.zuege = auf.getZuege();

            Throwable abbruch = null;
            try {
                bahnhof.sortiere();
            } catch (Throwable t) {
                abbruch = t;
            }

            List<List<Waggon>> tatsaechlich = new ArrayList<>();
            tatsaechlich.add(Aufzeichnung.inhaltVon(bahnhof.getGleisA()));
            tatsaechlich.add(Aufzeichnung.inhaltVon(bahnhof.getGleisB()));
            tatsaechlich.add(Aufzeichnung.inhaltVon(bahnhof.getGleisC()));
            // Für die Ansicht zählt, was gemeldet wurde – das wird abgespielt.
            ergebnis.ende = new ArrayList<>();
            for (List<Waggon> gleis : auf.getErwartet()) {
                List<Integer> nummern = new ArrayList<>();
                for (Waggon waggon : gleis) {
                    nummern.add(waggon.getNummer());
                }
                ergebnis.ende.add(nummern);
            }

            if (abbruch != null) {
                return "Abbruch nach " + verschiebungen(auf.getZuege().size()) + ": " + beschreibe(abbruch);
            }
            if (!tatsaechlich.equals(auf.getErwartet())) {
                return "Die Gleise stimmen nicht mit den gemeldeten Verschiebungen überein. Werden in sortiere() "
                        + "Waggons direkt mit push/pop bewegt statt mit verschiebeWaggon(...)?";
            }
            int anzahlBelegt = 0;
            int belegt = -1;
            int gesamt = 0;
            for (int g = 0; g < 3; g++) {
                gesamt += tatsaechlich.get(g).size();
                if (!tatsaechlich.get(g).isEmpty()) {
                    anzahlBelegt++;
                    belegt = g;
                }
            }
            if (gesamt != alle.size()) {
                return "Am Ende stehen " + gesamt + " statt " + alle.size() + " Waggons auf den Gleisen.";
            }
            int anzahlZuege = auf.getZuege().size();
            if (anzahlZuege == 0 && !istAufsteigend(tatsaechlich.get(0))) {
                return "sortiere() hat keinen Waggon verschoben. Ist die Methode schon implementiert?";
            }
            if (anzahlBelegt > 1) {
                return "Nach " + verschiebungen(anzahlZuege) + " stehen die Waggons noch auf " + anzahlBelegt
                        + " Gleisen. Am Ende müssen alle auf einem einzigen Gleis stehen.";
            }
            if (belegt >= 0 && !istAufsteigend(tatsaechlich.get(belegt))) {
                return "Nach " + verschiebungen(anzahlZuege) + " stehen alle Waggons auf Gleis "
                        + Aufzeichnung.NAMEN[belegt] + ", aber nicht aufsteigend vom Prellbock nach vorne: "
                        + ergebnis.ende.get(belegt) + ".";
            }
            String wo = belegt >= 0 ? "Gleis " + Aufzeichnung.NAMEN[belegt] : "den Gleisen";
            ergebnis.meldung = "Richtig sortiert: Alle " + alle.size() + " Waggons stehen aufsteigend auf " + wo
                    + " (" + verschiebungen(anzahlZuege) + ").";
            return null;
        }

        private static String verschiebungen(int pAnzahl) {
            return pAnzahl == 1 ? "1 Verschiebung" : pAnzahl + " Verschiebungen";
        }

        private static boolean istAufsteigend(List<Waggon> pGleis) {
            for (int i = 0; i + 1 < pGleis.size(); i++) {
                if (pGleis.get(i).getNummer() > pGleis.get(i + 1).getNummer()) {
                    return false;
                }
            }
            return true;
        }
    }

    /** Beschreibt einen Fehler so, dass man ihn im eigenen Programm findet. */
    static String beschreibe(Throwable pFehler) {
        String ort = ortVon(pFehler);
        if (pFehler instanceof RangierFehler) {
            return pFehler.getMessage() + ort;
        }
        if (pFehler instanceof StackOverflowError) {
            return "StackOverflowError" + ort + ": Eine Methode ruft sich endlos selbst auf.";
        }
        if (pFehler instanceof NullPointerException) {
            return "NullPointerException" + ort + ": Es wurde auf ein Objekt zugegriffen, das es nicht gibt (null). "
                    + "Häufige Ursachen: top() auf einem leeren Gleis oder ein Stack, der nie erzeugt wurde.";
        }
        String meldung = pFehler.getMessage();
        return pFehler.getClass().getSimpleName() + ort + (meldung == null ? "" : ": " + meldung);
    }

    private static String ortVon(Throwable pFehler) {
        for (StackTraceElement element : pFehler.getStackTrace()) {
            String klasse = element.getClassName();
            if (klasse.equals("rangierbahnhof.Rangierbahnhof") || klasse.equals("rangierbahnhof.Waggon")) {
                return " (" + element.getFileName() + ", Zeile " + element.getLineNumber() + ", Methode "
                        + element.getMethodName() + ")";
            }
        }
        return "";
    }
}
