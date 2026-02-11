Ten projekt to gra typu Strategy RPG na platformę ForkArcade.

## SDK
SDK jest podpięty w index.html. Używaj:
- `ForkArcade.onReady(cb)` — start gry po połączeniu z platformą
- `ForkArcade.submitScore(score)` — wyślij wynik po zakończeniu bitwy/gry
- `ForkArcade.getPlayer()` — info o zalogowanym graczu
- `ForkArcade.updateNarrative(data)` — raportuj stan narracji (graf, zmienne, eventy)

## Typ gry
Turowa strategia z jednostkami na gridzie lub w menu.
Gracz zarządza drużyną, prowadzi bitwy turowe, zdobywa XP i ekwipunek.

## Scoring
Score = (chapters_completed * 1000) + (enemies_killed * 10) + (units_survived * 500) - (turns_total * 5)

## Warstwa narracji
Gra ma wbudowany narrative engine (`narrative` obiekt w game.js). Platforma wyświetla panel narracyjny w czasie rzeczywistym.

- `narrative.transition(nodeId, event)` — przejdź do nowego node'a w grafie, wyślij event
- `narrative.setVar(name, value, reason)` — zmień zmienną fabularną, wyślij event
- Rozbuduj `narrative.graph` o nowe nodes i edges dopasowane do fabuły gry
- Typy nodów: `scene` (scena/rozdział), `choice` (decyzja gracza), `condition` (warunek)
- Zmienne numeryczne (0-10) wyświetlane jako paski, boolean jako checkmarks

## Plik wejściowy
Cała logika gry w `game.js`. Renderowanie na `<canvas id="game">`.
