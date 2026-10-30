import { useEffect, useState, useCallback } from 'react'
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut as fbSignOut, onAuthStateChanged } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
} from 'firebase/firestore'
import { TAM_EMAIL } from './lib'

// ค่าพวกนี้เป็นค่าสาธารณะของ Firebase (ไม่ใช่รหัสลับ) ความปลอดภัยอยู่ที่กฎของฐานข้อมูล
const firebaseConfig = {
  apiKey: 'AIzaSyBSyzvqlMg26tgtLGecrmObbwFmUY94kIo',
  authDomain: 'our-watchlist-50724.firebaseapp.com',
  projectId: 'our-watchlist-50724',
  storageBucket: 'our-watchlist-50724.firebasestorage.app',
  messagingSenderId: '434371509208',
  appId: '1:434371509208:web:ea61a4f098f54a73e890ad',
}

// โหมดตัวอย่าง (ใช้ตอนทำภาพตัวอย่างเท่านั้น ไม่เปิดในเว็บจริง)
export const DEMO = import.meta.env.VITE_DEMO === '1'

let app, auth, db
if (!DEMO) {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  // เก็บสำเนาไว้ในเครื่อง → เปิดดูและแก้ตอนไม่มีเน็ตได้ ต่อเน็ตแล้วซิงก์เอง
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
}

/* ---------- ล็อกอิน ---------- */
export function useAuth() {
  const [state, setState] = useState({ user: DEMO ? { email: TAM_EMAIL } : null, loading: !DEMO, error: '' })

  useEffect(() => {
    if (DEMO) return
    return onAuthStateChanged(auth, (u) => setState((s) => ({ ...s, user: u, loading: false })))
  }, [])

  const signIn = useCallback(async () => {
    if (DEMO) return
    setState((s) => ({ ...s, error: '' }))
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    try {
      await signInWithPopup(auth, provider)
    } catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider)
      } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        setState((s) => ({ ...s, error: 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้งนะ' }))
      }
    }
  }, [])

  const signOut = useCallback(() => (DEMO ? undefined : fbSignOut(auth)), [])
  return { ...state, signIn, signOut }
}

/* ---------- รายการเรื่อง ---------- */
const now = Date.now()
const day = 86400000
const seed = [
  { id: 'd1', title: 'เงาในหมอก', category: 'series', who: 'both', status: 'watching', season: 2, episode: 8, totalEpisodes: 12, lastWatchedAt: now - 1 * day },
  { id: 'd2', title: 'ดาบสุดท้าย', category: 'anime', who: 'gf', status: 'watching', season: 1, episode: 12, totalEpisodes: 24, lastWatchedAt: now - 3 * day },
  { id: 'd3', title: 'ฤดูร้อนที่หายไป', category: 'series', who: 'tam', status: 'watching', season: 1, episode: 4, totalEpisodes: 16, lastWatchedAt: now - 20 * day },
  { id: 'd4', title: 'เมืองใต้ทะเล', category: 'anime', who: 'both', status: 'watching', season: 3, episode: 20, totalEpisodes: 25, lastWatchedAt: now - 2 * day },
  { id: 'd5', title: 'คืนสุดท้ายที่โตเกียว', category: 'movie', who: 'tam', status: 'watching', lastWatchedAt: now - 5 * day },
  { id: 'd6', title: 'ห้องเลขที่ 7', category: 'series', who: 'gf', status: 'watching', season: 1, episode: 2, totalEpisodes: 10, lastWatchedAt: now - 9 * day },
  { id: 'd7', title: 'บ้านริมคลอง', category: 'series', who: 'both', status: 'plan' },
  { id: 'd8', title: 'ปลายทางของดวงดาว', category: 'movie', who: 'both', status: 'done', lastWatchedAt: now - 60 * day },
].map((x) => ({ createdAt: now, updatedAt: now, ...x }))

const demoListeners = new Set()
let demoItems = seed
const demoEmit = () => demoListeners.forEach((fn) => fn(demoItems))

export function useMedia(enabled) {
  const [items, setItems] = useState([])
  const [ready, setReady] = useState(false)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (!enabled) return
    if (DEMO) {
      const fn = (list) => { setItems(list); setReady(true) }
      demoListeners.add(fn)
      fn(demoItems)
      return () => demoListeners.delete(fn)
    }
    return onSnapshot(
      collection(db, 'media'),
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setReady(true)
        setDenied(false)
      },
      (err) => {
        if (err.code === 'permission-denied') setDenied(true)
        setReady(true)
      },
    )
  }, [enabled])

  // บันทึก (เพิ่มใหม่หรือแก้ของเดิม) — ถ้าไม่มี id จะสร้าง id ใหม่ให้
  const save = useCallback(async (item) => {
    const id = item.id || (DEMO ? 'd' + Math.random().toString(36).slice(2, 8) : doc(collection(db, 'media')).id)
    const data = { ...item, id: undefined, updatedAt: Date.now() }
    if (!item.id) data.createdAt = Date.now()
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k])
    if (DEMO) {
      const old = demoItems.find((x) => x.id === id)
      demoItems = old ? demoItems.map((x) => (x.id === id ? { ...old, ...data } : x)) : [...demoItems, { id, ...data }]
      demoEmit()
      return id
    }
    await setDoc(doc(db, 'media', id), data, { merge: true })
    return id
  }, [])

  const remove = useCallback(async (id) => {
    if (DEMO) {
      demoItems = demoItems.filter((x) => x.id !== id)
      demoEmit()
      return
    }
    await deleteDoc(doc(db, 'media', id))
  }, [])

  return { items, ready, denied, save, remove }
}
