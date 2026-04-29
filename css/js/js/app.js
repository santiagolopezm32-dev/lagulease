// ═══════════════════════════════════════════
// LAGULEASE — Main App Logic
// ═══════════════════════════════════════════
import { db, auth, fmt, fmtDate, getInitials, getThisMonday, getMondayOf,
         getDiasRestantes, getMonthDocs, avatarColors, getDriverDebt,
         statusBadge, openModal, closeModal, downloadCSV } from './firebase.js';

import { collection, doc, addDoc, updateDoc, deleteDoc,
         onSnapshot, query, orderBy, serverTimestamp } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { signOut, onAuthStateChanged } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ── State ─────────────────────────────────────────
let currentUser = null;
let userRole = 'asistente'; // 'admin' or 'asistente'
let drivers = [], payments = [], gastos = [], gastosFijos = [];
let inventario = [], movimientos = [], servicios = [], aportaciones = [], flota = [];
let currentFilter = 'todos';
let editingDriverId = null, payingDriverId = null, editingCarroId = null, editingDocDriverId = null;

// Admin emails - add your email and asistente email here
const ADMIN_EMAILS = ['santiagolopezm32@gmail.com'];

// ── Auth ──────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (!user) { window.location.href = 'index.html'; return; }
  currentUser = user;
  userRole = ADMIN_EMAILS.includes(user.email) ? 'admin' : 'asistente';
  setupUI();
  startListeners();
  registerSW();
});

window.doLogout = async () => { await signOut(auth); };

function setupUI() {
  const email = currentUser.email;
  const initials = email.substring(0, 2).toUpperCase();
  document.getElementById('nav-avatar').textContent = initials;
  document.getElementById('nav-email').textContent = email;
  const roleBadge = document.getElementById('nav-role-badge');
  roleBadge.textContent = userRole === 'admin' ? 'Admin' : 'Asistente';
  roleBadge.className = `nav-role-badge ${userRole === 'admin' ? 'role-admin' : 'role-asistente'}`;

  // Show/hide admin-only sections
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = userRole === 'admin' ? '' : 'none';
  });
}

// ── Service Worker ────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ── Listeners ─────────────────────────────────────
function startListeners() {
  onSnapshot(collection(db, 'drivers'), snap => {
    drivers = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderAll();
  });
  onSnapshot(query(collection(db, 'payments'), orderBy('createdAt', 'desc')), snap => {
    payments = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderAll();
  });
  onSnapshot(query(collection(db, 'gastos'), orderBy('createdAt', 'desc')), snap => {
    gastos = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderFinanciero();
  });
  onSnapshot(collection(db, 'gastos_fijos'), snap => {
    gastosFijos = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderGastosFijos(); renderFinanciero();
  });
  onSnapshot(collection(db, 'inventario'), snap => {
    inventario = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderInventario();
  });
  onSnapshot(query(collection(db, 'movimientos_inv'), orderBy('createdAt', 'desc')), snap => {
    movimientos = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderInventario(); renderFinanciero();
  });
  onSnapshot(query(collection(db, 'servicios'), orderBy('createdAt', 'desc')), snap => {
    servicios = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderServicios();
  });
  onSnapshot(query(collection(db, 'aportaciones'), orderBy('createdAt', 'desc')), snap => {
    aportaciones = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderFinanciero();
  });
  onSnapshot(collection(db, 'flota'), snap => {
    flota = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderFlota();
  });
}

// ── Tabs ──────────────────────────────────────────
window.switchTab = function(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${name}"]`).classList.add('active');
  document.getElementById('page-' + name).classList.add('active');
  if (name === 'financiero') renderFinanciero();
  if (name === 'reportes') renderReportes();
  if (name === 'contratos') renderContratos();
};

window.setFilter = function(f, el) {
  currentFilter = f;
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  renderChoferes();
};

window.closeModalById = function(id) { closeModal(id); };

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

// ── Render All ────────────────────────────────────
function renderAll() {
  renderKPIs();
  renderResumen();
  renderChoferes();
  renderCobros();
  renderDocumentos();
  showWeeklyChecklist();
}

// ── KPIs ──────────────────────────────────────────
function renderKPIs() {
  const active = drivers.filter(d => d.activo !== false);
  const statuses = active.map(d => getDriverDebt(d, payments));
  const alCorriente = statuses.filter(s => s.status === 'al_corriente').length;
  const cobrado = statuses.reduce((s, st) => s + st.paid, 0);
  const totalDeuda = statuses.reduce((s, st) => s + st.totalDebt, 0);
  const meta = active.reduce((s, d) => s + Number(d.renta || 0), 0);
  const pct = meta > 0 ? Math.min(100, (cobrado / meta * 100)).toFixed(0) : 0;

  document.getElementById('kpi-flota').textContent = active.length;
  document.getElementById('kpi-corriente').textContent = alCorriente;
  document.getElementById('kpi-pendientes').textContent = active.length - alCorriente;
  document.getElementById('kpi-cobrado').textContent = fmt(cobrado);
  document.getElementById('kpi-deuda').textContent = fmt(totalDeuda);
  document.getElementById('week-cobrado').textContent = fmt(cobrado);
  document.getElementById('week-falta').textContent = fmt(meta - cobrado);
  document.getElementById('week-meta').textContent = fmt(meta);
  document.getElementById('week-bar').style.width = pct + '%';
  document.getElementById('week-pct').textContent = pct + '% del objetivo semanal cobrado';

  if (userRole === 'admin') renderChart();
}

// ── Chart ─────────────────────────────────────────
let chartInstance = null;
function renderChart() {
  const now = new Date();
  const labels = [], data = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear(), m = d.getMonth() + 1;
    labels.push(d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }));
    data.push(getMonthDocs(payments, y, m).reduce((s, p) => s + Number(p.monto || 0), 0));
  }
  const ctx = document.getElementById('chart-ingresos');
  if (!ctx) return;
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Ingresos',
        data,
        backgroundColor: 'rgba(34,197,94,0.2)',
        borderColor: '#22c55e',
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => fmt(ctx.raw) }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#5a5f7a' } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#5a5f7a', callback: v => fmt(v) } }
      }
    }
  });
}

// ── Resumen ───────────────────────────────────────
function renderResumen() {
  const active = drivers.filter(d => d.activo !== false);
  const urgentes = active.filter(d => {
    const s = getDriverDebt(d, payments);
    return s.totalDebt > 0 || s.status === 'parcial';
  }).sort((a, b) => getDriverDebt(b, payments).totalDebt - getDriverDebt(a, payments).totalDebt).slice(0, 5);

  const alertasEl = document.getElementById('alertas-list');
  if (urgentes.length === 0) {
    alertasEl.innerHTML = '<div class="all-good">✅ Sin alertas — todos al corriente esta semana</div>';
  } else {
    alertasEl.innerHTML = urgentes.map(d => {
      const st = getDriverDebt(d, payments);
      return `<div class="cobro-card ${st.weeksOwed >= 2 ? 'urgent' : st.status === 'parcial' ? 'partial' : ''}">
        <div>
          <div class="fw7">${d.nombre}</div>
          <div class="pay-info">${d.placa} · ${st.weeksOwed > 0 ? `<span style="color:var(--red)">${st.weeksOwed} sem adeudadas</span>` : 'Pendiente'}</div>
        </div>
        <div class="cobro-right">
          <div class="mono fw7 text-red">${fmt(st.totalDebt || st.due)}</div>
          <button class="btn btn-primary btn-sm" onclick="openPayModal('${d.id}')">Cobrar</button>
        </div>
      </div>`;
    }).join('');
  }

  const ultEl = document.getElementById('ultimos-pagos');
  const recent = payments.slice(0, 6);
  if (recent.length === 0) { ultEl.innerHTML = '<div class="empty-small">Sin pagos registrados aún</div>'; return; }
  ultEl.innerHTML = recent.map(p => {
    const d = drivers.find(dr => dr.id === p.driverId);
    return `<div class="pay-item">
      <div><div class="fw7 fs85">${d ? d.nombre : '—'}</div><div class="pay-info">${fmtDate(p.createdAt)} · ${p.metodo || ''}${p.nota ? ' · ' + p.nota : ''}</div></div>
      <div class="pay-amount">${fmt(p.monto)}</div>
    </div>`;
  }).join('');
}

// ── Choferes ──────────────────────────────────────
window.renderChoferes = function() {
  const q = (document.getElementById('search-choferes')?.value || '').toLowerCase();
  let list = drivers.filter(d => d.activo !== false);
  if (q) list = list.filter(d => (d.nombre || '').toLowerCase().includes(q) || (d.placa || '').toLowerCase().includes(q));
  if (currentFilter !== 'todos') list = list.filter(d => getDriverDebt(d, payments).status === currentFilter);
  list.sort((a, b) => getDriverDebt(b, payments).totalDebt - getDriverDebt(a, payments).totalDebt);

  const el = document.getElementById('choferes-list');
  if (list.length === 0) { el.innerHTML = '<div class="empty"><div class="empty-icon">🚗</div><div class="empty-text">No hay choferes en este filtro</div></div>'; return; }

  el.innerHTML = list.map((d, i) => {
    const st = getDriverDebt(d, payments);
    const sb = statusBadge(st.status);
    const ci = i % avatarColors.length;
    return `<div class="driver-card" onclick="openDetalle('${d.id}')">
      <div class="avatar" style="background:${avatarColors[ci].bg};color:${avatarColors[ci].text}">${getInitials(d.nombre)}</div>
      <div class="driver-info">
        <div class="driver-name">${d.nombre} ${d.deposito > 0 ? `<span class="chip chip-green">Dep. ${fmt(d.deposito)}</span>` : '<span class="chip chip-red">Sin dep.</span>'}</div>
        <div class="driver-meta"><span>🚗 ${d.placa}</span><span>${d.plataforma || ''}</span><span class="mono">${fmt(d.renta)}/sem</span></div>
        ${st.weeksOwed > 0 ? `<div class="debt-tag">⚠️ ${st.weeksOwed} sem adeudadas · ${fmt(st.totalDebt)}</div>` : ''}
      </div>
      <div class="driver-right">
        <span class="badge ${sb.cls}">${sb.label}</span>
        <div class="pay-info" style="margin-top:4px">${st.totalDebt > 0 ? 'Debe ' + fmt(st.totalDebt) : 'Al corriente ✓'}</div>
      </div>
    </div>`;
  }).join('');
};

