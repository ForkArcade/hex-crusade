const canvas = document.getElementById('game')
const ctx = canvas.getContext('2d')

// ==================== CONSTANTS ====================
const COLS = 16, ROWS = 12
const HEX_SIZE = 22
const HEX_W = HEX_SIZE * Math.sqrt(3)
const HEX_H = HEX_SIZE * 2
const GRID_OFFSET_X = 60
const GRID_OFFSET_Y = 50
const PANEL_X = GRID_OFFSET_X + COLS * HEX_W + 30

const TERRAIN = {
  plains:   { name: 'Plains',   color: '#5a8c3c', moveCost: 1, defBonus: 1.0 },
  forest:   { name: 'Forest',   color: '#2d5a1e', moveCost: 2, defBonus: 1.3 },
  mountain: { name: 'Mountain', color: '#7a7a7a', moveCost: 3, defBonus: 1.5 },
  water:    { name: 'Water',    color: '#2a6a9a', moveCost: 99, defBonus: 1.0 },
  castle:   { name: 'Castle',   color: '#8a6a3a', moveCost: 1, defBonus: 1.8 }
}

const UNIT_DEFS = {
  warrior: { name: 'Warrior', char: 'W', hp: 30, atk: 10, def: 8, spd: 3, range: 1, move: 3, abilities: ['Shield Bash','Charge'] },
  archer:  { name: 'Archer',  char: 'A', hp: 20, atk: 12, def: 4, spd: 4, range: 3, move: 4, abilities: ['Aimed Shot','Volley'] },
  mage:    { name: 'Mage',    char: 'M', hp: 18, atk: 14, def: 3, spd: 2, range: 2, move: 3, abilities: ['Fireball','Freeze'] },
  healer:  { name: 'Healer',  char: 'H', hp: 22, atk: 5,  def: 5, spd: 3, range: 2, move: 3, abilities: ['Heal','Barrier'] }
}

const BATTLES = [
  { name: 'Border Outpost', enemyTypes: ['warrior','warrior','archer'], castlePos: {col:15,row:2} },
  { name: 'Forest Stronghold', enemyTypes: ['warrior','archer','mage','warrior'], castlePos: {col:15,row:1} },
  { name: 'Dark Fortress', enemyTypes: ['warrior','warrior','archer','mage','healer'], castlePos: {col:15,row:2} }
]

// ==================== STATE ====================
const STATE = { MENU: 0, DEPLOY: 1, PLAYER_TURN: 2, SELECT_ACTION: 3, SELECT_TARGET: 4, ANIMATING: 5, ENEMY_TURN: 6, BATTLE_END: 7, GAME_OVER: 8 }

let state = STATE.MENU
let battleIndex = 0
let grid = []       // grid[row][col] = { terrain, variant, unit }
let units = []
let selectedUnit = null
let reachable = []  // [{col,row}] tiles the selected unit can move to
let targets = []    // [{col,row}] valid attack/ability targets
let currentAction = null // 'move','attack','ability0','ability1'
let turnOrder = []
let turnIndex = 0
let animations = []
let messages = []   // floating messages
let score = 0
let totalTurns = 0
let enemiesKilled = 0
let hoveredHex = null
let abilityIndex = -1

// Camera (zoom & pan)
let camera = { x: 0, y: 0, zoom: 1 }
let isDragging = false
let isPotentialDrag = false
let dragOccurred = false
let dragStartX = 0, dragStartY = 0
let dragCamStartX = 0, dragCamStartY = 0

// ==================== NARRATIVE ====================
const narrative = {
  variables: { morale: 5, battles_won: 0, casualties: 0 },
  currentNode: 'intro',
  graph: {
    nodes: [
      { id: 'intro', label: 'The Crusade Begins', type: 'scene' },
      { id: 'battle-1', label: 'Border Outpost', type: 'scene' },
      { id: 'choice-1', label: 'Mercy or Raze?', type: 'choice' },
      { id: 'battle-2', label: 'Forest Stronghold', type: 'scene' },
      { id: 'choice-2', label: 'Shortcut or Safe?', type: 'choice' },
      { id: 'battle-3', label: 'Dark Fortress', type: 'scene' },
      { id: 'victory', label: 'Victory!', type: 'scene' },
      { id: 'defeat', label: 'Defeat', type: 'scene' }
    ],
    edges: [
      { from: 'intro', to: 'battle-1' },
      { from: 'battle-1', to: 'choice-1' },
      { from: 'choice-1', to: 'battle-2', label: 'Mercy' },
      { from: 'choice-1', to: 'battle-2', label: 'Raze' },
      { from: 'battle-2', to: 'choice-2' },
      { from: 'choice-2', to: 'battle-3', label: 'Shortcut' },
      { from: 'choice-2', to: 'battle-3', label: 'Safe path' },
      { from: 'battle-3', to: 'victory' },
      { from: 'battle-3', to: 'defeat' }
    ]
  },
  transition(nodeId, event) {
    this.currentNode = nodeId
    ForkArcade.updateNarrative({ variables: this.variables, currentNode: this.currentNode, graph: this.graph, event })
  },
  setVar(name, value, reason) {
    this.variables[name] = value
    ForkArcade.updateNarrative({ variables: this.variables, currentNode: this.currentNode, graph: this.graph, event: reason || (name + ' = ' + value) })
  }
}

