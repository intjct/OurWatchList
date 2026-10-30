import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth, useMedia, DEMO } from './data'
import { Card, MediaForm, Recap, Toast, UpdateBanner, useUpdateCheck, Icon, Dot } from './components'
import { roleOf, CATS } from './lib'

const PAGES = [
  { id: 'home', label: 'หน้าแรก', icon: 'home', title: 'ดูต่อเลย' },
  { id: 'plan', label: 'อยากดู', icon: 'bookmark', title: 'อยากดู', dot: 'plan' },
  { id: 'watching', label: 'กำลังดู', icon: 'play', title: 'กำลังดู', dot: 'watching' },
  { id: 'done', label: 'ดูจบแล้ว', icon: 'check', title: 'ดูจบแล้ว', dot: 'done' },
  { id: 'settings', label: 'ตั้งค่า', icon: 'gear', title: 'ตั้งค่า' },
]

/* ---------- ธีม สว่าง/มืด ---------- */
function useTheme() {
  const read = () => { try { return localStorage.getItem('ow-theme') || 'system' } catch { return 'system' } }
  const [pref, setPref] = useState(read)
  const [sysDark, setSysDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const fn = (e) => setSysDark(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  const dark = pref === 'dark' || (pref === 'system' && sysDark)
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#12161d' : '#f3f4f6')
  }, [dark])
  const set = (p) => { setPref(p); try { localStorage.setItem('ow-theme', p) } catch { /* ไม่เป็นไร */ } }
  return { pref, dark, set, toggle: () => set(dark ? 'light' : 'dark') }
}

/* ---------- สวิตช์ค้นหาจากอินเทอร์เน็ต (ปิดไว้เป็นค่าเริ่มต้น จำค่าไว้ในเครื่องนี้) ---------- */
function useTmdbSwitch() {
  const [on, setOn] = useState(() => { try { return localStorage.getItem('ow-tmdb') === '1' } catch { return false } })
  const set = (v) => { setOn(v); try { localStorage.setItem('ow-tmdb', v ? '1' : '0') } catch { /* ไม่เป็นไร */ } }
  return [on, set]
}