// ── Chofer CRUD ───────────────────────────────────
window.openAddChofer = function() {
  editingDriverId = null;
  document.getElementById('modal-chofer-title').textContent = 'Agregar chofer';
  ['f-nombre', 'f-tel', 'f-placa', 'f-notas'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-renta').value = '5000';
  document.getElementById('f-deposito').value = '0';
  document.getElementById('f-dep-devuelto').checked = false;
  document.getElementById('f-inicio').value = new Date().toISOString().split('T')[0];
  document.getElementById('f-plataforma').value = 'Uber';
  openModal('modal-chofer');
};

window.saveChofer = async function() {
  const nombre = document.getElementById('f-nombre').value.trim();
  const placa = document.getElementById('f-placa').value.trim().toUpperCase();
  const renta = Number(document.getElementById('f-renta').value);
  if (!nombre || !placa || !renta) { alert('Llena nombre, placa y renta'); return; }
  const data = {
    nombre, placa, renta,
    tel: document.getElementById('f-tel').value.trim(),
    inicio: document.getElementById('f-inicio').value,
    plataforma: document.getElementById('f-plataforma').value,
    notas: document.getElementById('f-notas').value.trim(),
    deposito: Number(document.getElementById('f-deposito').value || 0),
    depositoDevuelto: document.getElementById('f-dep-devuelto').checked,
    activo: true,
    updatedAt: serverTimestamp()
  };
  try {
    if (editingDriverId) { await updateDoc(doc(db, 'drivers', editingDriverId), data); }
    else { data.createdAt = serverTimestamp(); await addDoc(collection(db, 'drivers'), data); }
    closeModal('modal-chofer');
  } catch (e) { alert('Error: ' + e.message); }
};

window.openDetalle = function(driverId) {
  const d = drivers.find(dr => dr.id === driverId); if (!d) return;
  const st = getDriverDebt(d, payments);
  const driverPays = payments.filter(p => p.driverId === driverId).slice(0, 6);
  document.getElementById('detalle-content').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
      <div class="avatar" style="background:${avatarColors[0].bg};color:${avatarColors[0].text};width:52px;height:52px;font-size:1.1rem;border-radius:14px">${getInitials(d.nombre)}</div>
      <div><div style="font-size:1.1rem;font-weight:800">${d.nombre}</div><div class="pay-info">${d.placa} · ${d.plataforma || ''} · desde ${d.inicio || ''}</div></div>
    </div>
    <div class="stat-grid" style="margin-bottom:14px">
      <div class="stat-box"><div class="stat-label">Renta/sem</div><div class="stat-val">${fmt(d.renta)}</div></div>
      <div class="stat-box ${d.deposito > 0 ? 'green' : 'red'}"><div class="stat-label">Depósito</div><div class="stat-val" style="font-size:0.9rem">${d.deposito > 0 ? fmt(d.deposito) : 'Sin depósito'}</div><div style="font-size:0.65rem;color:var(--text3)">${d.depositoDevuelto ? 'Devuelto' : 'En garantía'}</div></div>
      <div class="stat-box ${st.totalDebt > 0 ? 'red' : 'green'}"><div class="stat-label">Deuda total</div><div class="stat-val" style="font-size:0.9rem">${st.totalDebt > 0 ? fmt(st.totalDebt) : 'Al corriente'}</div>${st.weeksOwed > 0 ? `<div style="font-size:0.65rem;color:var(--red)">${st.weeksOwed} sem</div>` : ''}</div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      ${d.tel ? `<button class="btn-wa" onclick="sendWA('${d.tel}','${d.nombre}',${st.totalDebt || st.due})">📱 WhatsApp cobro</button>` : ''}
      <button class="btn btn-secondary btn-sm" onclick="editChofer('${d.id}')">✏️ Editar</button>
      <button class="btn btn-ghost btn-sm" onclick="openDocModal('${d.id}')">📄 Docs</button>
      <button class="btn btn-danger btn-sm" onclick="bajaChofer('${d.id}')">Dar de baja</button>
    </div>
    <div class="label" style="margin-bottom:8px">Últimos pagos</div>
    ${driverPays.length === 0 ? '<div class="empty-small">Sin pagos registrados</div>' :
      driverPays.map(p => `<div class="pay-item"><div class="pay-info">${fmtDate(p.createdAt)} · ${p.metodo || ''}${p.nota ? ' · ' + p.nota : ''}</div><div class="pay-amount">${fmt(p.monto)}</div></div>`).join('')}
  `;
  document.getElementById('btn-pagar-detalle').onclick = () => { closeModal('modal-detalle'); openPayModal(driverId); };
  openModal('modal-detalle');
};

window.editChofer = function(id) {
  closeModal('modal-detalle'); editingDriverId = id;
  const d = drivers.find(dr => dr.id === id);
  document.getElementById('modal-chofer-title').textContent = 'Editar chofer';
  document.getElementById('f-nombre').value = d.nombre || '';
  document.getElementById('f-tel').value = d.tel || '';
  document.getElementById('f-placa').value = d.placa || '';
  document.getElementById('f-renta').value = d.renta || 5000;
  document.getElementById('f-deposito').value = d.deposito || 0;
  document.getElementById('f-dep-devuelto').checked = d.depositoDevuelto || false;
  document.getElementById('f-inicio').value = d.inicio || '';
  document.getElementById('f-plataforma').value = d.plataforma || 'Uber';
  document.getElementById('f-notas').value = d.notas || '';
  openModal('modal-chofer');
};

window.bajaChofer = async function(id) {
  if (!confirm('¿Dar de baja este chofer?')) return;
  await updateDoc(doc(db, 'drivers', id), { activo: false });
  closeModal('modal-detalle');
};

// ── Payments ──────────────────────────────────────
window.openPayModal = function(driverId) {
  payingDriverId = driverId;
  const d = drivers.find(dr => dr.id === driverId);
  const st = getDriverDebt(d, payments);
  document.getElementById('modal-pago-title').textContent = `Cobro — ${d.nombre}`;
  document.getElementById('modal-pago-info').innerHTML = `<div class="fw7">${d.nombre} · ${d.placa}</div><div class="pay-info" style="margin-top:4px">Renta: ${fmt(d.renta)}/sem · Deuda: <span class="${st.totalDebt > 0 ? 'text-red' : 'text-green'} fw7">${fmt(st.totalDebt)}</span></div>`;
  document.getElementById('p-monto').value = st.totalDebt || d.renta;
  document.getElementById('p-nota').value = '';
  openModal('modal-pago');
};

window.savePago = async function() {
  const monto = Number(document.getElementById('p-monto').value);
  if (!monto || monto <= 0) { alert('Ingresa un monto válido'); return; }
  try {
    await addDoc(collection(db, 'payments'), {
      driverId: payingDriverId, monto,
      metodo: document.getElementById('p-metodo').value,
      nota: document.getElementById('p-nota').value.trim(),
      createdAt: serverTimestamp()
    });
    closeModal('modal-pago');
  } catch (e) { alert('Error: ' + e.message); }
};

window.deletePayment = async function(id) {
  if (!confirm('¿Eliminar este pago?')) return;
  await deleteDoc(doc(db, 'payments', id));
};

function renderCobros() {
  const active = drivers.filter(d => d.activo !== false);
  const pendientes = active.filter(d => getDriverDebt(d, payments).status !== 'al_corriente')
    .sort((a, b) => getDriverDebt(b, payments).totalDebt - getDriverDebt(a, payments).totalDebt);

  const el = document.getElementById('cobros-pendientes');
  if (pendientes.length === 0) { el.innerHTML = '<div class="all-good">✅ Todos al corriente esta semana</div>'; }
  else {
    el.innerHTML = pendientes.map(d => {
      const st = getDriverDebt(d, payments);
      return `<div class="cobro-card ${st.weeksOwed >= 2 ? 'urgent' : st.status === 'parcial' ? 'partial' : ''}">
        <div>
          <div class="fw7">${d.nombre}</div>
          <div class="pay-info">${d.placa} · ${d.tel || ''}</div>
          ${st.weeksOwed > 0 ? `<div style="font-size:0.72rem;color:var(--red);font-weight:700;margin-top:2px">⚠️ ${st.weeksOwed} sem · ${fmt(st.totalDebt)}</div>` : ''}
          ${d.tel ? `<button class="btn-wa" style="margin-top:6px" onclick="sendWA('${d.tel}','${d.nombre}',${st.totalDebt || st.due})">📱 WhatsApp</button>` : ''}
        </div>
        <div class="cobro-right">
          <div class="mono fw7 text-red">${fmt(st.totalDebt || st.due)}</div>
          <button class="btn btn-primary btn-sm" onclick="openPayModal('${d.id}')">Cobrar</button>
        </div>
      </div>`;
    }).join('');
  }

  document.getElementById('historial-pagos').innerHTML = payments.slice(0, 30).map(p => {
    const d = drivers.find(dr => dr.id === p.driverId);
    return `<div class="pay-item">
      <div><div class="fw7 fs85">${d ? d.nombre : '—'} <span class="text-muted fs70">${d ? d.placa : ''}</span></div><div class="pay-info">${fmtDate(p.createdAt)} · ${p.metodo || ''}${p.nota ? ' · ' + p.nota : ''}</div></div>
      <div style="display:flex;align-items:center;gap:8px"><div class="pay-amount">${fmt(p.monto)}</div><button onclick="deletePayment('${p.id}')" class="del-btn">✕</button></div>
    </div>`;
  }).join('');
}

// ── WhatsApp ──────────────────────────────────────
window.sendWA = function(tel, nombre, monto) {
  const clean = tel.replace(/\D/g, '');
  const msg = encodeURIComponent(`Hola ${nombre.split(' ')[0]} 👋, tienes un saldo pendiente de ${fmt(monto)}. Por favor realiza tu pago. ¡Gracias! — LaguLease`);
  window.open(`https://wa.me/52${clean}?text=${msg}`, '_blank');
};

// ── Flota ─────────────────────────────────────────
window.renderFlota = function() {
  const q = (document.getElementById('search-flota')?.value || '').toLowerCase();
  const filtro = document.getElementById('flota-filtro')?.value || 'todos';
  let list = [...flota];
  if (q) list = list.filter(c => (c.placa || '').toLowerCase().includes(q) || (c.modelo || '').toLowerCase().includes(q));
  if (filtro !== 'todos') list = list.filter(c => c.estatus === filtro);

  const hoy = new Date();
  const proxVencer = flota.filter(c => { if (!c.seguroVence) return false; const dias = getDiasRestantes(c.seguroVence); return dias >= 0 && dias <= 30; }).length;

  document.getElementById('flota-total').textContent = flota.length;
  document.getElementById('flota-rentados').textContent = flota.filter(c => c.estatus === 'rentado').length;
  document.getElementById('flota-disponibles').textContent = flota.filter(c => c.estatus === 'disponible').length;
  document.getElementById('flota-seguros').textContent = proxVencer;

  const el = document.getElementById('flota-list');
  if (list.length === 0) { el.innerHTML = '<div class="empty"><div class="empty-icon">🚙</div><div class="empty-text">Sin carros registrados</div></div>'; return; }

  list.sort((a, b) => (a.placa || '').localeCompare(b.placa || ''));
  el.innerHTML = list.map(c => {
    const chofer = drivers.find(d => d.id === c.choferActualId && d.activo !== false);
    const licDias = getDiasRestantes(c.seguroVence);
    let segAlert = '';
    if (licDias !== null) {
      if (licDias < 0) segAlert = `<span class="chip chip-red">⛔ Seguro vencido</span>`;
      else if (licDias <= 30) segAlert = `<span class="chip chip-red">⚠️ Seguro: ${licDias} días</span>`;
      else segAlert = `<span class="chip chip-green">🛡️ Seguro vigente</span>`;
    }
    const estatusMap = { disponible: 'badge-green', rentado: 'badge-blue', servicio: 'badge-yellow', baja: 'badge-red' };
    const estatusLabel = { disponible: '✅ Disponible', rentado: '🔑 Rentado', servicio: '🔧 En servicio', baja: '⛔ Baja' };
    return `<div class="flota-card" onclick="openDetalleFlota('${c.id}')">
      <div class="flota-icon">🚙</div>
      <div>
        <div class="flota-placa">${c.placa} <span style="font-size:0.8rem;font-weight:500;color:var(--text3)">${c.modelo || ''} ${c.anio || ''}</span></div>
        <div class="flota-meta">
          ${chofer ? `<span>👤 ${chofer.nombre}</span>` : '<span style="color:var(--text3)">Sin chofer</span>'}
          ${c.color ? `<span>🎨 ${c.color}</span>` : ''}
          ${c.leasingPagosRestantes > 0 ? `<span>${c.leasingPagosRestantes} pagos leasing</span>` : ''}
        </div>
        <div style="margin-top:5px">${segAlert}</div>
      </div>
      <div class="flota-right"><span class="badge ${estatusMap[c.estatus] || 'badge-gray'}">${estatusLabel[c.estatus] || c.estatus}</span></div>
    </div>`;
  }).join('');
};

window.openAddCarro = function() {
  editingCarroId = null;
  document.getElementById('modal-carro-title').textContent = 'Agregar carro';
  ['fc-placa', 'fc-modelo', 'fc-anio', 'fc-color', 'fc-serie', 'fc-poliza', 'fc-seguro-vence', 'fc-leasing-inicio', 'fc-leasing-fin', 'fc-leasing-pagos', 'fc-notas-carro'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('fc-estatus').value = 'disponible';
  const sel = document.getElementById('fc-chofer');
  sel.innerHTML = '<option value="">Sin chofer asignado</option>' + drivers.filter(d => d.activo !== false).map(d => `<option value="${d.id}">${d.nombre} · ${d.placa}</option>`).join('');
  openModal('modal-carro');
};

window.saveCarro = async function() {
  const placa = document.getElementById('fc-placa').value.trim().toUpperCase();
  const modelo = document.getElementById('fc-modelo').value.trim();
  if (!placa || !modelo) { alert('Placa y modelo son obligatorios'); return; }
  const data = {
    placa, modelo,
    anio: document.getElementById('fc-anio').value,
    color: document.getElementById('fc-color').value.trim(),
    numSerie: document.getElementById('fc-serie').value.trim(),
    estatus: document.getElementById('fc-estatus').value,
    choferActualId: document.getElementById('fc-chofer').value || '',
    seguroPoliza: document.getElementById('fc-poliza').value.trim(),
    seguroVence: document.getElementById('fc-seguro-vence').value,
    leasingInicio: document.getElementById('fc-leasing-inicio').value,
    leasingFin: document.getElementById('fc-leasing-fin').value,
    leasingPagosRestantes: Number(document.getElementById('fc-leasing-pagos').value || 0),
    notas: document.getElementById('fc-notas-carro').value.trim(),
    updatedAt: serverTimestamp()
  };
  try {
    if (editingCarroId) { await updateDoc(doc(db, 'flota', editingCarroId), data); }
    else { data.createdAt = serverTimestamp(); await addDoc(collection(db, 'flota'), data); }
    closeModal('modal-carro');
  } catch (e) { alert('Error: ' + e.message); }
};

window.openDetalleFlota = function(carroId) {
  const c = flota.find(f => f.id === carroId); if (!c) return;
  const chofer = drivers.find(d => d.id === c.choferActualId);
  const hoy = new Date();
  const segDias = getDiasRestantes(c.seguroVence);
  const svcCarro = servicios.filter(s => s.placa === c.placa).slice(0, 5);
  document.getElementById('flota-detalle-content').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
      <div style="width:52px;height:52px;background:var(--surface2);border:1px solid var(--border);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:1.5rem">🚙</div>
      <div><div style="font-size:1.2rem;font-weight:800">${c.placa}</div><div class="pay-info">${c.modelo || ''} ${c.anio || ''} · ${c.color || ''}</div></div>
    </div>
    <div class="stat-grid" style="margin-bottom:14px">
      <div class="stat-box"><div class="stat-label">Estatus</div><div class="stat-val" style="font-size:0.85rem">${c.estatus || '—'}</div></div>
      <div class="stat-box ${segDias !== null && segDias < 0 ? 'red' : 'green'}"><div class="stat-label">Seguro</div><div class="stat-val" style="font-size:0.75rem">${segDias === null ? 'No reg.' : segDias < 0 ? '⛔ Vencido' : segDias <= 30 ? `⚠️ ${segDias} días` : '✅ Vigente'}</div></div>
      <div class="stat-box"><div class="stat-label">Leasing</div><div class="stat-val" style="font-size:0.75rem">${c.leasingPagosRestantes > 0 ? c.leasingPagosRestantes + ' pagos' : 'No reg.'}</div></div>
    </div>
    <div class="pay-item" style="margin-bottom:8px"><div><div class="fw7 fs85">👤 Chofer actual</div><div class="pay-info">${chofer ? chofer.nombre + ' · ' + chofer.tel : 'Sin chofer asignado'}</div></div></div>
    ${c.seguroPoliza ? `<div class="pay-item" style="margin-bottom:8px"><div><div class="fw7 fs85">🛡️ Póliza</div><div class="pay-info">${c.seguroPoliza}</div></div></div>` : ''}
    ${c.numSerie ? `<div class="pay-item" style="margin-bottom:8px"><div><div class="fw7 fs85">🔢 No. Serie</div><div class="pay-info mono">${c.numSerie}</div></div></div>` : ''}
    <div class="label" style="margin-top:12px;margin-bottom:8px">Últimos servicios</div>
    ${svcCarro.length === 0 ? '<div class="empty-small">Sin servicios registrados</div>' : svcCarro.map(s => `<div class="pay-item"><div class="fs85">${s.tipo}</div><div class="pay-info">${fmtDate(s.createdAt)}${s.km ? ' · ' + s.km + ' km' : ''}</div></div>`).join('')}
  `;
  document.getElementById('btn-editar-carro').onclick = () => editCarro(carroId);
  document.getElementById('btn-baja-carro').onclick = async () => {
    if (!confirm('¿Dar de baja este carro?')) return;
    await updateDoc(doc(db, 'flota', carroId), { estatus: 'baja' });
    closeModal('modal-flota-detalle');
  };
  openModal('modal-flota-detalle');
};

function editCarro(id) {
  closeModal('modal-flota-detalle'); editingCarroId = id;
  const c = flota.find(f => f.id === id);
  document.getElementById('modal-carro-title').textContent = 'Editar carro';
  document.getElementById('fc-placa').value = c.placa || '';
  document.getElementById('fc-modelo').value = c.modelo || '';
  document.getElementById('fc-anio').value = c.anio || '';
  document.getElementById('fc-color').value = c.color || '';
  document.getElementById('fc-serie').value = c.numSerie || '';
  document.getElementById('fc-estatus').value = c.estatus || 'disponible';
  document.getElementById('fc-poliza').value = c.seguroPoliza || '';
  document.getElementById('fc-seguro-vence').value = c.seguroVence || '';
  document.getElementById('fc-leasing-inicio').value = c.leasingInicio || '';
  document.getElementById('fc-leasing-fin').value = c.leasingFin || '';
  document.getElementById('fc-leasing-pagos').value = c.leasingPagosRestantes || '';
  document.getElementById('fc-notas-carro').value = c.notas || '';
  const sel = document.getElementById('fc-chofer');
  sel.innerHTML = '<option value="">Sin chofer</option>' + drivers.filter(d => d.activo !== false).map(d => `<option value="${d.id}" ${d.id === c.choferActualId ? 'selected' : ''}>${d.nombre} · ${d.placa}</option>`).join('');
  openModal('modal-carro');
}

// ── Documentos ────────────────────────────────────
function renderDocumentos() {
  const active = drivers.filter(d => d.activo !== false);
  let vencidos = 0, porVencer = 0, sinDoc = 0;
  active.forEach(d => {
    ['licenciaVence', 'ineVence', 'domicilioVence'].forEach(campo => {
      if (!d[campo]) { sinDoc++; return; }
      const dias = getDiasRestantes(d[campo]);
      if (dias < 0) vencidos++;
      else if (dias <= 30) porVencer++;
    });
  });
  document.getElementById('doc-total').textContent = active.length;
  document.getElementById('doc-vencidos').textContent = vencidos;
  document.getElementById('doc-porvencer').textContent = porVencer;
  document.getElementById('doc-sindoc').textContent = sinDoc;

  // Update tab badge
  const badge = document.getElementById('tab-docs-badge');
  if (vencidos + porVencer > 0) { badge.textContent = vencidos + porVencer; badge.style.display = 'inline'; }
  else badge.style.display = 'none';

  const urgentes = active.filter(d => ['licenciaVence', 'ineVence'].some(c => { const dias = getDiasRestantes(d[c]); return dias !== null && dias <= 30; }));
  const alertEl = document.getElementById('doc-alertas');
  if (urgentes.length === 0) { alertEl.innerHTML = '<div class="all-good">✅ Sin documentos próximos a vencer</div>'; }
  else {
    alertEl.innerHTML = urgentes.map(d => {
      const licDias = getDiasRestantes(d.licenciaVence);
      const ineDias = getDiasRestantes(d.ineVence);
      const worst = Math.min(licDias ?? 999, ineDias ?? 999);
      return `<div class="cobro-card ${worst < 0 ? 'urgent' : 'partial'}">
        <div>
          <div class="fw7">${d.nombre} · <span class="mono fs85">${d.placa}</span></div>
          <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
            ${licDias !== null && licDias <= 30 ? `<span class="badge ${licDias < 0 ? 'badge-red' : 'badge-yellow'}">🪪 Licencia: ${licDias < 0 ? 'VENCIDA' : licDias + ' días'}</span>` : ''}
            ${ineDias !== null && ineDias <= 30 ? `<span class="badge ${ineDias < 0 ? 'badge-red' : 'badge-yellow'}">🆔 INE: ${ineDias < 0 ? 'VENCIDA' : ineDias + ' días'}</span>` : ''}
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="openDocModal('${d.id}')">Actualizar</button>
      </div>`;
    }).join('');
  }

  const q = (document.getElementById('search-docs')?.value || '').toLowerCase();
  let list = [...active];
  if (q) list = list.filter(d => (d.nombre || '').toLowerCase().includes(q) || (d.placa || '').toLowerCase().includes(q));

  const el = document.getElementById('doc-list');
  el.innerHTML = list.map((d, i) => {
    const fields = [
      { label: '🪪 Licencia', fecha: d.licenciaVence },
      { label: '🆔 INE / ID', fecha: d.ineVence },
      { label: '🏠 Domicilio', fecha: d.domicilioVence },
    ];
    const hasAlert = fields.some(f => { const dias = getDiasRestantes(f.fecha); return dias !== null && dias <= 30; });
    const ci = i % avatarColors.length;
    return `<div class="doc-card ${hasAlert ? 'alert' : ''}">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="avatar" style="background:${avatarColors[ci].bg};color:${avatarColors[ci].text};width:38px;height:38px;border-radius:10px;font-size:0.85rem;flex-shrink:0">${getInitials(d.nombre)}</div>
        <div><div class="fw7">${d.nombre}</div><div class="pay-info">${d.placa} · ${d.plataforma || ''}</div></div>
        <button class="btn btn-secondary btn-sm" style="margin-left:auto" onclick="openDocModal('${d.id}')">✏️ Editar</button>
      </div>
      <div class="doc-grid">
        ${fields.map(f => {
          const dias = getDiasRestantes(f.fecha);
          let badgeCls = 'badge-gray', badgeLabel = 'Sin fecha';
          if (dias !== null) {
            if (dias < 0) { badgeCls = 'badge-red'; badgeLabel = '⛔ Vencida'; }
            else if (dias <= 30) { badgeCls = 'badge-yellow'; badgeLabel = `⚠️ ${dias} días`; }
            else { badgeCls = 'badge-green'; badgeLabel = `✅ ${dias} días`; }
          }
          return `<div class="doc-item">
            <div class="doc-label">${f.label}</div>
            <div class="doc-fecha">${f.fecha || 'No registrada'}</div>
            <span class="badge ${badgeCls}" style="font-size:0.6rem">${badgeLabel}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

window.openDocModal = function(driverId) {
  editingDocDriverId = driverId;
  const d = drivers.find(dr => dr.id === driverId); if (!d) return;
  closeModal('modal-detalle');
  document.getElementById('doc-chofer-nombre').textContent = d.nombre + ' · ' + d.placa;
  document.getElementById('doc-lic-num').value = d.licenciaNum || '';
  document.getElementById('doc-lic-vence').value = d.licenciaVence || '';
  document.getElementById('doc-ine-num').value = d.ineNum || '';
  document.getElementById('doc-ine-vence').value = d.ineVence || '';
  document.getElementById('doc-dom-vence').value = d.domicilioVence || '';
  document.getElementById('doc-notas').value = d.docNotas || '';
  openModal('modal-docs');
};

window.saveDocs = async function() {
  try {
    await updateDoc(doc(db, 'drivers', editingDocDriverId), {
      licenciaNum: document.getElementById('doc-lic-num').value.trim(),
      licenciaVence: document.getElementById('doc-lic-vence').value,
      ineNum: document.getElementById('doc-ine-num').value.trim(),
      ineVence: document.getElementById('doc-ine-vence').value,
      domicilioVence: document.getElementById('doc-dom-vence').value,
      docNotas: document.getElementById('doc-notas').value.trim(),
      updatedAt: serverTimestamp()
    });
    closeModal('modal-docs');
  } catch (e) { alert('Error: ' + e.message); }
};

// ── Servicios ─────────────────────────────────────
window.renderServicios = function() {
  const q = (document.getElementById('search-servicios')?.value || '').toLowerCase();
  let list = [...servicios];
  if (q) list = list.filter(s => (s.tipo || '').toLowerCase().includes(q) || (s.placa || '').toLowerCase().includes(q));
  const el = document.getElementById('servicios-list');
  if (list.length === 0) { el.innerHTML = '<div class="empty"><div class="empty-icon">🔧</div><div class="empty-text">Sin servicios registrados</div></div>'; return; }
  el.innerHTML = list.map(s => {
    const d = drivers.find(dr => dr.id === s.driverId);
    const inv = inventario.find(i => i.id === s.refaccionId);
    return `<div class="pay-item" style="flex-direction:column;align-items:stretch;padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div class="fw7 fs85">🔧 ${s.tipo} — <span style="color:var(--blue)">${s.placa || d?.placa || '—'}</span></div>
          <div class="pay-info">${d ? d.nombre : '—'} · ${fmtDate(s.createdAt)}${s.km ? ' · ' + s.km + ' km' : ''}</div>
          ${inv ? `<div class="pay-info" style="color:var(--green)">📦 Usó: ${s.cantidad || 1} ${inv.unidad || 'pzas'} de ${inv.nombre}</div>` : ''}
          ${s.proxKm ? `<div style="font-size:0.72rem;color:var(--yellow);margin-top:2px">🔔 Próximo: ${s.proxKm} km</div>` : ''}
          ${s.notas ? `<div class="pay-info">${s.notas}</div>` : ''}
        </div>
        <button onclick="deleteServicio('${s.id}')" class="del-btn">✕</button>
      </div>
    </div>`;
  }).join('');
};

window.openAddServicio = function() {
  const sel = document.getElementById('svc-chofer');
  sel.innerHTML = drivers.filter(d => d.activo !== false).map(d => `<option value="${d.id}" data-placa="${d.placa}">${d.nombre} · ${d.placa}</option>`).join('');
  const invSel = document.getElementById('svc-refaccion');
  invSel.innerHTML = '<option value="">Sin refacción del inventario</option>' + inventario.filter(i => Number(i.stock || 0) > 0).map(i => `<option value="${i.id}">${i.nombre} (${i.stock} ${i.unidad || 'pzas'})</option>`).join('');
  ['svc-tipo', 'svc-km', 'svc-proxkm', 'svc-notas', 'svc-cantidad'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('svc-cant-row').style.display = 'none';
  openModal('modal-servicio');
};

window.saveServicio = async function() {
  const driverId = document.getElementById('svc-chofer').value;
  const tipo = document.getElementById('svc-tipo').value.trim();
  if (!driverId || !tipo) { alert('Selecciona el chofer y el tipo'); return; }
  const driver = drivers.find(d => d.id === driverId);
  const refaccionId = document.getElementById('svc-refaccion').value;
  const cantidad = Number(document.getElementById('svc-cantidad').value || 1);
  const item = refaccionId ? inventario.find(i => i.id === refaccionId) : null;
  if (item && cantidad > Number(item.stock || 0)) { alert(`Solo hay ${item.stock} en stock`); return; }
  try {
    await addDoc(collection(db, 'servicios'), {
      driverId, tipo, placa: driver?.placa || '',
      km: document.getElementById('svc-km').value.trim(),
      proxKm: document.getElementById('svc-proxkm').value.trim(),
      refaccionId: refaccionId || '', cantidad: refaccionId ? cantidad : 0,
      notas: document.getElementById('svc-notas').value.trim(),
      createdAt: serverTimestamp()
    });
    if (item && refaccionId) {
      await updateDoc(doc(db, 'inventario', refaccionId), { stock: Math.max(0, Number(item.stock || 0) - cantidad) });
      await addDoc(collection(db, 'movimientos_inv'), {
        productoId: refaccionId, tipo: 'salida', cantidad, costo: item.costo || 0,
        driverId, notas: `Servicio: ${tipo}`, createdAt: serverTimestamp()
      });
    }
    closeModal('modal-servicio');
  } catch (e) { alert('Error: ' + e.message); }
};

window.deleteServicio = async function(id) { if (!confirm('¿Eliminar?')) return; await deleteDoc(doc(db, 'servicios', id)); };

// ── Inventario ────────────────────────────────────
window.renderInventario = function() {
  const q = (document.getElementById('search-inv')?.value || '').toLowerCase();
  const filtro = document.getElementById('inv-filtro')?.value || 'todos';
  let list = [...inventario];
  if (q) list = list.filter(i => (i.nombre || '').toLowerCase().includes(q));
  if (filtro === 'bajo') list = list.filter(i => Number(i.stock || 0) <= Number(i.stockMin || 0) && Number(i.stock || 0) > 0);
  if (filtro === 'agotado') list = list.filter(i => Number(i.stock || 0) === 0);
  list.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  const totalValor = inventario.reduce((s, i) => s + Number(i.stock || 0) * Number(i.costo || 0), 0);
  const bajo = inventario.filter(i => Number(i.stock || 0) <= Number(i.stockMin || 0) && Number(i.stock || 0) > 0).length;
  const agotado = inventario.filter(i => Number(i.stock || 0) === 0).length;
  document.getElementById('inv-total').textContent = inventario.length;
  document.getElementById('inv-valor').textContent = fmt(totalValor);
  document.getElementById('inv-bajo').textContent = bajo;
  document.getElementById('inv-agotado').textContent = agotado;

  const el = document.getElementById('inv-list');
  if (list.length === 0) { el.innerHTML = '<div class="empty"><div class="empty-icon">📦</div><div class="empty-text">Sin productos en inventario</div></div>'; return; }
  el.innerHTML = list.map(item => {
    const stock = Number(item.stock || 0);
    const stockMin = Number(item.stockMin || 0);
    const valor = stock * Number(item.costo || 0);
    const s = stock === 0 ? { color: 'var(--red)', label: '⛔ Agotado' } :
              stock <= stockMin ? { color: 'var(--yellow)', label: '⚠️ Stock bajo' } :
              { color: 'var(--green)', label: '✅ En stock' };
    return `<div class="inv-card">
      <div>
        <div class="fw7 fs85">${item.nombre} <span class="badge badge-gray" style="font-size:0.62rem">${item.categoria || ''}</span></div>
        <div class="pay-info">Costo unit: ${fmt(item.costo)} · Mín: ${stockMin} ${item.unidad || 'pzas'} · <span style="color:${s.color}">${s.label}</span></div>
      </div>
      <div style="text-align:center;min-width:70px">
        <div class="inv-stock-num" style="color:${s.color}">${stock}</div>
        <div style="font-size:0.65rem;color:var(--text3)">${item.unidad || 'pzas'}</div>
        <div style="font-size:0.7rem;color:var(--text3)">${fmt(valor)}</div>
      </div>
      <div class="inv-actions">
        <button class="btn btn-primary btn-sm" onclick="openEntrada('${item.id}')">📥</button>
        <button class="btn btn-secondary btn-sm" onclick="openSalida('${item.id}')">📤</button>
        <button class="del-btn" onclick="deleteProducto('${item.id}')">✕</button>
      </div>
    </div>`;
  }).join('');

  const movEl = document.getElementById('inv-movimientos');
  if (!movEl) return;
  movEl.innerHTML = movimientos.slice(0, 15).map(m => {
    const item = inventario.find(i => i.id === m.productoId);
    const driver = drivers.find(d => d.id === m.driverId);
    const isIn = m.tipo === 'entrada';
    return `<div class="pay-item">
      <div>
        <div class="fw7 fs85">${isIn ? '📥' : '📤'} ${item ? item.nombre : '—'} <span class="text-muted fs70">${m.cantidad} ${item?.unidad || 'pzas'}</span></div>
        <div class="pay-info">${fmtDate(m.createdAt)} · ${isIn ? 'Compra' : 'Uso en ' + (driver ? driver.placa : 'taller')}${m.notas ? ' · ' + m.notas : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="${isIn ? 'pay-amount' : 'pay-amount red'}">${isIn ? '+' : '-'}${m.cantidad}</div>
        <button onclick="deleteMov('${m.id}','${m.productoId}','${m.tipo}',${m.cantidad || 0},${m.costo || 0})" class="del-btn">✕</button>
      </div>
    </div>`;
  }).join('');
};

window.openAddProducto = function() {
  ['np-nombre', 'np-costo', 'np-stock', 'np-stockmin'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('np-unidad').value = 'pzas';
  document.getElementById('np-categoria').value = 'Aceites y lubricantes';
  openModal('modal-producto');
};

window.saveProducto = async function() {
  const nombre = document.getElementById('np-nombre').value.trim();
  const costo = Number(document.getElementById('np-costo').value);
  const stock = Number(document.getElementById('np-stock').value || 0);
  if (!nombre || !costo) { alert('Llena nombre y costo'); return; }
  try {
    const ref = await addDoc(collection(db, 'inventario'), {
      nombre, costo, stock,
      stockMin: Number(document.getElementById('np-stockmin').value || 0),
      unidad: document.getElementById('np-unidad').value,
      categoria: document.getElementById('np-categoria').value,
      createdAt: serverTimestamp()
    });
    if (stock > 0) {
      await addDoc(collection(db, 'movimientos_inv'), {
        productoId: ref.id, tipo: 'entrada', cantidad: stock, costo,
        notas: 'Stock inicial', createdAt: serverTimestamp()
      });
    }
    closeModal('modal-producto');
  } catch (e) { alert('Error: ' + e.message); }
};

window.deleteProducto = async function(id) { if (!confirm('¿Eliminar producto?')) return; await deleteDoc(doc(db, 'inventario', id)); };

window.openEntrada = function(productoId) {
  document.getElementById('mov-producto-id').value = productoId;
  document.getElementById('mov-tipo').value = 'entrada';
  const item = inventario.find(i => i.id === productoId);
  document.getElementById('modal-mov-title').textContent = `📥 Entrada — ${item?.nombre}`;
  document.getElementById('mov-costo-row').style.display = 'block';
  document.getElementById('mov-driver-row').style.display = 'none';
  document.getElementById('mov-costo').value = item?.costo || '';
  document.getElementById('mov-cantidad').value = '';
  document.getElementById('mov-notas').value = '';
  openModal('modal-movimiento');
};

window.openSalida = function(productoId) {
  document.getElementById('mov-producto-id').value = productoId;
  document.getElementById('mov-tipo').value = 'salida';
  const item = inventario.find(i => i.id === productoId);
  document.getElementById('modal-mov-title').textContent = `📤 Usar — ${item?.nombre}`;
  document.getElementById('mov-costo-row').style.display = 'none';
  document.getElementById('mov-driver-row').style.display = 'block';
  const sel = document.getElementById('mov-driver');
  sel.innerHTML = '<option value="">Uso general en taller</option>' + drivers.filter(d => d.activo !== false).map(d => `<option value="${d.id}">${d.nombre} · ${d.placa}</option>`).join('');
  document.getElementById('mov-cantidad').value = '';
  document.getElementById('mov-notas').value = '';
  openModal('modal-movimiento');
};

window.saveMovimiento = async function() {
  const productoId = document.getElementById('mov-producto-id').value;
  const tipo = document.getElementById('mov-tipo').value;
  const cantidad = Number(document.getElementById('mov-cantidad').value);
  const item = inventario.find(i => i.id === productoId);
  if (!cantidad || cantidad <= 0) { alert('Ingresa una cantidad válida'); return; }
  if (tipo === 'salida' && cantidad > Number(item?.stock || 0)) { alert(`Solo hay ${item?.stock} en stock`); return; }
  const costo = tipo === 'entrada' ? Number(document.getElementById('mov-costo').value || item?.costo || 0) : Number(item?.costo || 0);
  const nuevoStock = tipo === 'entrada' ? Number(item?.stock || 0) + cantidad : Number(item?.stock || 0) - cantidad;
  try {
    await updateDoc(doc(db, 'inventario', productoId), { stock: nuevoStock, ...(tipo === 'entrada' && { costo }) });
    await addDoc(collection(db, 'movimientos_inv'), {
      productoId, tipo, cantidad, costo,
      driverId: document.getElementById('mov-driver')?.value || '',
      notas: document.getElementById('mov-notas').value.trim(),
      createdAt: serverTimestamp()
    });
    if (tipo === 'entrada') {
      await addDoc(collection(db, 'gastos'), {
        concepto: `Compra inventario: ${item?.nombre} x${cantidad}`,
        monto: costo * cantidad, tipo: 'variable',
        categoria: 'Refacciones y materiales',
        createdAt: serverTimestamp()
      });
    }
    closeModal('modal-movimiento');
  } catch (e) { alert('Error: ' + e.message); }
};

window.deleteMov = async function(movId, productoId, tipo, cantidad, costo) {
  if (!confirm('¿Revertir este movimiento?')) return;
  try {
    const item = inventario.find(i => i.id === productoId);
    if (item) {
      const delta = tipo === 'entrada' ? -cantidad : cantidad;
      await updateDoc(doc(db, 'inventario', productoId), { stock: Math.max(0, Number(item.stock || 0) + delta) });
    }
    await deleteDoc(doc(db, 'movimientos_inv', movId));
    if (tipo === 'entrada') {
      const linked = gastos.filter(g => g.tipo === 'variable' && g.categoria === 'Refacciones y materiales' && Math.abs(Number(g.monto || 0) - cantidad * costo) < 1);
      if (linked.length > 0) await deleteDoc(doc(db, 'gastos', linked[0].id));
    }
  } catch (e) { alert('Error: ' + e.message); }
};

// ── Financiero ────────────────────────────────────
window.renderFinanciero = function() {
  const selMonth = document.getElementById('fin-month')?.value;
  if (!selMonth) return;
  const [y, m] = selMonth.split('-').map(Number);
  const ingresos = getMonthDocs(payments, y, m).reduce((s, p) => s + Number(p.monto || 0), 0);
  const aportacionesMes = getMonthDocs(aportaciones, y, m).reduce((s, a) => s + Number(a.monto || 0), 0);
  const comprasInv = getMonthDocs(movimientos.filter(mv => mv.tipo === 'entrada'), y, m).reduce((s, mv) => s + Number(mv.costo || 0) * Number(mv.cantidad || 0), 0);
  const totalFijos = gastosFijos.reduce((s, g) => s + Number(g.monto || 0), 0);
  const leasing = getMonthDocs(gastos.filter(g => g.tipo === 'leasing'), y, m).reduce((s, g) => s + Number(g.monto || 0), 0);
  const impuestos = getMonthDocs(gastos.filter(g => g.tipo === 'impuesto'), y, m).reduce((s, g) => s + Number(g.monto || 0), 0);
  const otros = getMonthDocs(gastos.filter(g => g.tipo === 'variable' && g.categoria !== 'Refacciones y materiales'), y, m).reduce((s, g) => s + Number(g.monto || 0), 0);
  const totalGastos = comprasInv + totalFijos + leasing + impuestos + otros;
  const neto = ingresos - totalGastos;
  const margen = ingresos > 0 ? (neto / ingresos * 100).toFixed(1) : 0;

  document.getElementById('er-ingresos').textContent = fmt(ingresos);
  document.getElementById('er-aportaciones').textContent = fmt(aportacionesMes);
  document.getElementById('er-inv').textContent = fmt(comprasInv);
  document.getElementById('er-gastos-fijos').textContent = fmt(totalFijos);
  document.getElementById('er-leasing').textContent = fmt(leasing);
  document.getElementById('er-impuestos').textContent = fmt(impuestos);
  document.getElementById('er-otros').textContent = fmt(otros);
  document.getElementById('er-total-gastos').textContent = fmt(totalGastos);
  document.getElementById('er-neta').textContent = fmt(neto);
  document.getElementById('er-neta').className = 'er-val fw7 ' + (neto >= 0 ? 'text-green' : 'text-red');
  const margenEl = document.getElementById('er-margen');
  margenEl.textContent = margen + '% del ingreso';
  margenEl.style.background = neto >= 0 ? 'var(--green-bg)' : 'var(--red-bg)';
  margenEl.style.color = neto >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('fc-ingresos').textContent = fmt(ingresos + aportacionesMes);
  document.getElementById('fc-egresos').textContent = fmt(totalGastos);
  document.getElementById('fc-flujo').textContent = fmt(neto);
  document.getElementById('fc-flujo').className = 'er-val fw7 ' + (neto >= 0 ? 'text-green' : 'text-red');
  renderGastosFijos();
  renderGastosVarList(y, m);
  renderAportacionesList(y, m);
};

function renderGastosFijos() {
  const el = document.getElementById('gastos-fijos-list');
  if (!el) return;
  if (gastosFijos.length === 0) { el.innerHTML = '<div class="empty-small">Sin gastos fijos configurados</div>'; return; }
  const total = gastosFijos.reduce((s, g) => s + Number(g.monto || 0), 0);
  el.innerHTML = gastosFijos.map(g => `<div class="pay-item"><div><div class="fw7 fs85">${g.nombre}</div><div class="pay-info">${g.categoria || ''}</div></div><div style="display:flex;align-items:center;gap:8px"><div class="pay-amount red">${fmt(g.monto)}/mes</div><button onclick="deleteGastoFijo('${g.id}')" class="del-btn">✕</button></div></div>`).join('') +
    `<div class="pay-item" style="background:var(--red-bg);border-color:var(--red-border)"><div class="fw7">Total fijos/mes</div><div class="pay-amount red fw7">${fmt(total)}</div></div>`;
}

function renderGastosVarList(y, m) {
  const list = getMonthDocs(gastos.filter(g => g.tipo !== 'leasing' && g.tipo !== 'impuesto'), y, m);
  const el = document.getElementById('gastos-var-list');
  if (!el) return;
  if (list.length === 0) { el.innerHTML = '<div class="empty-small">Sin gastos variables este mes</div>'; return; }
  el.innerHTML = list.map(g => `<div class="pay-item"><div><div class="fw7 fs85">${g.concepto}</div><div class="pay-info">${fmtDate(g.createdAt)} · ${g.categoria || ''}</div></div><div style="display:flex;align-items:center;gap:8px"><div class="pay-amount red">${fmt(g.monto)}</div><button onclick="deleteGasto('${g.id}')" class="del-btn">✕</button></div></div>`).join('');

  const list2 = getMonthDocs(gastos.filter(g => g.tipo === 'leasing' || g.tipo === 'impuesto'), y, m);
  const el2 = document.getElementById('leasing-list');
  if (!el2) return;
  if (list2.length === 0) { el2.innerHTML = '<div class="empty-small">Sin registros este mes</div>'; return; }
  el2.innerHTML = list2.map(g => `<div class="pay-item"><div><div class="fw7 fs85">${g.concepto}</div><div class="pay-info">${fmtDate(g.createdAt)} · ${g.tipo === 'impuesto' ? 'Impuesto' : 'Leasing'}</div></div><div style="display:flex;align-items:center;gap:8px"><div class="pay-amount red">${fmt(g.monto)}</div><button onclick="deleteGasto('${g.id}')" class="del-btn">✕</button></div></div>`).join('');
}

function renderAportacionesList(y, m) {
  const list = getMonthDocs(aportaciones, y, m);
  const el = document.getElementById('aportaciones-list');
  if (!el) return;
  if (list.length === 0) { el.innerHTML = '<div class="empty-small">Sin aportaciones este mes</div>'; return; }
  el.innerHTML = list.map(a => `<div class="pay-item"><div><div class="fw7 fs85">${a.concepto}</div><div class="pay-info">${fmtDate(a.createdAt)}${a.nota ? ' · ' + a.nota : ''}</div></div><div style="display:flex;align-items:center;gap:8px"><div class="pay-amount text-blue">${fmt(a.monto)}</div><button onclick="deleteAportacion('${a.id}')" class="del-btn">✕</button></div></div>`).join('');
}

window.saveGastoFijo = async function() {
  const nombre = document.getElementById('gf-nombre').value.trim();
  const monto = Number(document.getElementById('gf-monto').value);
  if (!nombre || !monto) { alert('Llena nombre y monto'); return; }
  try { await addDoc(collection(db, 'gastos_fijos'), { nombre, monto, categoria: document.getElementById('gf-categoria').value, createdAt: serverTimestamp() }); document.getElementById('gf-nombre').value = ''; document.getElementById('gf-monto').value = ''; } catch (e) { alert('Error: ' + e.message); }
};
window.deleteGastoFijo = async function(id) { if (!confirm('¿Eliminar?')) return; await deleteDoc(doc(db, 'gastos_fijos', id)); };
window.openGastoModal = function() { document.getElementById('gv-concepto').value = ''; document.getElementById('gv-monto').value = ''; openModal('modal-gasto'); };
window.saveGasto = async function() {
  const concepto = document.getElementById('gv-concepto').value.trim();
  const monto = Number(document.getElementById('gv-monto').value);
  if (!concepto || !monto) { alert('Llena concepto y monto'); return; }
  try { await addDoc(collection(db, 'gastos'), { concepto, monto, tipo: document.getElementById('gv-tipo').value, categoria: document.getElementById('gv-categoria').value, createdAt: serverTimestamp() }); closeModal('modal-gasto'); } catch (e) { alert('Error: ' + e.message); }
};
window.deleteGasto = async function(id) { if (!confirm('¿Eliminar?')) return; await deleteDoc(doc(db, 'gastos', id)); };
window.openAportacionModal = function() { document.getElementById('ap-monto').value = ''; document.getElementById('ap-concepto').value = ''; document.getElementById('ap-nota').value = ''; openModal('modal-aportacion'); };
window.saveAportacion = async function() {
  const monto = Number(document.getElementById('ap-monto').value);
  if (!monto || monto <= 0) { alert('Ingresa un monto válido'); return; }
  try { await addDoc(collection(db, 'aportaciones'), { monto, concepto: document.getElementById('ap-concepto').value.trim() || 'Aportación a capital', nota: document.getElementById('ap-nota').value.trim(), createdAt: serverTimestamp() }); closeModal('modal-aportacion'); } catch (e) { alert('Error: ' + e.message); }
};
window.deleteAportacion = async function(id) { if (!confirm('¿Eliminar?')) return; await deleteDoc(doc(db, 'aportaciones', id)); };

// ── Contratos ─────────────────────────────────────
window.renderContratos = function() {
  const active = drivers.filter(d => d.activo !== false);
  const el = document.getElementById('contratos-list');
  if (active.length === 0) { el.innerHTML = '<div class="empty"><div class="empty-icon">📝</div><div class="empty-text">Agrega choferes primero</div></div>'; return; }
  el.innerHTML = active.map((d, i) => {
    const ci = i % avatarColors.length;
    return `<div class="pay-item">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="avatar" style="background:${avatarColors[ci].bg};color:${avatarColors[ci].text};width:38px;height:38px;border-radius:10px;font-size:0.85rem;flex-shrink:0">${getInitials(d.nombre)}</div>
        <div><div class="fw7 fs85">${d.nombre}</div><div class="pay-info">${d.placa} · ${d.plataforma || ''} · ${fmt(d.renta)}/sem</div></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="generarContrato('${d.id}')">📄 Generar PDF</button>
    </div>`;
  }).join('');
};

window.generarContrato = function(driverId) {
  const d = drivers.find(dr => dr.id === driverId); if (!d) return;
  const hoy = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  const carro = flota.find(c => c.choferActualId === d.id) || null;
  const contrato = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;font-size:11pt;color:#111;margin:0;padding:0}.page{width:21cm;min-height:29.7cm;margin:0 auto;padding:2.5cm 2cm;box-sizing:border-box}h1{text-align:center;font-size:14pt;text-transform:uppercase;margin-bottom:4px}h2{text-align:center;font-size:11pt;margin-bottom:24px;font-weight:normal}.sub{font-size:12pt;font-weight:bold;text-transform:uppercase;margin:20px 0 8px;border-bottom:1px solid #333;padding-bottom:4px}p{margin-bottom:10px;line-height:1.7;text-align:justify}.box{background:#f5f5f5;border:1px solid #ddd;border-radius:6px;padding:14px 18px;margin:12px 0}.row{display:flex;margin-bottom:6px}.lbl{font-weight:bold;width:200px;flex-shrink:0}.firmas{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:60px}.firma{text-align:center}.linea{border-top:1px solid #333;margin-bottom:8px;margin-top:50px}table{width:100%;border-collapse:collapse;margin:10px 0}td,th{border:1px solid #ddd;padding:8px 10px;font-size:10pt}th{background:#f0f0f0;font-weight:bold}@media print{button{display:none!important}}</style></head><body><div class="page"><div style="text-align:right;margin-bottom:8px"><button onclick="window.print()" style="background:#1a1916;color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:11pt">🖨️ Imprimir / Guardar PDF</button></div><div style="text-align:right;font-size:9pt;color:#555;margin-bottom:20px">Contrato No. LG-${String(Date.now()).slice(-6)} | Monterrey, N.L. a ${hoy}</div><div style="text-align:center;margin-bottom:30px"><h1>LaguLease</h1><h2>Contrato de Arrendamiento con Opción a Compra de Vehículo</h2></div><div class="sub">I. Partes del Contrato</div><p>El presente contrato se celebra entre:</p><div class="box"><div class="row"><span class="lbl">ARRENDADOR:</span><span>_____________________________________ (LaguLease)</span></div><div class="row"><span class="lbl">RFC:</span><span>_____________________________________</span></div><div class="row"><span class="lbl">Domicilio:</span><span>_____________________________________, Monterrey, N.L.</span></div></div><p>Y por la otra parte:</p><div class="box"><div class="row"><span class="lbl">ARRENDATARIO:</span><span>${d.nombre}</span></div><div class="row"><span class="lbl">No. Licencia:</span><span>${d.licenciaNum || '_____________________'}</span></div><div class="row"><span class="lbl">INE:</span><span>${d.ineNum || '_____________________'}</span></div><div class="row"><span class="lbl">Teléfono:</span><span>${d.tel || '_____________________'}</span></div><div class="row"><span class="lbl">Plataforma:</span><span>${d.plataforma || '_____________________'}</span></div></div><div class="sub">II. Descripción del Vehículo</div><div class="box"><div class="row"><span class="lbl">Marca / Modelo:</span><span>${carro?.modelo || 'Renault Kwid 2026'}</span></div><div class="row"><span class="lbl">Año:</span><span>${carro?.anio || '2026'}</span></div><div class="row"><span class="lbl">Color:</span><span>${carro?.color || '_____________________'}</span></div><div class="row"><span class="lbl">Placas:</span><span>${d.placa}</span></div><div class="row"><span class="lbl">No. de Serie / VIN:</span><span>${carro?.numSerie || '_____________________'}</span></div></div><div class="sub">III. Condiciones del Arrendamiento</div><table><tr><th>Concepto</th><th>Detalle</th></tr><tr><td>Renta semanal</td><td><strong>${fmt(d.renta)} MXN</strong></td></tr><tr><td>Día de pago</td><td>Lunes de cada semana</td></tr><tr><td>Método de pago</td><td>Transferencia bancaria / CoDi / Efectivo</td></tr><tr><td>Depósito en garantía</td><td>${d.deposito > 0 ? fmt(d.deposito) + ' MXN' : '_____________________ MXN'}</td></tr><tr><td>Fecha de inicio</td><td>${d.inicio || '_____________________'}</td></tr></table><div class="sub">IV. Opción a Compra</div><p>El ARRENDATARIO tendrá derecho a ejercer la opción de compra del vehículo descrito, una vez que haya cumplido con los pagos pactados y siempre que no existan adeudos pendientes.</p><div class="sub">V. Obligaciones del Arrendatario</div><p><strong>1.</strong> Pagar puntualmente la renta semanal cada lunes.<br><strong>2.</strong> Usar el vehículo exclusivamente en plataformas digitales autorizadas.<br><strong>3.</strong> Mantener vigente su licencia de conducir en todo momento.<br><strong>4.</strong> Reportar accidentes o daños en las 24 horas siguientes.<br><strong>5.</strong> No ceder ni subarrendar el vehículo sin autorización escrita.<br><strong>6.</strong> Cubrir el costo de daños por negligencia o mal uso.</p><div class="sub">VI. Causas de Rescisión</div><p>Falta de pago de dos semanas, uso para actividades ilícitas, daños por negligencia, documentación falsa o licencia vencida.</p><div class="sub">VII. Disposiciones Generales</div><p>Las partes se someten a los tribunales de Monterrey, N.L., renunciando a cualquier otro fuero.</p><p>Leído y firmado en Monterrey, N.L., a los _____ días del mes de ________________ de 20_____.</p><div class="firmas"><div class="firma"><div class="linea"></div><div style="font-weight:bold">_____________________________</div><div>EL ARRENDADOR — LaguLease</div></div><div class="firma"><div class="linea"></div><div style="font-weight:bold">${d.nombre}</div><div>EL ARRENDATARIO</div></div></div><div style="margin-top:40px;border-top:1px solid #ddd;padding-top:16px;text-align:center;font-size:9pt;color:#888">Testigo 1: _____________________________ &nbsp;&nbsp; Testigo 2: _____________________________</div></div></body></html>`;
  const w = window.open('', '_blank');
  w.document.write(contrato);
  w.document.close();
};

// ── Reportes ──────────────────────────────────────
window.renderReportes = function() {
  const now = new Date();
  const selMonth = document.getElementById('rep-mes')?.value || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [y, m] = selMonth.split('-').map(Number);
  const monthPays = getMonthDocs(payments, y, m);
  const ingresos = monthPays.reduce((s, p) => s + Number(p.monto || 0), 0);
  const active = drivers.filter(d => d.activo !== false);
  const statuses = active.map(d => getDriverDebt(d, payments));
  const cobrado = statuses.reduce((s, st) => s + st.paid, 0);
  const deuda = statuses.reduce((s, st) => s + st.totalDebt, 0);
  document.getElementById('rep-preview').innerHTML = `<div class="kpi-grid kpi-grid-4" style="margin-bottom:0"><div class="kpi-card"><div class="kpi-label">Cobrado esta semana</div><div class="kpi-value green" style="font-size:1.1rem">${fmt(cobrado)}</div></div><div class="kpi-card"><div class="kpi-label">Deuda acumulada</div><div class="kpi-value red" style="font-size:1.1rem">${fmt(deuda)}</div></div><div class="kpi-card"><div class="kpi-label">Ingresos del mes</div><div class="kpi-value green" style="font-size:1.1rem">${fmt(ingresos)}</div></div><div class="kpi-card"><div class="kpi-label">Choferes con deuda</div><div class="kpi-value red">${statuses.filter(s => s.totalDebt > 0).length}</div></div></div>`;
};

function getSelMonth() {
  const v = document.getElementById('rep-mes')?.value;
  if (!v) return [new Date().getFullYear(), new Date().getMonth() + 1];
  return v.split('-').map(Number);
}

window.descargarCobranza = function() {
  const active = drivers.filter(d => d.activo !== false);
  const hoy = new Date().toLocaleDateString('es-MX');
  const rows = [['REPORTE DE COBRANZA SEMANAL - LaguLease'], ['Generado:', hoy], [], ['Chofer', 'Placa', 'Plataforma', 'Renta/sem', 'Pagado esta sem', 'Deuda acum.', 'Semanas adeudadas', 'Estatus', 'Teléfono']];
  active.forEach(d => { const st = getDriverDebt(d, payments); rows.push([d.nombre, d.placa, d.plataforma || '', d.renta, st.paid, st.totalDebt, st.weeksOwed, st.status, d.tel || '']); });
  rows.push([], ['TOTALES', '', '', '', active.reduce((s, d) => s + getDriverDebt(d, payments).paid, 0), active.reduce((s, d) => s + getDriverDebt(d, payments).totalDebt, 0), '', '', '']);
  downloadCSV(rows, `LaguLease_Cobranza_${hoy.replace(/\//g, '-')}.csv`);
};

window.descargarFinanciero = function() {
  const [y, m] = getSelMonth();
  const monthName = new Date(y, m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  const monthPays = getMonthDocs(payments, y, m);
  const ingresos = monthPays.reduce((s, p) => s + Number(p.monto || 0), 0);
  const comprasInv = getMonthDocs(movimientos.filter(mv => mv.tipo === 'entrada'), y, m).reduce((s, mv) => s + Number(mv.costo || 0) * Number(mv.cantidad || 0), 0);
  const totalFijos = gastosFijos.reduce((s, g) => s + Number(g.monto || 0), 0);
  const leasing = getMonthDocs(gastos.filter(g => g.tipo === 'leasing'), y, m).reduce((s, g) => s + Number(g.monto || 0), 0);
  const impuestos = getMonthDocs(gastos.filter(g => g.tipo === 'impuesto'), y, m).reduce((s, g) => s + Number(g.monto || 0), 0);
  const otros = getMonthDocs(gastos.filter(g => g.tipo === 'variable' && g.categoria !== 'Refacciones y materiales'), y, m).reduce((s, g) => s + Number(g.monto || 0), 0);
  const total = comprasInv + totalFijos + leasing + impuestos + otros;
  const rows = [['ESTADO FINANCIERO - LaguLease'], ['Periodo:', monthName], [], ['CONCEPTO', 'MONTO'], ['Ingresos por rentas', ingresos], ['(-) Compras inventario', comprasInv], ['(-) Nómina y fijos', totalFijos], ['(-) Leasing', leasing], ['(-) Impuestos', impuestos], ['(-) Otros gastos', otros], ['TOTAL GASTOS', total], [], ['LO QUE TE QUEDÓ', ingresos - total], [], ['DETALLE DE COBROS'], ['Chofer', 'Placa', 'Monto', 'Método', 'Fecha']];
  monthPays.forEach(p => { const d = drivers.find(dr => dr.id === p.driverId); rows.push([d ? d.nombre : '—', d ? d.placa : '—', p.monto, p.metodo || '', fmtDate(p.createdAt)]); });
  downloadCSV(rows, `LaguLease_Financiero_${monthName.replace(/ /g, '_')}.csv`);
};

window.descargarDeudores = function() {
  const active = drivers.filter(d => d.activo !== false).filter(d => getDriverDebt(d, payments).totalDebt > 0).sort((a, b) => getDriverDebt(b, payments).totalDebt - getDriverDebt(a, payments).totalDebt);
  const rows = [['REPORTE DE DEUDORES - LaguLease'], ['Generado:', new Date().toLocaleDateString('es-MX')], [], ['Chofer', 'Placa', 'Teléfono', 'Renta/sem', 'Deuda total', 'Semanas', 'Inicio']];
  active.forEach(d => { const st = getDriverDebt(d, payments); rows.push([d.nombre, d.placa, d.tel || '', d.renta, st.totalDebt, st.weeksOwed, d.inicio || '']); });
  downloadCSV(rows, `LaguLease_Deudores_${new Date().toLocaleDateString('es-MX').replace(/\//g, '-')}.csv`);
};

window.descargarFlota = function() {
  const rows = [['REPORTE DE FLOTA - LaguLease'], ['Generado:', new Date().toLocaleDateString('es-MX')], [], ['Placa', 'Modelo', 'Año', 'Color', 'No. Serie', 'Estatus', 'Chofer', 'Seguro póliza', 'Seguro vence', 'Leasing fin', 'Pagos rest.']];
  flota.forEach(c => { const chofer = drivers.find(d => d.id === c.choferActualId); rows.push([c.placa, c.modelo || '', c.anio || '', c.color || '', c.numSerie || '', c.estatus || '', chofer ? chofer.nombre : 'Sin chofer', c.seguroPoliza || '', c.seguroVence || '', c.leasingFin || '', c.leasingPagosRestantes || 0]); });
  downloadCSV(rows, `LaguLease_Flota_${new Date().toLocaleDateString('es-MX').replace(/\//g, '-')}.csv`);
};

window.descargarServicios = function() {
  const [y, m] = getSelMonth();
  const monthName = new Date(y, m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  const rows = [['REPORTE DE SERVICIOS - LaguLease'], ['Periodo:', monthName], [], ['Fecha', 'Placa', 'Chofer', 'Tipo', 'KM', 'Próx. KM', 'Refacción', 'Cantidad', 'Notas']];
  getMonthDocs(servicios, y, m).forEach(s => { const d = drivers.find(dr => dr.id === s.driverId); const inv = inventario.find(i => i.id === s.refaccionId); rows.push([fmtDate(s.createdAt), s.placa || d?.placa || '', d ? d.nombre : '—', s.tipo || '', s.km || '', s.proxKm || '', inv ? inv.nombre : '', s.cantidad || '', s.notas || '']); });
  downloadCSV(rows, `LaguLease_Servicios_${monthName.replace(/ /g, '_')}.csv`);
};

window.descargarDocumentos = function() {
  const active = drivers.filter(d => d.activo !== false);
  const rows = [['REPORTE DE DOCUMENTOS - LaguLease'], ['Generado:', new Date().toLocaleDateString('es-MX')], [], ['Chofer', 'Placa', 'No. Licencia', 'Licencia vence', 'Días lic', 'No. INE', 'INE vence', 'Días INE', 'Dom. vence', 'Estatus']];
  active.forEach(d => { const licDias = getDiasRestantes(d.licenciaVence); const ineDias = getDiasRestantes(d.ineVence); const worst = Math.min(licDias ?? 999, ineDias ?? 999); rows.push([d.nombre, d.placa, d.licenciaNum || '', d.licenciaVence || '', licDias ?? 'Sin fecha', d.ineNum || '', d.ineVence || '', ineDias ?? 'Sin fecha', d.domicilioVence || '', worst < 0 ? 'VENCIDO' : worst <= 30 ? 'POR VENCER' : 'AL CORRIENTE']); });
  downloadCSV(rows, `LaguLease_Documentos_${new Date().toLocaleDateString('es-MX').replace(/\//g, '-')}.csv`);
};

// ── Weekly Checklist ──────────────────────────────
function showWeeklyChecklist() {
  if (userRole !== 'admin') return;
  const hoy = new Date();
  if (hoy.getDay() !== 1) return; // Solo lunes
  const key = `lagulease_checklist_${hoy.toISOString().split('T')[0]}`;
  if (localStorage.getItem(key)) return;

  const active = drivers.filter(d => d.activo !== false);
  const statuses = active.map(d => getDriverDebt(d, payments));
  const pendientes = statuses.filter(s => s.status !== 'al_corriente').length;
  const deudaTotal = statuses.reduce((s, st) => s + st.totalDebt, 0);
  const docsAlerta = active.filter(d => ['licenciaVence', 'ineVence'].some(c => { const dias = getDiasRestantes(d[c]); return dias !== null && dias <= 30; })).length;
  const segurosAlerta = flota.filter(c => { const dias = getDiasRestantes(c.seguroVence); return dias !== null && dias <= 30; }).length;

  const items = [
    { id: 'cobros', icon: '💰', text: `Registrar cobros de la semana`, badge: pendientes > 0 ? `${pendientes} pendientes` : '✅ Todos al corriente', done: pendientes === 0 },
    { id: 'deuda', icon: '⚠️', text: `Revisar deuda acumulada`, badge: deudaTotal > 0 ? `${fmt(deudaTotal)} pendiente` : '✅ Sin deuda', done: deudaTotal === 0 },
    { id: 'docs', icon: '📄', text: `Revisar documentos de choferes`, badge: docsAlerta > 0 ? `${docsAlerta} alertas` : '✅ Todo vigente', done: docsAlerta === 0 },
    { id: 'seguros', icon: '🛡️', text: `Revisar seguros de flota`, badge: segurosAlerta > 0 ? `${segurosAlerta} por vencer` : '✅ Todo vigente', done: segurosAlerta === 0 },
    { id: 'gastos', icon: '📊', text: 'Registrar gastos de la semana', badge: '', done: false },
  ];

  const hoyStr = hoy.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('checklist-fecha').textContent = hoyStr;
  document.getElementById('checklist-items').innerHTML = items.map(item => `
    <div class="checklist-item ${item.done ? 'done' : ''}" id="chk-${item.id}">
      <div class="checklist-check ${item.done ? 'checked' : ''}" onclick="toggleCheck('${item.id}')">
        ${item.done ? '✓' : ''}
      </div>
      <div class="checklist-text">${item.icon} ${item.text}</div>
      ${item.badge ? `<span class="badge ${item.done ? 'badge-green' : 'badge-yellow'} checklist-badge">${item.badge}</span>` : ''}
    </div>
  `).join('');

  document.getElementById('checklist-overlay').classList.add('open');
}

window.toggleCheck = function(id) {
  const item = document.getElementById('chk-' + id);
  item.classList.toggle('done');
  const check = item.querySelector('.checklist-check');
  check.classList.toggle('checked');
  check.textContent = check.classList.contains('checked') ? '✓' : '';
};

window.closeChecklist = function() {
  const hoy = new Date().toISOString().split('T')[0];
  localStorage.setItem(`lagulease_checklist_${hoy}`, '1');
  document.getElementById('checklist-overlay').classList.remove('open');
};

// ── Init ──────────────────────────────────────────
const now = new Date();
const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
['fin-month', 'rep-mes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = monthStr; });