// ==================== HEX MATH ====================
function hexToPixel(col, row) {
  const x = GRID_OFFSET_X + col * HEX_W + (row % 2 === 1 ? HEX_W / 2 : 0)
  const y = GRID_OFFSET_Y + row * HEX_H * 0.75
  return { x: x + HEX_W / 2, y: y + HEX_H / 2 }
}

function pixelToHex(px, py) {
  let best = null, bestDist = Infinity
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const { x, y } = hexToPixel(c, r)
      const d = Math.hypot(px - x, py - y)
      if (d < bestDist && d < HEX_SIZE) { bestDist = d; best = { col: c, row: r } }
    }
  }
  return best
}

function hexDistance(c1, r1, c2, r2) {
  const ac1 = c1 - Math.floor(r1 / 2), az1 = r1, ac2 = c2 - Math.floor(r2 / 2), az2 = r2
  const ar1 = -ac1 - az1, ar2 = -ac2 - az2
  return Math.max(Math.abs(ac1 - ac2), Math.abs(ar1 - ar2), Math.abs(az1 - az2))
}

function hexNeighbors(col, row) {
  const parity = row & 1
  const dirs = parity
    ? [[1,0],[-1,0],[0,-1],[1,-1],[0,1],[1,1]]
    : [[1,0],[-1,0],[-1,-1],[0,-1],[-1,1],[0,1]]
  return dirs.map(([dc, dr]) => ({ col: col + dc, row: row + dr }))
    .filter(h => h.col >= 0 && h.col < COLS && h.row >= 0 && h.row < ROWS)
}

function screenToWorld(sx, sy) {
  return { x: (sx - camera.x) / camera.zoom, y: (sy - camera.y) / camera.zoom }
}

// ==================== PERLIN NOISE ====================
function noiseHash(x, y, seed) {
  var n = Math.sin(x * 127.1 + y * 311.7 + seed * 53.3) * 43758.5453
  return n - Math.floor(n)
}

