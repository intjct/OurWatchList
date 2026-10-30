// ฝั่งเซิร์ฟเวอร์ (Vercel) — ให้ Gemini สรุปเนื้อเรื่องเป็นภาษาไทย "ถึงตอนที่ดูแล้วเท่านั้น"
// คีย์ Gemini / TMDB และรายชื่ออีเมลที่ใช้ได้ เก็บใน Environment Variables ของ Vercel (ไม่อยู่ในโค้ดนี้)
import { verifyUser } from './tmdb.js'

const TMDB = 'https://api.themoviedb.org/3'
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest']
const BUDGET = 45000 // เป้าจำนวนตัวอักษรเรื่องย่อที่ส่งให้ AI (เรื่องยาวหลายร้อยตอนจะตัดแต่ละตอนให้สั้นลง ขั้นต่ำ 90 ตัวอักษร)

const SYSTEM = `คุณคือผู้ช่วยทบทวนเรื่องให้คนที่กำลังจะดูซีรีส์หรืออนิเมะต่อ
กติกาเด็ดขาด:
1. ใช้เฉพาะ "เรื่องย่อรายตอน" ที่ให้มาเท่านั้น ห้ามใช้ความรู้ภายนอก ห้ามเดา ห้ามแต่งเพิ่ม ห้ามเล่าเลยตอนสุดท้ายที่ให้มา
2. ถ้าข้อมูลบางตอนหายไป ให้เล่าเท่าที่มี ไม่ต้องเติมช่องว่างเอง
3. เขียนเป็นภาษาไทยที่อ่านง่ายสำหรับคนทั่วไป ประโยคสั้น ไม่ใช้ศัพท์ยาก แปลจากภาษาอังกฤษให้เป็นไทยธรรมชาติ
4. ชื่อตัวละครและชื่อสถานที่ ใช้ตามที่ปรากฏในข้อมูล
5. ตอบเป็น JSON ตามรูปแบบที่กำหนดเท่านั้น`

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    story: { type: 'STRING', description: 'เล่าเนื้อเรื่องตั้งแต่ต้นจนถึงตอนล่าสุดเป็นย่อหน้าต่อเนื่อง 120-200 คำ ตามลำดับเวลา' },
    characters: { type: 'ARRAY', items: { type: 'STRING' }, description: 'ตัวละครสำคัญไม่เกิน 5 คน รูปแบบ "ชื่อ — เป็นใคร/ทำอะไรในเรื่อง" สั้นๆ' },
    now: { type: 'STRING', description: 'สถานการณ์ ณ ตอนล่าสุดที่ให้มา ไม่เกิน 60 คำ' },
    open: { type: 'ARRAY', items: { type: 'STRING' }, description: 'เรื่องที่ยังค้างคา/ยังไม่รู้คำตอบ ไม่เกิน 4 ข้อ ข้อละไม่เกิน 20 คำ' },
  },
  required: ['story', 'characters', 'now', 'open'],
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const asList = (v, max) => (Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean).slice(0, max) : [])

