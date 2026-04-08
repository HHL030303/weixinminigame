const poems = require('../data/poems')

const STORAGE_SCORE = 'poetryScore'
const STORAGE_LEADER = 'poetryLeaderboard'
const STORAGE_PROGRESS = 'poetryProgress' // 保存游戏进度

function createPoetryModule(deps) {
  const { ctx, state, colors, roundRectPath, drawTopBackButton, pointInRect, rankService } = deps

  const mod = {
    name: 'poetry',
    state: {
      poemIndex: 0,
      completedLevels: [], // 已完成的关卡列表
      target: '',
      title: '',
      author: '',
      pool: [], // { id, ch, used }
      selected: [], // only selected Chinese chars from pool
      bottom: [], // display tokens: selected chars + auto punctuations
      segments: [],
      totalCharCount: 0,
      poolRects: [],
      bottomRects: [],
      undoBtn: null,
      nextBtn: null,
      modal: null,
      toast: null,
      score: 0,
      leaderboard: [],
      rankText: '服务器排名：加载中',
    },
  }

  function loadStorage() {
    try {
      const s = wx.getStorageSync(STORAGE_SCORE)
      if (typeof s === 'number') mod.state.score = s
      
      const lb = wx.getStorageSync(STORAGE_LEADER)
      if (Array.isArray(lb)) mod.state.leaderboard = lb
      
      // 加载进度
      const progress = wx.getStorageSync(STORAGE_PROGRESS)
      if (progress) {
        if (typeof progress.poemIndex === 'number') {
          mod.state.poemIndex = progress.poemIndex
        }
        if (Array.isArray(progress.completedLevels)) {
          mod.state.completedLevels = progress.completedLevels
        }
      }
    } catch (e) {}
  }

  function saveStorage() {
    try {
      wx.setStorageSync(STORAGE_SCORE, mod.state.score)
      wx.setStorageSync(STORAGE_LEADER, mod.state.leaderboard)
      // 保存进度
      wx.setStorageSync(STORAGE_PROGRESS, {
        poemIndex: mod.state.poemIndex,
        completedLevels: mod.state.completedLevels,
      })
    } catch (e) {}
  }

  function showToast(text, ms) {
    mod.state.toast = { text, until: Date.now() + (ms || 1200) }
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

  function splitPoemSegments(text) {
    const normalized = String(text).replace(/\s/g, '')
    const segments = []
    let buf = ''
    const punctSet = new Set(['，', '。', '！', '？', '；', ',', '.', '!', '?', ';'])
    for (const ch of Array.from(normalized)) {
      if (punctSet.has(ch)) {
        if (buf) {
          segments.push({ chars: Array.from(buf), punct: ch })
          buf = ''
        }
      } else {
        buf += ch
      }
    }
    if (buf) segments.push({ chars: Array.from(buf), punct: '' })
    return segments
  }

  function rebuildBottomDisplay() {
    const rebuilt = []
    let idx = 0
    for (let i = 0; i < mod.state.segments.length; i++) {
      const seg = mod.state.segments[i]
      const len = seg.chars.length
      const left = mod.state.selected.length - idx
      const take = Math.max(0, Math.min(len, left))
      for (let j = 0; j < take; j++) {
        rebuilt.push(mod.state.selected[idx])
        idx += 1
      }
      if (take === len && seg.punct) {
        rebuilt.push({ id: `punct_${i}_${idx}`, ch: seg.punct, type: 'punct' })
      }
      if (idx >= mod.state.selected.length) break
    }

    mod.state.bottom = rebuilt
  }

  function startRound() {
    const list = poems
    if (!list.length) return
    const p = list[mod.state.poemIndex % list.length]
    mod.state.title = p.title
    mod.state.author = p.author
    mod.state.segments = splitPoemSegments(p.text)
    mod.state.target = mod.state.segments.map((s) => s.chars.join('')).join('')
    mod.state.totalCharCount = mod.state.target.length
    const chars = Array.from(mod.state.target)
    const instances = chars.map((ch, i) => ({ id: `t${mod.state.poemIndex}_${i}`, ch }))
    mod.state.pool = shuffle(instances).map((x) => ({ ...x, used: false }))
    mod.state.selected = []
    mod.state.bottom = []
    mod.state.modal = null
    mod.state.toast = null
    mod.state.poolRects = []
    mod.state.bottomRects = []
    
    // 初始化安全区域（刘海屏适配）
    if (!mod.state.safeTop) {
      try {
        const sys = wx.getSystemInfoSync()
        mod.state.safeTop = sys.safeArea ? sys.safeArea.top : (sys.statusBarHeight || 0) + 10
      } catch (e) {
        mod.state.safeTop = 44 // 默认值
      }
    }
  }

  function syncServerRank() {
    if (!rankService) return
    rankService.refreshRank('poetry').then((ret) => {
      mod.state.rankText = ret && ret.rank ? `服务器排名：第 ${ret.rank} 名` : '服务器排名：未上榜'
    })
  }

  function nextPoem() {
    // 关卡不循环，到最后一首后停止
    if (mod.state.poemIndex < poems.length - 1) {
      mod.state.poemIndex++
      saveStorage()
      startRound()
    } else {
      showToast('已经是最后一关了！', 800)
    }
  }

  function checkWin() {
    const built = mod.state.selected.map((x) => x.ch).join('')
    if (built.length !== mod.state.target.length) return
    if (built === mod.state.target) {
      mod.state.score += 1
      
      // 记录已完成的关卡
      if (!mod.state.completedLevels.includes(mod.state.poemIndex)) {
        mod.state.completedLevels.push(mod.state.poemIndex)
      }
      saveStorage()
      
      const entry = { title: mod.state.title, score: 1, ts: Date.now() }
      mod.state.leaderboard.push(entry)
      mod.state.leaderboard.sort((a, b) => b.ts - a.ts)
      mod.state.leaderboard = mod.state.leaderboard.slice(0, 30)
      
      mod.state.modal = { mode: 'win' }
      if (rankService) {
        rankService.reportPass({ moduleKey: 'poetry', level: mod.state.score, score: mod.state.score }).then((ret) => {
          if (ret && ret.rank) mod.state.rankText = `服务器排名：第 ${ret.rank} 名`
        })
      }
    } else {
      showToast('顺序不对，请点「撤销」重试')
    }
  }

  function layoutPool() {
    mod.state.poolRects = []
    const pad = 12
    const topY = mod.state.safeTop + 160 // 使用安全区域，增加间距
    const poolH = Math.min(220, state.h * 0.32)
    const x0 = pad
    const w = state.w - pad * 2
    const cell = 36
    const gap = 8
    const cols = Math.max(4, Math.floor((w + gap) / (cell + gap)))
    let col = 0
    let row = 0
    for (let i = 0; i < mod.state.pool.length; i++) {
      const px = x0 + col * (cell + gap)
      const py = topY + row * (cell + gap)
      mod.state.poolRects.push({
        id: mod.state.pool[i].id,
        rect: { x: px, y: py, w: cell, h: cell },
      })
      col++
      if (col >= cols) {
        col = 0
        row++
      }
    }
    mod.state.poolAreaBottom = topY + (row + 1) * (cell + gap) + 8
  }

  function layoutBottom() {
    mod.state.bottomRects = []
    const pad = 12
    const startY = Math.max(mod.state.poolAreaBottom || 240, state.h * 0.42)
    const w = state.w - pad * 2
    const cell = 32
    const gap = 6
    const lineH = 46
    let x = pad
    let y = startY
    let row = 0
    for (let i = 0; i < mod.state.bottom.length; i++) {
      if (x + cell > pad + w) {
        x = pad
        y += lineH
        row++
      }
      mod.state.bottomRects.push({
        id: mod.state.bottom[i].id,
        rect: { x, y, w: cell, h: cell },
      })
      x += cell + gap
    }
    mod.state.bottomAreaY = startY
    mod.state.bottomAreaH = Math.max(48, (row + 1) * lineH)
  }

  function layoutButtons() {
    const bw = 100
    const bh = 40
    const gap = 12
    const y = mod.state.bottomAreaY + mod.state.bottomAreaH + 16
    const total = bw * 2 + gap
    const startX = (state.w - total) / 2
    mod.state.undoBtn = { x: startX, y, w: bw, h: bh }
    mod.state.nextBtn = { x: startX + bw + gap, y, w: bw, h: bh }
  }

  function drawHeader() {
    const safeTop = mod.state.safeTop
    const startY = safeTop + 10
    
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.font = '900 26px sans-serif'
    ctx.fillText('我爱背唐诗', state.w / 2, startY + 36)

    // 显示进度信息
    const currentLevel = mod.state.poemIndex + 1
    const totalLevels = poems.length
    const completedCount = mod.state.completedLevels.length

    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = '600 13px sans-serif'
    ctx.fillText(`进度：第 ${currentLevel}/${totalLevels} 关 | 已完成：${completedCount} 关`, state.w / 2, startY + 62)

    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = '600 12px sans-serif'
    ctx.fillText(`累计得分：${mod.state.score}`, state.w / 2, startY + 82)

    ctx.font = '600 11px sans-serif'
    ctx.fillText(mod.state.rankText, state.w / 2, startY + 100)

    if (mod.state.title) {
      ctx.fillStyle = '#ffd166'
      ctx.font = '700 13px sans-serif'
      ctx.fillText(`《${mod.state.title}》· ${mod.state.author}`, state.w / 2, startY + 120)
    }
  }

  function drawPool() {
    layoutPool()
    for (let i = 0; i < mod.state.poolRects.length; i++) {
      const pr = mod.state.poolRects[i]
      const blk = mod.state.pool.find((p) => p.id === pr.id)
      if (!blk) continue
      const { rect } = pr
      ctx.save()
      ctx.globalAlpha = blk.used ? 0.35 : 1
      ctx.fillStyle = colors[i % colors.length]
      roundRectPath(rect.x, rect.y, rect.w, rect.h, 8)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.lineWidth = 1.5
      roundRectPath(rect.x, rect.y, rect.w, rect.h, 8)
      ctx.stroke()
      ctx.fillStyle = '#0b1020'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '800 18px sans-serif'
      ctx.fillText(blk.ch, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1)
      ctx.restore()
    }
  }

  function drawBottomArea() {
    layoutBottom()
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    roundRectPath(12, mod.state.bottomAreaY - 6, state.w - 24, mod.state.bottomAreaH + 12, 12)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1.5
    roundRectPath(12, mod.state.bottomAreaY - 6, state.w - 24, mod.state.bottomAreaH + 12, 12)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    // ctx.font = '600 12px sans-serif'
    // ctx.textAlign = 'left'
    // ctx.fillText('只需拼汉字，标点会自动补齐', 20, mod.state.bottomAreaY - 18)

    for (let i = 0; i < mod.state.bottomRects.length; i++) {
      const br = mod.state.bottomRects[i]
      const item = mod.state.bottom.find((b) => b.id === br.id)
      if (!item) continue
      const { rect } = br
      ctx.fillStyle = '#ffd166'
      roundRectPath(rect.x, rect.y, rect.w, rect.h, 8)
      ctx.fill()
      ctx.strokeStyle = 'rgba(11,16,32,0.2)'
      ctx.lineWidth = 1.5
      roundRectPath(rect.x, rect.y, rect.w, rect.h, 8)
      ctx.stroke()
      ctx.fillStyle = '#0b1020'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '800 17px sans-serif'
      ctx.fillText(item.ch, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1)
    }
    layoutButtons()
  }

  function drawControlButtons() {
    const u = mod.state.undoBtn
    const n = mod.state.nextBtn
    if (!u || !n || mod.state.modal) return
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    roundRectPath(u.x, u.y, u.w, u.h, 10)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '700 14px sans-serif'
    ctx.fillText('撤销', u.x + u.w / 2, u.y + u.h / 2)
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    roundRectPath(n.x, n.y, n.w, n.h, 10)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillText('换一首', n.x + n.w / 2, n.y + n.h / 2)
  }

  function drawToast() {
    const t = mod.state.toast
    if (!t) return
    if (Date.now() > t.until) {
      mod.state.toast = null
      return
    }
    const w = Math.min(300, state.w - 40)
    const h = 38
    const x = (state.w - w) / 2
    const y = state.h * 0.36
    ctx.fillStyle = 'rgba(255,59,92,0.9)'
    roundRectPath(x, y, w, h, 10)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '700 13px sans-serif'
    ctx.fillText(t.text, x + w / 2, y + h / 2)
  }

  function drawModal() {
    if (!mod.state.modal) return
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, state.w, state.h)
    const w = state.w - 48
    const h = 220
    const x = 24
    const y = state.h * 0.5 - h / 2
    ctx.fillStyle = 'rgba(255,255,255,0.98)'
    roundRectPath(x, y, w, h, 20)
    ctx.fill()
    ctx.strokeStyle = 'rgba(46,196,182,0.85)'
    ctx.lineWidth = 2.5
    roundRectPath(x, y, w, h, 20)
    ctx.stroke()
    ctx.fillStyle = '#2ec4b6'
    ctx.textAlign = 'center'
    ctx.font = '900 22px sans-serif'
    ctx.fillText('太棒了！', x + w / 2, y + 48)
    ctx.fillStyle = 'rgba(11,16,32,0.85)'
    ctx.font = '600 14px sans-serif'
    ctx.fillText(`《${mod.state.title}》拼对了！`, x + w / 2, y + 82)
    
    const currentLevel = mod.state.poemIndex + 1
    const totalLevels = poems.length
    const completedCount = mod.state.completedLevels.length
    ctx.font = '13px sans-serif'
    ctx.fillStyle = 'rgba(11,16,32,0.7)'
    ctx.fillText(`进度：第 ${currentLevel}/${totalLevels} 关 | 已完成：${completedCount} 关`, x + w / 2, y + 106)
    ctx.fillText(`累计得分：${mod.state.score}`, x + w / 2, y + 128)
    
    const okW = 160
    const okH = 44
    const okX = x + (w - okW) / 2
    const okY = y + h - okH - 20
    ctx.fillStyle = '#ffd166'
    roundRectPath(okX, okY, okW, okH, 14)
    ctx.fill()
    ctx.fillStyle = '#0b1020'
    ctx.font = '800 16px sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText('下一题', okX + okW / 2, okY + okH / 2)
    mod.state.modalRect = {
      card: { x, y, w, h },
      okBtn: { x: okX, y: okY, w: okW, h: okH },
    }
  }

  function hitPool(x, y) {
    for (let i = mod.state.poolRects.length - 1; i >= 0; i--) {
      const pr = mod.state.poolRects[i]
      if (pointInRect(x, y, pr.rect)) return pr.id
    }
    return null
  }

  function handleTap(x, y) {
    if (x >= 14 && x <= 60 && y >= 14 && y <= 60) {
      state.scene = 'home'
      return true
    }

    if (mod.state.modal && mod.state.modalRect) {
      const m = mod.state.modalRect
      if (pointInRect(x, y, m.okBtn)) {
        nextPoem()
        mod.state.modal = null
        mod.state.modalRect = null
      }
      return true
    }

    if (mod.state.undoBtn && pointInRect(x, y, mod.state.undoBtn)) {
      if (mod.state.bottom.length === 0) {
        showToast('没有可撤销的')
        return true
      }
      const last = mod.state.selected.pop()
      const poolItem = mod.state.pool.find((p) => p.id === last.id)
      if (poolItem) poolItem.used = false
      rebuildBottomDisplay()
      return true
    }

    if (mod.state.nextBtn && pointInRect(x, y, mod.state.nextBtn)) {
      nextPoem()
      showToast('已换题', 800)
      return true
    }

    const pid = hitPool(x, y)
    if (pid) {
      const item = mod.state.pool.find((p) => p.id === pid)
      if (!item || item.used) return true
      item.used = true
      mod.state.selected.push({ id: item.id, ch: item.ch, type: 'char' })
      rebuildBottomDisplay()
      checkWin()
      return true
    }

    return false
  }

  mod.enter = function enter() {
    loadStorage()
    // 不再重置到第0关，保留上次进度
    startRound()
    syncServerRank()
  }

  mod.render = function render() {
    drawTopBackButton()
    drawHeader()
    drawPool()
    drawBottomArea()
    drawControlButtons()
    drawToast()
    drawModal()
  }

  mod.tap = handleTap
  return mod
}

module.exports = { createPoetryModule }
