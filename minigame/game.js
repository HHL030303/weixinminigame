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

  // 在游戏内也显示分享按钮（右上角）
  if (state.scene !== 'home') {
    drawInGameShareButton()
  }
}

function drawInGameShareButton() {
  const size = 46
  const x = state.w - size - 14
  const y = 28
  state.shareBtn = { x, y, w: size, h: size }

  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  roundRectPath(x, y, size, size, 16)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 2
  roundRectPath(x, y, size, size, 16)
  ctx.stroke()

  // 分享图标
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const cx = x + size / 2
  const cy = y + size / 2 - 2
  const iconSize = 10

  ctx.beginPath()
  ctx.moveTo(cx, cy - iconSize)
  ctx.lineTo(cx - iconSize * 0.8, cy + iconSize * 0.3)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(cx, cy - iconSize)
  ctx.lineTo(cx + iconSize * 0.8, cy + iconSize * 0.3)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(cx - iconSize * 0.6, cy - iconSize * 0.2)
  ctx.lineTo(cx, cy + iconSize * 0.5)
  ctx.lineTo(cx + iconSize * 0.6, cy - iconSize * 0.2)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(cx - iconSize, cy + iconSize * 0.6)
  ctx.lineTo(cx + iconSize, cy + iconSize * 0.6)
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
    { key: 'findNumber', title: '给数字找茬', subtitle: '试试你的专注力' },
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

  // 分享按钮位置（右下角）
  const shareSize = 50
  state.home.shareBtn = {
    x: state.w - shareSize - 20,
    y: state.h - shareSize - 30,
    w: shareSize,
    h: shareSize,
  }
}

function drawShareButton() {
  const btn = state.home.shareBtn
  if (!btn) return

  ctx.save()
  // 背景圆形
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.beginPath()
  ctx.arc(btn.x + btn.w / 2, btn.y + btn.h / 2, btn.w / 2, 0, Math.PI * 2)
  ctx.fill()

  // 边框
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(btn.x + btn.w / 2, btn.y + btn.h / 2, btn.w / 2, 0, Math.PI * 2)
  ctx.stroke()

  // 分享图标（箭头）
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const cx = btn.x + btn.w / 2
  const cy = btn.y + btn.h / 2 - 2
  const size = 12

  // 向上的箭头
  ctx.beginPath()
  ctx.moveTo(cx, cy - size)
  ctx.lineTo(cx - size * 0.8, cy + size * 0.3)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(cx, cy - size)
  ctx.lineTo(cx + size * 0.8, cy + size * 0.3)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(cx - size * 0.6, cy - size * 0.2)
  ctx.lineTo(cx, cy + size * 0.5)
  ctx.lineTo(cx + size * 0.6, cy - size * 0.2)
  ctx.stroke()

  // 横线
  ctx.beginPath()
  ctx.moveTo(cx - size, cy + size * 0.6)
  ctx.lineTo(cx + size, cy + size * 0.6)
  ctx.stroke()

  ctx.restore()
}

function drawHome() {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.font = '900 34px sans-serif'
  ctx.fillText('i学i玩', state.w / 2, 92)
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

  // 绘制分享按钮
  drawShareButton()
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
  // 检查是否点击了分享按钮
  const shareBtn = state.home.shareBtn
  if (shareBtn && pointInRect(x, y, shareBtn)) {
    triggerShare()
    return
  }

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

// 触发分享
function triggerShare() {
  // 先显示提示
  showToast('正在生成分享图片...', 800)
  
  // 截图当前画面
  captureShareImage((tempFilePath) => {
    if (tempFilePath) {
      // 有截图时使用截图作为分享图片
      wx.shareAppMessage({
        title: getShareTitle(),
        desc: getShareDesc(),
        imageUrl: tempFilePath,
        path: '/minigame/game',
        success: () => {
          showToast('分享成功！', 1200)
        },
        fail: (err) => {
          console.log('分享失败:', err)
          // 用户取消分享不算失败
          if (err && err.errMsg && !err.errMsg.includes('cancel')) {
            showToast('分享失败，请重试', 1200)
          }
        },
      })
    } else {
      // 没有截图时使用默认配置
      wx.shareAppMessage({
        title: getShareTitle(),
        desc: getShareDesc(),
        imageUrl: '',
        path: '/minigame/game',
        success: () => {
          showToast('分享成功！', 1200)
        },
        fail: (err) => {
          console.log('分享失败:', err)
          if (err && err.errMsg && !err.errMsg.includes('cancel')) {
            showToast('分享失败，请重试', 1200)
          }
        },
      })
    }
  })
}

// 根据当前场景获取分享标题
function getShareTitle() {
  const titles = {
    home: 'i学i玩 - 趣味益智小游戏',
    game24: '我在玩速算24点，来挑战！',
    findNumber: '我在玩找数字游戏，考验眼力！',
    poetry: '我在背唐诗，一起来！',
  }
  return titles[state.scene] || titles.home
}

// 根据当前场景获取分享描述
function getShareDesc() {
  const descs = {
    home: '速算24点、找数字、背唐诗，给小朋友练脑力，也给摸鱼党爽一把！',
    game24: '加减乘除凑24，锻炼数学思维，快来挑战！',
    findNumber: '限时找数字，考验你的专注力和眼力！',
    poetry: '打乱字块拼回原诗，趣味背唐诗！',
  }
  return descs[state.scene] || descs.home
}

// 截图当前画面作为分享图片
function captureShareImage(callback) {
  try {
    // 使用 canvas.toTempFilePath 截图
    wx.canvasToTempFilePath({
      canvas: canvas,
      success: (res) => {
        callback(res.tempFilePath)
      },
      fail: (err) => {
        console.log('截图失败:', err)
        callback(null)
      },
    })
  } catch (e) {
    console.log('截图异常:', e)
    callback(null)
  }
}

// 显示提示信息
function showToast(text, duration) {
  // 简单的全局提示实现
  const toast = {
    text: text,
    until: Date.now() + (duration || 1500),
  }
  state.toast = toast
}

function onTap(x, y) {
  // 检查游戏内的分享按钮点击
  if (state.scene !== 'home' && state.shareBtn && pointInRect(x, y, state.shareBtn)) {
    triggerShare()
    return
  }

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
  drawGlobalToast()
}

// 绘制全局提示
function drawGlobalToast() {
  const t = state.toast
  if (!t) return
  if (Date.now() > t.until) {
    state.toast = null
    return
  }
  const w = Math.min(320, state.w - 60)
  const h = 44
  const x = (state.w - w) / 2
  const y = state.h * 0.45
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.85)'
  roundRectPath(x, y, w, h, 12)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '700 15px sans-serif'
  ctx.fillText(t.text, x + w / 2, y + h / 2)
  ctx.restore()
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

