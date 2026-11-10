import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyArbsSRGXJZ126MCrmpsMLm122pfQNHn6I",
  authDomain: "asistencia-204b3.firebaseapp.com",
  projectId: "asistencia-204b3",
  storageBucket: "asistencia-204b3.firebasestorage.app",
  messagingSenderId: "718203638725",
  appId: "1:718203638725:web:27f8e04b692a4d01f231ac",
  measurementId: "G-H6ZSCHBH37"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const SESSION_KEY = 'ajedrez_upmp_session_v1';

const Data = {
  state: { users: [], sessions: [], attendance: [] },
  async load() {
    try {
      const snap = await getDoc(doc(db, "ajedrez", "datosGenerales"));
      if (snap.exists()) {
        const parsed = snap.data();
        this.state = {
          users: parsed.users || [],
          sessions: parsed.sessions || [],
          attendance: parsed.attendance || []
        };
      }
    } catch (err) {
      console.error('Error al leer de Firebase:', err);
    }
  },
  async save() {
    try {
      await setDoc(doc(db, "ajedrez", "datosGenerales"), this.state);
    } catch (err) {
      console.error('Error al guardar en Firebase:', err);
    }
  }
};

/* ---------------------------------------------------------------------
   2. UTILIDADES
   --------------------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const uid = () => (window.crypto && crypto.randomUUID)
  ? crypto.randomUUID()
  : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const pad = (n) => String(n).padStart(2, '0');
function fmtDate(ts) {
  const d = new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function hashPassword(password) {
  const salted = 'upmp-ajedrez::' + password;
  try {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salted));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (err) { /* cae al respaldo */ }
  let h = 5381;
  for (const ch of salted) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return 'x' + (h >>> 0).toString(16);
}

let toastTimer = null;
function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

function openModal(html) {
  $('#modal-box').innerHTML = html;
  $('#modal').hidden = false;
}
function closeModal() {
  $('#modal').hidden = true;
  $('#modal-box').innerHTML = '';
}

/* ---------------------------------------------------------------------
   3. LÓGICA DE NEGOCIO
   --------------------------------------------------------------------- */
let authTab = 'login';
let adminTab = 'dash';
let justifyUserId = null;

const getUser = (id) => Data.state.users.find((u) => u.id === id);
const getStudents = () => Data.state.users.filter((u) => u.rol === 'estudiante');
const sessionsDesc = () => [...Data.state.sessions].sort((a, b) => b.creadaEn - a.creadaEn);
const sessionsAsc = () => [...Data.state.sessions].sort((a, b) => a.creadaEn - b.creadaEn);

function currentUser() {
  const id = localStorage.getItem(SESSION_KEY);
  return id ? getUser(id) : null;
}

const isOpen = (s) => !s.cerrada && Date.now() < s.expiraEn;
const recordFor = (userId, sessionId) =>
  Data.state.attendance.find((a) => a.userId === userId && a.sessionId === sessionId);

function statusOf(user, session) {
  const rec = recordFor(user.id, session.id);
  if (rec) return rec.estado; // asistencia o justificada
  if (isOpen(session)) return 'pendiente';
  // SE ELIMINÓ LA LÍNEA QUE PERDONABA LAS FALTAS SI LA CLASE ERA ANTERIOR AL REGISTRO
  return 'falta'; 
}

function userStats(user) {
  const out = { asistencias: 0, justificadas: 0, faltas: 0, total: 0, pct: 0 };
  
  Data.state.sessions.forEach((s) => {
    const st = statusOf(user, s);
    if (st === 'asistencia') out.asistencias++;
    else if (st === 'justificada') out.justificadas++;
    else if (st === 'falta') out.faltas++;
  });
  
  // EL TOTAL DE CLASES AHORA ES EXACTAMENTE EL TOTAL DE CLASES REGISTRADAS
  out.total = Data.state.sessions.length; 
  out.pct = out.total ? Math.round(((out.asistencias + out.justificadas) / out.total) * 100) : 0;
  
  return out;
}

function generateUniquePin() {
  const active = new Set(Data.state.sessions.filter(isOpen).map((s) => s.codigo));
  let pin;
  do {
    if (window.crypto && crypto.getRandomValues) {
      pin = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
    } else {
      pin = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    }
  } while (active.has(pin));
  return pin;
}