function smoothNoise(x, y, seed) {
  var ix = Math.floor(x), iy = Math.floor(y)
  var fx = x - ix, fy = y - iy
  fx = fx * fx * (3 - 2 * fx)
  fy = fy * fy * (3 - 2 * fy)
  var a = noiseHash(ix, iy, seed)
  var b = noiseHash(ix + 1, iy, seed)
  var c = noiseHash(ix, iy + 1, seed)
  var d = noiseHash(ix + 1, iy + 1, seed)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

function perlin2D(x, y, seed, octaves) {
  var val = 0, amp = 1, freq = 1, max = 0
  for (var i = 0; i < octaves; i++) {
    val += smoothNoise(x * freq, y * freq, seed + i * 97) * amp
    max += amp
    amp *= 0.5
    freq *= 2
  }
  return val / max
}

// ==================== GRID & UNITS ====================
const TERRAIN_SPRITE_MAP = { plains: 'grass', forest: 'forest', mountain: 'mountain', water: 'water', castle: 'castle', road: 'road' }

function generateTerrain(battleIdx) {
  var seed = battleIdx * 1000 + 42
  grid = []
  for (var r = 0; r < ROWS; r++) {
    grid[r] = []
    for (var c = 0; c < COLS; c++) {
      var n = perlin2D(c * 0.35, r * 0.35, seed, 3)
      var t = 'plains'
      if (battleIdx === 0) {
        if (n < 0.22) t = 'water'
        else if (n < 0.38) t = 'forest'
      } else if (battleIdx === 1) {
        if (n < 0.18) t = 'water'
        else if (n < 0.45) t = 'forest'
        else if (n > 0.82) t = 'mountain'
      } else {
        if (n < 0.15) t = 'water'
        else if (n < 0.30) t = 'forest'
        else if (n > 0.72) t = 'mountain'
      }
      // Keep spawn columns clear
      if (c <= 1 || c >= COLS - 2) t = 'plains'
      var variant = (c * 7 + r * 13 + seed) % 3
      grid[r][c] = { terrain: t, variant: variant, unit: null }
    }
  }
  // Place castle
  var cp = BATTLES[battleIdx].castlePos
  grid[cp.row][cp.col].terrain = 'castle'
  grid[cp.row][cp.col].variant = 0
}

function makeUnit(type, team, col, row) {
  const def = UNIT_DEFS[type]
  return {
    type, team, col, row,
    name: def.name, char: def.char,
    hp: def.hp, maxHp: def.hp,
    atk: def.atk, def: def.def, spd: def.spd,
    range: def.range, move: def.move,
    abilities: [...def.abilities],
    moved: false, acted: false, alive: true,
    animX: 0, animY: 0
  }
}

function setupBattle(idx) {
  battleIndex = idx
  generateTerrain(idx)
  units = []
  // Player units on left
  const playerTypes = ['warrior', 'archer', 'mage', 'healer']
  const playerPositions = [{col:0,row:3},{col:0,row:6},{col:1,row:4},{col:1,row:7}]
  playerTypes.forEach((t, i) => {
    const p = playerPositions[i]
    const u = makeUnit(t, 'player', p.col, p.row)
    units.push(u)
    grid[p.row][p.col].unit = u
  })
  // Enemy units on right
  const battle = BATTLES[idx]
  const enemyStartCol = COLS - 2
  battle.enemyTypes.forEach((t, i) => {
    const row = 2 + i * Math.floor(10 / battle.enemyTypes.length)
    const col = enemyStartCol + (i % 2)
    const u = makeUnit(t, 'enemy', col, Math.min(row, ROWS - 1))
    units.push(u)
    grid[u.row][u.col].unit = u
  })
  // Castle unit (destructible)
  const cp = battle.castlePos
  const castle = { type: 'castle', team: 'enemy', col: cp.col, row: cp.row, name: 'Castle', char: 'C', hp: 40 + idx * 15, maxHp: 40 + idx * 15, atk: 0, def: 12, spd: 0, range: 0, move: 0, abilities: [], moved: true, acted: true, alive: true, animX: 0, animY: 0 }
  units.push(castle)
  grid[cp.row][cp.col].unit = castle

  selectedUnit = null
  reachable = []
  targets = []
  currentAction = null
  turnOrder = []
  turnIndex = 0
  camera = { x: 0, y: 0, zoom: 1 }
}

// ==================== PATHFINDING ====================
function findReachable(unit) {
  const result = []
  const visited = {}
  const queue = [{ col: unit.col, row: unit.row, cost: 0 }]
  visited[unit.col + ',' + unit.row] = 0
  while (queue.length) {
    const cur = queue.shift()
    if (cur.cost > 0) result.push({ col: cur.col, row: cur.row })
    for (const nb of hexNeighbors(cur.col, cur.row)) {
      const key = nb.col + ',' + nb.row
      const cell = grid[nb.row][nb.col]
      const cost = cur.cost + TERRAIN[cell.terrain].moveCost
      if (cost <= unit.move && cell.terrain !== 'water' && !cell.unit && (visited[key] === undefined || visited[key] > cost)) {
        visited[key] = cost
        queue.push({ col: nb.col, row: nb.row, cost })
      }
    }
  }
  return result
}

function findTargets(unit, range) {
  const result = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c]
      if (cell.unit && cell.unit.alive && cell.unit.team !== unit.team && hexDistance(unit.col, unit.row, c, r) <= range) {
        result.push({ col: c, row: r })
      }
    }
  }
  return result
}

function findHealTargets(unit, range) {
  const result = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c]
      if (cell.unit && cell.unit.alive && cell.unit.team === unit.team && cell.unit.hp < cell.unit.maxHp && hexDistance(unit.col, unit.row, c, r) <= range) {
        result.push({ col: c, row: r })
      }
    }
  }
  return result
}

// ==================== COMBAT ====================
function calcDamage(attacker, defender) {
  const terrain = TERRAIN[grid[defender.row][defender.col].terrain]
  const raw = attacker.atk - defender.def * terrain.defBonus
  return Math.max(1, Math.floor(raw * (0.9 + Math.random() * 0.2)))
}

function applyDamage(target, dmg) {
  target.hp -= dmg
  addMessage(target.col, target.row, '-' + dmg, '#f44')
  if (target.hp <= 0) {
    target.hp = 0
    target.alive = false
    grid[target.row][target.col].unit = null
    addMessage(target.col, target.row, target.name + ' defeated!', '#ff0')
    if (target.team === 'enemy') enemiesKilled++
  }
}

function doAttack(attacker, target) {
  const dmg = calcDamage(attacker, target)
  applyDamage(target, dmg)
  attacker.acted = true
}

