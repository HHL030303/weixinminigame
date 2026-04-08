function createFindNumberModule(deps) {
  const { ctx, state, colors, roundRectPath, drawTopBackButton, pointInRect, rankService } = deps
  const STORAGE_KEY = 'findNumberLeaderboard'

  const mod = {
    name: 'findNumber',
    state: {
      blocks: [],
      next: 1,
      selectedSet: {},
      shakeUntil: 0,
      toast: null,
      timer: { startTs: Date.now(), elapsed: 0 },
      modal: null,
      lastResult: null,
      leaderboard: [],
      clearBtn: null,
      rankText: '服务器排名：加载中',
    },
  }

  function loadBoard() {
    try {
      const v = wx.getStorageSync(STORAGE_KEY)
      if (Array.isArray(v)) mod.state.leaderboard = v
    } catch (e) {}
  }
  function saveBoard() {
    try {
      wx.setStorageSync(STORAGE_KEY, mod.state.leaderboard)
    } catch (e) {}
  }

  function showToast(text, ms) {
    mod.state.toast = { text, until: Date.now() + (ms || 1200) }
  }

  function rand(min, max) {
    return min + Math.random() * (max - min)
  }

  function shuffle(arr) {
    const a = arr.slice()
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const t = a[i]
      a[i] = a[j]
      a[j] = t
    }
    return a
  }

  function makeWeights(count, minW, maxW) {
    const ws = []
    for (let i = 0; i < count; i++) ws.push(rand(minW, maxW))
    return ws
  }

  function normalizeToPixels(weights, total) {
    const sum = weights.reduce((s, v) => s + v, 0)
    const out = []
    let acc = 0
    for (let i = 0; i < weights.length; i++) {
      const raw = (weights[i] / sum) * total
      const px = i === weights.length - 1 ? total - acc : Math.round(raw)
      out.push(px)
      acc += px
    }
    return out
  }

  function pointInPolygon(px, py, poly) {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x
      const yi = poly[i].y
      const xj = poly[j].x
      const yj = poly[j].y
      const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi
      if (intersect) inside = !inside
    }
    return inside
  }

  function startRound() {
    mod.state.blocks = []
    mod.state.next = 1
    mod.state.selectedSet = {}
    mod.state.shakeUntil = 0
    mod.state.toast = null
    mod.state.modal = null
    mod.state.lastResult = null
    mod.state.timer.startTs = Date.now()
    mod.state.timer.elapsed = 0

    // 30 块拼成一个大矩形（5x6），通过共享顶点做不规则拼图但无缝连接
    const rows = 5
    const cols = 6
    const boardPaddingX = 16
    const boardTop = 122
    const boardBottomGap = 88
    const boardW = state.w - boardPaddingX * 2
    const boardH = state.h - boardTop - boardBottomGap
    const boardX = boardPaddingX
    const boardY = boardTop

    // 拉大尺寸离散度：让同屏出现明显大小差异（更难快速识别）
    const rowHeights = normalizeToPixels(makeWeights(rows, 0.45, 1.75), boardH)
    const colWidths = normalizeToPixels(makeWeights(cols, 0.45, 1.75), boardW)

    // 前缀坐标（网格线）
    const xs = [boardX]
    for (let c = 0; c < cols; c++) xs.push(xs[c] + colWidths[c])
    const ys = [boardY]
    for (let r = 0; r < rows; r++) ys.push(ys[r] + rowHeights[r])

    // 共享顶点：内部点随机扰动，边界点固定 => 相邻块共边无缝
    const verts = []
    for (let r = 0; r <= rows; r++) {
      verts[r] = []
      for (let c = 0; c <= cols; c++) {
        let vx = xs[c]
        let vy = ys[r]
        const isBorder = r === 0 || c === 0 || r === rows || c === cols
        if (!isBorder) {
          const dx = Math.min(colWidths[c - 1], colWidths[c]) * 0.16
          const dy = Math.min(rowHeights[r - 1], rowHeights[r]) * 0.16
          vx += rand(-dx, dx)
          vy += rand(-dy, dy)
        }
        verts[r][c] = { x: vx, y: vy }
      }
    }

    const nums = []
    for (let n = 1; n <= 30; n++) nums.push(n)
    const shuffledNums = shuffle(nums)

    let idx = 0
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const n = shuffledNums[idx++]
        const p0 = verts[r][c]
        const p1 = verts[r][c + 1]
        const p2 = verts[r + 1][c + 1]
        const p3 = verts[r + 1][c]
        const poly = [p0, p1, p2, p3]
        const minX = Math.min(p0.x, p1.x, p2.x, p3.x)
        const maxX = Math.max(p0.x, p1.x, p2.x, p3.x)
        const minY = Math.min(p0.y, p1.y, p2.y, p3.y)
        const maxY = Math.max(p0.y, p1.y, p2.y, p3.y)
        const cx = (p0.x + p1.x + p2.x + p3.x) / 4
        const cy = (p0.y + p1.y + p2.y + p3.y) / 4
        mod.state.blocks.push({
          n,
          poly,
          bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
          cx,
          cy,
          seed: rand(0, Math.PI * 2),
          // 形状/尺寸随机参数（增强辨识难度）
          textAlpha: rand(0.5, 0.92),
          textScale: rand(0.16, 0.42),
          color: colors[(n - 1) % colors.length],
          selected: false,
        })
      }
    }
  }

  function syncServerRank() {
    if (!rankService) return
    rankService.refreshRank('findNumber').then((ret) => {
      mod.state.rankText = ret && ret.rank ? `服务器排名：第 ${ret.rank} 名` : '服务器排名：未上榜'
    })
  }

  function finishRound() {
    if (mod.state.modal) return
    const score = Object.keys(mod.state.selectedSet).length
    const timeUsed = mod.state.timer.elapsed
    mod.state.lastResult = { score, timeUsed }

    mod.state.leaderboard.push({ name: '你', score, timeUsed, ts: Date.now() })
    mod.state.leaderboard.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.timeUsed - b.timeUsed))
    mod.state.leaderboard = mod.state.leaderboard.slice(0, 20)
    saveBoard()
    mod.state.modal = { card: { x: 0, y: 0, w: 0, h: 0 }, close: { x: 0, y: 0, w: 0, h: 0 }, okBtn: { x: 0, y: 0, w: 0, h: 0 } }
    if (rankService && score > 0) {
      rankService.reportPass({ moduleKey: 'findNumber', level: score, score, timeUsed }).then((ret) => {
        if (ret && ret.rank) mod.state.rankText = `服务器排名：第 ${ret.rank} 名`
      })
    }
  }

  function updateTimer() {
    if (mod.state.modal) return
    mod.state.timer.elapsed = (Date.now() - mod.state.timer.startTs) / 1000
  }

  function drawHeader() {
    const s = Math.max(0, Math.floor(mod.state.timer.elapsed))
    const mm = Math.floor(s / 60)
    const ss = s % 60
    const t = `${mm}:${ss < 10 ? '0' + ss : ss}`
    ctx.textAlign = 'center'
    ctx.fillStyle = '#fff'
    ctx.font = '900 28px sans-serif'
    ctx.fillText('找数字 1-30', state.w / 2, 72)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.font = '700 14px sans-serif'
    ctx.fillText(`按顺序找：${mod.state.next} → 30`, state.w / 2, 98)
    ctx.font = '600 12px sans-serif'
    ctx.fillText(mod.state.rankText, state.w / 2, 116)
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.font = '700 18px monospace'
    ctx.fillText(`用时 ${t}`, state.w - 16, 48)
  }

  function shakeOffset() {
    if (Date.now() >= mod.state.shakeUntil) return { x: 0, y: 0 }
    const amp = 9
    return { x: Math.sin(state.frame * 1.7) * amp, y: Math.cos(state.frame * 1.9) * amp * 0.6 }
  }

  function drawBlocks(off) {
    for (let i = 0; i < mod.state.blocks.length; i++) {
      const b = mod.state.blocks[i]
      const poly = b.poly.map((p) => ({ x: p.x + off.x, y: p.y + off.y }))
      const cx = b.cx + off.x
      const cy = b.cy + off.y
      ctx.save()

      ctx.beginPath()
      for (let k = 0; k < poly.length; k++) {
        const p = poly[k]
        if (k === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      }
      ctx.closePath()

      ctx.fillStyle = b.selected ? '#ffd166' : 'rgba(255,255,255,0.90)'
      ctx.fill()
      ctx.strokeStyle = b.selected ? 'rgba(11,16,32,0.55)' : 'rgba(11,16,32,0.35)'
      ctx.lineWidth = 1
      ctx.stroke()

      ctx.fillStyle = `rgba(11,16,32,${b.selected ? 0.96 : b.textAlpha})`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const fontSize = Math.max(11, Math.min(18, Math.floor(Math.min(b.bbox.w, b.bbox.h) * b.textScale)))
      ctx.font = `${b.selected ? '900' : '800'} ${fontSize}px sans-serif`
      ctx.fillText(String(b.n), cx, cy + 1)
      ctx.restore()
    }
  }

  function drawClearBtn() {
    const w = 140
    const h = 44
    const x = state.w - w - 16
    const y = state.h - h - 34
    mod.state.clearBtn = { x, y, w, h }
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    roundRectPath(x, y, w, h, 16)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'
    ctx.lineWidth = 2
    roundRectPath(x, y, w, h, 16)
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '900 14px sans-serif'
    ctx.fillText('清除全部', x + w / 2, y + h / 2)
  }

  function drawToast() {
    const t = mod.state.toast
    if (!t) return
    if (Date.now() > t.until) {
      mod.state.toast = null
      return
    }
    const w = Math.min(320, state.w - 60)
    const h = 42
    const x = (state.w - w) / 2
    const y = 122
    ctx.fillStyle = 'rgba(255,59,92,0.92)'
    roundRectPath(x, y, w, h, 14)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '800 14px sans-serif'
    ctx.fillText(t.text, x + w / 2, y + h / 2)
  }

  function drawModal() {
    if (!mod.state.modal || !mod.state.lastResult) return
    const r = mod.state.lastResult
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, state.w, state.h)
    const w = state.w - 52
    const h = 232
    const x = 26
    const y = state.h * 0.5 - h / 2
    ctx.fillStyle = 'rgba(255,255,255,0.98)'
    roundRectPath(x, y, w, h, 24)
    ctx.fill()
    ctx.strokeStyle = 'rgba(27,108,168,0.85)'
    ctx.lineWidth = 3
    roundRectPath(x, y, w, h, 24)
    ctx.stroke()
    const close = { x: x + w - 46, y: y + 12, w: 34, h: 34 }
    ctx.fillStyle = 'rgba(11,16,32,0.08)'
    roundRectPath(close.x, close.y, close.w, close.h, 10)
    ctx.fill()
    ctx.fillStyle = r.score === 30 ? '#2ec4b6' : '#ff7b7b'
    ctx.textAlign = 'center'
    ctx.font = '900 22px sans-serif'
    ctx.fillText(r.score === 30 ? '全部找齐！' : '本局结束', x + w / 2, y + 56)
    ctx.fillStyle = 'rgba(11,16,32,0.88)'
    ctx.font = '800 16px sans-serif'
    ctx.fillText(`得分：${r.score} / 30`, x + w / 2, y + 92)
    ctx.font = '13px monospace'
    ctx.fillStyle = 'rgba(11,16,32,0.7)'
    ctx.fillText(`用时：${r.timeUsed.toFixed(1)}s`, x + w / 2, y + 116)
    ctx.font = '700 12px sans-serif'
    ctx.fillText('本地排行榜（前 3）', x + w / 2, y + 142)
    ctx.font = '12px monospace'
    const top = mod.state.leaderboard.slice(0, 3)
    for (let i = 0; i < top.length; i++) {
      const row = top[i]
      ctx.fillText(`${i + 1}. ${row.name}  ${row.score}/30  ${row.timeUsed.toFixed(1)}s`, x + w / 2, y + 164 + i * 18)
    }
    const ok = { x: x + (w - 168) / 2, y: y + h - 58, w: 168, h: 42 }
    ctx.fillStyle = '#ffd166'
    roundRectPath(ok.x, ok.y, ok.w, ok.h, 16)
    ctx.fill()
    ctx.fillStyle = '#0b1020'
    ctx.font = '800 16px sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText('再来一局', ok.x + ok.w / 2, ok.y + ok.h / 2)
    mod.state.modal = { card: { x, y, w, h }, close, okBtn: ok }
  }

  function hitBack(x, y) {
    return x >= 14 && x <= 60 && y >= 14 && y <= 60
  }

  function handleTap(x, y) {
    if (hitBack(x, y)) {
      state.scene = 'home'
      return true
    }

    if (mod.state.modal) {
      const m = mod.state.modal
      if (pointInRect(x, y, m.close) || pointInRect(x, y, m.okBtn) || !pointInRect(x, y, m.card)) {
        startRound()
      }
      return true
    }

    if (mod.state.clearBtn && pointInRect(x, y, mod.state.clearBtn)) {
      for (let i = 0; i < mod.state.blocks.length; i++) mod.state.blocks[i].selected = false
      mod.state.selectedSet = {}
      mod.state.next = 1
      showToast('已清除全部选择', 900)
      return true
    }

    const off = shakeOffset()
    for (let i = mod.state.blocks.length - 1; i >= 0; i--) {
      const b = mod.state.blocks[i]
      const poly = b.poly.map((p) => ({ x: p.x + off.x, y: p.y + off.y }))
      if (!pointInPolygon(x, y, poly)) continue
      if (b.selected) {
        b.selected = false
        delete mod.state.selectedSet[b.n]
        let next = 1
        while (mod.state.selectedSet[next]) next++
        mod.state.next = next
        showToast(`取消 ${b.n}`, 700)
        return true
      }
      if (b.n !== mod.state.next) {
        showToast(`要先找 ${mod.state.next} 哦`, 1200)
        mod.state.shakeUntil = Date.now() + 240
        return true
      }
      b.selected = true
      mod.state.selectedSet[b.n] = true
      mod.state.next++
      if (mod.state.next === 31) finishRound()
      return true
    }
    return false
  }

  mod.enter = function enter() {
    loadBoard()
    startRound()
    syncServerRank()
  }

  mod.render = function render() {
    updateTimer()
    drawTopBackButton()
    drawHeader()
    drawBlocks(shakeOffset())
    drawToast()
    drawClearBtn()
    drawModal()
  }

  mod.tap = handleTap
  return mod
}

module.exports = { createFindNumberModule }