const BADGES = {
  asistencia: ['ok', 'Asistió'],
  justificada: ['warn', 'Justificada'],
  falta: ['bad', 'Falta'],
  pendiente: ['info', 'En curso'],
  na: ['muted', '—']
};
const badge = (st) => `<span class="badge badge-${BADGES[st][0]}">${BADGES[st][1]}</span>`;
const barClass = (pct) => (pct >= 80 ? '' : pct >= 60 ? 'mid' : 'low');

/* ---------------------------------------------------------------------
   4. RENDER
   --------------------------------------------------------------------- */
function renderAll() {
  const user = currentUser();
  $('#view-auth').hidden = true;
  $('#view-admin').hidden = true;
  $('#view-student').hidden = true;
  $('#topbar').hidden = !user;

  if (!user) {
    $('#view-auth').hidden = false;
    renderAuthTabs();
    return;
  }
  $('#user-chip').textContent = user.nombre;

  if (user.rol === 'admin') {
    $('#view-admin').hidden = false;
    renderAdmin();
  } else {
    $('#view-student').hidden = false;
    renderStudent(user);
  }
}

function renderAuthTabs() {
  $$('[data-authtab]').forEach((b) => b.classList.toggle('active', b.dataset.authtab === authTab));
  $('#login-form').hidden = authTab !== 'login';
  $('#register-form').hidden = authTab !== 'register';
}