export function makeRecapHandler({ verify = verifyUser, fetchImpl = fetch, env = process.env } = {}) {
  async function tmdb(path, params = {}) {
    const url = new URL(TMDB + path)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    const r = await fetchImpl(url, { headers: { Authorization: `Bearer ${env.TMDB_TOKEN}`, accept: 'application/json' } })
    if (!r.ok) throw new Error(`tmdb ${r.status}`)
    return r.json()
  }

  // รวมเรื่องย่อรายตอน: ซีซันก่อนหน้าทั้งซีซัน ซีซันปัจจุบันถึงตอนที่ดูเท่านั้น (ตอนที่ยังไม่ได้ดูไม่ถูกดึงมาใช้เลย)
  async function collect(id, curSeason, curEp) {
    const seasons = Array.from({ length: curSeason }, (_, i) => i + 1).filter((s) => !(s === curSeason && curEp === 0))
    const got = await Promise.all(
      seasons.map(async (s) => {
        const th = await tmdb(`/tv/${id}/season/${s}`, { language: 'th-TH' })
        const en = await tmdb(`/tv/${id}/season/${s}`, { language: 'en-US' }).catch(() => null)
        const enBy = new Map((en?.episodes || []).map((e) => [e.episode_number, e]))
        return (th.episodes || [])
          .filter((e) => s < curSeason || e.episode_number <= curEp)
          .map((e) => {
            const alt = enBy.get(e.episode_number)
            return { s, n: e.episode_number, name: e.name || alt?.name || '', text: e.overview || alt?.overview || '' }
          })
      }),
    )
    return got.flat()
  }

  function buildPrompt(title, eps, curSeason, curEp) {
    const withText = eps.filter((e) => e.text)
    const per = Math.max(90, Math.min(500, Math.floor(BUDGET / Math.max(1, withText.length)) - 30))
    const lines = withText.map((e) => `ซีซัน ${e.s} ตอน ${e.n}${e.name && !/^(ตอนที่|Episode)\s*\d+$/i.test(e.name) ? ` (${e.name})` : ''}: ${clip(e.text, per)}`)
    return {
      withText: withText.length,
      text: `เรื่อง: ${title || '(ไม่ระบุชื่อ)'}\nผู้ชมดูมาถึง: ซีซัน ${curSeason} ตอน ${curEp}\n\nเรื่องย่อรายตอน (เรียงตามลำดับ):\n${lines.join('\n')}`,
    }
  }

  // เรียกโมเดลหนึ่งตัว → { ok, ... } (ไม่โยนข้อผิดพลาด เพื่อให้ลองตัวถัดไปได้)
  async function tryModel(model, prompt) {
    const r = await fetchImpl(`${GEMINI}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
    })
    if (!r.ok) {
      let msg = ''
      try { msg = String((await r.json())?.error?.message || '') } catch { /* ไม่มีรายละเอียด */ }
      return { ok: false, status: r.status, msg }
    }
    const data = await r.json()
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
    const block = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason
    try {
      const j = JSON.parse(text)
      const out = { story: String(j.story || '').trim(), characters: asList(j.characters, 5), now: String(j.now || '').trim(), open: asList(j.open, 4) }
      if (out.story) return { ok: true, summary: out }
    } catch { /* ตอบไม่เป็น JSON */ }
    return { ok: false, status: 200, msg: `ตอบไม่ครบ (${block || 'empty'})` }
  }

  // ถามรายชื่อรุ่นที่บัญชีนี้ใช้ได้จริง (กรณีชื่อรุ่นที่เตรียมไว้ถูกยกเลิกไปแล้ว)
  async function discoverModels(tried) {
    try {
      const r = await fetchImpl(`${GEMINI}?pageSize=200`, { headers: { 'x-goog-api-key': env.GEMINI_KEY } })
      if (!r.ok) return []
      const list = (await r.json()).models || []
      const ver = (n) => Number((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0)
      return list
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => String(m.name || '').replace(/^models\//, ''))
        .filter((n) => /flash/.test(n) && !/(image|tts|live|audio|embedding|robotics|computer|thinking)/.test(n) && !tried.includes(n))
        .sort((a, b) => (/preview|exp/.test(a) - /preview|exp/.test(b)) || ver(b) - ver(a))
        .slice(0, 2)
    } catch { return [] }
  }

  async function askGemini(prompt) {
    const first = env.GEMINI_MODEL ? [env.GEMINI_MODEL] : DEFAULT_MODELS
    const tried = []
    let last = ''
    const attempt = async (model) => {
      tried.push(model)
      const res = await tryModel(model, prompt)
      if (res.ok) return { summary: res.summary, model }
      if (res.status === 429) { const e = new Error('quota'); e.code = 'quota'; throw e }
      if ((res.status === 400 || res.status === 401 || res.status === 403) && /api key|api_key|permission|credential|unauthenticated/i.test(res.msg)) {
        const e = new Error(res.msg); e.code = 'bad_key'; throw e
      }
      last = `${model} ${res.status}${res.msg ? ': ' + res.msg.slice(0, 120) : ''}`
      return null
    }
    for (const m of first) { const ok = await attempt(m); if (ok) return ok }
    for (const m of await discoverModels(tried)) { const ok = await attempt(m); if (ok) return ok }
    const e = new Error(last || 'gemini'); e.code = 'upstream'; e.detail = last; throw e
  }

  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') return res.status(405).json({ error: 'method' })
    if (!(await verify(req, env))) return res.status(401).json({ error: 'unauthorized' })
    if (!env.TMDB_TOKEN) return res.status(503).json({ error: 'not_configured' })
    if (!env.GEMINI_KEY) return res.status(503).json({ error: 'no_gemini' })

    const { id, season, episode, title } = req.query || {}
    if (!/^\d{1,9}$/.test(String(id)) || !/^\d{1,2}$/.test(String(season)) || !/^\d{1,4}$/.test(String(episode))) {
      return res.status(400).json({ error: 'bad_request' })
    }
    const curSeason = Number(season)
    const curEp = Number(episode)
    if (curSeason < 1 || (curSeason === 1 && curEp === 0)) return res.status(400).json({ error: 'nothing_watched' })

    try {
      const eps = await collect(id, curSeason, curEp)
      const { text, withText } = buildPrompt(String(title || '').slice(0, 100), eps, curSeason, curEp)
      if (!withText) return res.status(422).json({ error: 'no_data' })
      const { summary, model } = await askGemini(text)
      return res.status(200).json({ summary, model, basedOn: { episodes: eps.length, withText } })
    } catch (e) {
      if (e.code === 'quota') return res.status(429).json({ error: 'quota' })
      if (e.code === 'bad_key') return res.status(502).json({ error: 'bad_key' })
      console.error('recap failed:', String(e.detail || e.message || e).slice(0, 300)) // ไม่มีคีย์/ข้อมูลส่วนตัวในข้อความนี้
      return res.status(502).json({ error: 'upstream', detail: String(e.detail || e.message || '').slice(0, 160) })
    }
  }
}

export default makeRecapHandler()
