// ═══════════════════════════════════════════
// LAGULEASE — Firebase Config & Utilities
// ═══════════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";


const firebaseConfig = {
  apiKey: "AIzaSyDYb4YywzBh6EUAAQSDf7SJMzuPrDduEcE",
  authDomain: "flotamax-2994b.firebaseapp.com",
  projectId: "flotamax-2994b",
  storageBucket: "flotamax-2994b.firebasestorage.app",
  messagingSenderId: "160535924045",
  appId: "1:160535924045:web:7d69b52db7182d5f473b04"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);


// ── Helpers ──────────────────────────────────────
export function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('es-MX');
}

export function fmtDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function getInitials(name) {
  return (name || '').split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}

export function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getThisMonday() {
  return getMondayOf(new Date());
}

export function getDiasRestantes(fechaStr) {
  if (!fechaStr) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const vence = new Date(fechaStr + 'T12:00:00');
  return Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24));
}

export function getMonthDocs(arr, year, month) {
  return arr.filter(p => {
    const d = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0);
    return d.getFullYear() === year && d.getMonth() === month - 1;
  });
}

export const avatarColors = [
  { bg: '#1a3a2a', text: '#22c55e' },
  { bg: '#1a2a3a', text: '#60a5fa' },
  { bg: '#3a1a2a', text: '#f472b6' },
  { bg: '#2a2a1a', text: '#fbbf24' },
  { bg: '#2a1a3a', text: '#a78bfa' },
  { bg: '#1a3a3a', text: '#34d399' },
];

// ── Driver debt calculation ───────────────────────
export function getDriverDebt(driver, payments) {
  if (!driver.inicio) return { status: 'pendiente', paid: 0, due: driver.renta, weeksOwed: 0, totalDebt: 0 };
  const startDate = new Date(driver.inicio + 'T12:00:00');
  const thisMonday = getThisMonday();
  const renta = Number(driver.renta || 0);
  let mondays = [], cursor = getMondayOf(startDate);
  while (cursor <= thisMonday) {
    mondays.push(new Date(cursor));
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
  }
  const totalPaid = payments.filter(p => p.driverId === driver.id).reduce((s, p) => s + Number(p.monto || 0), 0);
  const totalDebt = Math.max(0, mondays.length * renta - totalPaid);
  const weeksOwed = Math.floor(totalDebt / renta);
  const thisWeekMs = thisMonday.getTime();
  const thisWeekPaid = payments.filter(p => {
    if (p.driverId !== driver.id) return false;
    const pd = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0);
    return pd.getTime() >= thisWeekMs;
  }).reduce((s, p) => s + Number(p.monto || 0), 0);
  let status = 'pendiente';
  if (totalDebt === 0) status = 'al_corriente';
  else if (thisWeekPaid > 0 && thisWeekPaid < renta) status = 'parcial';
  else if (weeksOwed >= 2) status = 'atrasado';
  return { status, paid: thisWeekPaid, due: renta - thisWeekPaid, weeksOwed, totalDebt };
}

export function statusBadge(s) {
  return {
    al_corriente: { label: '✅ Al corriente', cls: 'badge-green' },
    pendiente: { label: '⏳ Pendiente', cls: 'badge-blue' },
    parcial: { label: '🟡 Parcial', cls: 'badge-yellow' },
    atrasado: { label: '🔴 Atrasado', cls: 'badge-red' },
  }[s] || { label: '⏳ Pendiente', cls: 'badge-blue' };
}

// ── Modal helpers ─────────────────────────────────
export function openModal(id) { document.getElementById(id).classList.add('open'); }
export function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ── CSV download ──────────────────────────────────
export function downloadCSV(rows, filename) {
  const bom = '\uFEFF';
  const csv = bom + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