export default function App() {
  const theme = useTheme()
  const [tmdbOn, setTmdbOn] = useTmdbSwitch()
  const auth = useAuth()
  const update = useUpdateCheck()
  const role = roleOf(auth.user?.email)
  const { items, ready, denied, save, remove } = useMedia(!!auth.user)

  const [page, setPage] = useState('home')
  const [tab, setTab] = useState('both')
  const [cat, setCat] = useState('all')
  const [query, setQuery] = useState('')
  const [form, setForm] = useState(null) // null = ปิด, {item} = แก้, {defaults} = เพิ่ม
  const [recap, setRecap] = useState(null)
  const [toast, setToast] = useState(null)
  const closeToast = useCallback(() => setToast(null), [])

  const other = role === 'tam' ? 'gf' : 'tam'

  const list = useMemo(() => {
    const statuses = { home: ['watching'], watching: ['watching'], plan: ['plan'], done: ['done', 'dropped'] }[page] || []
    const q = query.trim().toLowerCase()
    let out = items.filter((x) => statuses.includes(x.status))
    out = out.filter((x) => (tab === 'mine' ? x.who === role : tab === 'both' ? x.who === 'both' : x.who === other))
    if (cat !== 'all') out = out.filter((x) => x.category === cat)
    if (q) out = out.filter((x) => `${x.title} ${x.altTitles || ''}`.toLowerCase().includes(q))
    const key = page === 'plan' ? 'updatedAt' : 'lastWatchedAt'
    return out.sort((a, b) => (b[key] || b.updatedAt || 0) - (a[key] || a.updatedAt || 0))
  }, [items, page, tab, cat, query, role, other])

  const shown = page === 'home' ? list.slice(0, 6) : list

  function openAdd() {
    setForm({
      defaults: {
        category: cat === 'all' ? 'series' : cat,
        who: tab === 'mine' ? role : tab === 'both' ? 'both' : other,
        status: page === 'plan' ? 'plan' : page === 'done' ? 'done' : 'watching',
      },
    })
  }

  async function plus(item, startOnly) {
    const before = { status: item.status, episode: item.episode || 0, lastWatchedAt: item.lastWatchedAt || 0 }
    const next = startOnly
      ? { ...item, status: 'watching', lastWatchedAt: Date.now() }
      : { ...item, status: 'watching', episode: before.episode + 1, lastWatchedAt: Date.now() }
    await save(next)
    setToast({
      text: startOnly ? `เริ่มดู “${item.title}” แล้ว` : `“${item.title}” ดูถึงตอน ${next.episode} แล้ว`,
      undo: () => save({ ...item, ...before }),
    })
  }
  // เพิ่มเรื่องใหม่แล้ว พาไปหน้า/แท็บที่เรื่องนั้นอยู่เลย (กันงงว่าหายไปไหน)
  async function saveItem(item) {
    const isNew = !item.id
    await save(item)
    if (!isNew) return
    const where = item.status === 'plan' ? 'plan' : item.status === 'watching' ? 'watching' : 'done'
    setPage(where)
    setTab(item.who === 'both' ? 'both' : item.who === role ? 'mine' : 'partner')
    setCat('all')
    setQuery('')
    setToast({ text: `เพิ่ม “${item.title}” แล้ว — อยู่ที่หน้า “${PAGES.find((p) => p.id === where).label}”` })
  }
  async function finish(item) {
    const before = { status: item.status, lastWatchedAt: item.lastWatchedAt || 0 }
    await save({ ...item, status: 'done', lastWatchedAt: Date.now() })
    setToast({ text: `ย้าย “${item.title}” ไปดูจบแล้ว`, undo: () => save({ ...item, ...before }) })
  }

  /* ----- หน้าก่อนเข้าแอป ----- */
  if (auth.loading) return <div className="center"><p style={{ color: 'var(--mu)' }}>กำลังโหลด…</p></div>
  if (!auth.user) return <Login onSignIn={auth.signIn} error={auth.error} />
  if (denied) return <Denied email={auth.user.email} onOut={auth.signOut} />

  const pageInfo = PAGES.find((p) => p.id === page)
  const isSettings = page === 'settings'

  return (
    <div className="app">
      <UpdateBanner show={update.hasNew} />

      <aside className="side">
        <div className="brand">Our Watchlist</div>
        {PAGES.map((p) => (
          <button key={p.id} className={`nav-item ${page === p.id ? 'on' : ''}`} onClick={() => setPage(p.id)}><Dot status={p.dot} />{p.label}</button>
        ))}
      </aside>

      <main className="main">
        <div className="mobile-brand">Our Watchlist</div>
        <div className="top">
          <div>
            <h2>{pageInfo.dot && <Dot status={pageInfo.dot} />}{pageInfo.title}</h2>
            {!isSettings && <p>{page === 'home' ? `เรื่องที่ดูค้างอยู่ ${list.length} เรื่อง` : `${list.length} เรื่อง`}</p>}
          </div>
          <div className="right">
            {!isSettings && <input className="search" placeholder="ค้นหาเรื่อง…" value={query} onChange={(e) => setQuery(e.target.value)} />}
            <button className="icon-btn" onClick={theme.toggle} aria-label={theme.dark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'} title={theme.dark ? 'โหมดสว่าง' : 'โหมดมืด'}>
              <Icon name={theme.dark ? 'sun' : 'moon'} />
            </button>
            {!isSettings && <button className="btn add" onClick={openAdd}>+ เพิ่มเรื่องใหม่</button>}
            {!isSettings && <button className="icon-btn fill m-add" onClick={openAdd} aria-label="เพิ่มเรื่องใหม่"><Icon name="plus" /></button>}
          </div>
        </div>

        {isSettings ? (
          <Settings theme={theme} email={auth.user.email} onOut={auth.signOut} update={update} tmdbOn={tmdbOn} setTmdbOn={setTmdbOn} />
        ) : (
          <>
            <input className="search-m" placeholder="ค้นหาเรื่อง…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="tabs" role="tablist">
              {[['both', 'ด้วยกัน'], ['partner', 'ของแฟน'], ['mine', 'ของฉัน']].map(([id, label]) => (
                <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{id === 'both' && <Icon name="heart" />}{label}</button>
              ))}
            </div>
            <div className="chips">
              {[{ id: 'all', label: 'ทั้งหมด' }, ...CATS].map((c) => (
                <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.label}</button>
              ))}
            </div>

            {!ready ? (
              <div className="empty">กำลังโหลด…</div>
            ) : shown.length === 0 ? (
              <div className="empty">
                <b>{query ? 'ไม่เจอเรื่องที่ค้นหา' : 'ยังไม่มีเรื่องตรงนี้'}</b>
                {query ? 'ลองพิมพ์ชื่ออื่นดูนะ' : 'กดปุ่มด้านล่างเพื่อเพิ่มเรื่องแรกได้เลย'}
                {!query && <div><button className="btn" onClick={openAdd}>+ เพิ่มเรื่องใหม่</button></div>}
              </div>
            ) : (
              <>
                <div className="grid">
                  {shown.map((it) => (
                    <Card key={it.id} item={it} role={role} onOpen={(item) => setForm({ item })} onPlus={plus} onFinish={finish} onRecap={setRecap} />
                  ))}
                </div>
                {page === 'home' && list.length > 6 && (
                  <p style={{ marginTop: 22 }}><button className="link" onClick={() => setPage('watching')}>ดูทั้งหมดที่กำลังดู ({list.length}) →</button></p>
                )}
              </>
            )}
          </>
        )}
      </main>

      <nav className="bottom">
        {PAGES.map((p) => (
          <button key={p.id} className={`${page === p.id ? 'on' : ''} ${p.dot ? 's-' + p.dot : ''}`} onClick={() => setPage(p.id)}>
            <Icon name={p.icon} />{p.label}
          </button>
        ))}
      </nav>

      {form && (
        <MediaForm
          item={form.item}
          defaults={form.defaults}
          role={role}
          tmdbOn={tmdbOn}
          onSave={saveItem}
          onDelete={(it) => remove(it.id)}
          onClose={() => setForm(null)}
        />
      )}
      {recap && <Recap item={items.find((x) => x.id === recap.id) || recap} tmdbOn={tmdbOn} enableTmdb={() => setTmdbOn(true)} onClose={() => setRecap(null)} onEdit={(item) => setForm({ item })} />}
      <Toast toast={toast} onClose={closeToast} />
      {DEMO && <div style={{ position: 'fixed', top: 0, right: 0, background: '#b4642f', color: '#fff', fontSize: 11, padding: '2px 8px' }}>โหมดตัวอย่าง</div>}
    </div>
  )
}

