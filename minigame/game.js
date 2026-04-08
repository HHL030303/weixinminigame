const { createGame24Module } = require('./modules/game24')
const { createFindNumberModule } = require('./modules/findNumber')
const { createPoetryModule } = require('./modules/poetry')
const { createRankService } = require('./services/rankService')

const canvas = wx.createCanvas()
const ctx = canvas.getContext('2d')

const colors = ['#ffd166', '#06d6a0', '#4cc9f0', '#b8c0ff']
const rankService = createRankService()

const state = {
  frame: 0,
  touch: null,
  w: 0,
  h: 0,
  scene: 'home',
  home: {
    tiles: [],
  },
  user: {
    nickName: '游客',
    avatarUrl: '',
  },
}

function setupCanvas() {
  const sys = wx.getSystemInfoSync()
  state.w = sys.windowWidth
  state.h = sys.windowHeight
  canvas.width = Math.floor(state.w)
  canvas.height = Math.floor(state.h)
}

function clear() {
  ctx.clearRect(0, 0, state.w, state.h)
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, state.w, state.h)
  g.addColorStop(0, '#1b6ca8')
  g.addColorStop(1, '#2ec4b6')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, state.w, state.h)
}

function roundRectPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h
}

function drawTopBackButton() {
  const size = 46
  const x = 14
  const y = 28
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  roundRectPath(x, y, size, size, 16)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 2
  roundRectPath(x, y, size, size, 16)
  ctx.stroke()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x + 28, y + 16)
  ctx.lineTo(x + 18, y + 23)
  ctx.lineTo(x + 28, y + 30)
  ctx.stroke()
  ctx.restore()
}

function drawTouchRipple() {
  if (!state.touch) return
  const age = state.frame - state.touch.t
  if (age < 0 || age > 30) return
  const alpha = Math.max(0, 1 - age / 30)
  const r = 10 + (1 - alpha) * 12
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = '#ffd166'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(state.touch.x, state.touch.y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function layoutHomeTiles() {
  const tiles = [
    { key: 'game24', title: '速算 24 点', subtitle: '加减乘除凑 24' },
    { key: 'findNumber', title: '找数字 1-30', subtitle: '一分钟内按顺序找齐' },
    { key: 'poetry', title: '我爱背唐诗', subtitle: '打乱字块拼回原诗' },
  ]
  const gap = 16
  const tileW = Math.min(300, state.w - 60)
  const tileH = 92
  const startY = 162
  const x = (state.w - tileW) / 2
  state.home.tiles = tiles.map((t, i) => ({
    ...t,
    rect: { x, y: startY + i * (tileH + gap), w: tileW, h: tileH },
  }))
}

function drawHome() {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.font = '900 34px sans-serif'
  ctx.fillText('数学小游乐园', state.w / 2, 92)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.font = '600 14px sans-serif'
  ctx.fillText('给小朋友练脑力，也给摸鱼党爽一把', state.w / 2, 120)

  layoutHomeTiles()
  for (let i = 0; i < state.home.tiles.length; i++) {
    const tile = state.home.tiles[i]
    const c = i === 0 ? '#ffd166' : i === 1 ? '#b8c0ff' : '#06d6a0'
    const r = tile.rect
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    roundRectPath(r.x + 2, r.y + 4, r.w, r.h, 22)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    roundRectPath(r.x, r.y, r.w, r.h, 22)
    ctx.fill()
    ctx.fillStyle = c
    roundRectPath(r.x, r.y, 12, r.h, 10)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 2
    roundRectPath(r.x, r.y, r.w, r.h, 22)
    ctx.stroke()
    ctx.fillStyle = '#0b1020'
    ctx.textAlign = 'left'
    ctx.font = '900 20px sans-serif'
    ctx.fillText(tile.title, r.x + 22, r.y + 38)
    ctx.fillStyle = 'rgba(11,16,32,0.72)'
    ctx.font = '600 13px sans-serif'
    ctx.fillText(tile.subtitle, r.x + 22, r.y + 64)
    ctx.restore()
  }
}

const game24 = createGame24Module({
  ctx,
  state,
  colors,
  roundRectPath,
  drawTopBackButton,
  pointInRect,
  rankService,
})

const findNumber = createFindNumberModule({
  ctx,
  state,
  colors,
  roundRectPath,
  drawTopBackButton,
  pointInRect,
  rankService,
})

const poetry = createPoetryModule({
  ctx,
  state,
  colors,
  roundRectPath,
  drawTopBackButton,
  pointInRect,
  rankService,
})

function enterScene(key) {
  if (key === 'game24') {
    state.scene = 'game24'
    game24.enter()
  } else if (key === 'findNumber') {
    state.scene = 'findNumber'
    findNumber.enter()
  } else if (key === 'poetry') {
    state.scene = 'poetry'
    poetry.enter()
  }
}

function onTapHome(x, y) {
  for (let i = 0; i < state.home.tiles.length; i++) {
    const tile = state.home.tiles[i]
    if (!pointInRect(x, y, tile.rect)) continue
    rankService
      .ensureUserProfile(true)
      .then((profile) => {
        state.user = profile
        enterScene(tile.key)
      })
      .catch(() => enterScene(tile.key))
    return
  }
}

function onTap(x, y) {
  if (state.scene === 'home') return onTapHome(x, y)
  if (state.scene === 'game24') return game24.tap(x, y)
  if (state.scene === 'findNumber') return findNumber.tap(x, y)
  if (state.scene === 'poetry') return poetry.tap(x, y)
}

function render() {
  clear()
  drawBackground()
  if (state.scene === 'home') drawHome()
  else if (state.scene === 'game24') game24.render()
  else if (state.scene === 'findNumber') findNumber.render()
  else if (state.scene === 'poetry') poetry.render()
  drawTouchRipple()
}

function loop() {
  state.frame++
  render()
  requestAnimationFrame(loop)
}

function bindInput() {
  wx.onTouchStart((e) => {
    const t = e.touches && e.touches[0]
    if (!t) return
    const x = typeof t.clientX === 'number' ? t.clientX : t.x
    const y = typeof t.clientY === 'number' ? t.clientY : t.y
    if (typeof x !== 'number' || typeof y !== 'number') return
    state.touch = { x, y, t: state.frame }
    onTap(x, y)
  })
}

setupCanvas()
rankService.initCloud()
rankService.ensureUserProfile(false).then((p) => {
  state.user = p
})
rankService.ensureOpenid()
bindInput()
layoutHomeTiles()
loop()