function doAbility(attacker, target, abilityIdx) {
  const ability = attacker.abilities[abilityIdx]
  attacker.acted = true
  if (ability === 'Shield Bash') {
    const dmg = calcDamage(attacker, target) + 3
    applyDamage(target, dmg)
    addMessage(attacker.col, attacker.row, 'Shield Bash!', '#ff0')
  } else if (ability === 'Charge') {
    const dmg = calcDamage(attacker, target) + 5
    applyDamage(target, dmg)
    addMessage(attacker.col, attacker.row, 'Charge!', '#fa0')
  } else if (ability === 'Aimed Shot') {
    const dmg = calcDamage(attacker, target) + 4
    applyDamage(target, dmg)
  } else if (ability === 'Volley') {
    // AOE: hit target + adjacent enemies
    const dmg = calcDamage(attacker, target)
    applyDamage(target, dmg)
    for (const nb of hexNeighbors(target.col, target.row)) {
      const cell = grid[nb.row][nb.col]
      if (cell.unit && cell.unit.alive && cell.unit.team !== attacker.team) {
        applyDamage(cell.unit, Math.floor(dmg * 0.5))
      }
    }
    addMessage(attacker.col, attacker.row, 'Volley!', '#ff0')
  } else if (ability === 'Fireball') {
    const dmg = calcDamage(attacker, target) + 6
    applyDamage(target, dmg)
    addMessage(attacker.col, attacker.row, 'Fireball!', '#f80')
  } else if (ability === 'Freeze') {
    const dmg = Math.floor(calcDamage(attacker, target) * 0.5)
    applyDamage(target, dmg)
    target.moved = true // frozen — can't move next turn
    addMessage(attacker.col, attacker.row, 'Freeze!', '#4cf')
  } else if (ability === 'Heal') {
    const heal = 10 + Math.floor(Math.random() * 5)
    target.hp = Math.min(target.maxHp, target.hp + heal)
    addMessage(target.col, target.row, '+' + heal, '#4f4')
  } else if (ability === 'Barrier') {
    target.def += 3
    addMessage(target.col, target.row, 'DEF+3', '#4ff')
  }
}

// ==================== MOVE UNIT ====================
function moveUnit(unit, toCol, toRow) {
  grid[unit.row][unit.col].unit = null
  unit.col = toCol
  unit.row = toRow
  grid[toRow][toCol].unit = unit
  unit.moved = true
}

// ==================== TURN SYSTEM ====================
function startPlayerTurn() {
  state = STATE.PLAYER_TURN
  totalTurns++
  units.filter(u => u.team === 'player' && u.alive).forEach(u => { u.moved = false; u.acted = false })
  selectedUnit = null
  reachable = []
  targets = []
}

function endPlayerTurn() {
  state = STATE.ENEMY_TURN
  units.filter(u => u.team === 'enemy' && u.alive).forEach(u => { u.moved = false; u.acted = false })
  setTimeout(runEnemyAI, 400)
}

function checkBattleEnd() {
  const castle = units.find(u => u.type === 'castle')
  if (!castle || !castle.alive) {
    narrative.setVar('battles_won', narrative.variables.battles_won + 1, 'Castle destroyed — Battle ' + (battleIndex + 1) + ' won!')
    state = STATE.BATTLE_END
    return true
  }
  const playerAlive = units.filter(u => u.team === 'player' && u.alive)
  if (playerAlive.length === 0) {
    narrative.setVar('casualties', narrative.variables.casualties + 4, 'All units lost!')
    state = STATE.GAME_OVER
    return true
  }
  return false
}

function allPlayersDone() {
  return units.filter(u => u.team === 'player' && u.alive).every(u => u.moved && u.acted)
}

// ==================== ENEMY AI ====================
function runEnemyAI() {
  const enemies = units.filter(u => u.team === 'enemy' && u.alive && u.type !== 'castle')
  let delay = 0
  for (const enemy of enemies) {
    delay += 300
    setTimeout(() => aiAct(enemy), delay)
  }
  setTimeout(() => {
    if (!checkBattleEnd()) startPlayerTurn()
  }, delay + 400)
}

function aiAct(enemy) {
  if (!enemy.alive) return
  // Find nearest player unit
  let nearest = null, nearDist = Infinity
  for (const u of units) {
    if (u.team === 'player' && u.alive) {
      const d = hexDistance(enemy.col, enemy.row, u.col, u.row)
      if (d < nearDist) { nearDist = d; nearest = u }
    }
  }
  if (!nearest) return

  // If in range, attack
  if (nearDist <= enemy.range) {
    doAttack(enemy, nearest)
    return
  }

  // Move toward nearest player
  const reach = findReachable(enemy)
  if (reach.length === 0) return
  let bestPos = null, bestDist = Infinity
  for (const pos of reach) {
    const d = hexDistance(pos.col, pos.row, nearest.col, nearest.row)
    if (d < bestDist) { bestDist = d; bestPos = pos }
  }
  if (bestPos) {
    moveUnit(enemy, bestPos.col, bestPos.row)
    // Attack after moving if in range
    const newDist = hexDistance(enemy.col, enemy.row, nearest.col, nearest.row)
    if (newDist <= enemy.range) doAttack(enemy, nearest)
  }
}

// ==================== MESSAGES ====================
function addMessage(col, row, text, color) {
  const { x, y } = hexToPixel(col, row)
  messages.push({ x, y, text, color, life: 60 })
}

// ==================== DRAWING ====================
function drawHex(cx, cy, size, fill, stroke) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 180 * (60 * i - 30)
    const x = cx + size * Math.cos(angle)
    const y = cy + size * Math.sin(angle)
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.closePath()
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke() }
}

