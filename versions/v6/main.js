// ==================== ENTRY POINT ====================
ForkArcade.onReady(function(context) {
  console.log('Hex Crusade ready:', context.slug)
  narrative.transition('intro', 'Hex Crusade loaded')
  gameLoop()
})
