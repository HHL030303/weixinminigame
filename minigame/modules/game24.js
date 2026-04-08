const TARGET = 24
const EPS = 1e-6

function absNear(a, b, eps) {
  return Math.abs(a - b) <= eps
}

function applyOp(a, b, op) {
  if (op === '+') return a + b
  if (op === '-') return a - b
  if (op === '*') return a * b
  if (op === '/') {
    if (Math.abs(b) < EPS) return null
    return a / b
  }
  return null
}

function isSolvable(nums, target) {
  const memo = new Set()
  function norm(v) {
    return Math.round(v * 1e5) / 1e5
  }
  function key(vals) {
    return vals.map(norm).sort((a, b) => a - b).join(',')
  }
  function dfs(vals) {
    if (vals.length === 1) return absNear(vals[0], target, 1e-3)
    const k = key(vals)
    if (memo.has(k)) return false
    memo.add(k)
    for (let i = 0; i < vals.length; i++) {
      for (let j = 0; j < vals.length; j++) {
        if (i === j) continue
        const rest = []
        for (let t = 0; t < vals.length; t++) if (t !== i && t !== j) rest.push(vals[t])
        const a = vals[i]
        const b = vals[j]
        const ops = ['+', '-', '*', '/']
        for (let p = 0; p < ops.length; p++) {
          const r = applyOp(a, b, ops[p])
          if (r == null) continue
          if (dfs(rest.concat(r))) return true
        }
      }
    }
    return false
  }
  return dfs(nums.slice())
}

function randomQuestion() {
  let tries = 0
  while (tries < 1000) {
    tries++
    const nums = []
    for (let i = 0; i < 4; i++) nums.push(Math.floor(Math.random() * 9) + 1)
    if (isSolvable(nums, TARGET)) return nums
  }
  return [3, 3, 8, 8]
}