function drawGrid() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const { x, y } = hexToPixel(c, r)
      const cell = grid[r][c]
      const t = TERRAIN[cell.terrain]

      // Highlight reachable
      let highlight = false
      if (reachable.find(h => h.col === c && h.row === r)) highlight = true

      // Highlight targets
      let isTarget = false
      if (targets.find(h => h.col === c && h.row === r)) isTarget = true

      var baseName = TERRAIN_SPRITE_MAP[cell.terrain] || cell.terrain
      var terrainSprite = typeof getSprite === 'function' && getSprite('terrain', baseName)
      var frame = cell.terrain === 'water' ? cell.variant * 2 + Math.floor(Date.now() / 500) % 2 : cell.variant

      if (terrainSprite) {
        // Clip to hex shape, then draw sprite(s)
        ctx.save()
        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          const angle = Math.PI / 180 * (60 * i - 30)
          const hx = x + (HEX_SIZE - 1) * Math.cos(angle)
          const hy = y + (HEX_SIZE - 1) * Math.sin(angle)
          if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy)
        }
        ctx.closePath()
        ctx.clip()
        // Forest: draw grass underneath first
        if (cell.terrain === 'forest') {
          var grassSprite = getSprite('terrain', 'grass')
          if (grassSprite) drawSprite(ctx, grassSprite, x - HEX_SIZE, y - HEX_SIZE, HEX_SIZE * 2, cell.variant)
        }
        drawSprite(ctx, terrainSprite, x - HEX_SIZE, y - HEX_SIZE, HEX_SIZE * 2, frame)
        ctx.restore()
        // Draw hex border
        drawHex(x, y, HEX_SIZE - 1, null, '#333')
      } else {
        drawHex(x, y, HEX_SIZE - 1, t.color, '#333')
      }

      if (highlight) drawHex(x, y, HEX_SIZE - 2, 'rgba(100,200,255,0.3)', '#4cf')
      if (isTarget) drawHex(x, y, HEX_SIZE - 2, 'rgba(255,80,80,0.3)', '#f44')

      // Hovered hex
      if (hoveredHex && hoveredHex.col === c && hoveredHex.row === r) {
        drawHex(x, y, HEX_SIZE - 2, null, '#fff')
        ctx.lineWidth = 2
      }
    }
  }
}

