const STORAGE_USER_KEY = 'gameUserProfile'
const STORAGE_OPENID_KEY = 'gameUserOpenid'

const COLL_RECORD = 'game_rank_records'
const COLL_SUMMARY = 'game_rank_summary'
const OPENID_FUNC = 'getOpenid'

function createRankService() {
  const svc = {
    inited: false,
    db: null,
    profile: null,
    openid: '',
  }

  function now() {
    return Date.now()
  }

  function initCloud() {
    if (svc.inited) return true
    try {
      if (!wx.cloud) return false
      wx.cloud.init({ traceUser: true })
      svc.db = wx.cloud.database()
      svc.inited = true
      return true
    } catch (e) {
      return false
    }
  }

  function loadLocalProfile() {
    if (svc.profile) return svc.profile
    try {
      const v = wx.getStorageSync(STORAGE_USER_KEY)
      if (v && typeof v.nickName === 'string') {
        svc.profile = v
        return svc.profile
      }
    } catch (e) {}
    return null
  }

  function saveLocalProfile(profile) {
    svc.profile = profile
    try {
      wx.setStorageSync(STORAGE_USER_KEY, profile)
    } catch (e) {}
  }

  function loadOpenidCache() {
    if (svc.openid) return svc.openid
    try {
      const v = wx.getStorageSync(STORAGE_OPENID_KEY)
      if (v && typeof v === 'string') {
        svc.openid = v
        return svc.openid
      }
    } catch (e) {}
    return ''
  }

  function saveOpenidCache(openid) {
    if (!openid) return
    svc.openid = openid
    try {
      wx.setStorageSync(STORAGE_OPENID_KEY, openid)
    } catch (e) {}
  }

  function ensureUserProfile(interactive) {
    const cached = loadLocalProfile()
    if (cached) return Promise.resolve(cached)

    return new Promise((resolve) => {
      const fallback = { nickName: '游客', avatarUrl: '' }
      if (!interactive) {
        saveLocalProfile(fallback)
        resolve(fallback)
        return
      }

      if (wx.getUserProfile) {
        wx.getUserProfile({
          desc: '用于排行榜展示昵称和头像',
          success: (res) => {
            const userInfo = res && res.userInfo ? res.userInfo : fallback
            const profile = {
              nickName: userInfo.nickName || '游客',
              avatarUrl: userInfo.avatarUrl || '',
            }
            saveLocalProfile(profile)
            resolve(profile)
          },
          fail: () => {
            saveLocalProfile(fallback)
            resolve(fallback)
          },
        })
        return
      }

      saveLocalProfile(fallback)
      resolve(fallback)
    })
  }

  async function ensureOpenid() {
    if (!initCloud()) return ''
    const cached = loadOpenidCache()
    if (cached) return cached
    try {
      const ret = await wx.cloud.callFunction({ name: OPENID_FUNC, data: {} })
      const result = (ret && ret.result) || {}
      const openid = result.openid || ''
      if (openid) saveOpenidCache(openid)
      return openid
    } catch (e) {
      return ''
    }
  }

  async function getMySummary(moduleKey, openid) {
    if (!initCloud() || !openid) return null
    const ret = await svc.db.collection(COLL_SUMMARY).where({ moduleKey, openid }).limit(1).get()
    const rows = (ret && ret.data) || []
    return rows.length ? rows[0] : null
  }

  async function computeRank(moduleKey, myLevel, myScore) {
    if (!initCloud()) return null
    const list = await svc.db
      .collection(COLL_SUMMARY)
      .where({ moduleKey })
      .orderBy('bestLevel', 'desc')
      .orderBy('bestScore', 'desc')
      .orderBy('updatedAt', 'asc')
      .limit(1000)
      .get()
    const rows = (list && list.data) || []
    if (!rows.length) return null
    let rank = 1
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const lv = Number(row.bestLevel || 0)
      const sc = Number(row.bestScore || 0)
      if (lv > myLevel || (lv === myLevel && sc > myScore)) rank += 1
    }
    return rank
  }

  async function refreshRank(moduleKey) {
    if (!initCloud()) return { rank: null, summary: null }
    try {
      const openid = await ensureOpenid()
      if (!openid) return { rank: null, summary: null }
      const my = await getMySummary(moduleKey, openid)
      if (!my) return { rank: null, summary: null }
      const rank = await computeRank(moduleKey, Number(my.bestLevel || 0), Number(my.bestScore || 0))
      return { rank, summary: my }
    } catch (e) {
      return { rank: null, summary: null }
    }
  }

  async function upsertSummary(moduleKey, openid, level, score, timeUsed) {
    const profile = await ensureUserProfile(false)
    const mine = await getMySummary(moduleKey, openid)
    const bestLevel = Number(level || 0)
    const bestScore = Number(score || 0)
    const bestTimeUsed = Number(timeUsed || 0)

    if (!mine) {
      await svc.db.collection(COLL_SUMMARY).add({
        data: {
          moduleKey,
          openid,
          bestLevel,
          bestScore,
          nickName: profile.nickName || '游客',
          avatarUrl: profile.avatarUrl || '',
          bestTimeUsed,
          updatedAt: now(),
        },
      })
      return
    }

    const nextLevel = Math.max(Number(mine.bestLevel || 0), bestLevel)
    const nextScore = Math.max(Number(mine.bestScore || 0), bestScore)
    const nextTime = Number(mine.bestTimeUsed || 0) > 0 ? Math.min(Number(mine.bestTimeUsed || 0), bestTimeUsed || Number.MAX_SAFE_INTEGER) : bestTimeUsed
    await svc.db.collection(COLL_SUMMARY).doc(mine._id).update({
      data: {
        bestLevel: nextLevel,
        bestScore: nextScore,
        bestTimeUsed: nextTime > Number.MAX_SAFE_INTEGER ? 0 : nextTime,
        nickName: profile.nickName || mine.nickName || '游客',
        avatarUrl: profile.avatarUrl || mine.avatarUrl || '',
        updatedAt: now(),
      },
    })
  }

  async function reportPass(params) {
    const { moduleKey, level, score, timeUsed } = params
    if (!initCloud()) return { uploaded: false, rank: null, reason: 'cloud-not-ready' }

    const openid = await ensureOpenid()
    if (!openid) return { uploaded: false, rank: null, reason: 'openid-empty' }

    await ensureUserProfile(false)

    const levelNum = Number(level || 0)
    const scoreNum = Number(score || 0)
    const timeNum = Number(timeUsed || 0)

    try {
      const existsRet = await svc.db.collection(COLL_RECORD).where({ moduleKey, openid, level: levelNum }).limit(1).get()
      const exists = existsRet && Array.isArray(existsRet.data) && existsRet.data.length > 0
      if (!exists) {
        await svc.db.collection(COLL_RECORD).add({
          data: {
            moduleKey,
            openid,
            level: levelNum,
            score: scoreNum,
            timeUsed: timeNum,
            createdAt: now(),
          },
        })
      }

      await upsertSummary(moduleKey, openid, levelNum, scoreNum, timeNum)
      const rankState = await refreshRank(moduleKey)
      return { uploaded: !exists, rank: rankState.rank }
    } catch (e) {
      return { uploaded: false, rank: null, reason: 'db-error' }
    }
  }

  return {
    initCloud,
    ensureUserProfile,
    ensureOpenid,
    refreshRank,
    reportPass,
  }
}

module.exports = { createRankService }
