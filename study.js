
(function () {
    'use strict';
    const KEY = 'ctrl.study.v1', BUCKET = 'ctrl-study-files', $ = id => document.getElementById(id);
    const uid = () => crypto.randomUUID ? crypto.randomUUID() : 'study-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const day = () => new Date().toISOString().slice(0, 10);
    const dateLabel = v => { if (!v) return 'Sin fecha'; const d = new Date(v + 'T12:00:00'); return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }); };
    const icon = n => '<i data-lucide="' + n + '"></i>';
    const emptyData = () => ({ folders: [], subjects: [], notes: [], files: [], tasks: [], dates: [], topics: [], flashcards: [], wall: [], grades: [] });
    let data = emptyData(), activeFolder = null, activeSubject = null, activeTab = 'overview', search = '';
    function load() { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && typeof v === 'object') data = Object.assign(emptyData(), v); } catch (e) { console.warn('[Ctrl Estudio] Error leyendo datos', e) } Object.keys(emptyData()).forEach(k => { if (!Array.isArray(data[k])) data[k] = []; }); }
    function ensureDefaultFolders() {
        if (data._defaultFoldersSeeded === true) return;
        const defaults = ['Escuela', 'Trabajo', 'Personal'];
        defaults.forEach(name => {
            if (!data.folders.some(f => String(f.name || '').trim().toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) {
                data.folders.push({ id: uid(), name, description: '', icon: 'folder', archived: false, createdAt: Date.now() });
            }
        });
        data._defaultFoldersSeeded = true;
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { console.warn('[Ctrl Estudio] No se pudieron guardar las carpetas iniciales', e); toast('No se pudieron guardar las carpetas iniciales. Revisá el espacio disponible.'); }
    }
    function toast(t) { const e = $('toast'); if (e) { e.textContent = t; e.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => e.classList.remove('show'), 2600); } }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); render(); return true; } catch (e) { toast('No se pudo guardar: revisá el espacio disponible.'); return false; } }
    function folder(id) { return data.folders.find(x => x.id === id); }
    function subject(id) { return data.subjects.find(x => x.id === id); }
    function rows(k, id) { return data[k].filter(x => x.subjectId === id); }
    function fmtSize(b) { return b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; }
    function getClient() { return new Promise((resolve, reject) => { let n = 0; function check() { const c = window.ctrlSupabase; if (c && c.auth) { c.auth.getUser().then(r => r.error ? reject(r.error) : r.data.user ? resolve({ client: c, user: r.data.user }) : reject(new Error('Iniciá sesión para administrar archivos.'))).catch(reject); return; } if (++n > 40) { reject(new Error('Supabase no está disponible. Recargá la página.')); return; } setTimeout(check, 150); } check(); }); }
    async function uploadFile(file, subjectId) { const { client, user } = await getClient(); const id = uid(), safe = file.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120) || 'archivo', path = user.id + '/' + subjectId + '/' + id + '-' + safe; if (file.size > 50 * 1024 * 1024) throw new Error('El máximo por archivo es 50 MB.'); const { error } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false }); if (error) throw error; data.files.unshift({ id, subjectId, name: file.name, size: file.size, type: file.type || 'application/octet-stream', storagePath: path, createdAt: Date.now() }); if (!save()) { await client.storage.from(BUCKET).remove([path]); throw new Error('No se pudo guardar el registro del archivo.'); } }
    async function openFile(id) { const f = data.files.find(x => x.id === id); if (!f) return; try { const { client } = await getClient(), r = await client.storage.from(BUCKET).createSignedUrl(f.storagePath, 60); if (r.error) throw r.error; window.open(r.data.signedUrl, '_blank', 'noopener,noreferrer'); } catch (e) { toast('No se pudo abrir: ' + e.message); } }
    async function deleteFile(id) { const f = data.files.find(x => x.id === id); if (!f || !confirm('¿Eliminar ' + f.name + '?')) return; try { const { client } = await getClient(), r = await client.storage.from(BUCKET).remove([f.storagePath]); if (r.error) throw r.error; data.files = data.files.filter(x => x.id !== id); save(); toast('Archivo eliminado'); } catch (e) { toast('No se pudo eliminar: ' + e.message); } }
    async function syncGoogle(item, oldId) { try { const t = JSON.parse(sessionStorage.getItem('ctrl_google_calendar_token') || 'null'); if (!t || !t.accessToken || Number(t.expiresAt) < Date.now()) return oldId || null; const s = subject(item.subjectId), next = new Date(item.date + 'T12:00:00'); next.setDate(next.getDate() + 1); const end = next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0') + '-' + String(next.getDate()).padStart(2, '0'); const payload = { summary: '[' + ((s && s.name) || 'Estudio') + '] ' + item.title, description: (item.description || '') + '\n\nCreado desde Ctrl · Estudio' }; if (item.time) { const start = new Date(item.date + 'T' + item.time + ':00'), finish = new Date(start.getTime() + 60 * 60000); payload.start = { dateTime: start.toISOString() }; payload.end = { dateTime: finish.toISOString() }; } else { payload.start = { date: item.date }; payload.end = { date: end }; } const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events' + (oldId ? '/' + encodeURIComponent(oldId) : ''); const r = await fetch(url, { method: oldId ? 'PUT' : 'POST', headers: { Authorization: 'Bearer ' + t.accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || 'Google Calendar ' + r.status); } return (await r.json()).id || oldId || null; } catch (e) { console.warn('[Ctrl Estudio] Google Calendar no disponible:', e); return oldId || null; } }
    async function removeGoogle(item) { if (!item?.googleEventId) return; try { const t = JSON.parse(sessionStorage.getItem('ctrl_google_calendar_token') || 'null'); if (t?.accessToken && Number(t.expiresAt) > Date.now()) await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(item.googleEventId), { method: 'DELETE', headers: { Authorization: 'Bearer ' + t.accessToken } }); } catch (e) { console.warn(e); } }
    function calendarEvents() { return data.dates.map(x => { const d = new Date(x.date + 'T12:00:00'); d.setDate(d.getDate() + 1); const end = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); const event = { id: 'ctrl-study-' + x.id, summary: '📚 ' + x.title, description: x.description || '', _calendarName: 'Ctrl · Estudio · ' + ((subject(x.subjectId) || {}).name || 'Materia'), _calendarColor: '#81936b', _isCtrlStudy: true }; if (x.time) { const start = new Date(x.date + 'T' + x.time + ':00'), finish = new Date(start.getTime() + 60 * 60000); event.start = { dateTime: start.toISOString() }; event.end = { dateTime: finish.toISOString() }; } else { event.start = { date: x.date }; event.end = { date: end }; } return event; }); }
    let lastNav = null;
    function navAnim() {
        const nav = (activeFolder || '') + '|' + (activeSubject || '') + '|' + (activeSubject ? activeTab : '');
        const changed = lastNav !== null && nav !== lastNav; lastNav = nav;
        if (!changed || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const scope = activeSubject ? document.querySelector('[data-study-panel="' + activeTab + '"]') : activeFolder ? $('studySubjectGrid') : $('studyFolderGrid');
        if (!scope) return;
        scope.querySelectorAll('.study-folder,.study-subject,.study-metric,.study-item,.mural-note,.study-empty').forEach((el, i) => {
            el.animate([{ opacity: 0, transform: 'translate3d(-26px,22px,0) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: Math.min(700, i * 55), easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
        });
    }
    function render() {
        const fg = $('studyFolderGrid'), sg = $('studySubjectGrid'); if (!fg || !sg) return;
        const currentFolder = folder(activeFolder), currentSubject = subject(activeSubject);
        const fs = data.folders.filter(f => !f.archived && (!search || (f.name + ' ' + (f.description || '')).toLowerCase().includes(search.toLowerCase())));
        fg.innerHTML = fs.map(f => { const ss = data.subjects.filter(s => s.folderId === f.id && !s.archived), due = data.dates.filter(d => { const s = subject(d.subjectId); return s && s.folderId === f.id && d.date >= day() }).length, files = data.files.filter(x => { const s = subject(x.subjectId); return s && s.folderId === f.id }).length; return '<button class="study-folder" type="button" data-folder="' + esc(f.id) + '"><div class="study-folder-top"><span class="study-folder-icon">' + icon('folder') + '</span><span><strong>' + esc(f.name) + '</strong><small>' + ss.length + ' ' + (ss.length === 1 ? 'materia' : 'materias') + '</small></span></div><div class="study-card-meta"><span>' + due + ' fechas próximas</span><span>' + files + ' archivos</span></div></button>'; }).join('');
        const ss = data.subjects.filter(s => !s.archived && (!search || (s.name + ' ' + (s.description || '')).toLowerCase().includes(search.toLowerCase())) && (!activeFolder || s.folderId === activeFolder));
        sg.innerHTML = ss.map(s => '<button class="study-subject" type="button" data-subject="' + esc(s.id) + '"><div class="study-subject-top"><span class="study-subject-icon">' + icon('book-open') + '</span><span><strong>' + esc(s.name) + '</strong><small>' + esc(folder(s.folderId)?.name || 'Sin carpeta') + '</small></span></div><div class="study-card-meta"><span>' + rows('notes', s.id).length + ' apuntes</span><span>' + rows('files', s.id).length + ' archivos</span><span>' + rows('tasks', s.id).filter(t => t.status !== 'done').length + ' pendientes</span></div></button>').join('');
        const pageTitle = $('studyPageTitle'), pageDescription = $('studyPageDescription');
        if (pageTitle) pageTitle.textContent = currentSubject ? currentSubject.name : currentFolder ? currentFolder.name : 'Estudio';
        if (pageDescription) pageDescription.textContent = currentSubject ? (currentSubject.description || currentFolder?.name || 'Materia') : currentFolder ? (currentFolder.description || 'Materias y materiales de esta carpeta.') : 'Materias, apuntes, documentos, tareas y fechas en un solo lugar.';
        $('studyFoldersWrap').hidden = !!activeFolder || !!activeSubject;
        $('studyFolderLabel').hidden = !!activeFolder || !!activeSubject;
        $('studySubjectGrid').hidden = !activeFolder || !!activeSubject;
        $('studyAllSubjectsLabel').hidden = !activeFolder || !!activeSubject;
        $('studyFolderEmpty').hidden = fs.length > 0 || !!activeFolder || !!activeSubject;
        $('studySubjectEmpty').hidden = ss.length > 0 || !activeFolder || !!activeSubject;
        $('studyToolbar').hidden = !!activeSubject;
        $('studyFolderBack').hidden = !activeFolder && !activeSubject;
        $('studyEditFolder').hidden = !activeFolder || !!activeSubject;
        $('studyDeleteFolder').hidden = !activeFolder || !!activeSubject;
        $('studyAddFolder').hidden = !!activeFolder || !!activeSubject;
        $('studyAddSubject').hidden = !activeFolder || !!activeSubject;
        $('studyEditSubject').hidden = !activeSubject;
        $('studyArchiveSubject').hidden = !activeSubject;
        $('studyDeleteSubject').hidden = !activeSubject;
        $('studyAllSubjectsLabel').textContent = currentFolder ? 'MATERIAS DE ' + currentFolder.name.toUpperCase() : 'MATERIAS';
        $('studySubjectDetail').hidden = !activeSubject;
        if (activeSubject) renderSubject();
        navAnim();
        if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
    }
    function list(items) { if (!items.length) return '<div class="study-empty">Todavía no hay elementos en esta sección.</div>'; return '<div class="study-list">' + items.map(x => '<article class="study-item"><div class="study-item-main"><strong>' + esc(x.title) + '</strong>' + (x.body ? '<p>' + esc(x.body) + '</p>' : '') + '<div class="study-item-meta"><span>' + esc(x.meta || '') + '</span>' + (x.done ? '<span class="study-badge done">Completada</span>' : '') + '</div></div>' + (x.kind === 'task' ? '<button class="study-icon-btn" type="button" data-toggle-task="' + esc(x.id) + '" title="Cambiar estado">' + icon(x.done ? 'rotate-ccw' : 'check') + '</button>' : '') + '<div class="study-item-actions">' + (x.kind === 'file' ? '<button class="study-icon-btn" type="button" data-open-file="' + esc(x.id) + '" title="Abrir">' + icon('external-link') + '</button>' : '') + '<button class="study-icon-btn" type="button" data-edit="' + esc(x.kind) + '" data-id="' + esc(x.id) + '" title="Editar">' + icon('pencil') + '</button><button class="study-icon-btn" type="button" data-delete="' + esc(x.kind) + '" data-id="' + esc(x.id) + '" title="Eliminar">' + icon('trash-2') + '</button></div></article>').join('') + '</div>'; }
    function renderSubject() {
        const s = subject(activeSubject); if (!s) { activeSubject = null; return; }
        $('studySubjectTitle').textContent = s.name; $('studySubjectDescription').textContent = s.description || folder(s.folderId)?.name || 'Materia'; $('studySubjectCrumbName').textContent = s.name; $('studyBreadcrumbFolder').textContent = folder(s.folderId)?.name || 'Carpeta';
        document.querySelectorAll('[data-study-tab]').forEach(b => b.classList.toggle('active', b.dataset.studyTab === activeTab)); document.querySelectorAll('[data-study-panel]').forEach(p => p.hidden = p.dataset.studyPanel !== activeTab);
        const dates = rows('dates', s.id).filter(x => x.date >= day()).sort((a, b) => a.date.localeCompare(b.date)), tasks = rows('tasks', s.id), topics = rows('topics', s.id);
        $('studyOverview').innerHTML = '<div class="study-metric-grid"><div class="study-metric"><span>Apuntes</span><strong>' + rows('notes', s.id).length + '</strong></div><div class="study-metric"><span>Archivos</span><strong>' + rows('files', s.id).length + '</strong></div><div class="study-metric"><span>Pendientes</span><strong>' + tasks.filter(x => x.status !== 'done').length + '</strong></div><div class="study-metric"><span>Próximas fechas</span><strong>' + dates.length + '</strong></div></div>' + (dates.length ? '<div class="study-section-label">Próximos compromisos</div>' + list(dates.slice(0, 5).map(d => ({ kind: 'date', id: d.id, title: d.title, body: d.description, meta: dateLabel(d.date) + ' · ' + d.type }))) : '') + (topics.length ? '<div class="study-section-label">Temario</div>' + list(topics.map(t => ({ kind: 'topic', id: t.id, title: t.title, meta: t.status === 'done' ? 'Estudiado' : t.status === 'doing' ? 'En curso' : 'Pendiente', done: t.status === 'done' }))) : '');
        $('studyNotesPanel').innerHTML = '<form class="study-form" data-form="note"><div class="study-field"><label>Título del apunte</label><input name="title" maxlength="180" required placeholder="Ej. Unidad 1 · Introducción"></div><div class="study-field"><label>Organización</label><select name="pinned"><option value="false">Apunte normal</option><option value="true">Fijar arriba</option></select></div><div class="study-field full"><label>Contenido</label><textarea name="body" maxlength="50000" required placeholder="Escribí tus apuntes..."></textarea></div><div class="study-form-actions"><button class="primary" type="submit">Guardar apunte</button></div></form>' + list(rows('notes', s.id).slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt).map(n => ({ kind: 'note', id: n.id, title: n.title, body: n.body, meta: (n.pinned ? 'Fijado · ' : '') + 'Editado ' + dateLabel(new Date(n.updatedAt).toISOString().slice(0, 10)) })));
        $('studyFilesPanel').innerHTML = '<label class="study-upload" id="studyUploadDropzone" for="studyFileInput"><i data-lucide="upload-cloud"></i><span>Arrastrá un archivo o hacé clic para seleccionar</span><input type="file" id="studyFileInput" multiple></label><div class="study-files-list">' + list(rows('files', s.id).map(f => ({ kind: 'file', id: f.id, title: f.name, meta: fmtSize(f.size) + ' · ' + dateLabel(new Date(f.createdAt).toISOString().slice(0, 10)) }))) + '</div>';
        $('studyTasksPanel').innerHTML = '<form class="study-form" data-form="task"><div class="study-field"><label>Tarea o ejercicio</label><input name="title" required maxlength="180" placeholder="Ej. Resolver guía 3"></div><div class="study-field"><label>Fecha límite (opcional)</label><input name="dueDate" type="date"></div><div class="study-field"><label>Prioridad</label><select name="priority"><option value="medium">Media</option><option value="high">Alta</option><option value="low">Baja</option></select></div><div class="study-field full"><label>Descripción</label><textarea name="description" maxlength="5000" placeholder="Detalles, pasos o materiales..."></textarea></div><div class="study-form-actions"><button class="primary" type="submit">Agregar tarea</button></div></form>' + list(tasks.slice().sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))).map(t => ({ kind: 'task', id: t.id, title: t.title, body: t.description, meta: (t.status === 'done' ? 'Completada' : 'Pendiente') + ' · ' + (t.dueDate ? dateLabel(t.dueDate) : 'Sin fecha') + ' · Prioridad ' + t.priority, done: t.status === 'done' })));
        $('studyDatesPanel').innerHTML = '<form class="study-form" data-form="date"><div class="study-field"><label>Título</label><input name="title" required maxlength="180" placeholder="Ej. Parcial de álgebra"></div><div class="study-field"><label>Tipo</label><select name="type"><option>Examen</option><option>Entrega</option><option>Trabajo práctico</option><option>Inscripción</option><option>Recordatorio</option><option>Otro</option></select></div><div class="study-field"><label>Fecha</label><input name="date" type="date" required></div><div class="study-field"><label>Hora (opcional)</label><input name="time" type="time"></div><div class="study-field full"><label>Detalles</label><textarea name="description" maxlength="3000" placeholder="Temas incluidos, instrucciones..."></textarea></div><div class="study-form-actions"><button class="primary" type="submit">Guardar fecha y agregar al calendario</button></div></form>' + list(rows('dates', s.id).slice().sort((a, b) => a.date.localeCompare(b.date)).map(d => ({ kind: 'date', id: d.id, title: d.title, body: d.description, meta: dateLabel(d.date) + ' · ' + d.type + (d.googleEventId ? ' · Google Calendar' : '') })));
        $('studyTopicsPanel').innerHTML = '<form class="study-form" data-form="topic"><div class="study-field"><label>Tema o unidad</label><input name="title" required maxlength="180" placeholder="Ej. Unidad 2 · Funciones"></div><div class="study-field"><label>Estado</label><select name="status"><option value="todo">Pendiente</option><option value="doing">En curso</option><option value="done">Estudiado</option></select></div><div class="study-form-actions"><button class="primary" type="submit">Agregar al temario</button></div></form>' + list(topics.map(t => ({ kind: 'topic', id: t.id, title: t.title, meta: t.status === 'done' ? 'Estudiado' : t.status === 'doing' ? 'En curso' : 'Pendiente', done: t.status === 'done' })));
        $('studyWallPanel').innerHTML = wallMarkup(s.id); typeset($('studyWallPanel'));
        $('studyGradesPanel').innerHTML = '<form class="study-form" data-form="grade"><div class="study-field"><label>Evaluación</label><input name="title" required maxlength="180" placeholder="Ej. Primer parcial"></div><div class="study-field"><label>Fecha</label><input name="date" type="date"></div><div class="study-field"><label>Nota obtenida</label><input name="score" type="number" min="0" step=".01" required></div><div class="study-field"><label>Nota máxima</label><input name="maxScore" type="number" min=".01" step=".01" value="10" required></div><div class="study-form-actions"><button class="primary" type="submit">Registrar calificación</button></div></form>' + list(rows('grades', s.id).map(g => ({ kind: 'grade', id: g.id, title: g.title, meta: g.score + ' / ' + g.maxScore + (g.date ? ' · ' + dateLabel(g.date) : '') })));
        if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
    }
    function addFolder() { const n = prompt('Nombre de la carpeta (Universidad, Trabajo, Personal…):'); if (!n || !n.trim()) return; data.folders.push({ id: uid(), name: n.trim().slice(0, 100), description: '', icon: 'folder', archived: false, createdAt: Date.now() }); activeFolder = null; if (!save()) return; toast('Carpeta creada'); if (typeof window.ctrlSyncNow === 'function') window.ctrlSyncNow().catch(e => { console.warn('[Ctrl Estudio] No se pudo sincronizar la carpeta:', e); toast('Carpeta creada localmente; no se pudo sincronizar. Revisá tu conexión.'); }); }
    function addSubject() { const fs = data.folders.filter(f => !f.archived); if (!fs.length) { toast('Primero creá una carpeta.'); return; } let f = activeFolder ? folder(activeFolder) : fs[0]; if (fs.length > 1 && !activeFolder) { const n = prompt('¿En qué carpeta?\n' + fs.map(x => x.name).join('\n'), f?.name || fs[0].name); if (!n) return; f = fs.find(x => x.name.toLowerCase() === n.trim().toLowerCase()); if (!f) { toast('No encontramos esa carpeta.'); return; } } const n = prompt('Nombre de la materia o sección:'); if (!n || !n.trim()) return; const desc = prompt('Descripción u objetivo (opcional):') || ''; data.subjects.push({ id: uid(), folderId: f.id, name: n.trim().slice(0, 120), description: desc.trim().slice(0, 500), archived: false, createdAt: Date.now() }); activeFolder = f.id; save(); toast('Materia creada'); }
    function formData(form) { return Object.fromEntries(new FormData(form).entries()); }
    function submitForm(e) {
        const form = e.target.closest('form[data-form]'); if (!form) return; e.preventDefault(); const v = formData(form), id = uid(), subjectId = activeSubject;
        if (form.dataset.form === 'note') data.notes.unshift({ id, subjectId, title: v.title.trim(), body: v.body.trim(), pinned: v.pinned === 'true', createdAt: Date.now(), updatedAt: Date.now() });
        if (form.dataset.form === 'task') data.tasks.unshift({ id, subjectId, title: v.title.trim(), description: (v.description || '').trim(), dueDate: v.dueDate || '', priority: v.priority || 'medium', status: 'todo', createdAt: Date.now() });
        if (form.dataset.form === 'date') { if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date || '')) { toast('Elegí una fecha válida.'); return; } const item = { id, subjectId, title: v.title.trim(), type: v.type, date: v.date, time: v.time || '', description: (v.description || '').trim(), createdAt: Date.now(), googleEventId: null }; data.dates.unshift(item); save(); syncGoogle(item, null).then(gid => { if (gid) { item.googleEventId = gid; save(); toast('Fecha sincronizada con Google Calendar'); } else toast('Fecha guardada en Ctrl y visible en su calendario'); }); toast('Fecha guardada'); return; }
        if (form.dataset.form === 'topic') data.topics.push({ id, subjectId, title: v.title.trim(), status: v.status || 'todo', createdAt: Date.now() });
        if (form.dataset.form === 'flashcard') data.flashcards.unshift({ id, subjectId, question: v.question.trim(), answer: v.answer.trim(), createdAt: Date.now() });
        if (form.dataset.form === 'grade') { const score = Number(v.score), max = Number(v.maxScore); if (max <= 0 || score < 0 || score > max) { toast('La nota debe estar entre 0 y la nota máxima.'); return; } data.grades.unshift({ id, subjectId, title: v.title.trim(), date: v.date || '', score, maxScore: max, createdAt: Date.now() }); }
        save(); toast('Cambios guardados');
    }
    function editItem(kind, id) {
        const map = { note: 'notes', task: 'tasks', date: 'dates', topic: 'topics', flashcard: 'flashcards', grade: 'grades' }, key = map[kind], item = key && data[key].find(x => x.id === id); if (!item) return;
        if (kind === 'note') { const title = prompt('Título:', item.title); if (title === null) return; const body = prompt('Contenido:', item.body); if (body === null) return; item.title = title.trim(); item.body = body; item.updatedAt = Date.now(); }
        else if (kind === 'task') { const title = prompt('Tarea:', item.title); if (title === null) return; item.title = title.trim(); item.description = prompt('Descripción:', item.description || '') || ''; const due = prompt('Fecha límite AAAA-MM-DD (vacío para quitar):', item.dueDate || ''); if (due !== null) item.dueDate = due.trim(); }
        else if (kind === 'date') { const title = prompt('Título:', item.title); if (title === null) return; const date = prompt('Fecha AAAA-MM-DD:', item.date); if (date === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Fecha inválida.'); return; } item.title = title.trim(); item.date = date; item.description = prompt('Detalles:', item.description || '') || ''; syncGoogle(item, item.googleEventId).then(gid => { item.googleEventId = gid; save(); }); }
        else if (kind === 'topic') { const title = prompt('Tema:', item.title); if (title === null) return; item.title = title.trim(); const status = prompt('Estado: todo, doing o done', item.status || 'todo'); if (['todo', 'doing', 'done'].includes(status)) item.status = status; }
        else if (kind === 'flashcard') { const q = prompt('Pregunta:', item.question); if (q === null) return; const a = prompt('Respuesta:', item.answer); if (a === null) return; item.question = q; item.answer = a; }
        else if (kind === 'grade') { const title = prompt('Evaluación:', item.title); if (title === null) return; const score = Number(prompt('Nota obtenida:', item.score)); if (!Number.isFinite(score)) return; item.title = title; item.score = score; }
        save();
    }
    async function deleteItem(kind, id) { if (kind === 'file') return deleteFile(id); const map = { note: 'notes', task: 'tasks', date: 'dates', topic: 'topics', flashcard: 'flashcards', grade: 'grades' }, key = map[kind]; if (!key) return; const item = data[key].find(x => x.id === id); if (!item || !confirm('¿Eliminar este elemento?')) return; if (kind === 'date') await removeGoogle(item); data[key] = data[key].filter(x => x.id !== id); save(); toast('Elemento eliminado'); }
    /* ===== Mural ===== */
    const WALL_TYPES = { text: 'Texto', heading: 'Título', equation: 'Ecuación', code: 'Código', list: 'Lista de tareas', quote: 'Cita' };
    const WALL_ICONS = { text: 'type', heading: 'heading', equation: 'sigma', code: 'code', list: 'list-checks', quote: 'quote' };
    const WALL_COLORS = { yellow: 'Amarillo', green: 'Verde', pink: 'Rosa', blue: 'Azul', lavender: 'Lavanda', plain: 'Sin color' };
    const WALL_PH = { text: 'Escribí texto…', heading: 'Título de la sección', equation: 'Usá la paleta de arriba o escribí LaTeX. Tab salta al próximo {} vacío.', code: 'Pegá o escribí código…', list: 'Un ítem por línea', quote: 'Escribí una cita…' };
    const WALL_ROWS = { text: 3, heading: 1, equation: 3, code: 6, list: 3, quote: 2 };
    let wedit = null, katexLoading = null;
    function loadKatex() { if (window.katex) return Promise.resolve(); if (katexLoading) return katexLoading; katexLoading = new Promise((res, rej) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css'; document.head.appendChild(l); const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js'; s.onload = () => res(); s.onerror = () => { katexLoading = null; rej(new Error('KaTeX')); }; document.head.appendChild(s); }); return katexLoading; }

    /* Paleta de símbolos para ecuaciones: [etiqueta TeX, texto a insertar, título]. ‸ marca dónde queda el cursor. */
    const g = (n, t) => ['\\' + n, '\\' + n + ' ', t || n];
    const EQ_CATS = {
        'Estructuras': [
            ['\\frac{\\square}{\\square}', '\\frac{‸}{}', 'Fracción (numerador / denominador)'], ['\\dfrac{\\square}{\\square}', '\\dfrac{‸}{}', 'Fracción grande'],
            ['\\sqrt{\\square}', '\\sqrt{‸}', 'Raíz cuadrada'], ['\\sqrt[n]{\\square}', '\\sqrt[]{‸}', 'Raíz n-ésima (escribí n entre [ ])'],
            ['x^{\\square}', '^{‸}', 'Superíndice / potencia'], ['x_{\\square}', '_{‸}', 'Subíndice'], ['x_{\\square}^{\\square}', '_{‸}^{}', 'Subíndice y superíndice'],
            ['\\sum_{i=1}^{n}', '\\sum_{i=1}^{n} ‸', 'Sumatoria'], ['\\prod_{i=1}^{n}', '\\prod_{i=1}^{n} ‸', 'Productoria'],
            ['\\int', '\\int ‸', 'Integral indefinida'], ['\\int_a^b', '\\int_{a}^{b} ‸ \\, dx', 'Integral definida'], ['\\iint', '\\iint ‸', 'Integral doble'], ['\\iiint', '\\iiint ‸', 'Integral triple'], ['\\oint', '\\oint ‸', 'Integral de línea cerrada'],
            ['\\lim_{x\\to a}', '\\lim_{x \\to ‸}', 'Límite'], ['\\frac{d}{dx}', '\\frac{d}{d‸}', 'Derivada'], ['\\frac{\\partial}{\\partial x}', '\\frac{\\partial}{\\partial ‸}', 'Derivada parcial'],
            ['\\binom{n}{k}', '\\binom{‸}{}', 'Número combinatorio'], ['\\left(\\square\\right)', '\\left( ‸ \\right)', 'Paréntesis que se ajustan'], ['\\left[\\square\\right]', '\\left[ ‸ \\right]', 'Corchetes que se ajustan'],
            ['\\left\\{\\square\\right\\}', '\\left\\{ ‸ \\right\\}', 'Llaves que se ajustan'], ['|\\square|', '\\left| ‸ \\right|', 'Valor absoluto'], ['\\|\\square\\|', '\\left\\| ‸ \\right\\|', 'Norma'],
            ['\\lfloor\\square\\rfloor', '\\lfloor ‸ \\rfloor', 'Parte entera (piso)'], ['\\lceil\\square\\rceil', '\\lceil ‸ \\rceil', 'Techo'], ['\\langle\\square\\rangle', '\\langle ‸ \\rangle', 'Producto interno'],
            ['\\overline{z}', '\\overline{‸}', 'Conjugado / barra'], ['\\vec{v}', '\\vec{‸}', 'Vector'], ['\\hat{x}', '\\hat{‸}', 'Sombrero'], ['\\tilde{x}', '\\tilde{‸}', 'Tilde'], ['\\dot{x}', '\\dot{‸}', 'Punto (derivada temporal)'], ['\\ddot{x}', '\\ddot{‸}', 'Doble punto'],
            ['\\underbrace{\\square}', '\\underbrace{‸}_{}', 'Llave inferior'], ['\\overbrace{\\square}', '\\overbrace{‸}^{}', 'Llave superior'],
            ['\\begin{pmatrix}\\cdot\\end{pmatrix}', '\\begin{pmatrix} ‸ & \\\\  &  \\end{pmatrix}', 'Matriz 2×2 con paréntesis'], ['\\begin{bmatrix}\\cdot\\end{bmatrix}', '\\begin{bmatrix} ‸ & \\\\  &  \\end{bmatrix}', 'Matriz 2×2 con corchetes'], ['\\begin{vmatrix}\\cdot\\end{vmatrix}', '\\begin{vmatrix} ‸ & \\\\  &  \\end{vmatrix}', 'Determinante 2×2'],
            ['\\begin{cases}\\cdot\\end{cases}', '\\begin{cases} ‸ & \\text{si } \\\\  & \\text{si } \\end{cases}', 'Función definida por casos'], ['\\text{abc}', '\\text{‸}', 'Texto dentro de la ecuación'], ['\\mathbb{R}', '\\mathbb{‸}', 'Letra doble (ℝ, ℕ…)'], ['\\mathcal{A}', '\\mathcal{‸}', 'Letra caligráfica']
        ],
        'Griegas': 'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega'.split(' ').map(n => g(n)).concat('Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega'.split(' ').map(n => g(n))),
        'Operadores': [g('pm', 'Más menos'), g('mp', 'Menos más'), g('times', 'Por'), g('div', 'División (÷)'), g('cdot', 'Punto'), g('ast', 'Asterisco'), g('star'), g('circ', 'Composición'), g('bullet'), g('oplus', 'Suma directa / XOR'), g('ominus'), g('otimes', 'Producto tensorial'), g('odot'), g('infty', 'Infinito'), g('partial', 'Derivada parcial'), g('nabla', 'Nabla'), g('Delta', 'Delta'), g('prime', 'Prima'), g('degree', 'Grado'), g('angle', 'Ángulo'), g('measuredangle'), g('triangle', 'Triángulo'), g('square', 'Cuadrado'), g('cdots', 'Puntos centrados'), g('ldots', 'Puntos'), g('vdots', 'Puntos verticales'), g('ddots', 'Puntos diagonales'), g('hbar', 'h barra'), g('ell'), g('wp'), g('aleph', 'Álef'), g('Re', 'Parte real'), g('Im', 'Parte imaginaria'), g('%', 'Porcentaje'), ['\\bmod', '\\bmod ', 'Módulo'], ['\\equiv_{n}', '\\pmod{‸}', 'Congruente módulo n']],
        'Relaciones': [['=', '= '], g('neq', 'Distinto'), g('approx', 'Aproximado'), g('equiv', 'Equivalente / congruente'), g('sim', 'Semejante'), g('simeq'), g('cong', 'Congruente'), g('propto', 'Proporcional'), ['<', '< '], ['>', '> '], g('leq', 'Menor o igual'), g('geq', 'Mayor o igual'), g('leqslant', 'Menor o igual (inclinado)'), g('geqslant', 'Mayor o igual (inclinado)'), g('ll', 'Mucho menor'), g('gg', 'Mucho mayor'), g('nless'), g('ngtr'), g('perp', 'Perpendicular'), g('parallel', 'Paralelo'), g('nparallel'), g('mid', 'Divide a'), g('nmid', 'No divide a'), g('doteq'), g('asymp'), g('prec'), g('succ'), g('preceq'), g('succeq')],
        'Conjuntos': [g('in', 'Pertenece'), g('notin', 'No pertenece'), g('ni', 'Contiene al elemento'), g('subset', 'Incluido'), g('subseteq', 'Incluido o igual'), g('subsetneq', 'Incluido estricto'), g('nsubseteq', 'No incluido'), g('supset', 'Contiene'), g('supseteq', 'Contiene o igual'), g('cup', 'Unión'), g('cap', 'Intersección'), g('setminus', 'Diferencia'), g('triangle', 'Diferencia simétrica'), g('emptyset', 'Conjunto vacío'), g('varnothing', 'Vacío'), ['\\mathbb{N}', '\\mathbb{N}', 'Naturales'], ['\\mathbb{Z}', '\\mathbb{Z}', 'Enteros'], ['\\mathbb{Q}', '\\mathbb{Q}', 'Racionales'], ['\\mathbb{R}', '\\mathbb{R}', 'Reales'], ['\\mathbb{C}', '\\mathbb{C}', 'Complejos'], ['\\mathbb{P}', '\\mathbb{P}', 'Probabilidad / primos'], ['\\mathbb{E}', '\\mathbb{E}', 'Esperanza'], ['\\mathcal{P}', '\\mathcal{P}', 'Partes de un conjunto'], ['A^{c}', '^{c}', 'Complemento'], ['\\bigcup', '\\bigcup_{i=1}^{n} ‸', 'Unión grande'], ['\\bigcap', '\\bigcap_{i=1}^{n} ‸', 'Intersección grande'], ['\\{\\square\\}', '\\{ ‸ \\}', 'Conjunto'], ['\\{x \\mid \\square\\}', '\\{ x \\mid ‸ \\}', 'Conjunto por comprensión'], ['|A|', '\\left| ‸ \\right|', 'Cardinal'], g('times', 'Producto cartesiano')],
        'Lógica': [g('forall', 'Para todo'), g('exists', 'Existe'), g('nexists', 'No existe'), ['\\exists !', '\\exists ! ', 'Existe único'], g('neg', 'Not (negación)'), g('land', 'And (y)'), g('lor', 'Or (o)'), g('oplus', 'XOR (o exclusivo)'), g('top', 'Verdadero'), g('bot', 'Falso'), g('to', 'Implica (→)'), g('Rightarrow', 'Implica (⇒)'), g('Leftarrow', 'Es implicado (⇐)'), g('Leftrightarrow', 'Si y solo si (⇔)'), g('leftrightarrow', 'Doble flecha (↔)'), g('implies', 'Implica (largo)'), g('iff', 'Si y solo si (largo)'), g('therefore', 'Por lo tanto'), g('because', 'Porque'), g('vdash', 'Se deduce (⊢)'), g('models', 'Modela (⊨)'), g('nvdash'), g('Box', 'Necesario (□)'), g('Diamond', 'Posible (◇)'), g('blacksquare', 'Fin de demostración (∎)'), g('uparrow'), g('downarrow'), g('lnot', 'Not')],
        'Flechas': [g('rightarrow', 'Flecha derecha'), g('leftarrow', 'Flecha izquierda'), g('leftrightarrow', 'Flecha doble punta'), g('Rightarrow'), g('Leftarrow'), g('Leftrightarrow'), g('longrightarrow'), g('longleftarrow'), g('longleftrightarrow'), g('Longrightarrow'), g('Longleftarrow'), g('Longleftrightarrow'), g('uparrow'), g('downarrow'), g('updownarrow'), g('Uparrow'), g('Downarrow'), g('nearrow'), g('searrow'), g('swarrow'), g('nwarrow'), g('mapsto', 'Se mapea a'), g('longmapsto'), g('hookrightarrow', 'Inclusión'), g('twoheadrightarrow', 'Sobreyectiva'), g('rightharpoonup'), g('rightleftharpoons', 'Equilibrio'), g('leadsto'), ['\\xrightarrow{\\square}', '\\xrightarrow{‸}', 'Flecha con texto encima'], ['\\xleftarrow{\\square}', '\\xleftarrow{‸}', 'Flecha izquierda con texto'], ['\\overset{\\square}{\\to}', '\\overset{‸}{\\to}', 'Texto sobre símbolo']],
        'Funciones': 'sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln exp lim limsup liminf max min sup inf arg det dim ker gcd deg Pr hom mod'.split(' ').map(n => ['\\' + n, '\\' + n + ' ', n]).filter(x => !['\\mod'].includes(x[0]))
    };
    const eqLabelCache = {};
    function eqLabel(tex) { if (eqLabelCache[tex]) return eqLabelCache[tex]; try { return eqLabelCache[tex] = window.katex.renderToString(tex, { throwOnError: false, displayMode: false }); } catch (e) { return esc(tex); } }
    let eqCat = 'Estructuras';
    function fillEqPalette(box) {
        if (!box || !window.katex) return;
        const cats = Object.keys(EQ_CATS);
        let tabs = box.querySelector('.eq-pal-tabs');
        let grid = box.querySelector('.eq-pal-grid');
        if (!tabs || !grid) {
            box.innerHTML = '<div class="eq-pal-tabs" role="tablist">' + cats.map(c => '<button type="button" role="tab" class="eq-pal-tab' + (c === eqCat ? ' active' : '') + '" data-eq-cat="' + esc(c) + '" aria-selected="' + (c === eqCat) + '">' + c + '</button>').join('') + '</div><div class="eq-pal-grid"></div>';
            tabs = box.querySelector('.eq-pal-tabs');
            grid = box.querySelector('.eq-pal-grid');
        } else {
            tabs.querySelectorAll('[data-eq-cat]').forEach(b => {
                const isAct = b.dataset.eqCat === eqCat;
                b.classList.toggle('active', isAct);
                b.setAttribute('aria-selected', String(isAct));
            });
        }
        grid.innerHTML = EQ_CATS[eqCat].map((it, i) => '<button type="button" class="eq-pal-btn" data-eq-ins="' + i + '" title="' + esc(it[2] || it[1]) + '" aria-label="' + esc(it[2] || it[1]) + '">' + eqLabel(it[0]) + '</button>').join('');
    }
    function fillEqPalettes() { const boxes = document.querySelectorAll('[data-eq-pal]'); if (!boxes.length) return; if (window.katex) boxes.forEach(fillEqPalette); else loadKatex().then(() => document.querySelectorAll('[data-eq-pal]').forEach(fillEqPalette)).catch(() => { }); }
    function insertEq(ta, snippet) {
        const a = ta.selectionStart, z = ta.selectionEnd, sel = ta.value.slice(a, z), k = snippet.indexOf('‸'), body = snippet.replace('‸', sel);
        ta.setRangeText(body, a, z, 'end'); const pos = k < 0 ? a + body.length : a + k + sel.length; ta.setSelectionRange(pos, pos); ta.focus(); ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function cleanTex(t) {
        if (!t) return '';
        let s = String(t).trim().replace(/^\$\$?/, '').replace(/\$\$?$/, '').trim();
        if (!s) return '';
        const texts = [];
        s = s.replace(/\\(text|mathrm|mathbf|mathit|textbf)\{([^{}]*)\}/g, m => {
            texts.push(m);
            return '___TEX_TEXT_' + (texts.length - 1) + '___';
        });
        s = s.replace(/°/g, '^{\\circ}');
        s = s.replace(/(?<!\\)%/g, '\\%');
        s = s.replace(/(?<!\\)\$/g, '\\$');
        s = s.replace(/(\\[a-zA-Z]+)\s+([{\[])/g, '$1$2');
        s = s.replace(/\}\s+\{/g, '}{');
        s = s.replace(/\]\s+\{/g, ']{');
        s = s.replace(/(\\begin\{[^}]+\})\s*/g, '$1');
        s = s.replace(/\s*(\\end\{[^}]+\})/g, '$1');
        s = s.replace(/\s*&\s*/g, '___AMP___');
        s = s.replace(/\s*\\\\\s*/g, '___DBSLASH___');
        s = s.replace(/(?<!\\) /g, '\\ ');
        s = s.replace(/___AMP___/g, ' & ');
        s = s.replace(/___DBSLASH___/g, ' \\\\ ');
        s = s.replace(/___TEX_TEXT_(\d+)___/g, (_, i) => texts[Number(i)]);
        return s;
    }
    function eqInto(el, raw) {
        if (!el) return; const tex = cleanTex(raw); el.dataset.src = tex; if (!tex) { el.innerHTML = ''; return; }
        const draw = () => { if (!el.isConnected || el.dataset.src !== tex) return; el.classList.remove('is-source'); try { window.katex.render(tex, el, { displayMode: true, throwOnError: false }); } catch (e) { el.textContent = tex; } };
        if (window.katex) draw(); else { el.classList.add('is-source'); el.textContent = tex; loadKatex().then(draw).catch(() => { }); }
    }
    function typeset(root) { if (!root) return; root.querySelectorAll('.mb-eq').forEach(el => eqInto(el, el.dataset.raw)); }
    function blockHtml(b) {
        if (b.type === 'heading') return '<div class="mb-heading">' + esc(b.content) + '</div>';
        if (b.type === 'quote') return '<blockquote class="mb-quote">' + esc(b.content) + '</blockquote>';
        if (b.type === 'equation') return '<div class="mb-eq" data-raw="' + esc(b.content) + '"></div>';
        if (b.type === 'code') return '<div class="mb-code-wrap"><button type="button" class="mb-copy" data-wall-copy="' + esc(b.id) + '" title="Copiar código" aria-label="Copiar código">' + icon('copy') + '</button><pre class="mb-code"><code>' + esc(b.content) + '</code></pre></div>';
        if (b.type === 'list') return '<div class="mb-list">' + (b.items || []).map((it, i) => '<label><input type="checkbox" data-wall-check="' + esc(b.id) + ':' + i + '"' + (it.done ? ' checked' : '') + '><span>' + esc(it.text) + '</span></label>').join('') + '</div>';
        return '<div class="mb-text">' + esc(b.content) + '</div>';
    }
    function noteCard(n) { return '<article class="mural-note" data-color="' + esc(n.color || 'yellow') + '" data-note-id="' + esc(n.id) + '"><div class="mural-note-bar"><button type="button" class="mural-grip" title="Arrastrar para reordenar" aria-label="Arrastrar para reordenar">' + icon('grip-vertical') + '</button><span class="mural-note-spacer"></span><button type="button" class="' + (n.pinned ? 'on' : '') + '" data-wall-pin title="' + (n.pinned ? 'Desfijar' : 'Fijar') + '" aria-label="' + (n.pinned ? 'Desfijar nota' : 'Fijar nota') + '">' + icon('pin') + '</button><button type="button" data-wall-edit title="Editar" aria-label="Editar nota">' + icon('pencil') + '</button><button type="button" data-wall-del title="Eliminar" aria-label="Eliminar nota">' + icon('trash-2') + '</button></div><div class="mural-note-body">' + (n.blocks || []).map(blockHtml).join('') + '</div></article>'; }
    function wallMarkup(sid) {
        const notes = rows('wall', sid).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || b.createdAt - a.createdAt);
        const pinned = notes.filter(n => n.pinned), rest = notes.filter(n => !n.pinned);
        const label = (t, c) => '<div class="study-section-label">' + t + ' <span>' + c + '</span></div>';
        let h = '<div class="mural-toolbar"><button class="primary" type="button" data-wall-new>' + icon('plus') + ' Nueva nota</button><span class="mural-hint">Arrastrá una nota desde su asa para reordenarla y fijala para tenerla siempre arriba.</span></div>';
        if (!notes.length) return h + '<div class="study-empty"><strong>El mural está vacío</strong>Agregá notas con texto, ecuaciones, código o listas, como post-its en un muro.</div>';
        if (pinned.length) h += label('FIJADAS', pinned.length) + '<div class="mural-grid" data-group="pinned">' + pinned.map(noteCard).join('') + '</div>';
        if (rest.length) h += (pinned.length ? label('NOTAS', rest.length) : '') + '<div class="mural-grid" data-group="rest">' + rest.map(noteCard).join('') + '</div>';
        return h;
    }

    /* Editor */
    function ensureWallEditor() {
        if ($('muralEditorBackdrop')) return;
        const b = document.createElement('div'); b.className = 'modal-backdrop'; b.id = 'muralEditorBackdrop';
        b.innerHTML = '<div class="modal mural-editor" role="dialog" aria-modal="true" aria-labelledby="muralEditorTitle"><div class="modal-head"><div><h2 id="muralEditorTitle">Nueva nota</h2><p>Combiná texto, ecuaciones, código y más en una misma nota.</p></div><button class="close-btn" type="button" data-mural-close aria-label="Cerrar">×</button></div><div class="mural-editor-colors" role="group" aria-label="Color de la nota">' + Object.entries(WALL_COLORS).map(([k, v]) => '<button class="mural-color" type="button" data-mural-color="' + k + '" aria-label="' + v + '" title="' + v + '" aria-pressed="false"></button>').join('') + '</div><div id="muralBlocks"></div><div class="mural-add">' + Object.entries(WALL_TYPES).map(([k, v]) => '<button class="secondary" type="button" data-add-block="' + k + '">' + icon(WALL_ICONS[k]) + ' ' + v + '</button>').join('') + '</div><div class="modal-actions"><button class="secondary" type="button" data-mural-close>Cancelar</button><button class="primary" type="button" id="muralSave">' + icon('check') + ' Guardar nota</button></div></div>';
        document.body.appendChild(b);
        b.addEventListener('click', e => {
            if (e.target === b || e.target.closest('[data-mural-close]')) return closeWallEditor();
            const col = e.target.closest('[data-mural-color]'); if (col) { wedit.color = col.dataset.muralColor; wedit.dirty = true; paintWallColors(); return; }
            const cat = e.target.closest('[data-eq-cat]'); if (cat) { eqCat = cat.dataset.eqCat; document.querySelectorAll('[data-eq-pal]').forEach(fillEqPalette); return; }
            const ins = e.target.closest('[data-eq-ins]'); if (ins) { const ta = ins.closest('[data-block]').querySelector('textarea'), it = EQ_CATS[eqCat][Number(ins.dataset.eqIns)]; if (ta && it) insertEq(ta, it[1]); return; }
            const add = e.target.closest('[data-add-block]'); if (add) { wedit.dirty = true; wedit.blocks.push({ id: uid(), type: add.dataset.addBlock, content: '' }); paintWallBlocks(wedit.blocks.length - 1); return; }
            if (e.target.closest('#muralSave')) return saveWallEditor();
            const blk = e.target.closest('[data-block]'); if (!blk) return;
            const i = wedit.blocks.findIndex(x => x.id === blk.dataset.block); if (i < 0) return;
            if (e.target.closest('[data-block-del]')) { wedit.blocks.splice(i, 1); if (!wedit.blocks.length) wedit.blocks.push({ id: uid(), type: 'text', content: '' }); wedit.dirty = true; paintWallBlocks(); }
            else if (e.target.closest('[data-block-up]') && i > 0) { [wedit.blocks[i - 1], wedit.blocks[i]] = [wedit.blocks[i], wedit.blocks[i - 1]]; wedit.dirty = true; paintWallBlocks(i - 1); }
            else if (e.target.closest('[data-block-down]') && i < wedit.blocks.length - 1) { [wedit.blocks[i + 1], wedit.blocks[i]] = [wedit.blocks[i], wedit.blocks[i + 1]]; wedit.dirty = true; paintWallBlocks(i + 1); }
        });
        b.addEventListener('mousedown', e => { if (e.target.closest('[data-eq-ins],[data-eq-cat]')) e.preventDefault(); });
        b.addEventListener('change', e => { const s = e.target.closest('[data-block-type]'); if (!s) return; const i = wedit.blocks.findIndex(x => x.id === s.closest('[data-block]').dataset.block); if (i < 0) return; wedit.blocks[i].type = s.value; wedit.dirty = true; paintWallBlocks(i); });
        b.addEventListener('input', e => { const t = e.target.closest('[data-block-input]'); if (!t) return; const blk = t.closest('[data-block]'), x = wedit.blocks.find(y => y.id === blk.dataset.block); if (!x) return; x.content = t.value; wedit.dirty = true; if (x.type === 'equation') eqInto(blk.querySelector('[data-eq-preview]'), t.value); });
        b.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); saveWallEditor(); return; }
            if (e.key === 'Tab' && !e.shiftKey && e.target.matches && e.target.matches('[data-block-input]') && e.target.closest('[data-block]')?.querySelector('[data-eq-preview]')) { const t = e.target, m = /\{\}|\[\]/.exec(t.value.slice(t.selectionEnd)); if (m) { e.preventDefault(); const p = t.selectionEnd + m.index + 1; t.setSelectionRange(p, p); } return; }
            if (e.key === 'Tab' && e.target.classList && e.target.classList.contains('mono')) { e.preventDefault(); const t = e.target, s = t.selectionStart; t.setRangeText('  ', s, t.selectionEnd, 'end'); t.dispatchEvent(new Event('input', { bubbles: true })); }
        });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && b.classList.contains('open')) closeWallEditor(); });
    }
    function paintWallColors() { document.querySelectorAll('[data-mural-color]').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.muralColor === wedit.color))); }
    function paintWallBlocks(focusIdx) {
        const box = $('muralBlocks');
        box.innerHTML = wedit.blocks.map((b, i) => { const mono = b.type === 'code' || b.type === 'equation'; return '<div class="mural-block" data-block="' + esc(b.id) + '"><div class="mural-block-head"><select data-block-type aria-label="Formato del bloque">' + Object.entries(WALL_TYPES).map(([k, v]) => '<option value="' + k + '"' + (k === b.type ? ' selected' : '') + '>' + v + '</option>').join('') + '</select><span class="spacer"></span><button class="mural-mini" type="button" data-block-up title="Subir" aria-label="Subir bloque"' + (i === 0 ? ' disabled' : '') + '>' + icon('chevron-up') + '</button><button class="mural-mini" type="button" data-block-down title="Bajar" aria-label="Bajar bloque"' + (i === wedit.blocks.length - 1 ? ' disabled' : '') + '>' + icon('chevron-down') + '</button><button class="mural-mini" type="button" data-block-del title="Quitar bloque" aria-label="Quitar bloque">' + icon('x') + '</button></div>' + (b.type === 'equation' ? '<div class="eq-pal" data-eq-pal></div>' : '') + '<textarea class="mural-input' + (mono ? ' mono' : '') + '" data-block-input rows="' + WALL_ROWS[b.type] + '" placeholder="' + esc(WALL_PH[b.type]) + '"' + (mono ? ' wrap="off" spellcheck="false"' : '') + '></textarea>' + (b.type === 'equation' ? '<div class="mural-eq-preview" data-eq-preview></div>' : '') + '</div>'; }).join('');
        box.querySelectorAll('[data-block]').forEach((el, i) => { const b = wedit.blocks[i]; el.querySelector('textarea').value = b.content; if (b.type === 'equation') eqInto(el.querySelector('[data-eq-preview]'), b.content); });
        fillEqPalettes();
        if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
        if (focusIdx != null) { const t = box.querySelectorAll('textarea')[focusIdx]; if (t) t.focus(); }
    }
    function openWallEditor(n) {
        ensureWallEditor();
        wedit = { id: n ? n.id : null, color: n ? (n.color || 'yellow') : 'yellow', dirty: false, blocks: n ? (n.blocks || []).map(b => ({ id: b.id, type: b.type, content: b.type === 'list' ? (b.items || []).map(i => i.text).join('\n') : (b.content || '') })) : [{ id: uid(), type: 'text', content: '' }] };
        if (!wedit.blocks.length) wedit.blocks.push({ id: uid(), type: 'text', content: '' });
        $('muralEditorTitle').textContent = n ? 'Editar nota' : 'Nueva nota';
        paintWallColors(); paintWallBlocks(n ? null : 0);
        $('muralEditorBackdrop').classList.add('open');
    }
    function closeWallEditor(force) {
        if (!force && wedit && wedit.dirty && !confirm('¿Descartar los cambios de esta nota?')) return;
        const b = $('muralEditorBackdrop'); if (b) b.classList.remove('open'); wedit = null;
    }
    function saveWallEditor() {
        if (!wedit) return;
        const old = wedit.id ? data.wall.find(x => x.id === wedit.id) : null, blocks = [];
        wedit.blocks.forEach(b => {
            if (!String(b.content).trim()) return;
            if (b.type === 'list') { const ob = old && old.blocks.find(x => x.id === b.id), lines = b.content.split('\n').map(x => x.trim()).filter(Boolean); blocks.push({ id: b.id, type: 'list', items: lines.map((t, i) => ({ text: t, done: !!(ob && ob.items && ob.items[i] && ob.items[i].done) })) }); }
            else blocks.push({ id: b.id, type: b.type, content: b.content.replace(/\s+$/, '') });
        });
        if (!blocks.length) { toast('Agregá contenido a la nota.'); return; }
        if (old) { old.blocks = blocks; old.color = wedit.color; old.updatedAt = Date.now(); }
        else { const min = data.wall.filter(x => x.subjectId === activeSubject).reduce((m, x) => Math.min(m, Number.isFinite(x.order) ? x.order : 0), 0); data.wall.push({ id: uid(), subjectId: activeSubject, blocks, color: wedit.color, pinned: false, order: min - 1, createdAt: Date.now(), updatedAt: Date.now() }); }
        const wasNew = !old; closeWallEditor(true); save(); toast(wasNew ? 'Nota agregada al mural' : 'Nota actualizada');
    }

    /* Arrastrar y reordenar (mouse y táctil) */
    function startWallDrag(e, card) {
        if (!card || (e.button != null && e.button !== 0)) return;
        e.preventDefault();
        const grid = card.parentElement, id = card.dataset.noteId, r = card.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
        const ph = document.createElement('div'); ph.className = 'mural-placeholder'; ph.style.height = r.height + 'px';
        card.after(ph); card.classList.add('is-dragging');
        card.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;margin:0;z-index:60;pointer-events:none';
        document.body.appendChild(card);
        let last = 0;
        const move = ev => {
            card.style.left = (ev.clientX - dx) + 'px'; card.style.top = (ev.clientY - dy) + 'px';
            if (ev.clientY < 70) window.scrollBy(0, -14); else if (ev.clientY > innerHeight - 70) window.scrollBy(0, 14);
            if (performance.now() - last < 120) return;
            const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.mural-note');
            if (over && over !== card && over.parentElement === grid) {
                if (ph.compareDocumentPosition(over) & Node.DOCUMENT_POSITION_FOLLOWING) over.after(ph); else over.before(ph);
                last = performance.now();
            }
        };
        const end = ev => {
            window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
            const ids = [...grid.children].map(c => c === ph ? id : c.dataset.noteId).filter(Boolean);
            card.remove();
            if (ev.type === 'pointerup') { ids.forEach((nid, i) => { const n = data.wall.find(x => x.id === nid); if (n) n.order = i; }); save(); } else render();
        };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    }
    function bindWall() {
        const p = $('studyWallPanel'); if (!p) return;
        p.addEventListener('pointerdown', e => { const g = e.target.closest('.mural-grip'); if (g) startWallDrag(e, g.closest('.mural-note')); });
        p.addEventListener('click', e => {
            if (e.target.closest('[data-wall-new]')) return openWallEditor();
            const card = e.target.closest('.mural-note'); if (!card) return;
            const n = data.wall.find(x => x.id === card.dataset.noteId); if (!n || e.target.closest('.mural-grip')) return;
            if (e.target.closest('[data-wall-pin]')) { n.pinned = !n.pinned; n.updatedAt = Date.now(); save(); return; }
            if (e.target.closest('[data-wall-del]')) { if (confirm('¿Eliminar esta nota del mural?')) { data.wall = data.wall.filter(x => x.id !== n.id); save(); toast('Nota eliminada'); } return; }
            const chk = e.target.closest('[data-wall-check]');
            if (chk) { const [bid, idx] = chk.dataset.wallCheck.split(':'), blk = n.blocks.find(x => x.id === bid), it = blk && blk.items && blk.items[Number(idx)]; if (it) { it.done = chk.checked; save(); } return; }
            const cp = e.target.closest('[data-wall-copy]');
            if (cp) { const blk = n.blocks.find(x => x.id === cp.dataset.wallCopy); if (blk && navigator.clipboard) navigator.clipboard.writeText(blk.content).then(() => toast('Código copiado'), () => toast('No se pudo copiar')); return; }
            if (e.target.closest('a,label')) return;
            openWallEditor(n);
        });
    }
    function bind() {
        bindWall();
        $('studyAddFolder')?.addEventListener('click', addFolder); $('studyAddSubject')?.addEventListener('click', addSubject); $('studySearch')?.addEventListener('input', e => { search = e.target.value || ''; render(); });
        $('studyFolderBack')?.addEventListener('click', () => { if (activeSubject) { activeSubject = null; activeTab = 'overview'; } else activeFolder = null; render(); }); $('studyBreadcrumbFolders')?.addEventListener('click', () => { activeFolder = null; activeSubject = null; render(); }); $('studyBreadcrumbFolder')?.addEventListener('click', () => { activeSubject = null; render(); });
        $('studyFolderGrid')?.addEventListener('click', e => { const b = e.target.closest('[data-folder]'); if (b) { activeFolder = b.dataset.folder; activeSubject = null; render(); } });
        $('studySubjectGrid')?.addEventListener('click', e => { const b = e.target.closest('[data-subject]'); if (b) { activeSubject = b.dataset.subject; activeFolder = subject(activeSubject)?.folderId || null; activeTab = 'overview'; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
        $('studyTabs')?.addEventListener('click', e => { const b = e.target.closest('[data-study-tab]'); if (b) { activeTab = b.dataset.studyTab; renderSubject(); navAnim(); } }); $('studySubjectDetail')?.addEventListener('submit', submitForm);
        $('studySubjectDetail')?.addEventListener('click', e => { const edit = e.target.closest('[data-edit]'), del = e.target.closest('[data-delete]'), toggle = e.target.closest('[data-toggle-task]'), open = e.target.closest('[data-open-file]'); if (edit) editItem(edit.dataset.edit, edit.dataset.id); if (del) deleteItem(del.dataset.delete, del.dataset.id); if (toggle) { const t = data.tasks.find(x => x.id === toggle.dataset.toggleTask); if (t) { t.status = t.status === 'done' ? 'todo' : 'done'; save(); } } if (open) openFile(open.dataset.openFile); });
        async function processUploads(files, input) { if (!files.length || !activeSubject) return; if (input) input.disabled = true; const dz = $('studyUploadDropzone'); if (dz) dz.classList.add('is-uploading'); for (const f of files) { try { await uploadFile(f, activeSubject); } catch (err) { toast('No se pudo subir ' + f.name + ': ' + err.message); } } if (input) { input.value = ''; input.disabled = false; } renderSubject(); }
        $('studyFilesPanel')?.addEventListener('change', e => { if (e.target.id === 'studyFileInput') processUploads(Array.from(e.target.files || []), e.target); });
        $('studyFilesPanel')?.addEventListener('dragover', e => { const dz = e.target.closest('#studyUploadDropzone'); if (dz) { e.preventDefault(); dz.classList.add('is-dragover'); } });
        $('studyFilesPanel')?.addEventListener('dragleave', e => { const dz = e.target.closest('#studyUploadDropzone'); if (dz && !dz.contains(e.relatedTarget)) dz.classList.remove('is-dragover'); });
        $('studyFilesPanel')?.addEventListener('drop', e => { const dz = e.target.closest('#studyUploadDropzone'); if (!dz) return; e.preventDefault(); dz.classList.remove('is-dragover'); processUploads(Array.from(e.dataTransfer?.files || []), $('studyFileInput')); });
        $('studyArchiveSubject')?.addEventListener('click', () => { const s = subject(activeSubject); if (s && confirm('¿Archivar esta materia? Sus datos se conservarán.')) { s.archived = true; activeSubject = null; save(); } });
        $('studyDeleteSubject')?.addEventListener('click', async () => { const s = subject(activeSubject); if (!s || !confirm('¿Eliminar la materia y todos sus registros? Los archivos almacenados también se eliminarán.')) return; try { const files = rows('files', s.id).slice(); if (files.length) { const { client } = await getClient(); const { error } = await client.storage.from(BUCKET).remove(files.map(f => f.storagePath)); if (error) throw error; } for (const d of rows('dates', s.id)) await removeGoogle(d);['notes', 'files', 'tasks', 'dates', 'topics', 'flashcards', 'wall', 'grades'].forEach(k => data[k] = data[k].filter(x => x.subjectId !== s.id)); data.subjects = data.subjects.filter(x => x.id !== s.id); activeSubject = null; save(); toast('Materia eliminada'); } catch (e) { toast('No se pudo eliminar la materia: ' + e.message); } });
        $('studyEditSubject')?.addEventListener('click', () => { const s = subject(activeSubject); if (!s) return; const n = prompt('Nombre de la materia:', s.name); if (n === null || !n.trim()) return; s.name = n.trim(); s.description = prompt('Descripción:', s.description || '') || ''; save(); });
        $('studyEditFolder')?.addEventListener('click', () => { const f = folder(activeFolder); if (!f) return; const n = prompt('Nombre de la carpeta:', f.name); if (n === null || !n.trim()) return; f.name = n.trim(); save(); });
        $('studyDeleteFolder')?.addEventListener('click', () => { const f = folder(activeFolder); if (!f || !confirm('Eliminar la carpeta? Las materias se conservarán sin carpeta.')) return; data.subjects.forEach(s => { if (s.folderId === f.id) s.folderId = ''; }); data.folders = data.folders.filter(x => x.id !== f.id); activeFolder = null; save(); });
    }
    window.CtrlStudy = { render, calendarEvents, refresh: render };
    load();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { bind(); render(); }, { once: true }); else { bind(); render(); }
    window.addEventListener('ctrl:data-ready', () => { load(); ensureDefaultFolders(); render(); });
})();
