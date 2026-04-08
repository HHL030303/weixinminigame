function createFindNumberModule(deps) {
  const { ctx, state, colors, roundRectPath, drawTopBackButton, pointInRect, rankService } = deps
  const STORAGE_KEY = 'findNumberLeaderboard'

  const DIFFICULTY = {
    EASY: { key: 'easy', label: '简单', poolSize: 25, selectCount: 20, timeLimit: 90, minAreaRatio: 0.008 },
    NORMAL: { key: 'normal', label: '一般', poolSize: 50, selectCount: 30, timeLimit: 120, minAreaRatio: 0.005 },
    HARD: { key: 'hard', label: '困难', poolSize: 100, selectCount: 30, timeLimit: 150, minAreaRatio: 0.003 },
  }

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
      difficulty: DIFFICULTY.NORMAL,
      currentNumbers: [], // 实际需要找的数字列表
      phase: 'select', // 'select' | 'playing' | 'finished'
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
    const diff = mod.state.difficulty
    mod.state.blocks = []
    mod.state.selectedSet = {}
    mod.state.shakeUntil = 0
    mod.state.toast = null
    mod.state.modal = null
    mod.state.lastResult = null
    mod.state.timer.startTs = Date.now()
    mod.state.timer.elapsed = 0
    mod.state.phase = 'playing'

    // 从 1~poolSize 中随机选 selectCount 个数字
    const pool = []
    for (let i = 1; i <= diff.poolSize; i++) pool.push(i)
    const shuffled = shuffle(pool).slice(0, diff.selectCount).sort((a, b) => a - b)
    mod.state.currentNumbers = shuffled
    mod.state.next = shuffled[0]

    // 计算画板区域
    const boardPaddingX = 12
    const boardTop = 130
    const boardBottomGap = 80
    const boardW = state.w - boardPaddingX * 2
    const boardH = state.h - boardTop - boardBottomGap
    const boardX = boardPaddingX
    const boardY = boardTop
    const boardArea = boardW * boardH

    // 使用 Voronoi 风格的随机分布生成不规则块
    const count = shuffled.length
    const blocks = generateIrregularBlocks(count, boardX, boardY, boardW, boardH, boardArea, diff)
    mod.state.blocks = blocks

    // 将随机数字分配给每个块
    const shuffledNumsForBlocks = shuffle(shuffled)
    for (let i = 0; i < blocks.length; i++) {
      blocks[i].n = shuffledNumsForBlocks[i]
      blocks[i].selected = false
    }
  }

  function drawDifficultySelect() {
    const diff = mod.state.difficulty
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, state.w, state.h)
    
    const w = state.w - 60
    const h = 280
    const x = 30
    const y = state.h * 0.5 - h / 2
    
    ctx.fillStyle = 'rgba(255,255,255,0.98)'
    roundRectPath(x, y, w, h, 24)
    ctx.fill()
    ctx.strokeStyle = '#4cc9f0'
    ctx.lineWidth = 3
    roundRectPath(x, y, w, h, 24)
    ctx.stroke()
    
    ctx.fillStyle = '#0b1020'
    ctx.textAlign = 'center'
    ctx.font = '900 24px sans-serif'
    ctx.fillText('选择难度', x + w / 2, y + 48)
    
    const difficulties = [DIFFICULTY.EASY, DIFFICULTY.NORMAL, DIFFICULTY.HARD]
    const btnW = w - 40
    const btnH = 56
    const gap = 12
    const startY = y + 72
    
    mod.state.difficultyBtns = []
    
    for (let i = 0; i < difficulties.length; i++) {
      const d = difficulties[i]
      const by = startY + i * (btnH + gap)
      const btn = { x: x + 20, y: by, w: btnW, h: btnH, difficulty: d }
      mod.state.difficultyBtns.push(btn)
      
      const isSelected = diff.key === d.key
      ctx.fillStyle = isSelected ? '#ffd166' : 'rgba(11,16,32,0.08)'
      roundRectPath(btn.x, btn.y, btn.w, btn.h, 14)
      ctx.fill()
      
      ctx.strokeStyle = isSelected ? '#0b1020' : 'rgba(11,16,32,0.2)'
      ctx.lineWidth = isSelected ? 2 : 1
      roundRectPath(btn.x, btn.y, btn.w, btn.h, 14)
      ctx.stroke()
      
      ctx.fillStyle = isSelected ? '#0b1020' : 'rgba(11,16,32,0.7)'
      ctx.textAlign = 'left'
      ctx.font = `900 18px sans-serif`
      ctx.fillText(d.label, btn.x + 16, btn.y + 24)
      
      ctx.font = '12px sans-serif'
      ctx.fillStyle = isSelected ? 'rgba(11,16,32,0.7)' : 'rgba(11,16,32,0.5)'
      let desc = `从 1-${d.poolSize} 中找 ${d.selectCount} 个`
      if (d.key === 'hard') desc += ' | 形状混乱'
      ctx.fillText(desc, btn.x + 16, btn.y + 42)
    }
    
    mod.state.difficultyModal = { x, y, w, h }
  }

  function generateIrregularBlocks(count, bx, by, bw, bh, boardArea, diff) {
    const blocks = []
    const targetArea = boardArea / count
    
    // 使用改进的网格方法：根据数量自动计算行列数
    const cols = Math.ceil(Math.sqrt(count * (bw / bh)))
    const rows = Math.ceil(count / cols)
    const cellW = bw / cols
    const cellH = bh / rows
    
    // 生成共享顶点网格（内部点随机扰动，边界点固定）
    const gridPoints = []
    for (let r = 0; r <= rows; r++) {
      gridPoints[r] = []
      for (let c = 0; c <= cols; c++) {
        let px = bx + c * cellW
        let py = by + r * cellH
        
        // 内部点随机扰动（边界点不扰动，确保贴合边缘）
        const isBorder = r === 0 || c === 0 || r === rows || c === cols
        if (!isBorder) {
          // 增大扰动范围，让形状更不规则
          const maxDx = cellW * 0.45
          const maxDy = cellH * 0.45
          px += (Math.random() - 0.5) * 2 * maxDx
          py += (Math.random() - 0.5) * 2 * maxDy
        }
        
        gridPoints[r][c] = { x: px, y: py }
      }
    }
    
    // 为每个格子分配随机面积权重
    const weights = []
    for (let r = 0; r < rows; r++) {
      weights[r] = []
      for (let c = 0; c < cols; c++) {
        // 0.3~3.0 的权重范围，制造显著大小差异
        weights[r][c] = 0.3 + Math.random() * 2.7
      }
    }
    
    // 从权重中选取前 count 个格子生成块
    const cellIndices = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cellIndices.push({ r, c, weight: weights[r][c] })
      }
    }
    // 按权重排序，取前 count 个
    cellIndices.sort((a, b) => b.weight - a.weight)
    const selectedCells = cellIndices.slice(0, count)
    
    // 生成块：每个块由 1~3 个相邻格子合并而成（制造大小差异）
    let cellIndex = 0
    let blockCount = 0
    
    while (blockCount < count && cellIndex < selectedCells.length) {
      const primary = selectedCells[cellIndex]
      const r = primary.r
      const c = primary.c
      
      // 获取四个顶点（从共享网格）
      const p0 = gridPoints[r][c]
      const p1 = gridPoints[r][c + 1]
      const p2 = gridPoints[r + 1][c + 1]
      const p3 = gridPoints[r + 1][c]
      
      // 对顶点添加二次扰动（让形状更不规则）
      const jitterAmount = Math.min(cellW, cellH) * 0.15
      const jitteredPoly = [
        { x: p0.x + (Math.random() - 0.5) * jitterAmount, y: p0.y + (Math.random() - 0.5) * jitterAmount },
        { x: p1.x + (Math.random() - 0.5) * jitterAmount, y: p1.y + (Math.random() - 0.5) * jitterAmount },
        { x: p2.x + (Math.random() - 0.5) * jitterAmount, y: p2.y + (Math.random() - 0.5) * jitterAmount },
        { x: p3.x + (Math.random() - 0.5) * jitterAmount, y: p3.y + (Math.random() - 0.5) * jitterAmount },
      ]
      
      // 计算包围盒
      const xs = jitteredPoly.map(v => v.x)
      const ys = jitteredPoly.map(v => v.y)
      const minX = Math.max(bx, Math.min(...xs))
      const maxX = Math.min(bx + bw, Math.max(...xs))
      const minY = Math.max(by, Math.min(...ys))
      const maxY = Math.min(by + bh, Math.max(...ys))
      
      const bbox = {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
      }
      const cx = xs.reduce((a, b) => a + b, 0) / xs.length
      const cy = ys.reduce((a, b) => a + b, 0) / ys.length
      
      blocks.push({
        n: 0, // 稍后分配
        poly: jitteredPoly,
        bbox,
        cx,
        cy,
        seed: Math.random() * Math.PI * 2,
        textAlpha: 0.6 + Math.random() * 0.4,
        textScale: 0.12 + Math.random() * 0.58, // 字体大小差异极大
        color: colors[blockCount % colors.length],
        selected: false,
      })
      
      cellIndex++
      blockCount++
    }
    
    return blocks
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
    mod.state.lastResult = { score, timeUsed, total: mod.state.currentNumbers.length }
    mod.state.phase = 'finished'

    mod.state.leaderboard.push({ 
      name: '你', 
      score, 
      timeUsed, 
      difficulty: mod.state.difficulty.label,
      ts: Date.now() 
    })
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
    ctx.fillText('找数字', state.w / 2, 68)
    
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.font = '700 14px sans-serif'
    const found = Object.keys(mod.state.selectedSet).length
    const total = mod.state.currentNumbers.length
    ctx.fillText(`难度：${mod.state.difficulty.label} | 已找 ${found}/${total}`, state.w / 2, 92)
    
    if (mod.state.phase === 'playing') {
      ctx.fillStyle = '#ffd166'
      ctx.font = '800 16px sans-serif'
      ctx.fillText(`下一个：${mod.state.next}`, state.w / 2, 114)
    }
    
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '600 11px sans-serif'
    ctx.fillText(mod.state.rankText, state.w / 2, 130)
    
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
    const h = 240
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
    ctx.fillStyle = r.score === r.total ? '#2ec4b6' : '#ff7b7b'
    ctx.textAlign = 'center'
    ctx.font = '900 22px sans-serif'
    ctx.fillText(r.score === r.total ? '全部找齐！' : '本局结束', x + w / 2, y + 52)
    
    ctx.fillStyle = 'rgba(11,16,32,0.88)'
    ctx.font = '700 15px sans-serif'
    ctx.fillText(`难度：${r.difficulty || mod.state.difficulty.label}`, x + w / 2, y + 82)
    
    ctx.font = '800 16px sans-serif'
    ctx.fillText(`得分：${r.score} / ${r.total}`, x + w / 2, y + 108)
    
    ctx.font = '13px monospace'
    ctx.fillStyle = 'rgba(11,16,32,0.7)'
    ctx.fillText(`用时：${r.timeUsed.toFixed(1)}s`, x + w / 2, y + 132)
    
    ctx.font = '700 12px sans-serif'
    ctx.fillText('本地排行榜（前 3）', x + w / 2, y + 158)
    ctx.font = '12px monospace'
    const top = mod.state.leaderboard.slice(0, 3)
    for (let i = 0; i < top.length; i++) {
      const row = top[i]
      ctx.fillText(`${i + 1}. ${row.name}  ${row.score}/${row.total || 30}  ${row.timeUsed.toFixed(1)}s`, x + w / 2, y + 178 + i * 18)
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

    // 处理难度选择界面点击
    if (mod.state.phase === 'select' && mod.state.difficultyBtns) {
      for (let i = 0; i < mod.state.difficultyBtns.length; i++) {
        const btn = mod.state.difficultyBtns[i]
        if (pointInRect(x, y, btn)) {
          mod.state.difficulty = btn.difficulty
          mod.state.difficultyModal = null
          mod.state.difficultyBtns = []
          mod.state.phase = 'playing'
          startRound()
          syncServerRank()
          return true
        }
      }
      return true
    }

    if (mod.state.modal) {
      const m = mod.state.modal
      if (pointInRect(x, y, m.close) || pointInRect(x, y, m.okBtn) || !pointInRect(x, y, m.card)) {
        mod.state.phase = 'select' // 结束后回到难度选择
        mod.state.difficultyModal = null
        mod.state.difficultyBtns = []
      }
      return true
    }

    if (mod.state.clearBtn && pointInRect(x, y, mod.state.clearBtn)) {
      for (let i = 0; i < mod.state.blocks.length; i++) mod.state.blocks[i].selected = false
      mod.state.selectedSet = {}
      let next = mod.state.currentNumbers[0]
      mod.state.next = next
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
        // 找到下一个未选中的最小数字
        const remaining = mod.state.currentNumbers.filter(n => !mod.state.selectedSet[n])
        next = remaining.length > 0 ? remaining[0] : mod.state.currentNumbers[0]
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
      // 找下一个未选中的数字
      const remaining = mod.state.currentNumbers.filter(n => !mod.state.selectedSet[n])
      if (remaining.length === 0) {
        finishRound()
      } else {
        mod.state.next = remaining[0]
      }
      return true
    }
    return false
  }

  mod.enter = function enter() {
    loadBoard()
    mod.state.phase = 'select' // 先显示难度选择
    mod.state.difficultyModal = null
    mod.state.difficultyBtns = []
  }

  mod.render = function render() {
    updateTimer()
    drawTopBackButton()
    
    if (mod.state.phase === 'select') {
      drawDifficultySelect()
    } else {
      drawHeader()
      drawBlocks(shakeOffset())
      drawToast()
      drawClearBtn()
      drawModal()
    }
  }

  mod.tap = handleTap
  return mod
}

module.exports = { createFindNumberModule }