function drawUnits() {
  for (const u of units) {
    if (!u.alive) continue
    const { x, y } = hexToPixel(u.col, u.row)
    const size = HEX_SIZE * 0.55

    // Team color
    let color = u.team === 'player' ? '#4477dd' : '#dd4444'
    if (u.type === 'castle') color = '#aa6622'

    // Selected highlight
    if (selectedUnit === u) {
      ctx.beginPath()
      ctx.arc(x, y, size + 4, 0, Math.PI * 2)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Dimmed if already acted
    if (u.team === 'player' && u.moved && u.acted) color = adjustAlpha(color, 0.5)

    // Draw sprite fallback — colored circle with letter
    var sprite = typeof getSprite === 'function' && getSprite('units', u.type)
    if (sprite) {
      drawSprite(ctx, sprite, x - size, y - size, size * 2, 0)
    } else {
      ctx.beginPath()
      ctx.arc(x, y, size, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = '#222'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = '#fff'
      ctx.font = 'bold 16px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(u.char, x, y)
    }

    // HP bar
    const barW = size * 2, barH = 4
    const bx = x - barW / 2, by = y - size - 8
    ctx.fillStyle = '#333'
    ctx.fillRect(bx, by, barW, barH)
    const hpRatio = u.hp / u.maxHp
    ctx.fillStyle = hpRatio > 0.5 ? '#4c4' : hpRatio > 0.25 ? '#cc4' : '#c44'
    ctx.fillRect(bx, by, barW * hpRatio, barH)
  }
}

function adjustAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function drawUI() {
  // Side panel
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(PANEL_X - 10, 0, canvas.width - PANEL_X + 10, canvas.height)

  ctx.fillStyle = '#ccc'
  ctx.font = '14px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  let py = 15
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 16px monospace'
  ctx.fillText('Battle ' + (battleIndex + 1) + '/3', PANEL_X, py)
  py += 20
  ctx.font = '13px monospace'
  ctx.fillStyle = '#aaa'
  ctx.fillText(BATTLES[battleIndex].name, PANEL_X, py)
  py += 25

  // Player units
  ctx.fillStyle = '#4af'
  ctx.fillText('— Your Team —', PANEL_X, py); py += 18
  for (const u of units.filter(u => u.team === 'player')) {
    ctx.fillStyle = u.alive ? '#ccc' : '#666'
    ctx.fillText(u.char + ' ' + u.name + ' ' + u.hp + '/' + u.maxHp, PANEL_X, py)
    py += 16
  }
  py += 10

  // Enemy units
  ctx.fillStyle = '#f66'
  ctx.fillText('— Enemies —', PANEL_X, py); py += 18
  for (const u of units.filter(u => u.team === 'enemy')) {
    ctx.fillStyle = u.alive ? '#ccc' : '#666'
    ctx.fillText(u.char + ' ' + u.name + ' ' + u.hp + '/' + u.maxHp, PANEL_X, py)
    py += 16
  }
  py += 15

  // Selected unit info
  if (selectedUnit && selectedUnit.alive) {
    ctx.fillStyle = '#ff0'
    ctx.font = 'bold 14px monospace'
    ctx.fillText('Selected: ' + selectedUnit.name, PANEL_X, py); py += 20
    ctx.font = '12px monospace'
    ctx.fillStyle = '#ccc'
    ctx.fillText('ATK:' + selectedUnit.atk + ' DEF:' + selectedUnit.def + ' SPD:' + selectedUnit.spd, PANEL_X, py); py += 16
    ctx.fillText('Range:' + selectedUnit.range + ' Move:' + selectedUnit.move, PANEL_X, py); py += 20

    // Action buttons
    if (state === STATE.PLAYER_TURN || state === STATE.SELECT_ACTION) {
      drawButton(PANEL_X, py, 90, 22, 'Move', !selectedUnit.moved, 'move'); py += 28
      drawButton(PANEL_X, py, 90, 22, 'Attack', !selectedUnit.acted, 'attack'); py += 28
      for (let i = 0; i < selectedUnit.abilities.length; i++) {
        drawButton(PANEL_X, py, 120, 22, selectedUnit.abilities[i], !selectedUnit.acted, 'ability' + i); py += 28
      }
      py += 5
      drawButton(PANEL_X, py, 90, 22, 'End Turn', true, 'endturn'); py += 28
    }
  } else if (state === STATE.PLAYER_TURN) {
    py += 5
    ctx.fillStyle = '#aaa'
    ctx.font = '12px monospace'
    ctx.fillText('Click a unit', PANEL_X, py); py += 28
    drawButton(PANEL_X, py, 90, 22, 'End Turn', true, 'endturn')
  }

  // Zoom controls
  var zy = canvas.height - 60
  ctx.fillStyle = '#556'
  ctx.font = '10px monospace'
  ctx.fillText('Zoom: ' + Math.round(camera.zoom * 100) + '%', PANEL_X, zy)
  zy += 14
  drawButton(PANEL_X, zy, 28, 20, '+', true, 'zoom_in')
  drawButton(PANEL_X + 32, zy, 28, 20, '-', true, 'zoom_out')
  drawButton(PANEL_X + 64, zy, 50, 20, 'Reset', true, 'zoom_reset')

  // Turn info
  ctx.fillStyle = '#888'
  ctx.font = '11px monospace'
  ctx.fillText('Turn: ' + totalTurns + '  Kills: ' + enemiesKilled, PANEL_X, canvas.height - 20)
}

let buttons = []
function drawButton(x, y, w, h, text, enabled, action) {
  const color = enabled ? '#335' : '#222'
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = enabled ? '#66a' : '#444'
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, w, h)
  ctx.fillStyle = enabled ? '#ddf' : '#666'
  ctx.font = '12px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + w / 2, y + h / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  if (enabled) buttons.push({ x, y, w, h, action })
}

function drawMessages() {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    m.y -= 0.5
    m.life--
    ctx.globalAlpha = m.life / 60
    ctx.fillStyle = m.color
    ctx.font = 'bold 14px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(m.text, m.x, m.y)
    ctx.globalAlpha = 1
    if (m.life <= 0) messages.splice(i, 1)
  }
  ctx.textAlign = 'left'
}

function drawMenu() {
  ctx.fillStyle = '#0a0a1a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#dda'
  ctx.font = 'bold 36px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('HEX CRUSADE', canvas.width / 2, 180)
  ctx.fillStyle = '#aaa'
  ctx.font = '16px monospace'
  ctx.fillText('Command your squad. Siege the castle.', canvas.width / 2, 230)
  ctx.fillText('3 battles to victory.', canvas.width / 2, 255)
  ctx.fillStyle = '#4af'
  ctx.font = 'bold 20px monospace'
  ctx.fillText('[ Click to Start ]', canvas.width / 2, 340)
  ctx.fillStyle = '#666'
  ctx.font = '13px monospace'
  ctx.fillText('W=Warrior  A=Archer  M=Mage  H=Healer  C=Castle', canvas.width / 2, 420)
  ctx.textAlign = 'left'
}

function drawBattleEnd() {
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#ff0'
  ctx.font = 'bold 28px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('BATTLE ' + (battleIndex + 1) + ' WON!', canvas.width / 2, 200)
  if (battleIndex < 2) {
    ctx.fillStyle = '#aaa'
    ctx.font = '16px monospace'
    ctx.fillText('Click to continue to next battle', canvas.width / 2, 280)
  } else {
    ctx.fillStyle = '#4f4'
    ctx.font = '20px monospace'
    ctx.fillText('VICTORY — All castles destroyed!', canvas.width / 2, 260)
    ctx.fillStyle = '#aaa'
    ctx.font = '14px monospace'
    const s = calculateScore()
    ctx.fillText('Final Score: ' + s, canvas.width / 2, 300)
    ctx.fillText('Click to submit', canvas.width / 2, 330)
  }
  ctx.textAlign = 'left'
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.8)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#f44'
  ctx.font = 'bold 28px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('DEFEAT', canvas.width / 2, 220)
  ctx.fillStyle = '#aaa'
  ctx.font = '16px monospace'
  const s = calculateScore()
  ctx.fillText('Score: ' + s, canvas.width / 2, 270)
  ctx.fillText('Click to submit & restart', canvas.width / 2, 310)
  ctx.textAlign = 'left'
}

