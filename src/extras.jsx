import { useState, useEffect, useRef } from 'react'
import { CATS, catLabel, gradientFor, initialOf, isShow } from './lib'

/* ---------- ส่วนเสริม: สุ่มเรื่อง และ จับคู่ ---------- */

const poster = (it) => (it.poster ? { backgroundImage: `url(${it.poster})` } : { backgroundImage: gradientFor(it.title) })
const today = () => new Date().toISOString().slice(0, 10)

// เรื่องที่กด “ข้ามเรื่องนี้” ในหน้าสุ่ม จะไม่ถูกสุ่มซ้ำภายในวันเดียวกัน
function readSkip() {
  try {
    const v = JSON.parse(localStorage.getItem('ow-skip'))
    return v && v.date === today() ? v.ids : []
  } catch { return [] }
}
function writeSkip(ids) { try { localStorage.setItem('ow-skip', JSON.stringify({ date: today(), ids })) } catch { /* ไม่เป็นไร */ } }
const DEFAULT_OPT = { cat: 'all', whose: 'all', pool: 'plan' }
function readOpt() {
  try { return { ...DEFAULT_OPT, ...JSON.parse(localStorage.getItem('ow-random')) } } catch { return DEFAULT_OPT }
}

const WHOSE = [['both', 'ด้วยกัน'], ['partner', 'ของแฟน'], ['mine', 'ของฉัน'], ['all', 'ทุกคน']]
const POOLS = [['plan', 'อยากดู (เรื่องใหม่)'], ['watching', 'กำลังดู (ดูค้างอยู่)']]

export function RandomDialog({ items, role, onClose, onStart, onInvite }) {
  const [opt, setOpt] = useState(readOpt)
  const [phase, setPhase] = useState('setup') // setup | rolling | result | empty
  const [shown, setShown] = useState(null)
  const [skipped, setSkipped] = useState(readSkip)
  const timer = useRef(null)
  const partnerRole = role === 'tam' ? 'gf' : 'tam'

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onClose])
  // หยุดตัวหมุนเมื่อปิดหน้าต่างเท่านั้น (ไม่หยุดเมื่อหน้าแอปวาดใหม่ เช่นตอนแถบแจ้งเตือนหายไป)
  useEffect(() => () => clearInterval(timer.current), [])

  const poolOf = (skip) => items.filter((x) =>
    x.status === opt.pool &&
    (opt.cat === 'all' || x.category === opt.cat) &&
    (opt.whose === 'all' || (opt.whose === 'both' ? x.who === 'both' : opt.whose === 'mine' ? x.who === role : x.who === partnerRole)) &&
    !skip.includes(x.id))

  function roll(avoidId, skip = skipped) {
    try { localStorage.setItem('ow-random', JSON.stringify(opt)) } catch { /* ไม่เป็นไร */ }
    const p = poolOf(skip)
    if (!p.length) return setPhase('empty')
    const cand = p.length > 1 && avoidId ? p.filter((x) => x.id !== avoidId) : p
    const pick = cand[Math.floor(Math.random() * cand.length)]
    setPhase('rolling')
    clearInterval(timer.current)
    let n = 0
    timer.current = setInterval(() => {
      n++
      if (n >= 12) { clearInterval(timer.current); setShown(pick); setPhase('result') }
      else setShown(p[Math.floor(Math.random() * p.length)])
    }, 90)
  }
  function skipThis(cur) {
    const next = [...skipped, cur.id]
    setSkipped(next)
    writeSkip(next)
    roll(cur.id, next)
  }

  const cur = shown && (items.find((x) => x.id === shown.id) || shown)
  const canInvite = cur && phase === 'result' && cur.status === 'plan' && cur.who === partnerRole && !cur.invite
  const set = (k, v) => setOpt((o) => ({ ...o, [k]: v }))

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet rnd">
        <h3>🎲 สุ่มเรื่องที่จะดู</h3>

        {phase === 'setup' && (
          <>
            <div className="field"><span>อยากดูอะไร</span>
              <div className="seg">{[['all', 'ทั้งหมด'], ...CATS.map((c) => [c.id, c.label])].map(([id, l]) => (
                <button key={id} className={opt.cat === id ? 'on' : ''} onClick={() => set('cat', id)}>{l}</button>))}</div></div>
            <div className="field"><span>สุ่มจากของใคร</span>
              <div className="seg">{WHOSE.map(([id, l]) => <button key={id} className={opt.whose === id ? 'on' : ''} onClick={() => set('whose', id)}>{l}</button>)}</div></div>
            <div className="field"><span>สุ่มจากหมวด</span>
              <div className="seg">{POOLS.map(([id, l]) => <button key={id} className={opt.pool === id ? 'on' : ''} onClick={() => set('pool', id)}>{l}</button>)}</div></div>
            <div className="actions">
              <button className="btn ghost" onClick={onClose}>ยกเลิก</button>
              <button className="btn" onClick={() => roll()}>สุ่มเลย</button>
            </div>
          </>
        )}

        {phase === 'empty' && (
          <>
            <div className="empty" style={{ padding: '30px 10px' }}>
              <b>ไม่มีเรื่องให้สุ่มตามตัวเลือกนี้</b>
              ลองเปลี่ยนประเภท เลือก “ทุกคน” หรือสลับหมวดดูนะ
              {skipped.length > 0 && <div><button className="link" onClick={() => { setSkipped([]); writeSkip([]) }}>ล้างเรื่องที่ข้ามไว้วันนี้ ({skipped.length})</button></div>}
            </div>
            <div className="actions"><button className="btn" onClick={() => setPhase('setup')}>กลับไปเลือกใหม่</button></div>
          </>
        )}

        {(phase === 'rolling' || phase === 'result') && shown && (
          <>
            <div className={`pick ${phase === 'rolling' ? 'rolling' : ''}`}>
              <div className="poster-s" style={poster(cur)}>{!cur.poster && <span className="initial">{initialOf(cur.title)}</span>}</div>
              <div>
                <b className="pick-t">{phase === 'rolling' ? 'กำลังสุ่ม…' : cur.title}</b>
                {phase === 'result' && (
                  <p className="muted">
                    {catLabel(cur.category)}{isShow(cur.category) && cur.totalEpisodes ? ` · ${cur.totalEpisodes} ตอน` : ''}
                    {' · '}{cur.who === 'both' ? 'ด้วยกัน' : cur.who === role ? 'ของฉัน' : 'ของแฟน'}
                  </p>
                )}
                {canInvite && <div className="invite">เรื่องนี้เป็นของแฟน ชวนเธอดูด้วยกันได้</div>}
                {phase === 'result' && cur.invite && cur.who !== role && <div className="invite">💌 ชวนไปแล้ว รอเธอตอบ</div>}
              </div>
            </div>
            {phase === 'result' && (
              <div className="actions rnd-actions">
                <button className="btn ghost" onClick={() => roll(cur.id)}>สุ่มใหม่</button>
                <button className="btn ghost" onClick={() => skipThis(cur)}>ข้ามเรื่องนี้</button>
                <span className="spacer" />
                {canInvite && <button className="btn ghost" onClick={() => onInvite(cur)}>💌 ชวนดูด้วยกัน</button>}
                <button className="btn" onClick={() => { onClose(); onStart(cur) }}>{cur.status === 'plan' ? 'เริ่มดูเลย' : 'ไปดูต่อเลย'}</button>
              </div>
            )}
            {phase === 'result' && <p className="muted" style={{ textAlign: 'right' }}><button className="link" onClick={() => setPhase('setup')}>เปลี่ยนตัวเลือก</button></p>}
          </>
        )}
      </div>
    </div>
  )
}

