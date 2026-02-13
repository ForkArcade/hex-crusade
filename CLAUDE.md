This project is a Strategy RPG game for the ForkArcade platform.

## SDK
SDK is included in index.html. Use:
- `ForkArcade.onReady(cb)` — start the game after connecting to the platform
- `ForkArcade.submitScore(score)` — submit score after a battle/game ends
- `ForkArcade.getPlayer()` — info about the logged-in player
- `ForkArcade.updateNarrative(data)` — report narrative state (graph, variables, events)

## Game type
Turn-based strategy with units on a grid or in menus.
Player manages a squad, fights turn-based battles, earns XP and equipment.

## Scoring
Score = (chapters_completed * 1000) + (enemies_killed * 10) + (units_survived * 500) - (turns_total * 5)

## Narrative layer
The game has a built-in narrative engine (`narrative` object in game.js). The platform displays a narrative panel in real-time.

- `narrative.transition(nodeId, event)` — move to a new node in the graph, send event
- `narrative.setVar(name, value, reason)` — change a story variable, send event
- Expand `narrative.graph` with new nodes and edges matching the game's story
- Node types: `scene` (scene/chapter), `choice` (player decision), `condition` (condition check)
- Numeric variables (0-10) displayed as bars, booleans as checkmarks

## Entry file
All game logic in `game.js`. Rendering on `<canvas id="game">`.