// ==================== SCORING ====================
function calculateScore() {
  const survived = units.filter(u => u.team === 'player' && u.alive).length
  return (battleIndex + (state === STATE.BATTLE_END ? 1 : 0)) * 1000 + enemiesKilled * 10 + survived * 500 - totalTurns * 5
}

// ==================== INPUT ====================
canvas.addEventListener('mousemove', function(e) {
  const rect = canvas.getBoundingClientRect()
  const mx = (e.clientX - rect.left) * (canvas.width / rect.width)
  const my = (e.clientY - rect.top) * (canvas.height / rect.height)
  if (isPotentialDrag) {
    const dx = mx - dragStartX, dy = my - dragStartY
    if (!isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      isDragging = true
      dragOccurred = true
    }
  }
  if (isDragging) {
    camera.x = dragCamStartX + (mx - dragStartX)
    camera.y = dragCamStartY + (my - dragStartY)
    canvas.classList.add('grabbing')
    hoveredHex = null
    return
  }
  const w = screenToWorld(mx, my)
  hoveredHex = pixelToHex(w.x, w.y)
})

canvas.addEventListener('mousedown', function(e) {
  if (e.button === 0 && state !== STATE.MENU) {
    const rect = canvas.getBoundingClientRect()
    dragStartX = (e.clientX - rect.left) * (canvas.width / rect.width)
    dragStartY = (e.clientY - rect.top) * (canvas.height / rect.height)
    dragCamStartX = camera.x
    dragCamStartY = camera.y
    isPotentialDrag = true
    dragOccurred = false
  }
})

canvas.addEventListener('mouseup', function(e) {
  if (e.button === 0) {
    isPotentialDrag = false
    isDragging = false
    canvas.classList.remove('grabbing')
  }
})

canvas.addEventListener('wheel', function(e) {
  if (state === STATE.MENU) return
  e.preventDefault()
  const rect = canvas.getBoundingClientRect()
  const mx = (e.clientX - rect.left) * (canvas.width / rect.width)
  const my = (e.clientY - rect.top) * (canvas.height / rect.height)
  if (mx > PANEL_X - 10) return
  applyZoom(e.deltaY < 0 ? 1.15 : 0.87, mx, my)
}, { passive: false })

function applyZoom(factor, pivotX, pivotY) {
  const oldZoom = camera.zoom
  camera.zoom = Math.max(0.5, Math.min(3, camera.zoom * factor))
  if (camera.zoom === oldZoom) return
  camera.x = pivotX - (pivotX - camera.x) * (camera.zoom / oldZoom)
  camera.y = pivotY - (pivotY - camera.y) * (camera.zoom / oldZoom)
}

document.addEventListener('keydown', function(e) {
  if (state === STATE.MENU) return
  // +/= zoom in, - zoom out, 0 reset
  var centerX = (PANEL_X - 10) / 2
  var centerY = canvas.height / 2
  if (e.key === '+' || e.key === '=') {
    applyZoom(1.2, centerX, centerY)
    e.preventDefault()
  } else if (e.key === '-') {
    applyZoom(0.83, centerX, centerY)
    e.preventDefault()
  } else if (e.key === '0') {
    camera = { x: 0, y: 0, zoom: 1 }
    e.preventDefault()
  }
})

