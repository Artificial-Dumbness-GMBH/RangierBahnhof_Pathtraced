package rangierbahnhof.intern;

import java.util.ArrayList;
import java.util.List;

/**
 * Das Ergebnis eines Prüflaufs: Checkliste, mitgeschriebene Verschiebungen und
 * Endzustand. Lässt sich als Text (Konsole) und als JSON (Browser) ausgeben.
 *
 * Technik der 3D-Ansicht – nicht Teil der Aufgabe.
 */
final class Ergebnis {

    static final String OK = "ok";
    static final String FEHLER = "fehler";
    static final String OFFEN = "offen";

    /** Ein Eintrag der Checkliste. */
    static final class Punkt {
        final String titel;
        String status = OFFEN;
        String hinweis = "";

        Punkt(String pTitel) {
            titel = pTitel;
        }
    }

    final List<Punkt> checkliste = new ArrayList<>();
    int[] start = new int[0];
    List<String> zuege = new ArrayList<>();
    /** Nummern je Gleis vom Prellbock nach vorne; null, wenn nicht ermittelbar. */
    List<List<Integer>> ende = null;
    boolean sortiert = false;
    String meldung = "";

    String alsText() {
        StringBuilder sb = new StringBuilder();
        sb.append("Checkliste\n");
        for (Punkt punkt : checkliste) {
            String marke = punkt.status.equals(OK) ? "[x]" : punkt.status.equals(FEHLER) ? "[!]" : "[ ]";
            sb.append("  ").append(marke).append(' ').append(punkt.titel).append('\n');
            if (!punkt.hinweis.isEmpty()) {
                sb.append("        -> ").append(punkt.hinweis).append('\n');
            }
        }
        sb.append(meldung).append('\n');
        return sb.toString();
    }

    String alsJson() {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"checkliste\":[");
        for (int i = 0; i < checkliste.size(); i++) {
            Punkt punkt = checkliste.get(i);
            if (i > 0) {
                sb.append(',');
            }
            sb.append("{\"titel\":").append(text(punkt.titel));
            sb.append(",\"status\":").append(text(punkt.status));
            sb.append(",\"hinweis\":").append(text(punkt.hinweis)).append('}');
        }
        sb.append("],\"start\":[");
        for (int i = 0; i < start.length; i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(start[i]);
        }
        sb.append("],\"zuege\":[");
        for (int i = 0; i < zuege.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(text(zuege.get(i)));
        }
        sb.append("],\"ende\":");
        if (ende == null) {
            sb.append("null");
        } else {
            sb.append('{');
            for (int g = 0; g < ende.size(); g++) {
                if (g > 0) {
                    sb.append(',');
                }
                sb.append('"').append(Aufzeichnung.NAMEN[g]).append("\":[");
                List<Integer> nummern = ende.get(g);
                for (int i = 0; i < nummern.size(); i++) {
                    if (i > 0) {
                        sb.append(',');
                    }
                    sb.append(nummern.get(i));
                }
                sb.append(']');
            }
            sb.append('}');
        }
        sb.append(",\"sortiert\":").append(sortiert);
        sb.append(",\"meldung\":").append(text(meldung)).append('}');
        return sb.toString();
    }

    /** Wandelt einen Text in eine JSON-Zeichenkette um. */
    static String text(String pText) {
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < pText.length(); i++) {
            char c = pText.charAt(i);
            switch (c) {
                case '"':
                    sb.append("\\\"");
                    break;
                case '\\':
                    sb.append("\\\\");
                    break;
                case '\n':
                    sb.append("\\n");
                    break;
                case '\r':
                    sb.append("\\r");
                    break;
                case '\t':
                    sb.append("\\t");
                    break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        return sb.append('"').toString();
    }
}
