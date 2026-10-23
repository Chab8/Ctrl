/* =============================================================================
   Ctrl · Selectores animados
   Reemplaza TODOS los <select> de la app por un desplegable como el de la
   referencia (pastilla que se expande en una tarjeta con las opciones, entrada
   escalonada de cada opción), pero solo con texto, sin iconos de opción.

   - El <select> original se conserva oculto: sigue siendo la fuente de verdad,
     así que .value, .options, 'change', formularios y reset() siguen andando.
   - Detecta selects creados después (modales, formularios dinámicos) y los
     cambios de opciones / disabled / hidden.
   Incluir una sola vez al final del <body>:
     <script src="./custom-select.js"></script>
   ========================================================================== */
(function () {
    'use strict';
    if (window.__ctrlSelect) return; window.__ctrlSelect = true;

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nativeValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    const CHEV = '<svg class="cs-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

    /* ------------------------------------------------------------------ estilos */
    const CSS = `
html button.cs-trigger.cs-trigger{display:inline-flex;align-items:center;justify-content:space-between;gap:8px;min-height:40px;padding:9px 12px 9px 16px;border:1px solid var(--line);border-radius:30px;background:var(--card);color:var(--ink);font-size:12px;line-height:1.3;text-align:left;box-shadow:0 1px 2px #29281d0d;cursor:pointer;transition:transform .3s var(--ease),opacity .2s,background .2s,border-color .2s}
html button.cs-trigger.cs-trigger:hover{background:var(--soft)}
html button.cs-trigger.cs-trigger:active{transform:scale(.97)}
html button.cs-trigger.cs-trigger:disabled{opacity:.5;cursor:not-allowed}
html button.cs-trigger.cs-trigger.cs-open{opacity:0;pointer-events:none}
html button.cs-trigger.cs-trigger.cs-compact{min-height:30px;height:30px;padding:0 8px 0 11px;font-size:11px;max-width:116px}
.cs-trigger[hidden]{display:none!important}
.field .cs-trigger,.cuisine-personal-field .cs-trigger{width:100%}
.cuisine-personal-field .cs-trigger{min-height:43px}
.cs-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cs-label.cs-ph{color:var(--muted)}
.cs-chev{width:16px;height:16px;flex-shrink:0;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;color:var(--muted)}
.cs-native{position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;border:0!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important;clip:rect(0 0 0 0)!important}

.cs-panel{position:fixed;z-index:60;filter:drop-shadow(0 14px 28px #15161228) drop-shadow(0 2px 4px #15161214)}
.cs-card{display:flex;flex-direction:column;max-height:min(70vh,460px);background:var(--card);border:1px solid var(--line);border-radius:20px;overflow:hidden;color:var(--ink)}
.cs-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 14px 8px 18px;flex-shrink:0}
.cs-head strong{font-size:13px;font-weight:600;letter-spacing:-.2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cs-x{width:24px;height:24px;flex-shrink:0;border:0;border-radius:50%;background:var(--soft);color:var(--ink);display:grid;place-items:center;padding:0}
.cs-x svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round}
.cs-list{position:relative;overflow-y:auto;padding:0 0 8px;overscroll-behavior:contain}
.cs-item{display:block;width:100%;border:0;background:transparent;color:var(--ink);text-align:left;padding:11px 18px;font-size:13px;line-height:1.35;cursor:pointer;overflow-wrap:anywhere;transition:background .15s}
.cs-item:hover,.cs-item:focus-visible{background:var(--soft);outline:none}
.cs-item.sel{font-weight:600}
.cs-item:disabled{opacity:.4;cursor:not-allowed}
.cs-group{font:10px 'DM Mono',monospace;letter-spacing:1px;text-transform:uppercase;color:var(--muted);padding:12px 18px 4px}
@media(max-width:700px){.cs-item{padding:13px 18px}}`;
    const style = document.createElement('style'); style.id = 'ctrlSelectStyles'; style.textContent = CSS; document.head.appendChild(style);

    /* ---------------------------------------------------------------- utilidades */
    let cur = null;

    function titleOf(sel) {
        const clean = t => String(t || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
        let t = sel.getAttribute('aria-label');
        if (!t && sel.id) {
            const l = document.querySelector('label[for="' + sel.id.replace(/"/g, '\\"') + '"]');
            if (l) t = l.textContent;
        }
        if (!t && sel.parentElement) {
            const l = sel.parentElement.querySelector(':scope > label');
            if (l && !l.contains(sel)) t = l.textContent;
        }
        if (!t) {
            const l = sel.closest('label');
            if (l) { const s = l.querySelector('span'); if (s) t = s.textContent; }
        }
        if (!t) t = sel.title;
        return clean(t) || 'Elegí una opción';
    }

    const insetFor = (tr, pr, rad) =>
        'inset(' + Math.max(0, tr.top - pr.top) + 'px ' + Math.max(0, pr.right - tr.right) + 'px '
        + Math.max(0, pr.bottom - tr.bottom) + 'px ' + Math.max(0, tr.left - pr.left) + 'px round ' + rad + 'px)';
    const FULL = 'inset(0px 0px 0px 0px round 20px)';

    /* ------------------------------------------------------------ abrir / cerrar */
    function open(sel, btn) {
        if (sel.disabled) return;
        if (cur) close(false, true);
        const compact = btn.classList.contains('cs-compact');

        const panel = document.createElement('div'); panel.className = 'cs-panel';
        const card = document.createElement('div'); card.className = 'cs-card';
        card.setAttribute('role', 'dialog');
        const title = titleOf(sel);
        card.setAttribute('aria-label', title);

        const head = document.createElement('div'); head.className = 'cs-head';
        head.innerHTML = '<strong></strong><button type="button" class="cs-x" aria-label="Cerrar">' + CLOSE + '</button>';
        head.firstChild.textContent = title;

        const list = document.createElement('div'); list.className = 'cs-list'; list.setAttribute('role', 'listbox');
        const items = [];
        const addOpt = (o, groupDisabled) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'cs-item' + (o.index === sel.selectedIndex ? ' sel' : '');
            b.setAttribute('role', 'option');
            b.setAttribute('aria-selected', String(o.index === sel.selectedIndex));
            b.disabled = o.disabled || !!groupDisabled;
            b.textContent = o.textContent.trim() || '—';
            b.dataset.index = o.index;
            list.appendChild(b); items.push(b);
        };
        [...sel.children].forEach(ch => {
            if (ch.tagName === 'OPTGROUP') {
                const g = document.createElement('div'); g.className = 'cs-group'; g.textContent = ch.label || '';
                list.appendChild(g);
                [...ch.children].forEach(o => { if (o.tagName === 'OPTION') addOpt(o, ch.disabled); });
            } else if (ch.tagName === 'OPTION') addOpt(ch);
        });

        card.append(head, list); panel.appendChild(card);
        panel.style.visibility = 'hidden';
        document.body.appendChild(panel);

        // posición: la tarjeta nace sobre la pastilla y se expande desde ahí
        const tr = btn.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
        const w = Math.min(vw - 16, Math.max(tr.width, compact ? 200 : 260));
        panel.style.width = w + 'px';
        const ph = panel.offsetHeight;
        const left = Math.max(8, Math.min(tr.left, vw - w - 8));
        const top = Math.max(8, Math.min(tr.top, vh - ph - 8));
        panel.style.left = left + 'px'; panel.style.top = top + 'px'; panel.style.visibility = '';

        const selEl = items.find(b => b.classList.contains('sel'));
        if (selEl) list.scrollTop = Math.max(0, selEl.offsetTop - list.clientHeight / 2 + selEl.offsetHeight / 2);

        if (!reduce) {
            const pr = { left, top, right: left + w, bottom: top + ph };
            card.animate([{ clipPath: insetFor(tr, pr, 30) }, { clipPath: FULL }], { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' });
            head.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 100, easing: 'ease-out', fill: 'backwards' });
            items.slice(0, 14).forEach((b, i) => b.animate(
                [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
                { duration: 380, delay: 60 + i * 30, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }));
        }

        btn.classList.add('cs-open'); btn.setAttribute('aria-expanded', 'true');
        cur = { sel, btn, panel, card, items };

        panel.addEventListener('mousedown', e => e.preventDefault());
        panel.addEventListener('click', e => {
            if (e.target.closest('.cs-x')) return close(e.detail === 0);
            const b = e.target.closest('.cs-item');
            if (!b || b.disabled) return;
            choose(sel, Number(b.dataset.index), e.detail === 0);
        });
        panel.addEventListener('keydown', onNav);
        document.addEventListener('pointerdown', onDown, true);
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onResize);

        const start = selEl || items.find(b => !b.disabled);
        if (start) requestAnimationFrame(() => start.focus({ preventScroll: true }));
    }

    function close(refocus, instant) {
        if (!cur) return;
        const c = cur; cur = null;
        document.removeEventListener('pointerdown', onDown, true);
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', onResize);

        let finished = false;
        const done = () => {
            if (finished) return; finished = true;
            c.panel.remove();
            c.btn.classList.remove('cs-open'); c.btn.setAttribute('aria-expanded', 'false');
            if (refocus && c.btn.isConnected) c.btn.focus({ preventScroll: true });
        };
        if (instant || reduce || !c.btn.isConnected) { done(); return; }

        // la tarjeta se vuelve a encoger hasta la pastilla
        const tr = c.btn.getBoundingClientRect(), pr = c.panel.getBoundingClientRect();
        c.panel.style.pointerEvents = 'none';
        const a = c.card.animate([{ clipPath: FULL }, { clipPath: insetFor(tr, pr, 30) }],
            { duration: 230, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
        a.onfinish = done; setTimeout(done, 400);
    }

    function choose(sel, idx, refocus) {
        const changed = sel.selectedIndex !== idx;
        sel.selectedIndex = idx;
        if (sel._csRefresh) sel._csRefresh();
        close(refocus);
        if (changed) {
            sel.dispatchEvent(new Event('input', { bubbles: true }));
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    /* ------------------------------------------------------------ eventos globales */
    function onDown(e) { if (cur && !cur.panel.contains(e.target)) close(false); }
    function onKey(e) {
        if (!cur) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
        else if (e.key === 'Tab') close(false, true);
    }
    function onScroll(e) { if (cur && !cur.panel.contains(e.target)) close(false, true); }
    function onResize() { close(false, true); }
    function onNav(e) {
        if (!cur) return;
        const enabled = cur.items.filter(b => !b.disabled);
        if (!enabled.length) return;
        const i = enabled.indexOf(document.activeElement);
        let n = -1;
        if (e.key === 'ArrowDown') n = i < 0 ? 0 : Math.min(enabled.length - 1, i + 1);
        else if (e.key === 'ArrowUp') n = i < 0 ? enabled.length - 1 : Math.max(0, i - 1);
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = enabled.length - 1;
        if (n < 0) return;
        e.preventDefault(); enabled[n].focus();
    }

    /* ---------------------------------------------------------------- conversión */
    function upgrade(sel) {
        if (sel.dataset.cs || sel.multiple || sel.size > 1) return;
        sel.dataset.cs = '1';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cs-trigger ' + sel.className.trim();      // hereda ancho/flex/max-width de cada contexto
        if (sel.getAttribute('style')) btn.style.cssText = sel.getAttribute('style');
        if (sel.closest('.mc-toolbar')) btn.classList.add('cs-compact');
        btn.setAttribute('aria-haspopup', 'listbox');
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = '<span class="cs-label"></span>' + CHEV;

        // antes del select: si está dentro de un <label>, tocar el texto abre el desplegable
        sel.parentNode.insertBefore(btn, sel);
        sel.classList.add('cs-native');
        sel.tabIndex = -1;
        sel.setAttribute('aria-hidden', 'true');

        const refresh = () => {
            const o = sel.options[sel.selectedIndex];
            const txt = o ? o.textContent.trim() : '';
            const lab = btn.firstChild;
            lab.textContent = txt || 'Elegí una opción';
            lab.classList.toggle('cs-ph', !txt);
            btn.disabled = sel.disabled;
            btn.hidden = sel.hidden;
            btn.setAttribute('aria-label', titleOf(sel) + (txt ? ': ' + txt : ''));
        };
        sel._csRefresh = refresh;

        // asignaciones por código (select.value = ...) también actualizan la pastilla
        Object.defineProperty(sel, 'value', {
            configurable: true,
            get() { return nativeValue.get.call(sel); },
            set(v) { nativeValue.set.call(sel, v); refresh(); }
        });

        new MutationObserver(() => {
            refresh();
            if (cur && cur.sel === sel) close(false, true);
        }).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'selected'] });

        btn.addEventListener('click', () => { if (cur && cur.sel === sel) close(true); else open(sel, btn); });
        btn.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(sel, btn); }
        });
        sel.addEventListener('focus', () => btn.focus());          // p. ej. un <label for="..."> enfoca el select

        refresh();
    }

    function scan(root) {
        if (!root || root.nodeType !== 1) return;
        if (root.tagName === 'SELECT') upgrade(root);
        if (root.querySelectorAll) root.querySelectorAll('select:not([data-cs])').forEach(upgrade);
    }

    // form.reset() cambia la selección sin avisar: se vuelve a leer
    document.addEventListener('reset', e => {
        setTimeout(() => e.target.querySelectorAll && e.target.querySelectorAll('select[data-cs]').forEach(s => s._csRefresh && s._csRefresh()), 0);
    });

    scan(document.body);
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });
})();