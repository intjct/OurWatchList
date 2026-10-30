// ค่าคงที่และฟังก์ชันช่วยเล็กๆ

export const TAM_EMAIL = 'intjct@gmail.com' // ใครล็อกอินด้วยอีเมลนี้ = แตม ที่เหลือ = แฟน

export const roleOf = (email) => (email === TAM_EMAIL ? 'tam' : 'gf')

export const CATS = [
  { id: 'series', label: 'ซีรีส์' },
  { id: 'anime', label: 'อนิเมะ' },
  { id: 'movie', label: 'หนัง' },
]
export const catLabel = (id) => CATS.find((c) => c.id === id)?.label ?? ''

export const STATUSES = [
  { id: 'watching', label: 'กำลังดู' },
  { id: 'plan', label: 'อยากดู' },
  { id: 'done', label: 'ดูจบแล้ว' },
  { id: 'dropped', label: 'เลิกดู' },
]
export const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label ?? ''

// ใครดู: เก็บเป็น tam / gf / both แล้วแปลงเป็น ฉัน / แฟน / ด้วยกัน ตามคนที่เปิดแอป
export const whoLabel = (who, role) => (who === 'both' ? 'ด้วยกัน' : who === role ? 'ฉัน' : 'แฟน')
export const whoFromChoice = (choice, role) =>
  choice === 'both' ? 'both' : choice === 'me' ? role : role === 'tam' ? 'gf' : 'tam'
export const choiceFromWho = (who, role) => (who === 'both' ? 'both' : who === role ? 'me' : 'partner')

export const isShow = (cat) => cat !== 'movie'

export function timeAgo(ms) {
  if (!ms) return ''
  const days = Math.floor((Date.now() - ms) / 86400000)
  if (days <= 0) return 'วันนี้'
  if (days === 1) return 'เมื่อวาน'
  if (days < 7) return `${days} วันก่อน`
  if (days < 30) return `${Math.floor(days / 7)} สัปดาห์ก่อน`
  return `${Math.floor(days / 30)} เดือนก่อน`
}

// เรื่องที่กำลังดูแต่ไม่ได้ดูนาน → ขึ้นป้ายเตือนให้อัตโนมัติ
export function staleText(item) {
  if (item.status !== 'watching' || !item.lastWatchedAt) return ''
  const days = Math.floor((Date.now() - item.lastWatchedAt) / 86400000)
  if (days < 14) return ''
  return days < 30 ? `ไม่ได้ดู ${Math.floor(days / 7)} สัปดาห์` : `ไม่ได้ดู ${Math.floor(days / 30)} เดือน`
}

export function progressText(item) {
  if (!isShow(item.category)) return statusLabel(item.status)
  if (item.status === 'plan') return 'ยังไม่ได้เริ่ม'
  if (!item.episode) return `ซีซัน ${item.season || 1} · ยังไม่ได้เริ่ม`
  return `ซีซัน ${item.season || 1} · ตอน ${item.episode}`
}

// ตัวอักษรกลางโปสเตอร์สำรอง: ข้ามสระนำหน้า (เ แ โ ใ ไ) ให้ได้พยัญชนะตัวแรก
export function initialOf(title = '') {
  const chars = [...title]
  return chars.find((c) => !'เแโใไ'.includes(c) && /[\p{L}\p{N}]/u.test(c)) || chars[0] || ''
}

// สีโปสเตอร์สำรอง (กรณียังไม่ได้อัปโหลดรูป) เลือกตามชื่อเรื่อง
const PAIRS = [
  ['#5c6b8a', '#9fb0cf'],
  ['#7a5c5c', '#d0a79a'],
  ['#4f6f63', '#9cc2b0'],
  ['#665a80', '#b4a6d1'],
  ['#7a6a45', '#d6c68f'],
  ['#41647a', '#92bfd4'],
]
export function gradientFor(title = '') {
  let h = 0
  for (const ch of title) h = (h * 31 + ch.codePointAt(0)) >>> 0
  const [a, b] = PAIRS[h % PAIRS.length]
  return `linear-gradient(160deg, ${b}, ${a})`
}

// ย่อรูปโปสเตอร์ให้เล็กก่อนเก็บ (ไม่เกิน ~400px) จะได้ไม่กินที่ฟรี
export function resizeImage(file, maxW = 400, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width)
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      let out = c.toDataURL('image/webp', quality)
      if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', quality)
      resolve(out)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('เปิดรูปนี้ไม่ได้'))
    }
    img.src = url
  })
}
