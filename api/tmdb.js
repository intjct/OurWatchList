// ฝั่งเซิร์ฟเวอร์ (Vercel) — ค้นหาข้อมูลจาก TMDB ให้แอป
// คีย์ TMDB และรายชื่ออีเมลที่ใช้ได้ เก็บใน Environment Variables ของ Vercel (ไม่อยู่ในโค้ดนี้)
import { createRemoteJWKSet, jwtVerify } from 'jose'

const PROJECT = 'our-watchlist-50724'
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)
const TMDB = 'https://api.themoviedb.org/3'

// ตรวจว่าคนที่เรียกเป็นหนึ่งในสองบัญชีที่ได้รับอนุญาตจริง (กันคนนอกมาใช้โควตา)
export async function verifyUser(req, env = process.env) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT}`,
      audience: PROJECT,
    })
    const email = String(payload.email || '').toLowerCase()
    const allowed = String(env.ALLOWED_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)
    if (!payload.email_verified || !allowed.includes(email)) return null
    return email
  } catch {
    return null
  }
}

const yearOf = (d) => (d ? String(d).slice(0, 4) : '')

// เดาประเภท: การ์ตูน (genre 16) ที่ต้นฉบับเป็นภาษาญี่ปุ่น = อนิเมะ
function guessCategory(type, genreIds = [], lang = '') {
  if (type === 'movie') return 'movie'
  return genreIds.includes(16) && lang === 'ja' ? 'anime' : 'series'
}

export function makeHandler({ verify = verifyUser, fetchImpl = fetch, env = process.env } = {}) {
  async function tmdb(path, params = {}) {
    const url = new URL(TMDB + path)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    const r = await fetchImpl(url, { headers: { Authorization: `Bearer ${env.TMDB_TOKEN}`, accept: 'application/json' } })
    if (!r.ok) throw new Error(`tmdb ${r.status}`)
    return r.json()
  }

  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') return res.status(405).json({ error: 'method' })
    if (!(await verify(req, env))) return res.status(401).json({ error: 'unauthorized' })
    if (!env.TMDB_TOKEN) return res.status(503).json({ error: 'not_configured' })

    const { action, q, id, type, path, season, upTo } = req.query || {}
    try {
      if (action === 'search') {
        const query = String(q || '').trim().slice(0, 100)
        if (!query) return res.status(400).json({ error: 'bad_request' })
        const data = await tmdb('/search/multi', { query, language: 'th-TH', include_adult: 'false' })
        const results = (data.results || [])
          .filter((x) => x.media_type === 'tv' || x.media_type === 'movie')
          .slice(0, 8)
          .map((x) => ({
            id: x.id,
            type: x.media_type,
            title: x.title || x.name || '',
            originalTitle: x.original_title || x.original_name || '',
            year: yearOf(x.release_date || x.first_air_date),
            poster: x.poster_path || '',
            category: guessCategory(x.media_type, x.genre_ids, x.original_language),
          }))
        return res.status(200).json({ results })
      }

      if (action === 'detail') {
        if (!/^\d{1,9}$/.test(String(id)) || !['tv', 'movie'].includes(type)) return res.status(400).json({ error: 'bad_request' })
        const d = await tmdb(`/${type}/${id}`, { language: 'th-TH' })
        let overview = d.overview || ''
        if (!overview) {
          // ไม่มีเรื่องย่อภาษาไทย → ใช้ภาษาอังกฤษแทน และบอกให้รู้
          const en = await tmdb(`/${type}/${id}`, { language: 'en-US' }).catch(() => null)
          overview = en?.overview || ''
        }
        const seasons = (d.seasons || [])
          .filter((s) => s.season_number > 0)
          .map((s) => ({ season: s.season_number, episodes: s.episode_count || 0 }))
        return res.status(200).json({
          id: d.id,
          type,
          title: d.title || d.name || '',
          year: yearOf(d.release_date || d.first_air_date),
          overview,
          poster: d.poster_path || '',
          seasons,
          category: guessCategory(type, (d.genres || []).map((g) => g.id), d.original_language),
        })
      }

      // เรื่องย่อรายตอนของซีซันหนึ่ง — ถ้าระบุ upTo เซิร์ฟเวอร์จะส่งมาแค่ถึงตอนนั้น (ตอนที่ยังไม่ได้ดูไม่ถูกส่งออกไปเลย กันสปอยล์)
      if (action === 'season') {
        if (!/^\d{1,9}$/.test(String(id)) || !/^\d{1,3}$/.test(String(season)) || (upTo !== undefined && !/^\d{1,4}$/.test(String(upTo)))) {
          return res.status(400).json({ error: 'bad_request' })
        }
        const th = await tmdb(`/tv/${id}/season/${season}`, { language: 'th-TH' })
        const en = await tmdb(`/tv/${id}/season/${season}`, { language: 'en-US' }).catch(() => null)
        const enByNum = new Map((en?.episodes || []).map((e) => [e.episode_number, e]))
        let episodes = (th.episodes || []).map((e) => {
          const alt = enByNum.get(e.episode_number)
          const overview = e.overview || alt?.overview || ''
          return {
            n: e.episode_number,
            name: e.name || alt?.name || '',
            overview,
            lang: e.overview ? 'th' : alt?.overview ? 'en' : '',
          }
        })
        const total = episodes.length
        if (upTo !== undefined) episodes = episodes.filter((e) => e.n <= Number(upTo))
        return res.status(200).json({ season: Number(season), total, episodes })
      }

      if (action === 'poster') {
        if (!/^\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(String(path))) return res.status(400).json({ error: 'bad_request' })
        const r = await fetchImpl(`https://image.tmdb.org/t/p/w342${path}`)
        if (!r.ok) throw new Error('image')
        const buf = Buffer.from(await r.arrayBuffer())
        const mime = r.headers.get('content-type') || 'image/jpeg'
        return res.status(200).json({ dataUrl: `data:${mime};base64,${buf.toString('base64')}` })
      }

      return res.status(400).json({ error: 'bad_request' })
    } catch {
      return res.status(502).json({ error: 'upstream' })
    }
  }
}

export default makeHandler()