function Login({ onSignIn, error }) {
  return (
    <div className="center">
      <div className="login">
        <img className="logo" src="/icon.svg" alt="" />
        <h1>Our Watchlist</h1>
        <p>สมุดดูหนัง ซีรีส์ อนิเมะ ของเราสองคน<br />เข้าสู่ระบบเพื่อดูรายการของเรา</p>
        <button className="btn" onClick={onSignIn}>เข้าสู่ระบบด้วย Google</button>
        {error && <p className="err">{error}</p>}
      </div>
    </div>
  )
}

function Denied({ email, onOut }) {
  return (
    <div className="center">
      <div className="login">
        <h1>บัญชีนี้ยังเข้าไม่ได้</h1>
        <p>{email}<br />สมุดนี้เปิดให้เฉพาะ 2 บัญชีที่ได้รับอนุญาต<br />ลองเข้าด้วยบัญชี Google อื่นดูนะ</p>
        <button className="btn" onClick={onOut}>ออกจากระบบ</button>
      </div>
    </div>
  )
}

function Settings({ theme, email, onOut, update, tmdbOn, setTmdbOn }) {
  const [msg, setMsg] = useState('')
  async function check() {
    const isNew = await update.check()
    setMsg(isNew ? '' : 'ตอนนี้เป็นเวอร์ชันล่าสุดแล้ว')
  }
  return (
    <>
      <div className="panel">
        <h4>หน้าตา</h4>
        <div className="seg">
          {[['system', 'ตามเครื่อง'], ['light', 'สว่าง'], ['dark', 'มืด']].map(([id, label]) => (
            <button key={id} className={theme.pref === id ? 'on' : ''} onClick={() => theme.set(id)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="switch">
          <div>
            <b>ค้นหาข้อมูลเรื่องจากอินเทอร์เน็ต</b>
            <p>เปิดแล้วจะมีปุ่ม “ค้นหาข้อมูลให้” ในฟอร์มเพิ่มเรื่อง เพื่อดึงโปสเตอร์และเรื่องย่อมาให้ และปุ่ม “ทบทวนเรื่อง” จะให้ AI สรุปเนื้อเรื่องเป็นภาษาไทยให้ ปิดไว้ = ไม่ดึงอะไรจากข้างนอกเลย กรอกเองได้เหมือนเดิม และจะทำก็ต่อเมื่อคุณกดปุ่มเองเท่านั้น</p>
          </div>
          <button className={`toggle ${tmdbOn ? 'on' : ''}`} role="switch" aria-checked={tmdbOn} aria-label="ค้นหาข้อมูลเรื่องจากอินเทอร์เน็ต" onClick={() => setTmdbOn(!tmdbOn)} />
        </div>
      </div>
      <div className="panel">
        <h4>บัญชี</h4>
        <div className="line"><span>เข้าสู่ระบบอยู่ด้วย</span><span>{email}</span></div>
        <div className="actions"><button className="btn ghost" onClick={onOut}>ออกจากระบบ</button></div>
      </div>
      <div className="panel">
        <h4>เกี่ยวกับโปรแกรม</h4>
        <div className="line"><span>เวอร์ชัน</span><span>{__APP_VERSION__}</span></div>
        <div className="actions">
          {msg && <span style={{ color: 'var(--mu)', fontSize: 13, alignSelf: 'center' }}>{msg}</span>}
          <button className="btn ghost" onClick={check} disabled={update.checking}>{update.checking ? 'กำลังเช็ก…' : 'เช็กเวอร์ชันใหม่'}</button>
        </div>
      </div>
      <p className="credit">ข้อมูลโปสเตอร์และเรื่องย่อมาจาก TMDB ส่วนสรุปภาษาไทยเรียบเรียงโดย Gemini ของ Google — This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </>
  )
}
