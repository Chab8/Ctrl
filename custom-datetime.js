/* =============================================================================
   Ctrl · Selector de fecha y hora
   Reemplaza TODOS los <input type="date">, <input type="time"> y
   <input type="datetime-local"> de la app por un mini calendario propio
   (basado en el "Apple calendar picker"), con los colores de Ctrl y siguiendo
   el tema claro/oscuro de la app (no tiene modo propio).

   - El <input> original se conserva oculto: sigue siendo la fuente de verdad,
     así que .value, .min, .disabled, 'change', formularios y reset() siguen
     funcionando igual que antes.
   - Detecta inputs creados después (modales, formularios dinámicos).
   Incluir una sola vez al final del <body>:
     <script src="./custom-datetime.js"></script>
   ========================================================================== */
(function () {
    'use strict';
    if (window.__ctrlDateTime) return; window.__ctrlDateTime = true;

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    const SELECTOR = 'input[type="date"],input[type="time"],input[type="datetime-local"]';

    const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

    const svg = p => '<svg viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>';
    const I_CAL = svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18"/>');
    const I_CLOCK = svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>');
    const I_LEFT = svg('<path d="m15 18-6-6 6-6"/>');
    const I_RIGHT = svg('<path d="m9 18 6-6-6-6"/>');
    const I_CHEV = '<svg class="cd-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

    /* ------------------------------------------------------------------ estilos */
    const CSS = `
html button.cd-trigger.cd-trigger{display:inline-flex;align-items:center;gap:9px;min-height:42px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);font-size:12px;line-height:1.3;text-align:left;cursor:pointer;transition:background .2s,border-color .2s,box-shadow .2s,opacity .2s}
html button.cd-trigger.cd-trigger:hover{background:var(--soft)}
html button.cd-trigger.cd-trigger.cd-open{border-color:var(--ink);box-shadow:0 0 0 3px var(--line)}
html button.cd-trigger.cd-trigger:disabled{opacity:.45;cursor:not-allowed}
.cd-trigger[hidden]{display:none!important}
.cd-trigger>svg{width:15px;height:15px;flex-shrink:0;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;color:var(--muted)}
.field .cd-trigger,.cuisine-personal-field .cd-trigger{width:100%}
.mc-sched-custom .cd-trigger{flex:1;min-width:0}
.sp-daybar .cd-trigger{min-height:34px;padding:6px 10px;border-radius:10px}
.cd-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cd-label.cd-ph{color:var(--muted)}
.cd-native{position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;border:0!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important;clip:rect(0 0 0 0)!important}

.cd-panel{position:fixed;z-index:60;filter:drop-shadow(0 14px 28px #15161228) drop-shadow(0 2px 4px #15161214)}
.cd-card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:16px;color:var(--ink);user-select:none}
.cd-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.cd-title{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;color:var(--ink);font-size:15px;font-weight:600;letter-spacing:-.3px;padding:5px 8px;margin-left:-8px;border-radius:10px}
.cd-title:hover{background:var(--soft)}
.cd-chev{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;color:var(--muted);transition:transform .2s}
.cd-title[aria-expanded="true"] .cd-chev{transform:rotate(180deg)}
.cd-nav{display:flex;gap:2px}
.cd-iconbtn{width:30px;height:30px;border:0;border-radius:50%;background:transparent;color:var(--ink);display:grid;place-items:center;padding:0}
.cd-iconbtn:hover{background:var(--soft)}
.cd-iconbtn svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.cd-body{position:relative;height:252px}
.cd-wk{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));margin-bottom:4px}
.cd-wk span{text-align:center;font:9px 'DM Mono',monospace;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);padding:5px 0}
.cd-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-auto-rows:36px;row-gap:2px;justify-items:center;align-items:center}
.cd-day{width:34px;height:34px;border:0;border-radius:50%;background:transparent;color:var(--ink);font-size:13px;font-variant-numeric:tabular-nums;padding:0;transition:background .15s,transform .2s}
.cd-day:hover{background:var(--soft)}
.cd-day.out{color:var(--muted);opacity:.5}
.cd-day.today{box-shadow:inset 0 0 0 1.5px var(--green)}
.cd-day.sel{background:var(--ink);color:var(--paper);font-weight:600;box-shadow:none;opacity:1}
.cd-day:disabled{opacity:.22;cursor:not-allowed;background:transparent}
.cd-months{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:1fr;gap:6px;background:var(--card)}
.cd-m{border:0;border-radius:12px;background:transparent;color:var(--ink);font-size:13px;font-weight:500}
.cd-m:hover{background:var(--soft)}
.cd-m.sel{background:var(--ink);color:var(--paper);font-weight:600}
.cd-time{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid var(--line);margin-top:12px;padding-top:12px}
.cd-tl{font-size:13px;font-weight:600}
.cd-tctl{display:flex;align-items:center;gap:6px}
.cd-tctl>b{font-weight:600;color:var(--muted)}
.cd-step{display:inline-flex;align-items:center;background:var(--soft);border-radius:11px;padding:2px}
.cd-step button{width:26px;height:30px;border:0;border-radius:9px;background:transparent;color:var(--muted);font-size:16px;line-height:1;padding:0}
.cd-step button:hover{background:var(--line);color:var(--ink)}
.cd-step input.cd-n{width:30px;border:0;outline:0;background:transparent;color:var(--ink);text-align:center;font:600 15px 'DM Mono',monospace;padding:0;min-height:0;box-shadow:none}
.cd-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px}
.cd-foot>div{display:flex;gap:2px}
.cd-link{border:0;background:transparent;color:var(--muted);font-size:12px;padding:8px 10px;border-radius:10px}
.cd-link:hover{background:var(--soft);color:var(--ink)}
.cd-done{border:0;background:var(--ink);color:var(--paper);border-radius:11px;padding:9px 18px;font-size:12px;font-weight:600}
.cd-done:hover{opacity:.88}
html[data-theme="dark"] .cd-day.sel,html[data-theme="dark"] .cd-m.sel,html[data-theme="dark"] .cd-done{background:var(--accent);color:#243019}
@media(max-width:700px){.cd-day{width:36px;height:36px}.cd-grid{grid-auto-rows:38px}.cd-body{height:268px}}`;
    const style = document.createElement('style'); style.id = 'ctrlDateTimeStyles'; style.textContent = CSS; document.head.appendChild(style);

    /* ---------------------------------------------------------------- utilidades */
    const pad = n => String(n).padStart(2, '0');
    const keyOf = (y, m, d) => y + '-' + pad(m + 1) + '-' + pad(d);
    const parseDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; };
    const parseTime = (kind, s) => { const m = (kind === 'time' ? /^(\d{2}):(\d{2})/ : /T(\d{2}):(\d{2})/).exec(s || ''); return m ? { h: +m[1], mi: +m[2] } : null; };
    const todayParts = () => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() }; };

    function titleOf(inp, kind) {
        const clean = t => String(t || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
        let t = inp.getAttribute('aria-label');
        if (!t && inp.id) { const l = document.querySelector('label[for="' + inp.id.replace(/"/g, '\\"') + '"]'); if (l) t = l.textContent; }
        if (!t && inp.parentElement) { const l = inp.parentElement.querySelector(':scope > label'); if (l && !l.contains(inp)) t = l.textContent; }
        return clean(t) || (kind === 'time' ? 'Elegir hora' : kind === 'date' ? 'Elegir fecha' : 'Elegir fecha y hora');
    }
    function labelFor(kind, v) {
        const d = parseDate(v), t = parseTime(kind, v);
        const dateTxt = d ? new Date(d.y, d.m, d.d).toLocaleDateString('es-AR', kind === 'date' ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '') : '';
        const timeTxt = t ? pad(t.h) + ':' + pad(t.mi) : (kind === 'time' && /^\d{2}:\d{2}/.test(v || '') ? v.slice(0, 5) : '');
        if (kind === 'date') return dateTxt;
        if (kind === 'time') return timeTxt;
        return dateTxt ? dateTxt + (timeTxt ? ' · ' + timeTxt : '') : '';
    }

    /* ------------------------------------------------------------ abrir / cerrar */
    let cur = null;

    function open(inp, btn, kind) {
        if (inp.disabled) return;
        if (cur) close(false);

        const v = nativeValue.get.call(inp), now = new Date();
        const d0 = kind === 'time' ? null : parseDate(v), t0 = kind === 'date' ? null : parseTime(kind, v);
        const st = {
            view: 'days', sel: d0,
            y: d0 ? d0.y : now.getFullYear(), m: d0 ? d0.m : now.getMonth(),
            h: t0 ? t0.h : now.getHours(), mi: t0 ? t0.mi : Math.floor(now.getMinutes() / 5) * 5
        };
        const hasDate = kind !== 'time', hasTime = kind !== 'date';
        const minD = parseDate(inp.min), maxD = parseDate(inp.max);
        const minKey = minD ? keyOf(minD.y, minD.m, minD.d) : '', maxKey = maxD ? keyOf(maxD.y, maxD.m, maxD.d) : '';

        const panel = document.createElement('div'); panel.className = 'cd-panel';
        const card = document.createElement('div'); card.className = 'cd-card'; card.setAttribute('role', 'dialog');
        card.setAttribute('aria-label', titleOf(inp, kind));
        panel.appendChild(card);

        function commit() {
            let out;
            if (kind === 'time') out = pad(st.h) + ':' + pad(st.mi);
            else if (!st.sel) return;
            else { out = keyOf(st.sel.y, st.sel.m, st.sel.d); if (kind === 'datetime-local') out += 'T' + pad(st.h) + ':' + pad(st.mi); }
            if (nativeValue.get.call(inp) === out) return;
            nativeValue.set.call(inp, out);
            inp._cdRefresh();
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
        }

        function render() {
            const active = document.activeElement && panel.contains(document.activeElement) ? document.activeElement.dataset.cd : '';
            const tk = keyOf(todayParts().y, todayParts().m, todayParts().d);
            let h = '';
            if (hasDate) {
                h += '<div class="cd-head"><button type="button" class="cd-title" data-cd="toggle" aria-expanded="' + (st.view === 'months') + '"><span>' + (st.view === 'months' ? st.y : MONTHS[st.m] + ' ' + st.y) + '</span>' + I_CHEV + '</button>'
                    + '<div class="cd-nav"><button type="button" class="cd-iconbtn" data-cd="prev" aria-label="' + (st.view === 'months' ? 'Año anterior' : 'Mes anterior') + '">' + I_LEFT + '</button><button type="button" class="cd-iconbtn" data-cd="next" aria-label="' + (st.view === 'months' ? 'Año siguiente' : 'Mes siguiente') + '">' + I_RIGHT + '</button></div></div>';
                h += '<div class="cd-body">';
                if (st.view === 'days') {
                    h += '<div class="cd-wk">' + WEEKDAYS.map(w => '<span>' + w + '</span>').join('') + '</div><div class="cd-grid" role="grid">';
                    const offset = (new Date(st.y, st.m, 1).getDay() + 6) % 7;
                    for (let i = 0; i < 42; i++) {
                        const dt = new Date(st.y, st.m, 1 - offset + i), k = keyOf(dt.getFullYear(), dt.getMonth(), dt.getDate());
                        const sel = st.sel && k === keyOf(st.sel.y, st.sel.m, st.sel.d);
                        const dis = (minKey && k < minKey) || (maxKey && k > maxKey);
                        h += '<button type="button" class="cd-day' + (dt.getMonth() !== st.m ? ' out' : '') + (k === tk ? ' today' : '') + (sel ? ' sel' : '') + '" data-cd="day" data-v="' + k + '"' + (dis ? ' disabled' : '') + ' aria-pressed="' + !!sel + '" aria-label="' + dt.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '">' + dt.getDate() + '</button>';
                    }
                    h += '</div>';
                } else {
                    h += '<div class="cd-months">' + MONTHS_SHORT.map((m, i) => '<button type="button" class="cd-m' + (i === st.m ? ' sel' : '') + '" data-cd="month" data-v="' + i + '">' + m + '</button>').join('') + '</div>';
                }
                h += '</div>';
            }
            if (hasTime) {
                const step = (id, val, label) => '<div class="cd-step"><button type="button" data-cd="' + id + '-" aria-label="Restar ' + label + '">−</button><input class="cd-n" data-cd-in="' + id + '" value="' + pad(val) + '" inputmode="numeric" maxlength="2" aria-label="' + label[0].toUpperCase() + label.slice(1) + '" autocomplete="off"><button type="button" data-cd="' + id + '+" aria-label="Sumar ' + label + '">+</button></div>';
                h += '<div class="cd-time"' + (hasDate ? '' : ' style="border-top:0;margin-top:0;padding-top:0"') + '><span class="cd-tl">Hora</span><div class="cd-tctl">' + step('h', st.h, 'horas') + '<b>:</b>' + step('m', st.mi, 'minutos') + '</div></div>';
            }
            h += '<div class="cd-foot"><div>' + (!inp.required ? '<button type="button" class="cd-link" data-cd="clear">Borrar</button>' : '') + (hasDate ? '<button type="button" class="cd-link" data-cd="today">Hoy</button>' : '') + '</div>' + (hasTime ? '<button type="button" class="cd-done" data-cd="done">Listo</button>' : '') + '</div>';
            card.innerHTML = h;
            if (active) { const again = card.querySelector('[data-cd="' + active + '"]'); if (again) again.focus({ preventScroll: true }); }
        }

        function pick(dateParts) {
            st.sel = dateParts; st.y = dateParts.y; st.m = dateParts.m;
            commit();
            if (kind === 'date') close(true); else render();
        }

        panel.addEventListener('mousedown', e => { if (!e.target.closest('input')) e.preventDefault(); });
        panel.addEventListener('click', e => {
            const b = e.target.closest('[data-cd]'); if (!b) return;
            const a = b.dataset.cd;
            if (a === 'toggle') { st.view = st.view === 'days' ? 'months' : 'days'; return render(); }
            if (a === 'prev' || a === 'next') {
                const dir = a === 'next' ? 1 : -1;
                if (st.view === 'months') st.y += dir; else { st.m += dir; if (st.m < 0) { st.m = 11; st.y--; } if (st.m > 11) { st.m = 0; st.y++; } }
                return render();
            }
            if (a === 'month') { st.m = +b.dataset.v; st.view = 'days'; return render(); }
            if (a === 'day') { const p = parseDate(b.dataset.v); return pick(p); }
            if (a === 'h-' || a === 'h+') { st.h = (st.h + (a === 'h+' ? 1 : -1) + 24) % 24; commit(); return render(); }
            if (a === 'm-' || a === 'm+') { st.mi = (st.mi + (a === 'm+' ? 5 : -5) + 60) % 60; commit(); return render(); }
            if (a === 'today') { const t = todayParts(); st.view = 'days'; return pick(t); }
            if (a === 'clear') {
                nativeValue.set.call(inp, ''); inp._cdRefresh();
                inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
                return close(true);
            }
            if (a === 'done') { if (hasDate && !st.sel) st.sel = todayParts(); commit(); return close(true); }
        });
        panel.addEventListener('input', e => {
            const t = e.target.closest('[data-cd-in]'); if (!t) return;
            let val = t.value.replace(/\D/g, '').slice(0, 2);
            const max = t.dataset.cdIn === 'h' ? 23 : 59;
            if (val !== '' && +val > max) val = String(max);
            t.value = val;
            if (val === '') return;
            if (t.dataset.cdIn === 'h') st.h = +val; else st.mi = +val;
            commit();
        });
        panel.addEventListener('focusin', e => { if (e.target.matches && e.target.matches('[data-cd-in]')) e.target.select(); });
        panel.addEventListener('focusout', e => { const t = e.target; if (t.matches && t.matches('[data-cd-in]')) t.value = pad(t.dataset.cdIn === 'h' ? st.h : st.mi); });
        panel.addEventListener('keydown', e => {
            if (e.target.matches && e.target.matches('[data-cd-in]')) {
                if (e.key === 'Enter') { e.preventDefault(); const done = panel.querySelector('[data-cd="done"]'); if (done) done.click(); }
                else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault(); const isH = e.target.dataset.cdIn === 'h', dir = e.key === 'ArrowUp' ? 1 : -1;
                    if (isH) st.h = (st.h + dir + 24) % 24; else st.mi = (st.mi + dir + 60) % 60;
                    e.target.value = pad(isH ? st.h : st.mi); commit();
                }
                return;
            }
            if (!e.target.classList || !e.target.classList.contains('cd-day')) return;
            const days = [...panel.querySelectorAll('.cd-day')], i = days.indexOf(e.target);
            const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
            if (move === undefined) return;
            e.preventDefault();
            const nxt = days[i + move];
            if (nxt && !nxt.disabled) nxt.focus();
        });

        render();
        panel.style.visibility = 'hidden';
        document.body.appendChild(panel);
        const width = Math.min(innerWidth - 16, hasDate ? 304 : 248);
        panel.style.width = width + 'px';

        function place() {
            const tr = btn.getBoundingClientRect(), ph = panel.offsetHeight, vw = innerWidth, vh = innerHeight;
            let top = tr.bottom + 6; if (top + ph > vh - 8) top = Math.max(8, tr.top - ph - 6);
            top = Math.max(8, Math.min(top, vh - ph - 8));
            panel.style.left = Math.max(8, Math.min(tr.left, vw - width - 8)) + 'px';
            panel.style.top = top + 'px';
        }
        place(); panel.style.visibility = '';
        if (!reduce) card.animate([{ opacity: 0, transform: 'translateY(-6px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.22,1,.36,1)' });

        btn.classList.add('cd-open'); btn.setAttribute('aria-expanded', 'true');
        cur = { inp, btn, panel, place, w: innerWidth };

        document.addEventListener('pointerdown', onDown, true);
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('scroll', onReflow, true);
        window.addEventListener('resize', onResize);

        const first = panel.querySelector('.cd-day.sel') || panel.querySelector('.cd-day.today:not(:disabled)') || panel.querySelector('.cd-day:not(.out):not(:disabled)') || panel.querySelector('[data-cd-in]');
        if (first && first.classList.contains('cd-day')) requestAnimationFrame(() => first.focus({ preventScroll: true }));
    }

    function close(refocus) {
        if (!cur) return;
        const c = cur; cur = null;
        document.removeEventListener('pointerdown', onDown, true);
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('scroll', onReflow, true);
        window.removeEventListener('resize', onResize);
        c.panel.remove();
        c.btn.classList.remove('cd-open'); c.btn.setAttribute('aria-expanded', 'false');
        if (refocus && c.btn.isConnected) c.btn.focus({ preventScroll: true });
    }

    function onDown(e) { if (cur && !cur.panel.contains(e.target) && !cur.btn.contains(e.target)) close(false); }
    function onKey(e) { if (cur && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); } }
    // Con el teclado del celular abierto el viewport cambia: se reposiciona en vez de cerrar.
    function onReflow(e) { if (cur && !cur.panel.contains(e.target)) { if (!cur.btn.isConnected) return close(false); cur.place(); } }
    function onResize() { if (!cur) return; if (innerWidth !== cur.w) close(false); else cur.place(); }

    /* ---------------------------------------------------------------- conversión */
    function upgrade(inp) {
        if (inp.dataset.cd) return;
        const kind = inp.type;
        if (!['date', 'time', 'datetime-local'].includes(kind)) return;
        inp.dataset.cd = '1';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cd-trigger ' + inp.className.trim();
        if (inp.getAttribute('style')) btn.style.cssText = inp.getAttribute('style');
        btn.setAttribute('aria-haspopup', 'dialog');
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = (kind === 'time' ? I_CLOCK : I_CAL) + '<span class="cd-label"></span>';

        inp.parentNode.insertBefore(btn, inp);
        inp.classList.add('cd-native');
        inp.tabIndex = -1;
        inp.setAttribute('aria-hidden', 'true');

        const refresh = () => {
            const v = nativeValue.get.call(inp), txt = labelFor(kind, v), lab = btn.querySelector('.cd-label');
            lab.textContent = txt || titleOf(inp, kind);
            lab.classList.toggle('cd-ph', !txt);
            btn.disabled = inp.disabled;
            btn.hidden = inp.hidden;
            btn.setAttribute('aria-label', titleOf(inp, kind) + (txt ? ': ' + txt : ''));
        };
        inp._cdRefresh = refresh;

        // asignaciones por código (input.value = ...) también actualizan el botón
        Object.defineProperty(inp, 'value', {
            configurable: true,
            get() { return nativeValue.get.call(inp); },
            set(v) { nativeValue.set.call(inp, v); refresh(); }
        });

        new MutationObserver(() => { refresh(); if (cur && cur.inp === inp && inp.disabled) close(false); })
            .observe(inp, { attributes: true, attributeFilter: ['disabled', 'hidden', 'value', 'aria-label'] });

        btn.addEventListener('click', () => { if (cur && cur.inp === inp) close(true); else open(inp, btn, kind); });
        btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown' && !(cur && cur.inp === inp)) { e.preventDefault(); open(inp, btn, kind); } });
        inp.addEventListener('focus', () => btn.focus());   // p. ej. un <label for="..."> o la validación enfocan el input

        refresh();
    }

    function scan(root) {
        if (!root || root.nodeType !== 1) return;
        if (root.matches && root.matches(SELECTOR)) upgrade(root);
        if (root.querySelectorAll) root.querySelectorAll(SELECTOR).forEach(upgrade);
    }

    // form.reset() cambia el valor sin avisar: se vuelve a leer
    document.addEventListener('reset', e => {
        setTimeout(() => e.target.querySelectorAll && e.target.querySelectorAll('input[data-cd]').forEach(i => i._cdRefresh && i._cdRefresh()), 0);
    });

    scan(document.body);
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });
})();