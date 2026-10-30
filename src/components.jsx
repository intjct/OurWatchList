import { useState, useEffect, useRef } from 'react'
import { tmdb } from './data'
import {
  CATS, STATUSES, catLabel, whoLabel, whoFromChoice, choiceFromWho, isShow,
  progressText, staleText, gradientFor, resizeImage, initialOf,
} from './lib'

const PATHS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  play: 'M8 5l11 7-11 7z',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  check: 'M4 12l5 5L20 6',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z',
  plus: 'M12 5v14M5 12h14',
}
export const Icon = ({ name }) => (
  <svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d={PATHS[name]} /></svg>
)

/* ---------- การ์ดแต่ละเรื่อง ---------- */
export function Card({ item, role, onOpen, onPlus, onFinish, onRecap }) {
  const show = isShow(item.category)
  const pct = show && item.totalEpisodes ? Math.min(100, Math.round(((item.episode || 0) / item.totalEpisodes) * 100)) : null
  const stale = staleText(item)
  const posterStyle = item.poster
    ? { backgroundImage: `url(${item.poster})` }
    : { backgroundImage: gradientFor(item.title) }
  return (
    <div className="card">
      <button className="poster" style={posterStyle} onClick={() => onOpen(item)} aria-label={`เปิด ${item.title}`}>
        {!item.poster && <span className="initial">{initialOf(item.title)}</span>}
        <span className="badge">{whoLabel(item.who, role)}</span>
        <span className="cat">{catLabel(item.category)}</span>
      </button>
      <div className="meta">
        <b>{item.title}</b>
        <small>{progressText(item)}</small>
        {pct !== null && <div className="bar"><i style={{ width: `${pct}%` }} /></div>}
        {stale && <span className="stale">{stale}</span>}
        {show && (item.episode > 0 || (item.season || 1) > 1) && <button className="link recap-link" onClick={() => onRecap(item)}>ทบทวนเรื่อง</button>}
        {item.status === 'watching' && show && <button className="plus" onClick={() => onPlus(item)}>+1 ตอน</button>}
        {item.status === 'watching' && !show && <button className="plus" onClick={() => onFinish(item)}>ดูจบแล้ว</button>}
        {item.status === 'plan' && <button className="plus" onClick={() => onPlus(item, true)}>เริ่มดู</button>}
      </div>
    </div>
  )
}

