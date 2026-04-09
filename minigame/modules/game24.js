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

// 简单的表达式解析器（替代 eval，支持 + - * / 和括号）
function evaluateExpression(expr) {
  let pos = 0
  const str = expr.replace(/\s/g, '') // 去除空格
  
  function parseExpression() {
    let left = parseTerm()
    while (pos < str.length) {
      if (str[pos] === '+' || str[pos] === '-') {
        const op = str[pos]
        pos++
        const right = parseTerm()
        left = applyOp(left, right, op)
        if (left === null) return null
      } else {
        break
      }
    }
    return left
  }
  
  function parseTerm() {
    let left = parseFactor()
    while (pos < str.length) {
      if (str[pos] === '*' || str[pos] === '/') {
        const op = str[pos]
        pos++
        const right = parseFactor()
        left = applyOp(left, right, op)
        if (left === null) return null
      } else {
        break
      }
    }
    return left
  }
  
  function parseFactor() {
    if (pos >= str.length) return null
    
    // 处理括号
    if (str[pos] === '(') {
      pos++ // 跳过 '('
      const result = parseExpression()
      if (pos < str.length && str[pos] === ')') {
        pos++ // 跳过 ')'
      }
      return result
    }
    
    // 处理数字
    let numStr = ''
    while (pos < str.length && (str[pos] >= '0' && str[pos] <= '9' || str[pos] === '.')) {
      numStr += str[pos]
      pos++
    }
    
    if (numStr.length > 0) {
      return parseFloat(numStr)
    }
    
    return null
  }
  
  const result = parseExpression()
  return result
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
      cursorIndex: -1, // 光标位置，-1 表示在末尾
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

  // 在光标位置插入 token
  function insertToken(token) {
    const tokens = mod.state.exprTokens
    const cursorIdx = mod.state.cursorIndex
    
    if (cursorIdx === -1 || cursorIdx >= tokens.length) {
      // 光标在末尾，直接追加
      tokens.push(token)
      mod.state.cursorIndex = tokens.length - 1
    } else {
      // 在光标后插入
      tokens.splice(cursorIdx + 1, 0, token)
      mod.state.cursorIndex = cursorIdx + 1
    }
  }
  
  // 获取光标后的 token（用于验证）
  function getTokenAfterCursor() {
    const tokens = mod.state.exprTokens
    const cursorIdx = mod.state.cursorIndex
    
    // cursorIdx = -1 表示在第一个 token 前
    if (cursorIdx === -1) {
      return tokens.length > 0 ? tokens[0] : null
    }
    
    // cursorIdx >= tokens.length - 1 表示在末尾
    if (cursorIdx >= tokens.length - 1) {
      return null
    }
    
    return tokens[cursorIdx + 1]
  }
  
  // 在光标位置插入 token
  function insertToken(token) {
    const tokens = mod.state.exprTokens
    const cursorIdx = mod.state.cursorIndex
    
    if (cursorIdx === -1) {
      // 光标在开头，插入到最前面
      tokens.unshift(token)
      mod.state.cursorIndex = 0
    } else if (cursorIdx >= tokens.length - 1) {
      // 光标在末尾，追加到最后
      tokens.push(token)
      mod.state.cursorIndex = tokens.length - 1
    } else {
      // 在光标后插入
      tokens.splice(cursorIdx + 1, 0, token)
      mod.state.cursorIndex = cursorIdx + 1
    }
  }
  
  // 获取最后一个 token（当光标在末尾时）
  function lastToken() {
    const t = mod.state.exprTokens
    return t.length ? t[t.length - 1] : null
  }

  function buildExprEval() {
    // 构建用于 eval 计算的表达式
    const tokens = mod.state.exprTokens.map((t) => t.value)
    return tokens.join('')
  }
  
  function buildExprDisplay() {
    // 构建用于显示的表达式（带空格，更易读）
    const tokens = mod.state.exprTokens.map((t) => t.value)
    return tokens.join(' ')
  }
  function parenBalance() {
    let b = 0
    for (let i = 0; i < mod.state.exprTokens.length; i++) {
      const t = mod.state.exprTokens[i]
      if (t.type === 'paren') b += t.value === '(' ? 1 : -1
    }
    return b
  }
  
  // 获取光标前的 token
  function getTokenBeforeCursor() {
    const tokens = mod.state.exprTokens
    const cursorIdx = mod.state.cursorIndex
    
    // cursorIdx = -1 表示在开头，前面没有 token
    if (cursorIdx === -1) {
      return null
    }
    
    // cursorIdx 在范围内
    if (cursorIdx >= 0 && cursorIdx < tokens.length) {
      return tokens[cursorIdx]
    }
    
    // 超出范围，返回最后一个 token
    return tokens.length > 0 ? tokens[tokens.length - 1] : null
  }

  function resetRound() {
    const nums = randomQuestion()
    mod.state.numbers = nums.map((v) => ({ id: `${Date.now()}_${v}_${Math.random()}`, value: v, used: false }))
    mod.state.exprTokens = []
    mod.state.cursorIndex = -1 // 重置光标到末尾
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

    // 计算每个 token 的位置和宽度
    const tokens = mod.state.exprTokens
    const tokenWidths = []
    const padding = 12
    let totalWidth = 0
    
    ctx.font = '700 20px monospace'
    for (let i = 0; i < tokens.length; i++) {
      const width = ctx.measureText(tokens[i].value).width + 6 // 字符宽度 + 间距
      tokenWidths.push(width)
      totalWidth += width
    }
    
    // 存储 token 的命中区域
    mod.state.exprTokenRects = []
    let currentX = x + padding
    
    // 显示当前算式
    const text = buildExprDisplay()
    const emptyText = tokens.length === 0
    
    if (emptyText) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.font = '600 14px sans-serif'
      ctx.fillText('点数字 + 运算符，全部用完后点 =', x + padding, y + h / 2)
    } else {
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.font = '700 20px monospace'
      
      // 绘制每个 token
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]
        const tokenW = tokenWidths[i]
        
        // 存储命中区域
        mod.state.exprTokenRects.push({
          index: i,
          x: currentX,
          y: y + 8,
          w: tokenW,
          h: h - 16,
        })
        
        ctx.fillText(token.value, currentX, y + h / 2)
        currentX += tokenW
      }
      
      // 绘制光标（在光标位置或末尾）
      const cursorIdx = mod.state.cursorIndex
      let cursorX = currentX // 默认在末尾
      
      if (cursorIdx === -1) {
        // 光标在开头（第一个 token 前）
        cursorX = x + padding
      } else if (cursorIdx >= 0 && cursorIdx < tokens.length) {
        // 光标在某个 token 后
        cursorX = mod.state.exprTokenRects[cursorIdx].x + mod.state.exprTokenRects[cursorIdx].w
      }

      // 闪烁光标
      const blink = Math.floor(Date.now() / 500) % 2
      if (blink) {
        ctx.strokeStyle = '#ffd166'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(cursorX, y + 10)
        ctx.lineTo(cursorX, y + h - 10)
        ctx.stroke()
      }
    }

    // 清空算式按钮（不换题，只清当前输入）
    const cw = 72
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
    const last = getTokenBeforeCursor()
    if (!last) return { ok: false, msg: '先组好算式再点等于' }
    if (last.type === 'op') return { ok: false, msg: '不能以运算符结尾' }
    if (last.type === 'paren' && last.value === '(') return { ok: false, msg: '括号里要有内容' }
    return { ok: true }
  }

  function canAppendNum() {
    const tokens = mod.state.exprTokens
    const cursorIdx = mod.state.cursorIndex
    
    // 如果没有任何 token，可以插入
    if (tokens.length === 0) return true
    
    // cursorIdx = -1 表示在开头
    if (cursorIdx === -1) {
      // 检查第一个 token
      const first = tokens[0]
      if (first.type === 'op') return true
      if (first.type === 'paren' && first.value === '(') return true
      return false
    }
    
    // cursorIdx >= tokens.length - 1 表示在末尾
    if (cursorIdx >= tokens.length - 1) {
      const last = tokens[tokens.length - 1]
      if (last.type === 'op') return true
      if (last.type === 'paren' && last.value === '(') return true
      return false
    }
    
    // 光标在中间，检查光标后的 token
    const afterCursor = tokens[cursorIdx + 1]
    if (afterCursor.type === 'op') return true
    if (afterCursor.type === 'paren' && afterCursor.value === '(') return true
    return false
  }
  
  function canAppendOp() {
    const tokens = mod.state.exprTokens
    const cursorIdx = mod.state.cursorIndex
    
    // 如果没有任何 token，不能插入运算符
    if (tokens.length === 0) return false
    
    // cursorIdx = -1 表示在开头
    if (cursorIdx === -1) {
      // 开头不能放运算符（除非是左括号，但左括号有单独的逻辑）
      return false
    }
    
    // cursorIdx >= tokens.length - 1 表示在末尾
    if (cursorIdx >= tokens.length - 1) {
      const last = tokens[tokens.length - 1]
      if (last.type === 'num') return true
      if (last.type === 'paren' && last.value === ')') return true
      return false
    }
    
    // 光标在中间，检查光标前的 token
    const beforeCursor = tokens[cursorIdx]
    if (beforeCursor.type === 'num') return true
    if (beforeCursor.type === 'paren' && beforeCursor.value === ')') return true
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
      mod.state.cursorIndex = -1
      for (let i = 0; i < mod.state.numbers.length; i++) {
        mod.state.numbers[i].used = false
      }
      showToast('已清空当前运算')
      return true
    }
    
    // 检查是否点击了算式条中的 token（用于定位光标）
    if (mod.state.exprTokenRects) {
      for (let i = 0; i < mod.state.exprTokenRects.length; i++) {
        const rect = mod.state.exprTokenRects[i]
        if (pointInRect(x, y, rect)) {
          // 点击 token，将光标定位在这个 token 前
          // cursorIdx = i - 1 表示在第 i 个 token 前（即第 i-1 个 token 后）
          // 如果 i = 0，cursorIdx = -1 表示在第一个 token 前
          mod.state.cursorIndex = i - 1
          return true
        }
      }
      
      // 检查是否点击了算式条的空白区域（在所有 token 之后）
      const exprBarX = 16
      const exprBarY = state.h * 0.58
      const exprBarW = state.w - 32
      const exprBarH = 56
      const exprBarRect = { x: exprBarX, y: exprBarY, w: exprBarW, h: exprBarH }
      
      if (pointInRect(x, y, exprBarRect)) {
        // 点击了算式条但没有点到任何 token，光标移到末尾
        mod.state.cursorIndex = mod.state.exprTokens.length - 1
        return true
      }
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
      insertToken({ type: 'num', value: String(item.num.value) })
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
        
        // 调试信息：打印表达式
        console.log('=== 24点计算调试 ===')
        console.log('exprTokens:', mod.state.exprTokens)
        console.log('exprEval:', exprEval)
        console.log('exprDisplay:', exprDisplay)
        
        let value
        try {
          // 使用自定义表达式解析器替代 eval
          value = evaluateExpression(exprEval)
          console.log('计算结果:', value)
          
          if (value === null || !Number.isFinite(value)) {
            showToast('算式有误，请检查除数是否为0')
            mod.state.exprTokens = []
            for (let i = 0; i < mod.state.numbers.length; i++) mod.state.numbers[i].used = false
            return true
          }
        } catch (e) {
          console.error('❌ 计算错误:', e.message)
          console.error('表达式:', exprEval)
          showToast('算式有误: ' + e.message)
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
        const last = getTokenBeforeCursor()
        if (!(!last || last.type === 'op' || (last.type === 'paren' && last.value === '('))) {
          showToast('左括号位置不对')
          return true
        }
        insertToken({ type: 'paren', value: '(' })
        return true
      }
      if (label === ')') {
        const last = getTokenBeforeCursor()
        if (!(parenBalance() > 0 && last && (last.type === 'num' || (last.type === 'paren' && last.value === ')')))) {
          showToast('右括号位置不对')
          return true
        }
        insertToken({ type: 'paren', value: ')' })
        return true
      }
      if (!canAppendOp()) {
        showToast('不能连续点运算符')
        return true
      }
      insertToken({ type: 'op', value: label })
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

