package rangierbahnhof.intern;

import java.awt.Desktop;
import java.awt.GraphicsEnvironment;
import java.io.IOException;
import java.io.InputStream;
import java.net.BindException;
import java.net.HttpURLConnection;
import java.net.Proxy;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import java.util.concurrent.CountDownLatch;

/**
 * Startet alles, was zur 3D-Ansicht gehört: einen ersten Prüflauf für die
 * Konsole, den Webserver und den Browser.
 *
 * Technik der 3D-Ansicht – nicht Teil der Aufgabe.
 */
public final class Leitstand {

    private static final int ERSTER_PORT = 8765;
    private static final int ANZAHL_PORTS = 10;

    private Leitstand() {
    }

    public static void starte() {
        drucke("=== Rangierbahnhof ===\n");

        int[] start = zufaelligeBelegung(5 + new Random().nextInt(3));
        drucke("Probelauf mit Gleis A (Prellbock -> vorne): " + Arrays.toString(start));
        drucke(Pruefung.pruefe(start).alsText());

        boolean seiteSchonOffen = false;
        Webserver server = null;
        int port = ERSTER_PORT;
        for (int i = 0; i < ANZAHL_PORTS && server == null; i++) {
            port = ERSTER_PORT + i;
            try {
                server = new Webserver(port);
            } catch (BindException belegt) {
                // Läuft dort noch ein älterer Start dieses Programms? Dann ablösen.
                String antwort = frage("http://127.0.0.1:" + port + "/api/beenden");
                if (antwort != null && antwort.startsWith(Webserver.PROGRAMM)) {
                    seiteSchonOffen = antwort.contains("seite=1");
                    server = warteAufFreienPort(port);
                }
            } catch (IOException e) {
                drucke("Der Webserver konnte nicht gestartet werden: " + e.getMessage());
                return;
            }
        }
        if (server == null) {
            drucke("Kein freier Port gefunden – die 3D-Ansicht kann nicht gestartet werden.");
            return;
        }

        String adresse = "http://127.0.0.1:" + port + "/";
        drucke("3D-Ansicht: " + adresse);
        if (seiteSchonOffen) {
            drucke("Die bereits geöffnete Browser-Seite verbindet sich von selbst neu.");
        } else if (!"aus".equals(System.getProperty("rangierbahnhof.browser"))) {
            if (!oeffneBrowser(adresse)) {
                drucke("Bitte die Adresse von Hand im Browser öffnen.");
            }
        }
        drucke("Beenden: Stopp-Knopf in VS Code oder Strg+C im Terminal.");

        try {
            new CountDownLatch(1).await(); // läuft, bis das Programm gestoppt wird
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * Gibt einen Text in der Konsole aus. Umlaute und Sonderzeichen werden
     * dabei umschrieben, weil manche Terminals sie sonst verstümmeln.
     */
    static void drucke(String pText) {
        String[][] ersatz = { { "ä", "ae" }, { "ö", "oe" }, { "ü", "ue" }, { "Ä", "Ae" }, { "Ö", "Oe" },
            { "Ü", "Ue" }, { "ß", "ss" }, { "–", "-" } };
        String text = pText;
        for (String[] paar : ersatz) {
            text = text.replace(paar[0], paar[1]);
        }
        System.out.println(text);
    }

    /** pAnzahl verschiedene Nummern zwischen 1 und 100 in zufälliger Reihenfolge. */
    private static int[] zufaelligeBelegung(int pAnzahl) {
        List<Integer> nummern = new ArrayList<>();
        for (int i = 1; i <= 100; i++) {
            nummern.add(i);
        }
        Collections.shuffle(nummern);
        int[] ergebnis = new int[pAnzahl];
        for (int i = 0; i < pAnzahl; i++) {
            ergebnis[i] = nummern.get(i);
        }
        return ergebnis;
    }

    private static Webserver warteAufFreienPort(int pPort) {
        for (int versuch = 0; versuch < 25; versuch++) {
            try {
                Thread.sleep(120);
                return new Webserver(pPort);
            } catch (IOException nochBelegt) {
                // gleich noch einmal versuchen
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return null;
            }
        }
        return null;
    }

    /** Ruft eine Adresse auf diesem Rechner ab; null, wenn niemand antwortet. */
    private static String frage(String pAdresse) {
        try {
            HttpURLConnection verbindung = (HttpURLConnection) URI.create(pAdresse).toURL()
                    .openConnection(Proxy.NO_PROXY);
            verbindung.setConnectTimeout(500);
            verbindung.setReadTimeout(800);
            try (InputStream strom = verbindung.getInputStream()) {
                return new String(strom.readAllBytes(), StandardCharsets.UTF_8);
            }
        } catch (IOException e) {
            return null;
        }
    }

    private static boolean oeffneBrowser(String pAdresse) {
        try {
            if (!GraphicsEnvironment.isHeadless() && Desktop.isDesktopSupported()
                    && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(URI.create(pAdresse));
                return true;
            }
        } catch (Throwable t) {
            // unten folgt der zweite Versuch
        }
        String system = System.getProperty("os.name", "").toLowerCase();
        String[] befehl;
        if (system.contains("win")) {
            befehl = new String[] { "rundll32", "url.dll,FileProtocolHandler", pAdresse };
        } else if (system.contains("mac")) {
            befehl = new String[] { "open", pAdresse };
        } else {
            befehl = new String[] { "xdg-open", pAdresse };
        }
        try {
            new ProcessBuilder(befehl).start();
            return true;
        } catch (IOException e) {
            return false;
        }
    }
}
