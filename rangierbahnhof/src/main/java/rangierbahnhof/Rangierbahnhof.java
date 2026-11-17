package rangierbahnhof;

/**
 * Ein Rangierbahnhof mit den drei Abstellgleisen A, B und C.
 *
 * Jedes Gleis endet an einem Prellbock und ist nur von einer Seite aus
 * erreichbar. Die Rangierlok kommt deshalb immer nur an den vordersten Waggon
 * eines Gleises heran. Genau so arbeitet ein Stack:
 *
 *     unten im Stack  =  der Waggon direkt am Prellbock
 *     oben im Stack   =  der vorderste Waggon (hier kuppelt die Lok an)
 *
 * AUFGABE: Implementieren Sie die Klasse nach dem Implementationsdiagramm
 * (Ordner "diagramm"). Jede Stelle, an der etwas fehlt, ist mit 
 * Die Klasse Stack ist vorgegeben; Sie benötigen von ihr nur die Methoden
 * isEmpty(), push(...), pop() und top().
 *
 * Starten Sie zwischendurch die Klasse Main: Die Checkliste in der Konsole und
 * in der 3D-Ansicht zeigt, welche Methoden schon richtig arbeiten.
 */
public class Rangierbahnhof {

    //  Die drei Gleise gleisA, gleisB und gleisC als Attribute
    //       deklarieren. Jedes Gleis ist ein Stack von Waggons.

    // Verbindung zur 3D-Ansicht (vorgegeben, nicht verändern).
    private Anzeige anzeige;
    private Stack <Waggon> gleisA;
    private Stack <Waggon> gleisB;
    private Stack <Waggon> gleisC;

    /**
     * Ein Rangierbahnhof mit drei leeren Gleisen wird erzeugt.
     *
     * @param pAnzeige die Anzeige, die jede Verschiebung sichtbar macht
     */
    public Rangierbahnhof(Anzeige pAnzeige) {
        anzeige = pAnzeige; // vorgegeben
        gleisA = new Stack<Waggon>();
        gleisB = new Stack<Waggon>();
        gleisC = new Stack<Waggon>();
        
        //  Für jedes der drei Gleise einen neuen, leeren Stack erzeugen.
    }

    /**
     * Die Anfrage liefert das Gleis A.
     *
     * @return der Stack, der das Gleis A darstellt
     */
    public Stack<Waggon> getGleisA() {
        
        return gleisA; // Platzhalter – bitte ersetzen
    }

    /**
     * Die Anfrage liefert das Gleis B.
     *
     * @return der Stack, der das Gleis B darstellt
     */
    public Stack<Waggon> getGleisB() {
        //  Das Attribut zurückgeben.
        return gleisB; // Platzhalter – bitte ersetzen
    }

    /**
     * Die Anfrage liefert das Gleis C.
     *
     * @return der Stack, der das Gleis C darstellt
     */
    public Stack<Waggon> getGleisC() {
        // Das Attribut zurückgeben.
        return gleisC; // Platzhalter – bitte ersetzen
    }

    /**
     * Der Waggon pWaggon wird vorne auf Gleis A abgestellt. Mit dieser Methode
     * wird der Bahnhof zu Beginn mit Waggons gefüllt.
     *
     * @param pWaggon der Waggon, der auf Gleis A abgestellt wird
     */
    public void fuegeWaggonHinzu(Waggon pWaggon) {
        // pWaggon oben auf den Stack von Gleis A legen.
        gleisA.push(pWaggon);
    }

    /**
     * Die Anfrage liefert true, wenn auf dem Gleis pGleis kein Waggon steht,
     * sonst false.
     *
     * Beispiel für einen Aufruf: istLeer(gleisB)
     *
     * @param pGleis eines der drei Gleise
     * @return true, falls das Gleis leer ist, sonst false
     */
    public boolean istLeer(Stack<Waggon> pGleis) {
        //  Den Stack pGleis fragen, ob er leer ist, und die Antwort
        //       zurückgeben.
        if (pGleis.isEmpty()){
            return true;
        }
        return false; // Platzhalter – bitte ersetzen
    }

    /**
     * Der vorderste Waggon des Gleises pVon wird auf das Gleis pNach
     * rangiert. Dort steht er anschließend ganz vorne. Falls pVon leer ist,
     * passiert nichts.
     *
     * Beispiel für einen Aufruf: verschiebeWaggon(gleisA, gleisC)
     *
     * Dies ist die einzige Methode, mit der Waggons zwischen den Gleisen
     * bewegt werden dürfen.
     *
     * @param pVon  das Gleis, von dem der vorderste Waggon abgezogen wird
     * @param pNach das Gleis, auf das der Waggon geschoben wird
     */
    public void verschiebeWaggon(Stack<Waggon> pVon, Stack<Waggon> pNach) {
        //  Nur wenn pVon nicht leer ist:
        //   1. den obersten Waggon von pVon in einer lokalen Variablen merken,
        //   2. diesen Waggon von pVon entfernen,
        //   3. ihn oben auf pNach legen,
        //   4. als Letztes die 3D-Ansicht informieren. Diese Zeile ist
        //      vorgegeben, Sie müssen sie nur an die richtige Stelle setzen
        //      und die Kommentarzeichen entfernen:
        //
        //      

        if(!pVon.isEmpty()){
            Waggon waggon = pVon.top();
            pVon.pop();
            pNach.push(waggon);
            anzeige.zeigeVerschiebung(pVon, pNach);
        }
    }

    /**
     * Die Waggons werden sortiert.
     *
     * Vorher:  Alle Waggons stehen in beliebiger Reihenfolge auf Gleis A,
     *          die Gleise B und C sind leer.
     * Nachher: Alle Waggons stehen auf EINEM der drei Gleise (welches, ist
     *          egal), die beiden anderen Gleise sind leer. Die Nummern
     *          steigen vom Prellbock nach vorne an: Der Waggon mit der
     *          kleinsten Nummer steht am Prellbock (unten im Stack), der
     *          Waggon mit der größten Nummer ganz vorne (oben im Stack).
     *
     * Regeln:
     *   - Waggons werden ausschließlich mit verschiebeWaggon(...) bewegt.
     *   - Die Lok sieht von jedem Gleis nur den vordersten Waggon. Dessen
     *     Nummer erhalten Sie zum Beispiel mit gleisA.top().getNummer().
     *   - Prüfen Sie mit istLeer(...), ob auf einem Gleis überhaupt ein
     *     Waggon steht, bevor Sie nach dem vordersten Waggon fragen.
     */
    public void sortiere() {
        //  Hier entsteht Ihr Algorithmus.
        while(!istLeer(gleisA)){
            int kleinste = gleisA.top().getNummer();

            while (!gleisA.isEmpty()){
                if (gleisA.top().getNummer()<kleinste){
                    kleinste = gleisA.top().getNummer();
                }
                verschiebeWaggon(gleisA, gleisB);
            }

            while (!gleisB.isEmpty()){
                if(gleisB.top().getNummer() == kleinste){
                    verschiebeWaggon(gleisB, gleisC);
                }
                else{verschiebeWaggon(gleisB, gleisA);}
            }
        }
    }
}
