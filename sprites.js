// sprites.js — ForkArcade pixel art sprites
// Wygenerowany z _sprites.json przez create_sprite tool
// Mozesz edytowac recznie, ale pamietaj o formacie.

var SPRITE_DEFS = {}

function drawSprite(ctx, spriteDef, x, y, size) {
  if (!spriteDef) return false
  var pw = size / spriteDef.w
  var ph = size / spriteDef.h
  for (var row = 0; row < spriteDef.h; row++) {
    var line = spriteDef.pixels[row]
    for (var col = 0; col < spriteDef.w; col++) {
      var ch = line[col]
      if (ch === ".") continue
      var color = spriteDef.palette[ch]
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x + col * pw, y + row * ph, Math.ceil(pw), Math.ceil(ph))
    }
  }
  return true
}

function getSprite(category, name) {
  return SPRITE_DEFS[category] && SPRITE_DEFS[category][name] || null
}