canvas.addEventListener('click', function(e) {
  if (dragOccurred) { dragOccurred = false; return }
  const rect = canvas.getBoundingClientRect()
  const mx = (e.clientX - rect.left) * (canvas.width / rect.width)
  const my = (e.clientY - rect.top) * (canvas.height / rect.height)

  if (state === STATE.MENU) {
    narrative.transition('battle-1', 'The crusade begins — Battle 1: Border Outpost')
    setupBattle(0)
    startPlayerTurn()
    return
  }

  if (state === STATE.BATTLE_END) {
    if (battleIndex < 2) {
      battleIndex++
      // Heal surviving units partially
      units.filter(u => u.team === 'player' && u.alive).forEach(u => {
        u.hp = Math.min(u.maxHp, u.hp + Math.floor(u.maxHp * 0.4))
      })
      narrative.transition('battle-' + (battleIndex + 1), 'Advancing to Battle ' + (battleIndex + 1) + ': ' + BATTLES[battleIndex].name)
      setupBattle(battleIndex)
      startPlayerTurn()
    } else {
      // Final victory
      score = calculateScore()
      narrative.transition('victory', 'The crusade is complete! Final score: ' + score)
      ForkArcade.submitScore(score)
      state = STATE.MENU
      battleIndex = 0
      totalTurns = 0
      enemiesKilled = 0
    }
    return
  }

  if (state === STATE.GAME_OVER) {
    score = calculateScore()
    narrative.transition('defeat', 'The crusade has failed. Score: ' + score)
    ForkArcade.submitScore(score)
    state = STATE.MENU
    battleIndex = 0
    totalTurns = 0
    enemiesKilled = 0
    return
  }

  if (state === STATE.ENEMY_TURN) return

  // Check button clicks
  for (const btn of buttons) {
    if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
      handleAction(btn.action)
      return
    }
  }

  // Hex click (convert screen coords to world coords)
  const worldClick = screenToWorld(mx, my)
  const hex = pixelToHex(worldClick.x, worldClick.y)
  if (!hex) return

  if (state === STATE.SELECT_TARGET) {
    // Check if clicked a valid target
    if (targets.find(t => t.col === hex.col && t.row === hex.row)) {
      const target = grid[hex.row][hex.col].unit
      if (target) {
        if (currentAction === 'attack') {
          doAttack(selectedUnit, target)
        } else if (currentAction.startsWith('ability')) {
          const idx = parseInt(currentAction.replace('ability', ''))
          doAbility(selectedUnit, target, idx)
        }
        targets = []
        currentAction = null
        if (!checkBattleEnd() && allPlayersDone()) endPlayerTurn()
        else state = STATE.PLAYER_TURN
      }
    } else {
      // Cancel target selection
      targets = []
      state = STATE.PLAYER_TURN
    }
    return
  }

  if (state === STATE.PLAYER_TURN || state === STATE.SELECT_ACTION) {
    // Move to reachable hex
    if (reachable.find(h => h.col === hex.col && h.row === hex.row) && selectedUnit && !selectedUnit.moved) {
      moveUnit(selectedUnit, hex.col, hex.row)
      reachable = []
      if (selectedUnit.acted && allPlayersDone()) endPlayerTurn()
      return
    }

    // Select player unit
    const cell = grid[hex.row][hex.col]
    if (cell.unit && cell.unit.team === 'player' && cell.unit.alive) {
      selectedUnit = cell.unit
      reachable = cell.unit.moved ? [] : findReachable(cell.unit)
      targets = []
      state = STATE.PLAYER_TURN
    }
  }
})

function handleAction(action) {
  if (action === 'zoom_in') {
    applyZoom(1.25, (PANEL_X - 10) / 2, canvas.height / 2)
    return
  }
  if (action === 'zoom_out') {
    applyZoom(0.8, (PANEL_X - 10) / 2, canvas.height / 2)
    return
  }
  if (action === 'zoom_reset') {
    camera = { x: 0, y: 0, zoom: 1 }
    return
  }
  if (action === 'endturn') {
    reachable = []
    targets = []
    selectedUnit = null
    endPlayerTurn()
    return
  }
  if (!selectedUnit) return

  if (action === 'move' && !selectedUnit.moved) {
    reachable = findReachable(selectedUnit)
    targets = []
    state = STATE.PLAYER_TURN
  } else if (action === 'attack' && !selectedUnit.acted) {
    currentAction = 'attack'
    targets = findTargets(selectedUnit, selectedUnit.range)
    reachable = []
    state = STATE.SELECT_TARGET
  } else if (action.startsWith('ability') && !selectedUnit.acted) {
    const idx = parseInt(action.replace('ability', ''))
    currentAction = action
    const ability = selectedUnit.abilities[idx]
    // Heal targets friendly, others target enemies
    if (ability === 'Heal' || ability === 'Barrier') {
      targets = findHealTargets(selectedUnit, selectedUnit.range)
    } else {
      targets = findTargets(selectedUnit, selectedUnit.range + (ability === 'Volley' || ability === 'Fireball' ? 1 : 0))
    }
    reachable = []
    state = STATE.SELECT_TARGET
  }
}

// ==================== GAME LOOP ====================
function gameLoop() {
  ctx.fillStyle = '#0a0a1a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  buttons = []

  if (state === STATE.MENU) {
    drawMenu()
  } else if (state === STATE.BATTLE_END) {
    ctx.save()
    ctx.translate(camera.x, camera.y)
    ctx.scale(camera.zoom, camera.zoom)
    drawGrid(); drawUnits(); drawMessages()
    ctx.restore()
    drawUI(); drawBattleEnd()
  } else if (state === STATE.GAME_OVER) {
    ctx.save()
    ctx.translate(camera.x, camera.y)
    ctx.scale(camera.zoom, camera.zoom)
    drawGrid(); drawUnits(); drawMessages()
    ctx.restore()
    drawUI(); drawGameOver()
  } else {
    ctx.save()
    ctx.translate(camera.x, camera.y)
    ctx.scale(camera.zoom, camera.zoom)
    drawGrid(); drawUnits(); drawMessages()
    ctx.restore()
    drawUI()
  }
  requestAnimationFrame(gameLoop)
}

// ==================== INIT ====================
ForkArcade.onReady(function(context) {
  console.log('Hex Crusade ready:', context.slug)
  narrative.transition('intro', 'Hex Crusade loaded')
  gameLoop()
})