/* ---------- ฟอร์มเพิ่ม / แก้ไขเรื่อง ---------- */
export function MediaForm({ item, defaults, role, tmdbOn, onSave, onDelete, onClose }) {
  const editing = !!item?.id
  const init = item || defaults
  const [title, setTitle] = useState(init.title || '')
  const [category, setCategory] = useState(init.category || 'series')
  const [who, setWho] = useState(choiceFromWho(init.who || 'both', role))
  const [status, setStatus] = useState(init.status || 'watching')
  const [season, setSeason] = useState(init.season ?? 1)
  const [episode, setEpisode] = useState(init.episode ?? 0)
  const [total, setTotal] = useState(init.totalEpisodes ?? '')
  const [note, setNote] = useState(init.note || '')
  const [poster, setPoster] = useState(init.poster || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [askDelete, setAskDelete] = useState(false)
  const [meta, setMeta] = useState({ tmdbId: item?.tmdbId, tmdbType: item?.tmdbType, year: item?.year, overview: item?.overview })
  const [results, setResults] = useState(null) // null = ยังไม่ได้ค้นหา
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState('')
  const fileRef = useRef(null)
  const show = isShow(category)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onClose])

  // ค้นหาจาก TMDB — ทำเฉพาะตอนกดปุ่มเอง และเฉพาะเมื่อเปิดสวิตช์ในตั้งค่า
  async function search() {
    setSearchErr('')
    if (!title.trim()) return setSearchErr('พิมพ์ชื่อเรื่องก่อน แล้วค่อยกดค้นหา')
    setSearching(true)
    try { setResults((await tmdb('search', { q: title.trim() })).results) }
    catch (e) { setSearchErr(e.message); setResults(null) }
    finally { setSearching(false) }
  }
  async function pickResult(r) {
    setSearchErr('')
    setSearching(true)
    try {
      const d = await tmdb('detail', { id: r.id, type: r.type })
      let img = ''
      if (d.poster) { try { img = (await tmdb('poster', { path: d.poster })).dataUrl } catch { /* ไม่มีรูปก็ไม่เป็นไร */ } }
      setTitle(d.title || r.title)
      setCategory(d.category)
      if (img) setPoster(img)
      setMeta({ tmdbId: d.id, tmdbType: d.type, year: d.year, overview: d.overview })
      if (d.type === 'tv') {
        const s = d.seasons.find((x) => x.season === Number(season)) || d.seasons[0]
        if (s?.episodes) setTotal(s.episodes)
      }
      setResults(null)
    } catch (e) { setSearchErr(e.message) }
    finally { setSearching(false) }
  }

  async function pick(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setErr('')
    try { setPoster(await resizeImage(f)) } catch (x) { setErr(x.message) }
    e.target.value = ''
  }

  async function submit(e) {
    e.preventDefault()
    if (!title.trim()) return setErr('ใส่ชื่อเรื่องก่อนนะ')
    setBusy(true)
    const base = {
      ...(editing ? { id: item.id } : {}),
      title: title.trim(),
      category,
      who: whoFromChoice(who, role),
      status,
      note: note.trim(),
      poster: poster || '',
      ...(meta.tmdbId ? { tmdbId: meta.tmdbId, tmdbType: meta.tmdbType, year: meta.year || '', overview: meta.overview || '' } : {}),
    }
    if (show) {
      base.season = Math.max(1, Number(season) || 1)
      base.episode = Math.max(0, Number(episode) || 0)
      base.totalEpisodes = total === '' ? 0 : Math.max(0, Number(total) || 0)
    }
    const prevEp = item?.episode || 0
    if (status === 'watching' && (!editing || item.status !== 'watching' || base.episode !== prevEp)) {
      base.lastWatchedAt = Date.now()
    }
    if (status === 'done' && !item?.lastWatchedAt) base.lastWatchedAt = Date.now()
    try { await onSave(base); onClose() } catch { setErr('บันทึกไม่สำเร็จ ลองใหม่อีกครั้งนะ'); setBusy(false) }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit}>
        <h3>{editing ? 'แก้ไขเรื่องนี้' : 'เพิ่มเรื่องใหม่'}</h3>

        <div className="field">
          <label htmlFor="t">ชื่อเรื่อง</label>
          <input id="t" className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={!editing} placeholder="พิมพ์ชื่อเรื่อง" />
          {tmdbOn && (
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn ghost" onClick={search} disabled={searching}>{searching ? 'กำลังค้นหา…' : 'ค้นหาข้อมูลให้'}</button>
              <span style={{ color: 'var(--mu)', fontSize: 12, marginLeft: 10 }}>ดึงโปสเตอร์และเรื่องย่อมาให้</span>
            </div>
          )}
          {searchErr && <p className="err">{searchErr}</p>}
          {results && (
            <div className="results">
              {results.length === 0 && <p style={{ color: 'var(--mu)', fontSize: 13, padding: 10 }}>ไม่เจอเรื่องนี้ กรอกเองต่อได้เลย</p>}
              {results.map((r) => (
                <button type="button" key={`${r.type}${r.id}`} className="result" onClick={() => pickResult(r)} disabled={searching}>
                  <span className="rthumb" style={r.poster ? { backgroundImage: `url(https://image.tmdb.org/t/p/w92${r.poster})` } : { backgroundImage: gradientFor(r.title) }} />
                  <span><b>{r.title}</b><small>{[r.year, catLabel(r.category)].filter(Boolean).join(' · ')}{r.originalTitle && r.originalTitle !== r.title ? ` · ${r.originalTitle}` : ''}</small></span>
                </button>
              ))}
              <button type="button" className="link" style={{ padding: 10 }} onClick={() => setResults(null)}>ปิดรายการ</button>
            </div>
          )}
        </div>

        <div className="field">
          <span>ประเภท</span>
          <div className="seg">
            {CATS.map((c) => (
              <button type="button" key={c.id} className={category === c.id ? 'on' : ''} onClick={() => setCategory(c.id)}>{c.label}</button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>ใครดู</span>
          <div className="seg">
            {[['me', 'ฉัน'], ['partner', 'แฟน'], ['both', 'ด้วยกัน']].map(([id, label]) => (
              <button type="button" key={id} className={who === id ? 'on' : ''} onClick={() => setWho(id)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>สถานะ</span>
          <div className="seg">
            {STATUSES.map((s) => (
              <button type="button" key={s.id} className={status === s.id ? 'on' : ''} onClick={() => setStatus(s.id)}>{s.label}</button>
            ))}
          </div>
        </div>

        {show && (
          <div className="field">
            <span>ดูถึงตรงไหน</span>
            <div className="row2">
              <div><label htmlFor="s" style={{ fontSize: 11.5, color: 'var(--mu)' }}>ซีซัน</label><input id="s" type="number" min="1" inputMode="numeric" className="input" value={season} onChange={(e) => setSeason(e.target.value)} /></div>
              <div><label htmlFor="e" style={{ fontSize: 11.5, color: 'var(--mu)' }}>ตอนที่</label><input id="e" type="number" min="0" inputMode="numeric" className="input" value={episode} onChange={(e) => setEpisode(e.target.value)} /></div>
              <div><label htmlFor="n" style={{ fontSize: 11.5, color: 'var(--mu)' }}>มีกี่ตอน (ไม่ใส่ก็ได้)</label><input id="n" type="number" min="0" inputMode="numeric" className="input" value={total} onChange={(e) => setTotal(e.target.value)} /></div>
            </div>
          </div>
        )}

        <div className="field">
          <span>โปสเตอร์</span>
          <div className="upload">
            <div className="thumb" style={{ backgroundImage: poster ? `url(${poster})` : gradientFor(title || 'x') }} />
            <div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
              <button type="button" className="btn ghost" onClick={() => fileRef.current.click()}>{poster ? 'เปลี่ยนรูป' : 'เลือกรูปจากเครื่อง'}</button>
              {poster && <button type="button" className="link" style={{ marginLeft: 12 }} onClick={() => setPoster('')}>เอารูปออก</button>}
            </div>
          </div>
        </div>

        {meta.overview && (
          <div className="field">
            <span>เรื่องย่อ{meta.year ? ` (${meta.year})` : ''}</span>
            <p className="overview">{meta.overview}</p>
          </div>
        )}

        <div className="field">
          <label htmlFor="note">โน้ตสั้นๆ (ไม่ใส่ก็ได้)</label>
          <textarea id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ตอนนี้พระเอกรู้ความลับแล้ว" />
        </div>

        {err && <p className="err">{err}</p>}

        {askDelete && (
          <div className="warnbox">
            <b>ลบ “{item.title}” ใช่ไหม?</b><br />ลบแล้วเอากลับมาไม่ได้นะ
            <div className="actions">
              <button type="button" className="btn ghost" onClick={() => setAskDelete(false)}>ไม่ลบ</button>
              <button type="button" className="btn danger" onClick={async () => { await onDelete(item); onClose() }}>ลบเลย</button>
            </div>
          </div>
        )}

        {!askDelete && (
          <div className="actions">
            {editing && <button type="button" className="link" style={{ color: '#c0453d' }} onClick={() => setAskDelete(true)}>ลบเรื่องนี้</button>}
            <span className="spacer" />
            <button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button>
            <button type="submit" className="btn" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          </div>
        )}
      </form>
    </div>
  )
}

/* ---------- แจ้งเตือนเล็กๆ (มีปุ่มถอยกลับ) ---------- */
export function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
  }, [toast, onClose])
  if (!toast) return null
  return (
    <div className="toast" role="status">
      <span>{toast.text}</span>
      {toast.undo && <button onClick={() => { toast.undo(); onClose() }}>ถอยกลับ</button>}
    </div>
  )
}

/* ---------- แถบ "มีเวอร์ชันใหม่" (รอให้กดเอง ไม่เด้งเอง) ---------- */
export function useUpdateCheck() {
  const [hasNew, setHasNew] = useState(false)
  const [checking, setChecking] = useState(false)
  async function check() {
    try {
      setChecking(true)
      const r = await fetch('/version.json', { cache: 'no-store' })
      if (!r.ok) return false
      const v = await r.json()
      const isNew = String(v.build) !== __BUILD_ID__
      if (isNew) setHasNew(true)
      return isNew
    } catch { return false } finally { setChecking(false) }
  }
  useEffect(() => {
    const first = setTimeout(check, 4000)
    const iv = setInterval(check, 5 * 60 * 1000)
    const onVis = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVis)
    return () => { clearTimeout(first); clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [])
  return { hasNew, checking, check }
}

export function UpdateBanner({ show }) {
  if (!show) return null
  return (
    <div className="update" role="alert">
      <span>มีเวอร์ชันใหม่</span>
      <button onClick={() => location.reload()}>อัปเดตเลย</button>
    </div>
  )
}

/* ---------- ทบทวนเรื่อง: เรื่องย่อรายตอนถึงตอนที่ดูมาแล้วเท่านั้น ---------- */
const cacheKey = (id, season) => `ow-recap:${id}:${season}`
function readCache(id, season) { try { return JSON.parse(localStorage.getItem(cacheKey(id, season))) } catch { return null } }
function writeCache(id, season, v) { try { localStorage.setItem(cacheKey(id, season), JSON.stringify(v)) } catch { /* ไม่เป็นไร */ } }

export function Recap({ item, tmdbOn, enableTmdb, onClose, onEdit }) {
  const curSeason = item.season || 1
  const curEp = item.episode || 0
  const linked = !!item.tmdbId && item.tmdbType === 'tv'
  const [state, setState] = useState({ status: linked ? 'loading' : 'unlinked', seasons: [], err: '' })

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!linked) return
    let dead = false
    ;(async () => {
      const seasons = []
      let needNet = false
      // ซีซันที่ผ่านมาแล้วดูได้ทั้งซีซัน ซีซันปัจจุบันดูถึงตอนที่ดูแล้วเท่านั้น
      const want = []
      for (let s = 1; s <= curSeason; s++) {
        const upTo = s === curSeason ? curEp : undefined
        if (s === curSeason && curEp === 0) continue
        want.push({ s, upTo })
      }
      const missing = []
      for (const w of want) {
        const c = readCache(item.tmdbId, w.s)
        const fresh = c && (c.full || (w.upTo !== undefined && c.upTo >= w.upTo))
        if (fresh) seasons.push({ season: w.s, ...c, episodes: c.episodes.filter((e) => w.upTo === undefined || e.n <= w.upTo) })
        else missing.push(w)
      }
      if (missing.length && !tmdbOn) needNet = true
      if (needNet) return !dead && setState({ status: 'needs_switch', seasons: [], err: '' })
      try {
        for (const w of missing) {
          const params = { id: item.tmdbId, season: w.s }
          if (w.upTo !== undefined) params.upTo = w.upTo
          const d = await tmdb('season', params)
          writeCache(item.tmdbId, w.s, { full: w.upTo === undefined, upTo: w.upTo, total: d.total, episodes: d.episodes })
          seasons.push({ season: w.s, total: d.total, episodes: d.episodes })
        }
      } catch (e) {
        return !dead && setState({ status: 'error', seasons: [], err: e.message })
      }
      seasons.sort((a, b) => a.season - b.season)
      if (!dead) setState({ status: 'ready', seasons, err: '' })
    })()
    return () => { dead = true }
  }, [item.tmdbId, item.tmdbType, curSeason, curEp, tmdbOn, linked])

  const all = state.seasons.flatMap((s) => s.episodes)
  const withText = all.filter((e) => e.overview).length

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet recap">
        <h3>ทบทวนเรื่อง · {item.title}</h3>
        <p className="scope">
          {curEp === 0 && curSeason === 1 ? 'ยังไม่ได้เริ่มดู ยังไม่มีอะไรให้ทบทวน' : `สรุปถึง ซีซัน ${curSeason} ตอน ${curEp} (ไม่มีตอนที่ยังไม่ได้ดู)`}
        </p>

        {state.status === 'loading' && <p className="muted">กำลังดึงเรื่องย่อ…</p>}
        {state.status === 'unlinked' && (
          <div className="warnbox soft">
            เรื่องนี้ยังไม่ได้เชื่อมกับข้อมูลออนไลน์ จึงยังไม่มีเรื่องย่อรายตอน<br />
            วิธีเชื่อม: เปิดสวิตช์ค้นหาในตั้งค่า → กด “แก้ไขเรื่องนี้” → “ค้นหาข้อมูลให้” → เลือกเรื่องที่ตรง แล้วกดบันทึก
          </div>
        )}
        {state.status === 'needs_switch' && (
          <div className="warnbox soft">
            ต้องดึงเรื่องย่อจากอินเทอร์เน็ตก่อน แต่สวิตช์ค้นหาปิดอยู่ (ดึงครั้งเดียว ครั้งต่อไปเก็บไว้ในเครื่องนี้แล้วเปิดดูได้เลย)
            <div className="actions"><button className="btn" onClick={enableTmdb}>เปิดสวิตช์แล้วดึงเรื่องย่อ</button></div>
          </div>
        )}
        {state.status === 'error' && <p className="err">{state.err}</p>}

        {state.status === 'ready' && (
          <>
            <p className="muted">มีเรื่องย่อ {withText} จาก {all.length} ตอนที่ดูมาแล้ว{withText < all.length ? ' — ตอนที่ไม่มีเรื่องย่อ แอปจะไม่แต่งเนื้อเรื่องให้' : ''}</p>
            {[...state.seasons].reverse().map((s) => (
              <details key={s.season} open={s.season === curSeason}>
                <summary>ซีซัน {s.season}{s.season === curSeason ? ` · ถึงตอน ${curEp}` : ` · ครบ ${s.episodes.length} ตอน`}</summary>
                {s.episodes.map((e) => (
                  <div className="ep" key={e.n}>
                    <b>ตอน {e.n}{e.name && !/^(ตอนที่|Episode)\s*\d+$/i.test(e.name) ? ` · ${e.name}` : ''}</b>
                    {e.overview
                      ? <p>{e.overview}{e.lang === 'en' && <em> (เรื่องย่อภาษาอังกฤษ)</em>}</p>
                      : <p className="none">ไม่มีเรื่องย่อของตอนนี้</p>}
                  </div>
                ))}
              </details>
            ))}
            <p className="muted" style={{ marginTop: 10, fontSize: 11.5 }}>นับซีซันตามข้อมูลของ TMDB ซึ่งอาจไม่ตรงกับที่เรานับ โดยเฉพาะอนิเมะ</p>
          </>
        )}

        {item.note && (
          <div className="field" style={{ marginTop: 16 }}>
            <span>โน้ตของเรา</span>
            <p className="overview">{item.note}</p>
          </div>
        )}

        <div className="actions">
          <button className="btn ghost" onClick={() => { onClose(); onEdit(item) }}>แก้ไขเรื่องนี้</button>
          <button className="btn" onClick={onClose}>ปิด</button>
        </div>
      </div>
    </div>
  )
}
