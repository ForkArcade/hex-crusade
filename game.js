const canvas = document.getElementById('game')
const ctx = canvas.getContext('2d')

// Game state
let score = 0

// --- Narrative engine ---
const narrative = {
  variables: { morale: 5, betrayals: 0, alliance_formed: false },
  currentNode: 'chapter-1',
  graph: {
    nodes: [
      { id: 'chapter-1', label: 'First Battle', type: 'scene' },
      { id: 'choice-1', label: 'Ally or betray?', type: 'choice' },
      { id: 'chapter-2a', label: 'Alliance Path', type: 'scene' },
      { id: 'chapter-2b', label: 'Betrayal Path', type: 'scene' },
    ],
    edges: [
      { from: 'chapter-1', to: 'choice-1' },
      { from: 'choice-1', to: 'chapter-2a', label: 'Ally' },
      { from: 'choice-1', to: 'chapter-2b', label: 'Betray' },
    ]
  },

  transition(nodeId, event) {
    this.currentNode = nodeId
    ForkArcade.updateNarrative({
      variables: this.variables,
      currentNode: this.currentNode,
      graph: this.graph,
      event: event
    })
  },

  setVar(name, value, reason) {
    this.variables[name] = value
    ForkArcade.updateNarrative({
      variables: this.variables,
      currentNode: this.currentNode,
      graph: this.graph,
      event: reason || (name + ' = ' + value)
    })
  }
}

// Initialize when SDK connects to platform
ForkArcade.onReady(function(context) {
  console.log('Strategy RPG ready:', context.slug)
  narrative.transition('chapter-1', 'Game started')
  start()
})

function start() {
  // TODO: implement your strategy RPG here
  // Use narrative.transition(nodeId, event) to advance the story
  // Use narrative.setVar(name, value, reason) to change variables
  render()
}

function render() {
  ctx.fillStyle = '#222'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = '#fff'
  ctx.font = '24px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('Strategy RPG — implement game.js', canvas.width / 2, canvas.height / 2)
}

function gameOver() {
  ForkArcade.submitScore(score)
}