function createGame24Module(deps) {
  const { ctx, state, colors, roundRectPath, drawTopBackButton, pointInRect, rankService } = deps
  const mod = {
    name: 'game24',
    state: {
      toast: null,
      numbers: [],
      numberRects: [],
      exprTokens: [],
      opButtons: [],
      score: 0,
      timer: { startTs: Date.now(), elapsed: 0 },
      modal: null,
      result: null, // { mode, expressionStr, resultValue }
      rankText: '服务器排名：加载中',
    },
  }

  function showToast(text) {
    mod.state.toast = { text, until: Date.now() + 1500 }
  }

  function buildExprEval() {
    return mod.state.exprTokens.map((t) => t.value).join('')
  }
  function buildExprDisplay() {
    return mod.state.exprTokens.map((t) => t.value).join(' ')
  }
  function lastToken() {
    const t = mod.state.exprTokens
    return t.length ? t[t.length - 1] : null
  }
  function parenBalance() {
    let b = 0
    for (let i = 0; i < mod.state.exprTokens.length; i++) {
      const t = mod.state.exprTokens[i]
      if (t.type === 'paren') b += t.value === '(' ? 1 : -1
    }
    return b
  }

  function resetRound() {
    const nums = randomQuestion()
    mod.state.numbers = nums.map((v) => ({ id: `${Date.now()}_${v}_${Math.random()}`, value: v, used: false }))
    mod.state.exprTokens = []
    mod.state.result = null
    mod.state.modal = null
    mod.state.toast = null
    mod.state.timer.startTs = Date.now()
    mod.state.timer.elapsed = 0
  }

  function getRankTitle(score) {
    if (score <= 1) return '初出江湖'
    if (score <= 3) return '新鲜菜鸟'
    if (score <= 6) return '速算达人'
    return '江湖传说'
  }

  function syncServerRank() {
    if (!rankService) return
    rankService.refreshRank('game24').then((ret) => {
      mod.state.rankText = ret && ret.rank ? `服务器排名：第 ${ret.rank} 名` : '服务器排名：未上榜'
    })
  }

  function updateTimer() {
    if (mod.state.result) return
    mod.state.timer.elapsed = (Date.now() - mod.state.timer.startTs) / 1000
  }

  function drawHeader() {
    const secs = Math.max(0, Math.floor(mod.state.timer.elapsed))
    const mm = Math.floor(secs / 60)
    const ss = secs % 60
    const t = `${mm}:${ss < 10 ? '0' + ss : ss}`
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.font = '700 30px sans-serif'
    ctx.fillText('速算 24 点', state.w / 2, 72)
    ctx.textAlign = 'left'
    ctx.font = '600 14px sans-serif'
    ctx.fillText(`段位：${getRankTitle(mod.state.score)}`, 16, 48)
    ctx.fillText(`关卡：${mod.state.score + 1}`, 16, 70)
    ctx.font = '600 12px sans-serif'
    ctx.fillText(mod.state.rankText, 16, 90)
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.font = '600 18px monospace'
    ctx.fillText(`用时 ${t}`, state.w - 16, 48)
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = '14px sans-serif'
    ctx.fillText(`玩家：${(state.user && state.user.nickName) || '游客'}`, state.w / 2, 104)
    ctx.fillText('四个数字各用一次，不能连点运算符', state.w / 2, 124)
  }

  function layoutNumbers() {
    mod.state.numberRects = []
    const topY = 184
    const gap = 18
    const w = Math.min(110, state.w * 0.35)
    const h = 70
    const left = (state.w - (w * 2 + gap)) / 2
    const pos = [
      { x: left, y: topY },
      { x: left + w + gap, y: topY },
      { x: left, y: topY + h + gap },
      { x: left + w + gap, y: topY + h + gap },
    ]
    for (let i = 0; i < mod.state.numbers.length; i++) {
      mod.state.numberRects.push({ rect: { x: pos[i].x, y: pos[i].y, w, h }, num: mod.state.numbers[i] })
    }
  }

  function drawNumbers() {
    layoutNumbers()
    for (let i = 0; i < mod.state.numberRects.length; i++) {
      const { rect, num } = mod.state.numberRects[i]
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.2)'
      roundRectPath(rect.x + 2, rect.y + 3, rect.w, rect.h, 16)
      ctx.fill()
      ctx.globalAlpha = num.used ? 0.35 : 1
      ctx.fillStyle = colors[i % colors.length]
      roundRectPath(rect.x, rect.y, rect.w, rect.h, 16)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = 2
      roundRectPath(rect.x, rect.y, rect.w, rect.h, 16)
      ctx.stroke()
      ctx.fillStyle = '#0b1020'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '800 30px sans-serif'
      ctx.fillText(String(num.value), rect.x + rect.w / 2, rect.y + rect.h / 2 + 1)
      ctx.restore()
    }
  }

  function drawExprBar() {
    const x = 16
    const y = state.h * 0.58
    const w = state.w - 32
    const h = 56
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    roundRectPath(x, y, w, h, 16)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 2
    roundRectPath(x, y, w, h, 16)
    ctx.stroke()
    // ctx.fillStyle = '#fff'
    // ctx.textAlign = 'left'
    // ctx.textBaseline = 'middle'
    // ctx.font = '600 18px monospace'
    // const text = buildExprDisplay() || '点数字 + 运算符，全部用完后点 ='
    // ctx.fillText(text, x + 12, y + h / 2)

    // 清空算式按钮（不换题，只清当前输入）
    const cw = 92
    const ch = 34
    const cx = x + w - cw - 10
    const cy = y + (h - ch) / 2
    mod.state.clearExprBtn = { x: cx, y: cy, w: cw, h: ch }
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    roundRectPath(cx, cy, cw, ch, 10)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 1.5
    roundRectPath(cx, cy, cw, ch, 10)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.textAlign = 'center'
    ctx.font = '700 13px sans-serif'
    ctx.fillText('清空', cx + cw / 2, cy + ch / 2 + 1)
  }

  function layoutOpButtons() {
    mod.state.opButtons = []
    const labels = ['+', '-', '*', '/', '(', ')']
    if (mod.state.numbers.every((n) => n.used) && !mod.state.result) labels.push('=')
    const cols = 4
    const btnW = 60
    const btnH = 52
    const gapX = 14
    const gapY = 12
    const totalW = cols * btnW + (cols - 1) * gapX
    const startX = (state.w - totalW) / 2
    const startY = state.h * 0.68
    for (let i = 0; i < labels.length; i++) {
      const r = Math.floor(i / cols)
      const c = i % cols
      mod.state.opButtons.push({
        label: labels[i],
        rect: { x: startX + c * (btnW + gapX), y: startY + r * (btnH + gapY), w: btnW, h: btnH },
      })
    }
  }

  function drawOpButtons() {
    layoutOpButtons()
    for (let i = 0; i < mod.state.opButtons.length; i++) {
      const b = mod.state.opButtons[i]
      const isEq = b.label === '='
      ctx.fillStyle = isEq ? '#ffd166' : b.label === '(' || b.label === ')' ? '#b8c0ff' : '#06d6a0'
      roundRectPath(b.rect.x, b.rect.y, b.rect.w, b.rect.h, 14)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 2
      roundRectPath(b.rect.x, b.rect.y, b.rect.w, b.rect.h, 14)
      ctx.stroke()
      ctx.fillStyle = '#0b1020'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '900 22px sans-serif'
      ctx.fillText(b.label, b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2 + 1)
    }
  }

  function drawToast() {
    const t = mod.state.toast
    if (!t) return
    if (Date.now() > t.until) {
      mod.state.toast = null
      return
    }
    const w = Math.min(320, state.w - 50)
    const h = 40
    const x = (state.w - w) / 2
    const y = state.h * 0.43
    ctx.fillStyle = 'rgba(255,59,92,0.92)'
    roundRectPath(x, y, w, h, 12)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '700 14px sans-serif'
    ctx.fillText(t.text, x + w / 2, y + h / 2)
  }

  function drawBottomButton() {
    if (mod.state.result) return
    const w = 220
    const h = 58
    const x = (state.w - w) / 2
    const y = state.h - h - 40
    mod.state.nextBtn = { x, y, w, h }
    ctx.fillStyle = '#ffd166'
    roundRectPath(x, y, w, h, 18)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.lineWidth = 2
    roundRectPath(x, y, w, h, 18)
    ctx.stroke()
    ctx.fillStyle = '#0b1020'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '900 22px sans-serif'
    ctx.fillText('换一题', x + w / 2, y + h / 2)
  }

  function drawModal() {
    if (!mod.state.result) return
    const res = mod.state.result
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, state.w, state.h)
    const w = state.w - 52
    const h = 210
    const x = 26
    const y = state.h * 0.5 - h / 2
    ctx.fillStyle = 'rgba(255,255,255,0.98)'
    roundRectPath(x, y, w, h, 24)
    ctx.fill()
    ctx.strokeStyle = 'rgba(46,196,182,0.85)'
    ctx.lineWidth = 3
    roundRectPath(x, y, w, h, 24)
    ctx.stroke()
    const close = { x: x + w - 46, y: y + 12, w: 34, h: 34 }
    ctx.fillStyle = 'rgba(11,16,32,0.08)'
    roundRectPath(close.x, close.y, close.w, close.h, 10)
    ctx.fill()
    ctx.fillStyle = res.mode === 'win' ? '#2ec4b6' : '#ff7b7b'
    ctx.textAlign = 'center'
    ctx.font = '800 22px sans-serif'
    ctx.fillText('恭喜通关！', x + w / 2, y + 56)
    ctx.fillStyle = 'rgba(11,16,32,0.88)'
    ctx.font = '13px monospace'
    const line =
      typeof res.resultValue === 'number' && isFinite(res.resultValue)
        ? `${res.expressionStr} = ${Number(res.resultValue.toFixed(3))}`
        : `${res.expressionStr}（算式有误）`
    ctx.fillText(line, x + w / 2, y + 92)
    const ok = { x: x + (w - 168) / 2, y: y + h - 58, w: 168, h: 42 }
    ctx.fillStyle = '#ffd166'
    roundRectPath(ok.x, ok.y, ok.w, ok.h, 16)
    ctx.fill()
    ctx.fillStyle = '#0b1020'
    ctx.font = '800 16px sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText('知道了', ok.x + ok.w / 2, ok.y + ok.h / 2)
    mod.state.modal = { card: { x, y, w, h }, close, okBtn: ok }
  }

  function validateBeforeEqual() {
    if (!mod.state.numbers.every((n) => n.used)) return { ok: false, msg: '四个数字都要用一次' }
    if (parenBalance() !== 0) return { ok: false, msg: '括号要配对好哦' }
    const last = lastToken()
    if (!last) return { ok: false, msg: '先组好算式再点等于' }
    if (last.type === 'op') return { ok: false, msg: '不能以运算符结尾' }
    if (last.type === 'paren' && last.value === '(') return { ok: false, msg: '括号里要有内容' }
    return { ok: true }
  }

  function canAppendNum() {
    const last = lastToken()
    if (!last) return true
    if (last.type === 'op') return true
    if (last.type === 'paren' && last.value === '(') return true
    return false
  }
  function canAppendOp() {
    const last = lastToken()
    if (!last) return false
    if (last.type === 'num') return true
    if (last.type === 'paren' && last.value === ')') return true
    return false
  }

  function handleTap(x, y) {
    if (hitBack(x, y)) {
      state.scene = 'home'
      return true
    }
    if (mod.state.result && mod.state.modal) {
      const m = mod.state.modal
      if (pointInRect(x, y, m.close) || pointInRect(x, y, m.okBtn) || !pointInRect(x, y, m.card)) {
        if (mod.state.result.mode === 'win') resetRound()
        mod.state.result = null
        mod.state.modal = null
      }
      return true
    }
    if (mod.state.nextBtn && pointInRect(x, y, mod.state.nextBtn)) {
      resetRound()
      return true
    }
    // 清空当前算式（保留当前题目和计时）
    if (mod.state.clearExprBtn && pointInRect(x, y, mod.state.clearExprBtn)) {
      mod.state.exprTokens = []
      for (let i = 0; i < mod.state.numbers.length; i++) {
        mod.state.numbers[i].used = false
      }
      showToast('已清空当前运算')
      return true
    }
    for (let i = 0; i < mod.state.numberRects.length; i++) {
      const item = mod.state.numberRects[i]
      if (!pointInRect(x, y, item.rect)) continue
      if (item.num.used) return true
      if (!canAppendNum()) {
        showToast('数字之间需要运算符')
        return true
      }
      item.num.used = true
      mod.state.exprTokens.push({ type: 'num', value: String(item.num.value) })
      return true
    }
    for (let i = 0; i < mod.state.opButtons.length; i++) {
      const b = mod.state.opButtons[i]
      if (!pointInRect(x, y, b.rect)) continue
      const label = b.label
      if (label === '=') {
        const check = validateBeforeEqual()
        if (!check.ok) {
          showToast(check.msg)
          return true
        }
        const exprEval = buildExprEval()
        const exprDisplay = buildExprDisplay()
        let value
        try {
          // eslint-disable-next-line no-eval
          value = eval(exprEval)
        } catch (e) {
          showToast('算式有误，请重试')
          mod.state.exprTokens = []
          for (let i = 0; i < mod.state.numbers.length; i++) mod.state.numbers[i].used = false
          return true
        }
        const ok = Number.isFinite(value) && absNear(Number(value), TARGET, 1e-6)
        if (ok) {
          mod.state.score++
          if (rankService) {
            rankService
              .reportPass({ moduleKey: 'game24', level: mod.state.score, score: mod.state.score, timeUsed: mod.state.timer.elapsed })
              .then((ret) => {
                if (ret && ret.rank) mod.state.rankText = `服务器排名：第 ${ret.rank} 名`
              })
          }
          mod.state.result = { mode: 'win', expressionStr: exprDisplay, resultValue: value }
        } else {
          showToast(`结果是 ${Number(value.toFixed(3))}，不是 24`)
          mod.state.exprTokens = []
          for (let i = 0; i < mod.state.numbers.length; i++) mod.state.numbers[i].used = false
        }
        return true
      }
      if (label === '(') {
        const last = lastToken()
        if (!(!last || last.type === 'op' || (last.type === 'paren' && last.value === '('))) {
          showToast('左括号位置不对')
          return true
        }
        mod.state.exprTokens.push({ type: 'paren', value: '(' })
        return true
      }
      if (label === ')') {
        const last = lastToken()
        if (!(parenBalance() > 0 && last && (last.type === 'num' || (last.type === 'paren' && last.value === ')')))) {
          showToast('右括号位置不对')
          return true
        }
        mod.state.exprTokens.push({ type: 'paren', value: ')' })
        return true
      }
      if (!canAppendOp()) {
        showToast('不能连续点运算符')
        return true
      }
      mod.state.exprTokens.push({ type: 'op', value: label })
      return true
    }
    return false
  }

  function hitBack(x, y) {
    return x >= 14 && x <= 60 && y >= 14 && y <= 60
  }

  mod.enter = function enter() {
    resetRound()
    syncServerRank()
  }

  mod.render = function render() {
    updateTimer()
    drawTopBackButton()
    drawHeader()
    drawNumbers()
    drawExprBar()
    drawOpButtons()
    drawToast()
    drawBottomButton()
    drawModal()
  }

  mod.tap = handleTap
  return mod
}

module.exports = { createGame24Module }