/* ---------- จับคู่: เลือกเรื่องในอยากดูของแฟนที่อยากดูด้วย ---------- */
export function MatchPage({ items, role, onVote, onTogether }) {
  const partnerRole = role === 'tam' ? 'gf' : 'tam'
  const [passed, setPassed] = useState([])
  const queue = items
    .filter((x) => x.status === 'plan' && x.who === partnerRole && !x.votes?.[role])
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  const q = queue.filter((x) => !passed.includes(x.id))
  const cur = q[0]
  const matches = items.filter((x) => x.status === 'plan' && ((x.who === role && x.votes?.[partnerRole] === 'up') || (x.who === partnerRole && x.votes?.[role] === 'up')))

  return (
    <div className="match-wrap">
      <div className="swipe">
        {cur ? (
          <>
            <p className="cap">เรื่องในอยากดูของแฟน — ถ้าอยากดูด้วย กด 👍 <small>(เหลือ {q.length} เรื่อง)</small></p>
            <div className="poster-l" style={poster(cur)}>
              {!cur.poster && <span className="initial">{initialOf(cur.title)}</span>}
              <span className="badge">ของแฟน</span>
            </div>
            <b className="sw-t">{cur.title}</b>
            <small className="muted">{catLabel(cur.category)}{isShow(cur.category) && cur.totalEpisodes ? ` · ${cur.totalEpisodes} ตอน` : ''}</small>
            <div className="vote">
              <button onClick={() => onVote(cur, 'down')}>👎 ไม่เอา</button>
              <button onClick={() => setPassed((p) => [...p, cur.id])}>ข้าม</button>
              <button className="up" onClick={() => onVote(cur, 'up')}>👍 อยากดูด้วย</button>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>กด 👎 แฟนจะไม่เห็นเลย</p>
          </>
        ) : queue.length > 0 ? (
          <div className="empty" style={{ padding: '40px 10px' }}>
            <b>ข้ามไว้ {queue.length} เรื่อง</b>
            <button className="btn" onClick={() => setPassed([])}>ดูอีกครั้ง</button>
          </div>
        ) : (
          <div className="empty" style={{ padding: '40px 10px' }}>
            <b>ดูครบทุกเรื่องแล้ว 🎉</b>
            ไว้มีเรื่องใหม่ในอยากดูของแฟน แล้วค่อยกลับมานะ
          </div>
        )}
      </div>

      <div className="matches">
        <p className="cap">ตรงกันแล้ว 🎉 (ทั้งสองคนอยากดู)</p>
        {matches.length === 0 && <p className="muted">ยังไม่มีเรื่องที่ตรงกัน กด 👍 กับเรื่องที่อยากดูด้วยได้เลย</p>}
        {matches.map((m) => (
          <div className="match" key={m.id}>
            <div className="mthumb" style={poster(m)} />
            <div className="grow">
              <b>{m.title}</b>
              <div className="muted" style={{ margin: 0 }}>{m.who === partnerRole ? 'แฟนอยากดู · คุณกด 👍' : 'คุณอยากดู · แฟนกด 👍'}</div>
            </div>
            <button className="btn" style={{ padding: '8px 12px' }} onClick={() => onTogether(m)}>ดูด้วยกัน</button>
          </div>
        ))}
      </div>
    </div>
  )
}

export const countToVote = (items, role) => items.filter((x) => x.status === 'plan' && x.who !== role && x.who !== 'both' && !x.votes?.[role]).length
