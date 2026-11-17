package rangierbahnhof.intern;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.concurrent.Executors;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/**
 * Ein kleiner Webserver, der nur auf diesem Rechner erreichbar ist. Er liefert
 * die Dateien der 3D-Ansicht an den Browser aus und nimmt deren Anfragen
 * entgegen ("führe sortiere() mit dieser Startbelegung aus").
 *
 * Technik der 3D-Ansicht – nicht Teil der Aufgabe.
 */
final class Webserver {

    /** Kennwort, an dem sich zwei Instanzen dieses Programms erkennen. */
    static final String PROGRAMM = "rangierbahnhof";

    private final HttpServer server;
    private final String kennung = Long.toString(System.currentTimeMillis(), 36);
    private volatile long letzterKontakt = 0;

    Webserver(int pPort) throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), pPort), 0);
        server.createContext("/", this::liefereDatei);
        server.createContext("/api/status", this::liefereStatus);
        server.createContext("/api/sortiere", this::fuehreSortierenAus);
        server.createContext("/api/beenden", this::beende);
        server.setExecutor(Executors.newCachedThreadPool(auftrag -> {
            Thread faden = new Thread(auftrag, "Webserver");
            faden.setDaemon(true);
            return faden;
        }));
        server.start();
    }

    // ------------------------------------------------------------ Anfragen

    private void liefereStatus(HttpExchange pAnfrage) throws IOException {
        letzterKontakt = System.currentTimeMillis();
        sende(pAnfrage, 200, "application/json",
                "{\"programm\":\"" + PROGRAMM + "\",\"kennung\":\"" + kennung + "\"}");
    }

    private void fuehreSortierenAus(HttpExchange pAnfrage) throws IOException {
        letzterKontakt = System.currentTimeMillis();
        int[] start = leseStart(pAnfrage.getRequestURI().getQuery());
        if (start == null) {
            sende(pAnfrage, 400, "text/plain", "Ungültige Startbelegung.");
            return;
        }
        Ergebnis ergebnis;
        synchronized (this) {
            ergebnis = Pruefung.pruefe(start);
        }
        Leitstand.drucke("Startbelegung Gleis A (Prellbock -> vorne): " + java.util.Arrays.toString(start));
        Leitstand.drucke(ergebnis.alsText());
        sende(pAnfrage, 200, "application/json", ergebnis.alsJson());
    }

    private void beende(HttpExchange pAnfrage) throws IOException {
        boolean seiteOffen = System.currentTimeMillis() - letzterKontakt < 75_000;
        sende(pAnfrage, 200, "text/plain", PROGRAMM + " seite=" + (seiteOffen ? "1" : "0"));
        Thread ende = new Thread(() -> {
            try {
                Thread.sleep(150);
            } catch (InterruptedException e) {
                // egal, das Programm endet ohnehin
            }
            Leitstand.drucke("Ein neu gestartetes Programm hat übernommen – dieses beendet sich.");
            System.exit(0);
        });
        ende.setDaemon(true);
        ende.start();
    }

    private void liefereDatei(HttpExchange pAnfrage) throws IOException {
        String pfad = pAnfrage.getRequestURI().getPath();
        if (pfad.equals("/")) {
            pfad = "/index.html";
        }
        byte[] daten = null;
        if (pfad.matches("/[A-Za-z0-9_./-]+") && !pfad.contains("..")) {
            daten = lade(pfad.substring(1));
        }
        if (daten == null) {
            sende(pAnfrage, 404, "text/plain", "Nicht gefunden: " + pfad);
            return;
        }
        sende(pAnfrage, 200, typVon(pfad), daten);
    }

    // ------------------------------------------------------------- Hilfen

    /** Liest "start=7,3,9" aus der Anfrage; null bei ungültigen Angaben. */
    private static int[] leseStart(String pAbfrage) {
        if (pAbfrage == null || !pAbfrage.matches("start=\\d{1,3}(,\\d{1,3}){0,19}")) {
            return null;
        }
        String[] teile = pAbfrage.substring("start=".length()).split(",");
        int[] start = new int[teile.length];
        for (int i = 0; i < teile.length; i++) {
            start[i] = Integer.parseInt(teile[i]);
        }
        return start;
    }

    /**
     * Lädt eine Datei der 3D-Ansicht: zuerst direkt aus dem Projektordner
     * (src/main/resources/web), sonst aus dem Klassenpfad.
     */
    private static byte[] lade(String pName) throws IOException {
        Path datei = Paths.get("src", "main", "resources", "web").resolve(pName);
        if (Files.isRegularFile(datei)) {
            return Files.readAllBytes(datei);
        }
        try (InputStream strom = Webserver.class.getClassLoader().getResourceAsStream("web/" + pName)) {
            return strom == null ? null : strom.readAllBytes();
        }
    }

    private static String typVon(String pPfad) {
        if (pPfad.endsWith(".html")) {
            return "text/html";
        }
        if (pPfad.endsWith(".js")) {
            return "text/javascript";
        }
        if (pPfad.endsWith(".css")) {
            return "text/css";
        }
        if (pPfad.endsWith(".svg")) {
            return "image/svg+xml";
        }
        return "text/plain";
    }

    private static void sende(HttpExchange pAnfrage, int pCode, String pTyp, String pText) throws IOException {
        sende(pAnfrage, pCode, pTyp, pText.getBytes(StandardCharsets.UTF_8));
    }

    private static void sende(HttpExchange pAnfrage, int pCode, String pTyp, byte[] pDaten) throws IOException {
        pAnfrage.getResponseHeaders().set("Content-Type", pTyp + "; charset=utf-8");
        pAnfrage.getResponseHeaders().set("Cache-Control", "no-store");
        pAnfrage.sendResponseHeaders(pCode, pDaten.length);
        try (OutputStream aus = pAnfrage.getResponseBody()) {
            aus.write(pDaten);
        }
    }
}