function renderAdmin() {
  $$('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === adminTab));
  $('#panel-dash').hidden = adminTab !== 'dash';
  $('#panel-codigo').hidden = adminTab !== 'codigo';
  $('#panel-alumnos').hidden = adminTab !== 'alumnos';
  renderDashboard();
  renderCodePanel();
  renderStudentsTable();
}

function kpi(label, value, cls = '') {
  return `<div class="kpi ${cls}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}

function renderDashboard() {
  const students = getStudents();
  const rows = students.map((u) => ({ u, st: userStats(u) }));
  const withData = rows.filter((r) => r.st.total > 0);
  const avg = withData.length ? Math.round(withData.reduce((a, r) => a + r.st.pct, 0) / withData.length) : 0;
  const sum = (k) => rows.reduce((a, r) => a + r.st[k], 0);

  $('#kpis').innerHTML =
    kpi('Alumnos', students.length) +
    kpi('Clases totales', Data.state.sessions.length) +
    kpi('Asistencias', sum('asistencias'), 'ok') +
    kpi('Justificaciones', sum('justificadas'), 'warn') +
    kpi('Faltas', sum('faltas'), 'bad') +
    kpi('Asistencia prom.', avg + '%');

  const sorted = [...rows].sort((a, b) => b.st.pct - a.st.pct);
  $('#chart').innerHTML = sorted.length
    ? sorted.map((r) => `
        <div class="bar-row">
          <span class="bar-name" title="${esc(r.u.nombre)}">${esc(r.u.nombre)}</span>
          <div class="bar-track"><div class="bar-fill ${barClass(r.st.pct)}" style="width:${r.st.pct}%"></div></div>
          <span class="bar-pct">${r.st.pct}%</span>
        </div>`).join('')
    : '<p class="empty">Aún no hay alumnos registrados.</p>';

  $('#tabla-stats').innerHTML = sorted.length
    ? `<table>
        <thead><tr><th>Alumno</th><th>Matrícula</th><th class="num">Asistencias</th><th class="num">Justificadas</th><th class="num">Faltas</th><th class="num">%</th></tr></thead>
        <tbody>${sorted.map((r) => `
          <tr>
            <td>${esc(r.u.nombre)}</td><td>${esc(r.u.matricula)}</td>
            <td class="num">${r.st.asistencias}</td><td class="num">${r.st.justificadas}</td>
            <td class="num">${r.st.faltas}</td><td class="num"><b>${r.st.pct}%</b></td>
          </tr>`).join('')}</tbody></table>`
    : '<p class="empty">Sin datos todavía.</p>';
}

function renderCodePanel() {
  const active = Data.state.sessions.filter(isOpen).sort((a, b) => b.creadaEn - a.creadaEn)[0];

  $('#codigo-actual').innerHTML = active
    ? `<div class="code-display">
         <div class="countdown">Código activo · expira en <b data-countdown="${active.expiraEn}">--:--</b></div>
         <div class="pin">${esc(active.codigo)}</div>
         <div class="row">
           <button class="btn btn-outline btn-sm" data-act="copy-code" data-code="${esc(active.codigo)}">Copiar</button>
           <button class="btn btn-danger btn-sm" data-act="close-code" data-sid="${active.id}">Cerrar código ahora</button>
         </div>
       </div>`
    : '<div class="no-code">No hay un código activo. Genera uno para abrir la asistencia.</div>';

  const list = sessionsDesc();
  $('#historial-clases').innerHTML = list.length
    ? `<table>
        <thead><tr><th>Fecha</th><th>Código</th><th>Estado</th><th class="num">Asistentes</th><th></th></tr></thead>
        <tbody>${list.map((s) => {
          const n = Data.state.attendance.filter((a) => a.sessionId === s.id && a.estado === 'asistencia').length;
          const state = isOpen(s) ? '<span class="badge badge-info">Activo</span>'
            : s.cerrada ? '<span class="badge badge-muted">Cerrado</span>'
            : '<span class="badge badge-muted">Expirado</span>';
          return `<tr>
            <td>${fmtDate(s.creadaEn)}</td><td><b>${esc(s.codigo)}</b></td><td>${state}</td>
            <td class="num">${n}</td>
            <td><button class="btn btn-outline btn-sm" data-act="del-session" data-sid="${s.id}">Eliminar</button></td>
          </tr>`;
        }).join('')}</tbody></table>`
    : '<p class="empty">Todavía no has generado clases.</p>';
}

function renderStudentsTable() {
  const q = ($('#buscar').value || '').trim().toLowerCase();
  const list = getStudents()
    .filter((u) => !q || [u.nombre, u.matricula, u.correo].some((v) => v.toLowerCase().includes(q)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  $('#tabla-alumnos').innerHTML = list.length
    ? `<table>
        <thead><tr><th>Nombre</th><th>Matrícula</th><th>Correo</th><th class="num">A</th><th class="num">J</th><th class="num">F</th><th></th></tr></thead>
        <tbody>${list.map((u) => {
          const st = userStats(u);
          return `<tr>
            <td>${esc(u.nombre)}</td><td>${esc(u.matricula)}</td><td>${esc(u.correo)}</td>
            <td class="num">${st.asistencias}</td><td class="num">${st.justificadas}</td><td class="num">${st.faltas}</td>
            <td><div class="actions">
              <button class="btn btn-outline btn-sm" data-act="justify" data-uid="${u.id}">Asistencias / justificar</button>
              <button class="btn btn-outline btn-sm" data-act="edit-user" data-uid="${u.id}">Editar</button>
              <button class="btn btn-danger btn-sm" data-act="del-user" data-uid="${u.id}">Eliminar</button>
            </div></td>
          </tr>`;
        }).join('')}</tbody></table>
        <p class="hint">A = asistencias · J = justificadas · F = faltas</p>`
    : '<p class="empty">No hay alumnos que coincidan.</p>';
}

function renderStudent(user) {
  $('#student-welcome').textContent = `Hola, ${user.nombre.split(' ')[0]}`;
  const st = userStats(user);
  $('#student-kpis').innerHTML =
    kpi('Asistencias', st.asistencias, 'ok') +
    kpi('Justificadas', st.justificadas, 'warn') +
    kpi('Faltas', st.faltas, 'bad') +
    kpi('Mi asistencia', st.pct + '%');

  const rows = sessionsDesc().map((s) => ({ s, st: statusOf(user, s), rec: recordFor(user.id, s.id) }));

  $('#student-history').innerHTML = rows.length
    ? `<table>
        <thead><tr><th>Clase</th><th>Estado</th><th>Registrada</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr><td>${fmtDate(r.s.creadaEn)}</td><td>${badge(r.st)}</td>
          <td>${r.rec ? fmtDate(r.rec.marcadaEn) : '—'}</td></tr>`).join('')}</tbody></table>`
    : '<p class="empty">Todavía no hay clases registradas.</p>';
}

function justifyModalHTML(userId) {
  const u = getUser(userId);
  if (!u) return '';
  const st = userStats(u);
  const list = sessionsDesc();
  const rows = list.map((s) => {
    const status = statusOf(u, s);
    const btn = (target, label, cls) =>
      `<button class="btn ${cls} btn-sm" data-act="set-status" data-uid="${u.id}" data-sid="${s.id}" data-st="${target}" ${status === target ? 'disabled' : ''}>${label}</button>`;
    return `<tr>
      <td>${fmtDate(s.creadaEn)}</td><td>${badge(status)}</td>
      <td><div class="actions">${btn('asistencia', 'Asistió', 'btn-outline')}${btn('justificada', 'Justificar', 'btn-outline')}${btn('falta', 'Falta', 'btn-outline')}</div></td>
    </tr>`;
  }).join('');
  return `
    <div class="modal-head">
      <div><h3>${esc(u.nombre)}</h3>
      <p class="muted" style="margin:0">${esc(u.matricula)} · ${st.asistencias} asist. · ${st.justificadas} justif. · ${st.faltas} faltas</p></div>
      <button class="modal-close" data-act="modal-close" aria-label="Cerrar">×</button>
    </div>
    <div class="table-wrap">${list.length
      ? `<table><thead><tr><th>Clase</th><th>Estado</th><th>Cambiar a</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<p class="empty">No hay clases registradas.</p>'}</div>
    <div class="modal-foot"><button class="btn btn-primary" data-act="modal-close">Listo</button></div>`;
}

function editModalHTML(userId) {
  const u = getUser(userId);
  const title = currentUser().id === u.id ? 'Mi Perfil' : 'Editar alumno';
  return `
    <div class="modal-head"><h3>${title}</h3>
      <button class="modal-close" data-act="modal-close" aria-label="Cerrar">×</button></div>
    <form id="edit-form" class="form" data-uid="${u.id}">
      <label>Nombre completo<input name="nombre" required minlength="3" value="${esc(u.nombre)}"></label>
      <label>Matrícula<input name="matricula" required minlength="4" value="${esc(u.matricula)}"></label>
      <label>Correo<input type="email" name="correo" required value="${esc(u.correo)}"></label>
      <label>Nueva contraseña (opcional)<input type="password" name="password" minlength="6" placeholder="Déjalo vacío para no cambiarla" autocomplete="new-password"></label>
      <div class="modal-foot">
        <button type="button" class="btn btn-outline" data-act="modal-close">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar cambios</button>
      </div>
    </form>`;
}

function confirmModalHTML(title, text, confirmAct, dataAttrs) {
  return `
    <div class="modal-head"><h3>${esc(title)}</h3>
      <button class="modal-close" data-act="modal-close" aria-label="Cerrar">×</button></div>
    <p>${esc(text)}</p>
    <div class="modal-foot">
      <button class="btn btn-outline" data-act="modal-close">Cancelar</button>
      <button class="btn btn-danger" data-act="${confirmAct}" ${dataAttrs}>Sí, eliminar</button>
    </div>`;
}

/* ---------------------------------------------------------------------
   5. ACCIONES ASÍNCRONAS
   --------------------------------------------------------------------- */
async function handleLogin(form) {
  await Data.load(); // Refresca por si hubo cambios en la web
  const id = form.usuario.value.trim().toLowerCase();
  const hash = await hashPassword(form.password.value);
  const user = Data.state.users.find((u) =>
    (u.correo.toLowerCase() === id || u.matricula.toLowerCase() === id) && u.passHash === hash);
  if (!user) return toast('Credenciales incorrectas.', 'error');
  localStorage.setItem(SESSION_KEY, user.id);
  form.reset();
  renderAll();
  toast('Bienvenido, ' + user.nombre.split(' ')[0], 'ok');
}

async function handleRegister(form) {
  const nombre = form.nombre.value.trim();
  const matricula = form.matricula.value.trim();
  const correo = form.correo.value.trim().toLowerCase();
  const pass = form.password.value;
  if (pass !== form.password2.value) return toast('Las contraseñas no coinciden.', 'error');
  if (pass.length < 6) return toast('La contraseña debe tener al menos 6 caracteres.', 'error');
  
  await Data.load(); 
  if (Data.state.users.some((u) => u.matricula.toLowerCase() === matricula.toLowerCase()))
    return toast('Esa matrícula ya está registrada.', 'error');
  if (Data.state.users.some((u) => u.correo.toLowerCase() === correo))
    return toast('Ese correo ya está registrado.', 'error');

  const user = {
    id: uid(), nombre, matricula, correo,
    passHash: await hashPassword(pass),
    rol: 'estudiante', creadoEn: Date.now()
  };
  Data.state.users.push(user);
  await Data.save();
  localStorage.setItem(SESSION_KEY, user.id);
  form.reset();
  renderAll();
  toast('Cuenta creada. ¡Bienvenido al taller!', 'ok');
}

async function handleGenerateCode(form) {
  await Data.load();
  const minutes = parseInt(form.duracion.value, 10) || 10;
  const now = Date.now();
  Data.state.sessions.forEach((s) => { if (isOpen(s)) s.cerrada = true; });
  Data.state.sessions.push({
    id: uid(), codigo: generateUniquePin(), fecha: todayISO(),
    creadaEn: now, expiraEn: now + minutes * 60000, cerrada: false
  });
  await Data.save();
  renderAdmin();
  toast('Código generado.', 'ok');
}

async function handleMarkAttendance(form) {
  await Data.load();
  const user = currentUser();
  const code = form.codigo.value.trim();
  const session = Data.state.sessions.find((s) => s.codigo === code && isOpen(s));
  if (!session) return toast('Código inválido o expirado.', 'error');
  if (recordFor(user.id, session.id)) return toast('Ya registraste tu asistencia en esta clase.', 'error');
  Data.state.attendance.push({
    id: uid(), sessionId: session.id, userId: user.id,
    estado: 'asistencia', marcadaEn: Date.now(), manual: false
  });
  await Data.save();
  form.reset();
  renderStudent(user);
  toast('Asistencia registrada.', 'ok');
}

async function setStatus(userId, sessionId, status) {
  await Data.load();
  Data.state.attendance = Data.state.attendance.filter(
    (a) => !(a.userId === userId && a.sessionId === sessionId));
  if (status !== 'falta') {
    Data.state.attendance.push({
      id: uid(), sessionId, userId, estado: status, marcadaEn: Date.now(), manual: true
    });
  }
  await Data.save();
}

async function handleEditUser(form) {
  await Data.load();
  const u = getUser(form.dataset.uid);
  const nombre = form.nombre.value.trim();
  const matricula = form.matricula.value.trim();
  const correo = form.correo.value.trim().toLowerCase();
  
  if (Data.state.users.some((x) => x.id !== u.id && x.matricula.toLowerCase() === matricula.toLowerCase()))
    return toast('Esa matrícula ya pertenece a otro usuario.', 'error');
  if (Data.state.users.some((x) => x.id !== u.id && x.correo.toLowerCase() === correo))
    return toast('Ese correo ya pertenece a otro usuario.', 'error');
  
  Object.assign(u, { nombre, matricula, correo });
  
  const finish = async () => { await Data.save(); closeModal(); renderAll(); toast('Datos actualizados.', 'ok'); };
  
  if (form.password.value) {
    u.passHash = await hashPassword(form.password.value);
    await finish();
  } else {
    await finish();
  }
}

function exportCSV() {
  const students = getStudents().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  if (!students.length) return toast('No hay alumnos para exportar.', 'error');
  const sessions = sessionsAsc();
  const sym = { asistencia: 'A', justificada: 'J', falta: 'F', pendiente: 'En curso', na: '-' };

  const header = ['Nombre', 'Matrícula', 'Correo', 'Asistencias', 'Justificadas', 'Faltas', '% Asistencia',
    ...sessions.map((s) => 'Clase ' + fmtDate(s.creadaEn))];
  const rows = students.map((u) => {
    const st = userStats(u);
    return [u.nombre, u.matricula, u.correo, st.asistencias, st.justificadas, st.faltas, st.pct + '%',
      ...sessions.map((s) => sym[statusOf(u, s)])];
  });
  rows.push([], ['Leyenda: A = Asistió, J = Justificada, F = Falta, - = clase previa al registro del alumno']);

  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); 
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `asistencia_ajedrez_${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Archivo exportado.', 'ok');
}

/* ---------------------------------------------------------------------
   6. EVENTOS (Adaptados para asincronía)
   --------------------------------------------------------------------- */
function bindEvents() {
  document.addEventListener('click', async (e) => {
    const authTabBtn = e.target.closest('[data-authtab]');
    if (authTabBtn) { authTab = authTabBtn.dataset.authtab; renderAuthTabs(); return; }

    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) { adminTab = tabBtn.dataset.tab; renderAdmin(); return; }

    if (e.target.id === 'modal') { closeModal(); justifyUserId = null; return; }

    const el = e.target.closest('[data-act]');
    if (!el) return;
    const d = el.dataset;

    switch (d.act) {
      case 'logout':
        localStorage.removeItem(SESSION_KEY);
        renderAll();
        break;
      case 'edit-profile':
        openModal(editModalHTML(currentUser().id));
        break;
      case 'modal-close':
        closeModal(); justifyUserId = null;
        break;
      case 'copy-code':
        (navigator.clipboard ? navigator.clipboard.writeText(d.code) : Promise.reject())
          .then(() => toast('Código copiado.', 'ok'))
          .catch(() => toast('Copia el código manualmente.'));
        break;
      case 'close-code': {
        await Data.load();
        const s = Data.state.sessions.find((x) => x.id === d.sid);
        if (s) { s.cerrada = true; await Data.save(); renderAdmin(); toast('Código cerrado.'); }
        break;
      }
      case 'del-session':
        openModal(confirmModalHTML('Eliminar clase',
          'Se eliminará esta clase y todos los registros de asistencia asociados. ¿Continuar?',
          'confirm-del-session', `data-sid="${d.sid}"`));
        break;
      case 'confirm-del-session':
        await Data.load();
        Data.state.sessions = Data.state.sessions.filter((s) => s.id !== d.sid);
        Data.state.attendance = Data.state.attendance.filter((a) => a.sessionId !== d.sid);
        await Data.save(); closeModal(); renderAdmin(); toast('Clase eliminada.');
        break;
      case 'justify':
        justifyUserId = d.uid;
        openModal(justifyModalHTML(d.uid));
        break;
      case 'set-status':
        await setStatus(d.uid, d.sid, d.st);
        openModal(justifyModalHTML(d.uid));
        renderAdmin();
        break;
      case 'edit-user':
        openModal(editModalHTML(d.uid));
        break;
      case 'del-user': {
        const u = getUser(d.uid);
        openModal(confirmModalHTML('Eliminar alumno',
          `Se eliminará a ${u.nombre} y todo su historial de asistencia. Esta acción no se puede deshacer.`,
          'confirm-del-user', `data-uid="${d.uid}"`));
        break;
      }
      case 'confirm-del-user':
        await Data.load();
        Data.state.users = Data.state.users.filter((u) => u.id !== d.uid);
        Data.state.attendance = Data.state.attendance.filter((a) => a.userId !== d.uid);
        await Data.save(); closeModal(); renderAdmin(); toast('Alumno eliminado.');
        break;
      case 'export-csv':
        exportCSV();
        break;
    }
  });

  document.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    switch (f.id) {
      case 'login-form': await handleLogin(f); break;
      case 'register-form': await handleRegister(f); break;
      case 'gen-form': await handleGenerateCode(f); break;
      case 'mark-form': await handleMarkAttendance(f); break;
      case 'edit-form': await handleEditUser(f); break;
    }
  });

  $('#buscar').addEventListener('input', renderStudentsTable);

  $('#codigo-input').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal').hidden) { closeModal(); justifyUserId = null; }
  });
}

function tick() {
  let expired = false;
  $$('[data-countdown]').forEach((el) => {
    const left = Math.max(0, Math.floor((parseInt(el.dataset.countdown, 10) - Date.now()) / 1000));
    el.textContent = `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
    if (left === 0) expired = true;
  });
  if (expired) {
    const u = currentUser();
    if (u && u.rol === 'admin') renderAdmin();
    else if (u) renderStudent(u);
  }
}

/* ---------------------------------------------------------------------
   7. ARRANQUE
   --------------------------------------------------------------------- */
async function init() {
  await Data.load(); // Carga la DB en la nube antes de pintar la web

  if (!Data.state.users.some((u) => u.rol === 'admin')) {
    Data.state.users.push({
      id: uid(),
      nombre: 'Profesor del Taller',
      matricula: 'ADMIN',
      correo: 'profesor@upmetropolitana.edu.mx',
      passHash: await hashPassword('ajedrez2026'),
      rol: 'admin',
      creadoEn: Date.now()
    });
    await Data.save();
  }

  bindEvents();
  renderAll();
  setInterval(tick, 1000);
  tick();
}

document.addEventListener('DOMContentLoaded', init);