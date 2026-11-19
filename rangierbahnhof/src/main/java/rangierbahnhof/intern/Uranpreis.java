package rangierbahnhof.intern;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Liest den zuletzt veröffentlichten Monatskurs einer öffentlichen Referenzquelle. */
final class Uranpreis {
    private static final URI QUELLE = URI.create("https://www.cameco.com/invest/markets/uranium-price");
    private static final Pattern KURSZEILE = Pattern.compile(
            "<td\\b[^>]*field-monthly-date[^>]*>\\s*(\\d{4}/\\d{2}/\\d{2})\\s*</td>\\s*"
            + "<td\\b[^>]*field-spot-price[^>]*>\\s*(\\d+\\.\\d{2})\\s*</td>");

    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(4))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    private Kurs kurs = new Kurs(LocalDate.of(2026, 10, 30), "91.55");
    private long naechsteAbfrage;
    private boolean aktuell;

    synchronized String alsJson() {
        if (System.currentTimeMillis() >= naechsteAbfrage) {
            aktuell = aktualisiere();
            Duration intervall = aktuell ? Duration.ofHours(6) : Duration.ofMinutes(5);
            naechsteAbfrage = System.currentTimeMillis() + intervall.toMillis();
        }
        return "{\"usdProPfund\":" + kurs.usdProPfund() + ",\"datum\":\"" + kurs.datum()
                + "\",\"aktuell\":" + aktuell + "}";
    }

    private boolean aktualisiere() {
        HttpRequest anfrage = HttpRequest.newBuilder(QUELLE).timeout(Duration.ofSeconds(5)).build();
        try {
            HttpResponse<String> antwort = client.send(anfrage, HttpResponse.BodyHandlers.ofString());
            if (antwort.statusCode() != 200) return false;
            Matcher zeile = KURSZEILE.matcher(antwort.body());
            Kurs neuester = null;
            while (zeile.find()) {
                LocalDate datum = LocalDate.parse(zeile.group(1).replace('/', '-'));
                if (neuester == null || datum.isAfter(neuester.datum())) {
                    neuester = new Kurs(datum, zeile.group(2));
                }
            }
            if (neuester == null || neuester.datum().isBefore(kurs.datum())) return false;
            kurs = neuester;
            return true;
        } catch (IOException | java.time.format.DateTimeParseException fehler) {
            return false;
        } catch (InterruptedException fehler) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private record Kurs(LocalDate datum, String usdProPfund) { }
}
