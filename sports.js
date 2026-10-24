/* =============================================================================
   Ctrl · Deportes (fútbol) — datos de PitchAPI (https://pitchapi.dev)
   Módulo autónomo: al cargarse reemplaza el item "Inbox" por "Deportes",
   inyecta su sección, estilos y modales. Incluir una sola vez al final del
   <body>, después de los demás scripts:  <script src="./sports.js"></script>
   ========================================================================== */
(function () {
  'use strict';
  if (window.__ctrlSports) return; window.__ctrlSports = true;

  /* ------------------------------------------------------------------ config */
  // OJO: PitchAPI recomienda no exponer la key en el cliente. Si el repositorio es
  // público, conviene pasarla a un proxy (ver README / mensaje de entrega).
  const DEFAULT_KEY = ''; // La credencial se guarda exclusivamente en el servidor.
  const DEFAULT_BASE = '/api/pitchapi';
  const lsGet = k => { try { return localStorage.getItem(k) } catch { return null } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch { } };
  const CFG = {
    key: DEFAULT_KEY,
    base: DEFAULT_BASE
  };

  /* ----------------------------------------------------------------- helpers */
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = m => { if (typeof window.toast === 'function') window.toast(m); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pad = n => String(n).padStart(2, '0');
  const keyOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => keyOf(new Date());
  const fromKey = k => new Date(k + 'T12:00:00');
  const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
  const fmtTime = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '--:--' : d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }); };
  const fmtDay = (k, o) => fromKey(k).toLocaleDateString('es-AR', o || { weekday: 'long', day: 'numeric', month: 'long' });
  const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const mKey = m => m.time_utc && !Number.isNaN(new Date(m.time_utc).getTime()) ? keyOf(new Date(m.time_utc)) : (m.date || '');
  const kickoff = m => { const t = new Date(m.time_utc).getTime(); return Number.isNaN(t) ? 0 : t; };
  const hasScore = m => Number.isFinite(m.score_home) && Number.isFinite(m.score_away);
  async function pool(tasks, n) { let i = 0; const run = async () => { while (i < tasks.length) { const f = tasks[i++]; await f(); } }; await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, run)); }

  const COUNTRIES = { ENG: 'Inglaterra', ESP: 'España', ITA: 'Italia', GER: 'Alemania', FRA: 'Francia', ARG: 'Argentina', BRA: 'Brasil', POR: 'Portugal', NED: 'Países Bajos', BEL: 'Bélgica', TUR: 'Turquía', SCO: 'Escocia', WAL: 'Gales', IRL: 'Irlanda', NIR: 'Irlanda del Norte', USA: 'Estados Unidos', MEX: 'México', URU: 'Uruguay', CHI: 'Chile', COL: 'Colombia', PER: 'Perú', ECU: 'Ecuador', PAR: 'Paraguay', BOL: 'Bolivia', VEN: 'Venezuela', CZE: 'Chequia', CRO: 'Croacia', SUI: 'Suiza', AUT: 'Austria', GRE: 'Grecia', DEN: 'Dinamarca', SWE: 'Suecia', NOR: 'Noruega', FIN: 'Finlandia', POL: 'Polonia', RUS: 'Rusia', UKR: 'Ucrania', ROU: 'Rumania', HUN: 'Hungría', SRB: 'Serbia', BUL: 'Bulgaria', SVK: 'Eslovaquia', SVN: 'Eslovenia', ISR: 'Israel', CYP: 'Chipre', JPN: 'Japón', KOR: 'Corea del Sur', CHN: 'China', AUS: 'Australia', QAT: 'Catar', UAE: 'Emiratos Árabes', KSA: 'Arabia Saudita', LAT: 'Letonia', LVA: 'Letonia', EGY: 'Egipto', RSA: 'Sudáfrica', CAN: 'Canadá', CRC: 'Costa Rica', INT: 'Internacional', EUR: 'Europa', WLD: 'Mundo', SAM: 'Sudamérica', CON: 'Internacional' };
  function country(code) {
    if (!code) return 'Internacional';
    const c = String(code).toUpperCase();
    if (COUNTRIES[c]) return COUNTRIES[c];
    if (c.length === 2) { try { return new Intl.DisplayNames(['es'], { type: 'region' }).of(c) } catch { } }
    return c;
  }
  const CUP_RE = /cup|copa|champions|europa|conference|supercup|supercopa|super cup|supercoppa|libertadores|sudamericana|recopa|nations|trophy|trofeo|shield|play-?off|qualif|friend|coupe|pokal|coppa|mundial|world/i;

  /* ----------------------------------------------------------------- estado */
  function store() {
    if (typeof state === 'undefined') return { teams: [], leagues: [], scope: 'mine' };
    if (!state.sports || typeof state.sports !== 'object') state.sports = {};
    const s = state.sports;
    if (!Array.isArray(s.teams)) s.teams = [];
    if (!Array.isArray(s.leagues)) s.leagues = [];
    s.teams = s.teams.filter(t => t && t.id); s.leagues = s.leagues.filter(l => l && l.id);
    if (s.scope !== 'all') s.scope = 'mine';
    return s;
  }
  function persist() { try { localStorage.setItem(typeof KEY === 'string' ? KEY : 'ctrl.personal.v1', JSON.stringify(state)) } catch { } }
  // API IDs are opaque strings; normalize persisted IDs too, so old state
  // with numeric IDs cannot silently hide followed teams/leagues.
  const sameId = (a, b) => a != null && b != null && String(a) === String(b);
  const isTeamF = id => id != null && store().teams.some(t => sameId(t.id, id));
  const isLeagueF = id => id != null && store().leagues.some(l => sameId(l.id, id));
  const followedMatch = m => isLeagueF(m.league && m.league.id) || isTeamF(m.home_team && m.home_team.id) || isTeamF(m.away_team && m.away_team.id);
  const ui = { tab: 'matches', day: today(), tableLeague: '', season: '', manageTab: 'leagues', manageLeague: '', manageQuery: '' };
  let dayCache = [], dayToken = 0, tableToken = 0, shown = false, lastDayLoad = 0;

  /* -------------------------------------------------------------------- API */
  const memo = new Map(), inflight = new Map();
  async function api(path, params, opt) {
    const o = opt || {}, ttl = o.ttl || 0;
    const qs = params && Object.keys(params).length ? '?' + new URLSearchParams(params) : '';
    const url = CFG.base + path + qs;
    const hit = memo.get(url);
    if (!o.force && hit && Date.now() - hit.t < hit.ttl) return hit.data;
    if (!o.force && inflight.has(url)) return inflight.get(url);
    const p = (async () => {
      let res;
      for (let attempt = 0; attempt < 2; attempt++) {
        try { res = await fetch(url, { cache: 'no-store', headers: { 'X-API-KEY': CFG.key, Accept: 'application/json' } }); }
        catch (e) { const err = new Error('No se pudo conectar con PitchAPI. Revisá tu conexión (o si el navegador bloquea la API por CORS).'); err.network = true; throw err; }
        if (res.status === 429 && attempt === 0) { await sleep(Math.min(5, Number(res.headers.get('Retry-After')) || 2) * 1000); continue; }
        break;
      }
      let body = null; try { body = await res.json(); } catch { }
      if (!res.ok) {
        const apiError = body && body.error;
        const apiMessage = typeof apiError === 'string' ? apiError
          : (apiError && apiError.message) || (body && body.message) || '';
        const err = new Error(apiMessage || ('Error ' + res.status));
        err.status = res.status;
        err.code = (apiError && typeof apiError === 'object' && apiError.code) || (body && body.code) || '';
        err.endpoint = path + qs;
        err.upstreamMessage = apiMessage;
        err.target = res.headers.get('X-Pitchapi-Target') || '';
        // Sin JSON de PitchAPI: la respuesta vino del hosting/proxy (ruta inexistente), no de la API.
        err.noEnvelope = !body || typeof body !== 'object';
        throw err;
      }
      if (!body || typeof body !== 'object') {
        // 200 pero sin JSON (p. ej. una página HTML): nunca debe interpretarse como "sin datos".
        const err = new Error('El servidor respondió con algo que no es JSON. Probablemente el proxy /api/pitchapi no está funcionando.');
        err.status = 502; err.code = 'BAD_RESPONSE'; err.endpoint = path + qs; err.noEnvelope = true;
        throw err;
      }
      const data = body && typeof body === 'object' && 'data' in body ? body.data : body;
      memo.set(url, { t: Date.now(), ttl, data });
      return data;
    })();
    inflight.set(url, p);
    try { return await p; } finally { inflight.delete(url); }
  }

  /* ---------------------------------------------------- ligas y escudos */
  const L = { list: [], byId: new Map(), loaded: false };
  function setLeagues(list) {
    L.list = Array.isArray(list) ? list.filter(l => l && l.id && l.name) : [];
    L.byId = new Map(L.list.map(l => [String(l.id), l]));
  }
  async function loadLeagues(force) {
    // PitchAPI puede cambiar IDs del catálogo. El caché se usa para pintar rápido,
    // pero se refresca una vez por sesión para evitar búsquedas con IDs obsoletos (404).
    if (L.loaded && !force) return;
    try {
      const c = JSON.parse(lsGet('ctrl.sports.leagues') || 'null');
      if (!L.list.length && c && Array.isArray(c.list) && c.list.length) setLeagues(c.list);
    } catch { }
    try {
      const d = await api('/v1/leagues', null, { ttl: 0, force: true });
      if (!d || !Array.isArray(d.leagues)) throw new Error('PitchAPI devolvió un catálogo de competiciones inválido.');
      setLeagues(d.leagues);
      lsSet('ctrl.sports.leagues', JSON.stringify({ t: Date.now(), list: L.list.map(l => ({ id: l.id, name: l.name, country_code: l.country_code, image_url: l.image_url, seasons: l.seasons })) }));
      L.loaded = true;
      reconcileLeagues();
    } catch (e) {
      // Solo una caída transitoria (red, 429, 5xx) justifica usar el catálogo guardado.
      // Un 404/401 o una respuesta que no es JSON significa que el proxy está mal: hay que mostrarlo.
      const transient = e && (e.network || e.status === 429 || (e.status >= 500 && e.status !== 502) || (e.status === 502 && !e.noEnvelope));
      if (!L.list.length || !transient) throw e;
      L.loaded = true;
    }
  }
  // Equipos seguidos con ID obsoleto: se comprueba que PitchAPI ya no los conoce (404 JSON)
  // y recién entonces se re-vinculan por nombre exacto con un equipo visto en los partidos.
  const teamChecked = new Set();
  async function reconcileTeams(ms) {
    const s = store(); if (!s.teams.length || !Array.isArray(ms)) return;
    const byName = new Map(), seen = new Set();
    ms.forEach(m => [m.home_team, m.away_team].forEach(t => { if (t && t.id && t.name) { seen.add(String(t.id)); byName.set(t.name, t); } }));
    let changed = false;
    for (const f of s.teams.slice()) {
      const cand = byName.get(f.name);
      if (!cand || seen.has(String(f.id)) || sameId(cand.id, f.id) || teamChecked.has(f.id)) continue;
      teamChecked.add(f.id);
      try { await api('/v1/teams/' + encodeURIComponent(f.id), null, { ttl: 864e5 }); }
      catch (e) {
        if (e && e.status === 404 && !e.noEnvelope && !s.teams.some(x => sameId(x.id, cand.id))) { f.id = String(cand.id); changed = true; }
      }
    }
    if (changed) { persist(); paintFollowing(); paintDay(); }
  }
  // Si PitchAPI cambió los IDs del catálogo, las ligas seguidas quedan con IDs viejos y nunca
  // coinciden con los partidos. Las re-vinculamos por nombre y país.
  function reconcileLeagues() {
    const s = store(); let changed = false;
    s.leagues.forEach(f => {
      if (L.byId.has(String(f.id))) return;
      const match = L.list.find(l => l.name === f.name && (!f.country || l.country_code === f.country)) || L.list.find(l => l.name === f.name);
      if (match) { f.id = String(match.id); f.country = match.country_code || f.country; changed = true; }
    });
    if (changed) persist();
  }
  const leagueImg = id => (L.byId.get(id) || {}).image_url || '';

  let logos = {}; try { logos = JSON.parse(lsGet('ctrl.sports.logos') || '{}') || {}; } catch { }
  const pendingLogos = new Set();
  const saveLogos = () => lsSet('ctrl.sports.logos', JSON.stringify(logos));
  function noteTeam(t) { if (t && t.id && t.image_url && logos[t.id] !== t.image_url) logos[t.id] = t.image_url; }
  function crest(team, size) {
    const cls = size ? ' ' + size : '';
    if (!team) return '<span class="sp-crest sp-crest-ph' + cls + '">?</span>';
    const url = team.image_url || logos[team.id];
    if (url) return '<img class="sp-crest' + cls + '" src="' + esc(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer">';
    return '<span class="sp-crest sp-crest-ph' + cls + '" data-crest="' + esc(team.id) + '">' + esc(initials(team.name)) + '</span>';
  }
  function applyCrest(id) {
    const url = logos[id]; if (!url) return;
    document.querySelectorAll('[data-crest="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]').forEach(n => {
      const img = document.createElement('img'); img.className = n.className.replace('sp-crest-ph', '').trim(); img.src = url; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
      n.replaceWith(img);
    });
  }
  function hydrate(root) {
    if (!root) return;
    const ids = [...new Set([...root.querySelectorAll('[data-crest]')].map(n => n.dataset.crest))].filter(id => !(id in logos) && !pendingLogos.has(id)).slice(0, 60);
    if (!ids.length) return;
    ids.forEach(id => pendingLogos.add(id));
    pool(ids.map(id => async () => {
      try { const t = await api('/v1/teams/' + id, null, { ttl: 864e5 }); logos[id] = (t && t.image_url) || ''; }
      catch (e) { if (e.status === 404) logos[id] = ''; }
      finally { pendingLogos.delete(id); }
      applyCrest(id);
    }), 4).then(saveLogos);
  }
  document.addEventListener('error', e => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.classList.contains('sp-crest')) { const s = document.createElement('span'); s.className = t.className + ' sp-crest-ph'; s.textContent = '⚽'; t.replaceWith(s); }
  }, true);

  /* --------------------------------------------------------- estados partido */
  const FT = ['finished', 'ft', 'played', 'fulltime', 'ended', 'afterpenalties', 'afterextratime', 'aet', 'pen', 'awarded'];
  const NS = ['notstarted', 'scheduled', 'upcoming', 'ns', 'tbd', 'timetobedefined', ''];
  function statusInfo(m) {
    const s = String(m.status || '').toLowerCase().replace(/[\s_-]/g, '');
    if (FT.includes(s)) return { k: 'ft', label: 'Final' };
    if (NS.includes(s)) return { k: 'ns', label: fmtTime(m.time_utc) };
    if (s === 'postponed') return { k: 'pp', label: 'Postergado' };
    if (s === 'cancelled' || s === 'canceled') return { k: 'pp', label: 'Cancelado' };
    if (s === 'abandoned' || s === 'suspended' || s === 'interrupted') return { k: 'pp', label: s === 'abandoned' ? 'Abandonado' : 'Suspendido' };
    if (s === 'halftime' || s === 'ht') return { k: 'live', label: 'Entretiempo' };
    if (/live|progress|started|half|extra|penal/.test(s) || hasScore(m)) return { k: 'live', label: 'En juego' };
    return { k: 'ns', label: fmtTime(m.time_utc) };
  }
  const isDone = m => statusInfo(m).k === 'ft' && hasScore(m);

  /* ---------------------------------------------------------- datos de días */
  // Respaldo: si el endpoint por fecha no devuelve partidos, reconstruimos
  // el calendario a partir de los partidos de las temporadas de cada liga.
  // Se comparte una única petición entre las fechas y el selector de equipos.
  let leagueMatchesCache = null;
  let leagueMatchesCacheAt = 0;
  let leagueMatchesInFlight = null;
  async function allLeagueMatches(force) {
    if (!force && leagueMatchesCache && Date.now() - leagueMatchesCacheAt < 10 * 60 * 1000) return leagueMatchesCache;
    if (!force && leagueMatchesInFlight) return leagueMatchesInFlight;
    leagueMatchesInFlight = (async () => {
      await loadLeagues();
      const all = [];
      await pool(L.list.map(league => async () => {
        try {
          const result = await api('/v1/leagues/' + encodeURIComponent(league.id) + '/matches', { status: 'all' }, { ttl: 600000, force });
          const matches = matchesFrom(result);
          matches.forEach(match => {
            if (!match.league) match.league = result.league || league;
            all.push(match);
          });
        } catch (error) {
          // Una liga sin datos no debe impedir que las demás se muestren.
          if (!error || error.noEnvelope || (error.status !== 404 && error.status !== 400)) throw error;
        }
      }), 4);
      const unique = new Map();
      all.forEach(match => { if (match && match.id != null) unique.set(String(match.id), match); });
      leagueMatchesCache = [...unique.values()];
      leagueMatchesCacheAt = Date.now();
      return leagueMatchesCache;
    })();
    try { return await leagueMatchesInFlight; }
    finally { leagueMatchesInFlight = null; }
  }
  const dayTtl = k => Math.abs((fromKey(k) - fromKey(today())) / 864e5) <= 1.5 ? 60000 : 900000;
  function matchesFrom(d) {
    // Accept both the documented { matches: [...] } payload and wrapped variants.
    if (Array.isArray(d)) return d;
    if (d && Array.isArray(d.matches)) return d.matches;
    if (d && d.data && Array.isArray(d.data.matches)) return d.data.matches;
    return [];
  }
  const seasonYear = s => Number((String(s).match(/\d{4}/g) || ['0']).slice(-1)[0]);
  // Pide los partidos de una liga. Si la temporada por defecto da 404/400, prueba las
  // temporadas que anuncia el catálogo (de la más nueva a la más vieja).
  async function leagueMatches(lid, o) {
    o = o || {};
    const lg = L.byId.get(String(lid));
    const known = (Array.isArray(lg && lg.seasons) ? lg.seasons.slice() : [])
      .sort((a, b) => seasonYear(b) - seasonYear(a)).slice(0, 4);
    const seasons = o.season ? [o.season] : ['', ...known];
    const attempts = seasons.map(season => season ? { status: 'all', season } : { status: 'all' });
    if (!o.season) attempts.push({});   // último recurso: respuesta por defecto de la API
    let firstOk = null, lastError = null;
    for (const params of attempts) {
      try {
        const data = await api('/v1/leagues/' + encodeURIComponent(lid) + '/matches', params, { ttl: 600000, force: o.force });
        if (!firstOk) firstOk = { data, params };
        if (matchesFrom(data).length) return { data, params };
      } catch (e) {
        if (!e || e.noEnvelope || (e.status !== 404 && e.status !== 400)) throw e;
        lastError = e;
      }
    }
    if (firstOk) return firstOk;
    throw lastError;
  }
  async function fetchDate(k, force) {
    const future = k > today();
    // PitchAPI's default is historical-only. Ask explicitly for the relevant
    // status first; if the API returns an empty list, retry with "all" so that
    // scheduled fixtures aren't hidden by a status/filter inconsistency.
    const statuses = future ? ['upcoming', 'all'] : ['all', 'upcoming'];
    let lastError = null;
    for (let i = 0; i < statuses.length; i++) {
      try {
        const d = await api('/v1/date/' + k, { status: statuses[i] }, {
          ttl: dayTtl(k),
          force: force || i > 0
        });
        const matches = matchesFrom(d);
        if (matches.length) return matches;
      } catch (e) {
        lastError = e;
        // Un 404 JSON de PitchAPI para una fecha sin cobertura es un día vacío;
        // un 404 sin JSON es del hosting/proxy y debe mostrarse como error.
        if (!e || e.status !== 404 || e.noEnvelope) throw e;
      }
    }
    if (lastError && lastError.status !== 404) throw lastError;
    // The date endpoint can be empty even when league schedules are available.
    // Rebuild this date from the season schedules before declaring it empty.
    const fallback = await allLeagueMatches(force);
    return fallback.filter(match => mKey(match) === k);
  }
  async function dayMatches(k, force) {
    // La API agrupa por fecha UTC: pedimos el día anterior y el siguiente y filtramos por hora local.
    const keys = [-1, 0, 1].map(o => addDays(k, o));
    const res = await Promise.allSettled(keys.map(x => fetchDate(x, force)));
    if (res[1].status === 'rejected') throw res[1].reason;
    const seen = new Set(), out = [];
    res.forEach(r => { if (r.status === 'fulfilled') r.value.forEach(m => { if (!seen.has(m.id)) { seen.add(m.id); out.push(m); } }); });
    return out.filter(m => mKey(m) === k);
  }
  async function loadWeek(force) {
    const t = today(), keys = Array.from({ length: 15 }, (_, i) => addDays(t, i)), all = []; let lastErr = null;
    await pool(keys.map(k => async () => { try { all.push(...await fetchDate(k, force)); } catch (e) { lastErr = e; } }), 4);
    if (!all.length && lastErr) throw lastErr;
    const seen = new Set(); return all.filter(m => !seen.has(m.id) && seen.add(m.id));
  }

  /* ---------------------------------------------------------- vistas (HTML) */
  const loadingHtml = t => '<div class="empty">' + esc(t) + '</div>';
  const emptyHtml = t => '<div class="empty">' + t + '</div>';
  function errorHtml(e, retry) {
    let msg;
    if (e && (e.noEnvelope || e.code === 'BAD_RESPONSE')) msg = 'La app no está llegando a PitchAPI: la ruta /api/pitchapi no respondió JSON (' + esc(String(e.status || '')) + '). Verificá que el deploy en Vercel incluya la carpeta api/ y la variable PITCHAPI_API_KEY (no funciona en GitHub Pages).' + (e.endpoint ? '<br><small style="display:inline-block;margin-top:8px;opacity:.8">Consulta: ' + esc(e.endpoint) + '</small>' : '');
    else if (e && e.status === 401) msg = 'PitchAPI rechazó la clave de acceso (401). Revisá PITCHAPI_API_KEY en las variables de entorno de Vercel.';
    else if (e && e.status === 404 && e.code === 'RESOURCE_NOT_FOUND') msg = 'PitchAPI ya no encuentra este registro. Puede haber cambiado su ID; actualizá los datos o elegí otra competición.';
    else if (e && e.status === 404) {
      msg = 'PitchAPI devolvió 404: el recurso solicitado no está disponible para estos datos.';
      if (e.endpoint) msg += '<br><small style="display:inline-block;margin-top:8px;opacity:.8">Consulta: ' + esc(e.endpoint) + '</small>';
      if (e.target) msg += '<br><small style="display:inline-block;margin-top:4px;opacity:.8">Destino en PitchAPI: ' + esc(e.target) + '</small>';
      if (e.upstreamMessage) msg += '<br><small style="display:inline-block;margin-top:4px;opacity:.8">Detalle: ' + esc(e.upstreamMessage) + '</small>';
      if (e.code) msg += '<br><small style="display:inline-block;margin-top:4px;opacity:.8">Código: ' + esc(e.code) + '</small>';
    }
    else if (e && e.status === 503) msg = esc(e.message || 'El proxy de Deportes no está configurado. Revisá PITCHAPI_API_KEY en Vercel.');
    else msg = esc(e && e.message || 'Error desconocido');
    return '<div class="empty">' + msg + '<br><button class="secondary" style="margin-top:12px" data-sp-retry="' + retry + '">Reintentar</button></div>';
  }
  function matchRow(m, showDate) {
    const st = statusInfo(m), has = hasScore(m);
    noteTeam(m.home_team); noteTeam(m.away_team);
    const when = (showDate ? fmtDay(mKey(m), { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '') + ' · ' : '') + fmtTime(m.time_utc);
    return '<button type="button" class="sp-match' + (showDate ? ' dated' : '') + '" data-match="' + esc(m.id) + '">'
      + '<span class="sp-when ' + st.k + '">' + esc(when) + '</span>'
      + '<span class="sp-side home' + (isTeamF(m.home_team.id) ? ' f' : '') + '"><span class="sp-name">' + esc(m.home_team.name) + '</span>' + crest(m.home_team) + '</span>'
      + '<span class="sp-score ' + st.k + '">' + (has ? m.score_home + ' – ' + m.score_away : 'vs') + '</span>'
      + '<span class="sp-side away' + (isTeamF(m.away_team.id) ? ' f' : '') + '">' + crest(m.away_team) + '<span class="sp-name">' + esc(m.away_team.name) + '</span></span>'
      + '<span class="sp-state ' + st.k + '">' + esc(st.k === 'ns' ? '' : st.label) + '</span></button>';
  }
  function groupedHtml(ms) {
    const g = new Map();
    ms.forEach(m => { const id = (m.league && m.league.id) || 'x'; if (!g.has(id)) g.set(id, { league: m.league || { name: 'Otros' }, list: [] }); g.get(id).list.push(m); });
    return [...g.values()].sort((a, b) => kickoff(a.list[0]) - kickoff(b.list[0])).map(grp => {
      const img = leagueImg(grp.league.id) || grp.league.image_url;
      const lg = L.byId.get(grp.league.id);
      return '<div class="sp-lg">' + (img ? '<img class="sp-crest sm" src="' + esc(img) + '" alt="" loading="lazy">' : '') + '<span>' + esc(grp.league.name) + '</span>' + (lg && lg.country_code ? '<small>' + esc(country(lg.country_code)) + '</small>' : '') + (isLeagueF(grp.league.id) ? '<span class="sp-pin" title="Competición que seguís">★</span>' : '') + '</div>'
        + grp.list.sort((a, b) => kickoff(a) - kickoff(b)).map(m => matchRow(m)).join('');
    }).join('');
  }

  /* ---------------------------------------------------------- tab: partidos */
  function paintStrip() {
    const t = today();
    $('spStrip').innerHTML = [-3, -2, -1, 0, 1, 2, 3].map(o => {
      const k = addDays(ui.day, o);
      return '<button type="button" class="sp-dayb' + (k === ui.day ? ' active' : '') + (k === t ? ' today' : '') + '" data-day="' + k + '"><small>' + esc(fmtDay(k, { weekday: 'short' }).replace('.', '')) + '</small><b>' + fromKey(k).getDate() + '</b></button>';
    }).join('');
    $('spDayTitle').textContent = (ui.day === t ? 'Hoy · ' : '') + fmtDay(ui.day);
    $('spDayInput').value = ui.day;
  }
  async function renderDay(force, silent) {
    paintStrip();
    const box = $('spDayList'), token = ++dayToken;
    if (!silent) { box.innerHTML = loadingHtml('Cargando partidos…'); $('spDaySub').textContent = ''; }
    try {
      const all = await dayMatches(ui.day, force);
      if (token !== dayToken) return;
      dayCache = all; lastDayLoad = Date.now(); paintDay();
      reconcileTeams(all).catch(() => { });
    } catch (e) { if (token !== dayToken || silent) return; box.innerHTML = errorHtml(e, 'day'); }
  }
  function paintDay() {
    const s = store(), mine = s.scope !== 'all', box = $('spDayList');
    document.querySelectorAll('[data-sp-scope]').forEach(b => b.classList.toggle('active', b.dataset.spScope === s.scope));
    let list = dayCache.slice();
    if (mine) list = list.filter(followedMatch);
    const hasFollows = s.teams.length || s.leagues.length;
    $('spDaySub').textContent = mine ? (list.length + (list.length === 1 ? ' partido de lo que seguís' : ' partidos de lo que seguís')) : (list.length + ' partidos en total');
    if (!list.length) {
      if (mine && !hasFollows) box.innerHTML = emptyHtml('Todavía no seguís ningún equipo ni competición.<br><button class="primary" style="margin-top:14px" data-sp-open="manage">Elegir qué seguir</button>');
      else if (mine) box.innerHTML = emptyHtml('No hay partidos de lo que seguís este día.' + (dayCache.length ? '<br><button class="secondary" style="margin-top:12px" data-sp-scope="all">Ver los ' + dayCache.length + ' partidos del día</button>' : ''));
      else box.innerHTML = emptyHtml('No hay partidos cargados para este día.');
      return;
    }
    box.innerHTML = groupedHtml(list); hydrate(box);
  }
  function paintFollowing() {
    const s = store();
    const chip = (kind, o) => '<span class="sp-chip">' + (kind === 'team' ? crest(o) : (leagueImg(o.id) ? '<img class="sp-crest sm" src="' + esc(leagueImg(o.id)) + '" alt="">' : '')) + '<span>' + esc(o.name) + '</span><button type="button" data-unfollow-' + kind + '="' + esc(o.id) + '" aria-label="Dejar de seguir ' + esc(o.name) + '">×</button></span>';
    $('spFollowing').innerHTML = (s.teams.length || s.leagues.length)
      ? (s.teams.length ? '<div class="sp-sub">Equipos y selecciones</div><div class="sp-chips">' + s.teams.map(t => chip('team', t)).join('') + '</div>' : '')
      + (s.leagues.length ? '<div class="sp-sub">Competiciones</div><div class="sp-chips">' + s.leagues.map(l => chip('league', l)).join('') + '</div>' : '')
      : emptyHtml('Nada por acá todavía. Seguí equipos, selecciones o competiciones para armar tu agenda.');
    hydrate($('spFollowing'));
    $('spStatTeams').textContent = s.teams.length; $('spStatLeagues').textContent = s.leagues.length + (s.leagues.length === 1 ? ' competición' : ' competiciones');
  }
  async function renderUpcoming(force) {
    const box = $('spUpcoming'), s = store();
    if (!s.teams.length && !s.leagues.length) { box.innerHTML = emptyHtml('Cuando sigas algo, acá vas a ver los próximos partidos.'); $('spStatToday').textContent = '0'; $('spStatNext').textContent = '—'; return; }
    box.innerHTML = loadingHtml('Buscando partidos…');
    try {
      const week = (await loadWeek(force)).filter(followedMatch), t = today(), now = Date.now();
      const todayCount = week.filter(m => mKey(m) === t).length;
      $('spStatToday').textContent = todayCount; $('spStatTodaySub').textContent = todayCount === 1 ? 'partido de lo que seguís' : 'partidos de lo que seguís';
      const next = week.filter(m => statusInfo(m).k !== 'ft' && statusInfo(m).k !== 'pp' && kickoff(m) > now - 3.5 * 36e5).sort((a, b) => kickoff(a) - kickoff(b));
      if (next.length) { const n = next[0]; $('spStatNext').innerHTML = esc(n.home_team.name) + ' <span style="color:var(--muted)">vs</span> ' + esc(n.away_team.name); $('spStatNextSub').textContent = fmtDay(mKey(n), { weekday: 'long', day: 'numeric', month: 'short' }) + ' · ' + fmtTime(n.time_utc); }
      else { $('spStatNext').textContent = 'Sin partidos próximos'; $('spStatNextSub').textContent = 'en los próximos 14 días'; }
      box.innerHTML = next.length ? next.slice(0, 8).map(m => matchRow(m, true)).join('') : emptyHtml('No hay partidos de lo que seguís en los próximos 14 días.');
      hydrate(box);
    } catch (e) { box.innerHTML = errorHtml(e, 'upcoming'); }
  }

  /* ----------------------------------------------------------- tab: tablas */
  function groupLeagues(list) {
    const g = new Map();
    list.forEach(l => { const c = country(l.country_code); if (!g.has(c)) g.set(c, []); g.get(c).push(l); });
    return [...g.entries()].sort((a, b) => a[0] === 'Internacional' ? -1 : b[0] === 'Internacional' ? 1 : a[0].localeCompare(b[0], 'es')).map(([c, ls]) => [c, ls.sort((x, y) => x.name.localeCompare(y.name, 'es'))]);
  }
  function leagueOptions(selected) {
    const f = store().leagues.filter(l => L.byId.has(l.id)).map(l => L.byId.get(l.id));
    const opt = l => '<option value="' + esc(l.id) + '"' + (l.id === selected ? ' selected' : '') + '>' + esc(l.name) + '</option>';
    return (f.length ? '<optgroup label="★ Siguiendo">' + f.map(opt).join('') + '</optgroup>' : '')
      + groupLeagues(L.list).map(([c, ls]) => '<optgroup label="' + esc(c) + '">' + ls.map(opt).join('') + '</optgroup>').join('');
  }
  function standings(ms) {
    const rows = new Map();
    const get = t => { let r = rows.get(t.id); if (!r) { r = { team: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] }; rows.set(t.id, r); } return r; };
    ms.forEach(m => { get(m.home_team); get(m.away_team); });
    ms.filter(isDone).sort((a, b) => kickoff(a) - kickoff(b)).forEach(m => {
      const h = get(m.home_team), a = get(m.away_team), sh = m.score_home, sa = m.score_away;
      h.p++; a.p++; h.gf += sh; h.ga += sa; a.gf += sa; a.ga += sh;
      if (sh > sa) { h.w++; a.l++; h.pts += 3; h.form.push('w'); a.form.push('l'); }
      else if (sh < sa) { a.w++; h.l++; a.pts += 3; a.form.push('w'); h.form.push('l'); }
      else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('d'); a.form.push('d'); }
    });
    return [...rows.values()].sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.team.name.localeCompare(y.team.name, 'es'));
  }
  function tableHtml(rows, leagueId) {
    const F = { w: 'G', d: 'E', l: 'P' };
    return '<div class="sp-scroll"><table class="sp-table"><thead><tr><th>#</th><th>Equipo</th><th title="Partidos jugados">PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>DG</th><th>Pts</th><th class="sp-hide-sm">Forma</th></tr></thead><tbody>'
      + rows.map((r, i) => {
        const dg = r.gf - r.ga, f = isTeamF(r.team.id); noteTeam(r.team);
        return '<tr class="' + (f ? 'f' : '') + '"><td>' + (i + 1) + '</td><td><div class="sp-team-cell">' + crest(r.team) + '<span class="sp-name">' + esc(r.team.name) + '</span><button type="button" class="sp-star' + (f ? ' on' : '') + '" data-follow-team="' + esc(r.team.id) + '" data-name="' + esc(r.team.name) + '" data-league="' + esc(leagueId) + '" title="' + (f ? 'Dejar de seguir' : 'Seguir equipo') + '">' + (f ? '★' : '☆') + '</button></div></td><td>' + r.p + '</td><td>' + r.w + '</td><td>' + r.d + '</td><td>' + r.l + '</td><td>' + r.gf + '</td><td>' + r.ga + '</td><td>' + (dg > 0 ? '+' : '') + dg + '</td><td class="pts">' + r.pts + '</td><td class="sp-hide-sm"><span class="sp-form">' + r.form.slice(-5).map(x => '<i class="' + x + '">' + F[x] + '</i>').join('') + '</span></td></tr>';
      }).join('')
      + '</tbody></table></div>';
  }
  async function renderTable(force) {
    const box = $('spTableBody'), lid = ui.tableLeague;
    if (!lid) { box.innerHTML = emptyHtml('Elegí una competición para ver su tabla y sus partidos.'); return; }
    const lg = L.byId.get(lid), token = ++tableToken;
    box.innerHTML = loadingHtml('Cargando competición…');
    try {
      const r = await leagueMatches(lid, { season: ui.season, force });
      if (token !== tableToken) return;
      const d = r.data, ms = matchesFrom(d), season = (d && d.league && d.league.season) || r.params.season || ui.season;
      if (!ui.season && season) ui.season = season;
      $('spTableSeason').innerHTML = ((lg && lg.seasons) || [season]).filter(Boolean).map(s => '<option' + (s === ui.season ? ' selected' : '') + '>' + esc(s) + '</option>').join('');
      const name = (d && d.league && d.league.name) || (lg && lg.name) || '';
      const isCup = CUP_RE.test(name), now = Date.now();
      const played = ms.filter(isDone).sort((a, b) => kickoff(b) - kickoff(a)).slice(0, 8);
      const next = ms.filter(m => { const k = statusInfo(m).k; return k === 'ns' && kickoff(m) > now - 3.5 * 36e5; }).sort((a, b) => kickoff(a) - kickoff(b)).slice(0, 8);
      let html = '';
      if (isCup) html += '<div class="helper-note" style="margin-top:0">Esta competición tiene fases o eliminatorias, por eso no se arma una tabla única. Acá abajo ves sus últimos resultados y próximos partidos.</div>';
      else if (!ms.some(isDone)) html += emptyHtml('Todavía no hay partidos jugados en esta temporada.');
      else html += tableHtml(standings(ms), lid) + '<p class="sp-foot">Tabla calculada por Ctrl con los resultados de PitchAPI (la API no ofrece tablas oficiales). Puede diferir de la oficial por desempates, sanciones o fases.</p>';
      html += '<div class="sp-sub">Próximos partidos</div>' + (next.length ? next.map(m => matchRow(m, true)).join('') : '<div class="sp-none">No hay partidos programados.</div>');
      html += '<div class="sp-sub">Últimos resultados</div>' + (played.length ? played.map(m => matchRow(m, true)).join('') : '<div class="sp-none">Sin resultados todavía.</div>');
      box.innerHTML = html; hydrate(box);
      $('spTableFollow').textContent = isLeagueF(lid) ? '★ Siguiendo' : '☆ Seguir competición';
    } catch (e) { if (token === tableToken) box.innerHTML = errorHtml(e, 'table'); }
  }
  async function openTablesTab() {
    try { await loadLeagues(); } catch (e) { $('spTableBody').innerHTML = errorHtml(e, 'table'); return; }
    if (!ui.tableLeague || !L.byId.has(ui.tableLeague)) {
      const f = store().leagues.find(l => L.byId.has(l.id) && !CUP_RE.test(l.name)) || store().leagues.find(l => L.byId.has(l.id));
      ui.tableLeague = f ? f.id : (L.list.find(l => !CUP_RE.test(l.name)) || L.list[0] || {}).id || '';
      ui.season = '';
    }
    $('spTableLeague').innerHTML = leagueOptions(ui.tableLeague); $('spTableLeague').value = ui.tableLeague;
    renderTable();
  }

  /* ----------------------------------------------------------------- tabs */
  function setTab(tab) {
    ui.tab = tab;
    document.querySelectorAll('[data-sp-tab]').forEach(b => b.classList.toggle('active', b.dataset.spTab === tab));
    $('spTabMatches').hidden = tab !== 'matches'; $('spTabTables').hidden = tab !== 'tables';
    if (tab === 'tables') openTablesTab(); else renderDay();
  }

  /* ------------------------------------------------------- seguir (modal) */
  function follow(kind, o) {
    const s = store(), list = kind === 'team' ? s.teams : s.leagues, i = list.findIndex(x => sameId(x.id, o.id));
    if (i >= 0) { list.splice(i, 1); persist(); return false; }
    list.push(kind === 'team'
      ? { id: String(o.id), name: o.name || String(o.id), leagueId: o.leagueId ? String(o.leagueId) : '' }
      : { id: String(o.id), name: o.name || String(o.id), country: o.country || '' });
    persist(); return true;
  }
  function afterFollowChange() { paintFollowing(); paintDay(); renderUpcoming(); if (ui.tab === 'tables' && ui.tableLeague) { $('spTableFollow').textContent = isLeagueF(ui.tableLeague) ? '★ Siguiendo' : '☆ Seguir competición'; $('spTableLeague').innerHTML = leagueOptions(ui.tableLeague); $('spTableLeague').value = ui.tableLeague; } }
  function openManage() {
    $('spManageBackdrop').classList.add('open'); paintManage();
    loadLeagues().then(paintManage).catch(e => { $('spManageBody').innerHTML = errorHtml(e, 'manage'); });
  }
  function followBtn(on, attrs) { return '<button type="button" class="sp-fbtn ' + (on ? 'on' : '') + '" ' + attrs + '>' + (on ? '★ Siguiendo' : '☆ Seguir') + '</button>'; }
  function paintManage() {
    document.querySelectorAll('[data-sp-mtab]').forEach(b => b.classList.toggle('active', b.dataset.spMtab === ui.manageTab));
    const body = $('spManageBody'), q = ui.manageQuery.trim().toLowerCase();
    $('spManageSearch').placeholder = ui.manageTab === 'leagues' ? 'Buscar competición o país…' : 'Buscar equipo…';
    if (ui.manageTab === 'leagues') {
      $('spManageLeagueWrap').hidden = true;
      if (!L.list.length) { body.innerHTML = loadingHtml('Cargando competiciones…'); return; }
      const list = L.list.filter(l => !q || (l.name + ' ' + country(l.country_code)).toLowerCase().includes(q));
      body.innerHTML = list.length ? groupLeagues(list).map(([c, ls]) => '<div class="sp-sub">' + esc(c) + '</div>' + ls.map(l => '<div class="sp-mrow">' + (l.image_url ? '<img class="sp-crest" src="' + esc(l.image_url) + '" alt="" loading="lazy">' : '<span class="sp-crest sp-crest-ph">⚽</span>') + '<span class="sp-name">' + esc(l.name) + '</span>' + followBtn(isLeagueF(l.id), 'data-follow-league="' + esc(l.id) + '" data-name="' + esc(l.name) + '" data-country="' + esc(l.country_code || '') + '"') + '</div>').join('')).join('') : emptyHtml('No encontré competiciones con ese nombre.');
    } else {
      $('spManageLeagueWrap').hidden = false;
      if (L.list.length && !$('spManageLeague').options.length) $('spManageLeague').innerHTML = '<option value="">Elegí una competición…</option>' + leagueOptions(ui.manageLeague);
      if (L.list.length) $('spManageLeague').value = ui.manageLeague;
      paintManageTeams();
    }
    hydrate(body);
  }
  async function paintManageTeams() {
    const body = $('spManageBody'), lid = ui.manageLeague, q = ui.manageQuery.trim().toLowerCase();
    if (!lid) {
      const s = store();
      body.innerHTML = (s.teams.length ? '<div class="sp-sub">Ya seguís</div>' + s.teams.map(t => '<div class="sp-mrow">' + crest(t) + '<span class="sp-name">' + esc(t.name) + '</span>' + followBtn(true, 'data-follow-team="' + esc(t.id) + '" data-name="' + esc(t.name) + '" data-league="' + esc(t.leagueId || '') + '"') + '</div>').join('') : '')
        + emptyHtml('Elegí una competición para ver sus equipos. Las selecciones aparecen en las competiciones internacionales que tenga PitchAPI; también podés seguir cualquier equipo desde el detalle de un partido.');
      hydrate(body); return;
    }
    body.innerHTML = loadingHtml('Cargando equipos…');
    try {
      const league = L.byId.get(lid);
      const seasons = Array.isArray(league && league.seasons) ? league.seasons : [];
      const candidates = [{ status: 'all' }, ...seasons.map(season => ({ status: 'all', season }))];
      let d = null, lastError = null;
      // Some competitions need an explicit season. Try the API default first,
      // then each season advertised by the current league catalogue.
      for (const params of candidates) {
        try {
          const result = await api('/v1/leagues/' + lid + '/matches', params, { ttl: 600000 });
          d = result;
          const found = matchesFrom(result);
          if (found.length) break;
        } catch (err) {
          lastError = err;
          if (!err || err.noEnvelope || (err.status !== 404 && err.status !== 400)) throw err;
        }
        if (ui.manageLeague !== lid || ui.manageTab !== 'teams') return;
      }
      if (ui.manageLeague !== lid || ui.manageTab !== 'teams') return;
      if (!d && lastError) throw lastError;
      const m = new Map();
      matchesFrom(d).forEach(x => {
        [x.home_team, x.away_team].forEach(t => {
          if (t && t.id && t.name) { noteTeam(t); m.set(String(t.id), t); }
        });
      });
      // If the selected league endpoint is empty, reuse the full season-schedule
      // fallback so teams can still be followed from the available match data.
      if (!m.size) {
        const fallbackMatches = await allLeagueMatches(false);
        fallbackMatches.filter(match => sameId(match.league && match.league.id, lid)).forEach(match => {
          [match.home_team, match.away_team].forEach(team => {
            if (team && team.id && team.name) { noteTeam(team); m.set(String(team.id), team); }
          });
        });
      }
      const list = [...m.values()].filter(t => !q || t.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
      body.innerHTML = list.length
        ? list.map(t => '<div class="sp-mrow">' + crest(t) + '<span class="sp-name">' + esc(t.name) + '</span>' + followBtn(isTeamF(t.id), 'data-follow-team="' + esc(t.id) + '" data-name="' + esc(t.name) + '" data-league="' + esc(lid) + '"') + '</div>').join('')
        : emptyHtml('No encontré equipos en las temporadas disponibles de esta competición' + (q ? ' que coincidan con la búsqueda.' : '.'));
      hydrate(body);
    } catch (e) {
      if (ui.manageLeague !== lid) return;
      // If an ID became stale, refresh the catalogue and reset the selection.
      if (e.status === 404) {
        try {
          await loadLeagues(true);
          if (!L.byId.has(lid)) {
            ui.manageLeague = '';
            $('spManageLeague').innerHTML = '<option value="">Elegí una competición…</option>' + leagueOptions('');
            $('spManageLeague').value = '';
            return paintManage();
          }
        } catch { }
      }
      body.innerHTML = errorHtml(e, 'manageTeams');
    }
  }

  /* -------------------------------------------------- detalle de partido */
  let det = null;
  function heroHtml(m) {
    const st = statusInfo(m), has = hasScore(m);
    noteTeam(m.home_team); noteTeam(m.away_team);
    const tm = t => '<div class="sp-hero-team">' + crest(t, 'lg') + '<span>' + esc(t.name) + '</span>' + followBtn(isTeamF(t.id), 'data-follow-team="' + esc(t.id) + '" data-name="' + esc(t.name) + '" data-league="' + esc((m.league && m.league.id) || '') + '"') + '</div>';
    const meta = [m.league && m.league.name, m.round_name ? 'Fecha/Ronda ' + m.round_name : '', m.time_utc ? fmtDay(mKey(m), { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + fmtTime(m.time_utc) : '', m.stadium, m.referee ? 'Árbitro: ' + m.referee : ''].filter(Boolean);
    return '<div class="sp-hero">' + tm(m.home_team) + '<div><div class="sp-hero-score">' + (has ? m.score_home + ' – ' + m.score_away : 'vs') + '</div><div class="sp-state ' + st.k + '" style="text-align:center">' + esc(st.k === 'ns' ? fmtTime(m.time_utc) : st.label) + '</div></div>' + tm(m.away_team) + '</div>'
      + '<div class="sp-meta">' + meta.map(esc).join(' · ') + '</div>';
  }
  function eventsHtml(d, m) {
    const evs = (d && d.events) || [];
    if (!evs.length) return emptyHtml('Sin eventos registrados todavía (goles, tarjetas y cambios).');
    return evs.map(e => {
      const t = String(e.event_type || '').toLowerCase(), home = e.team_id === m.home_team.id;
      const min = (e.minute != null ? e.minute : '') + (e.minute_added ? '+' + e.minute_added : '') + "'";
      const name = e.player && e.player.name ? e.player.name : '';
      let icon = '•', txt = esc(name);
      if (t.includes('goal')) { icon = '⚽'; txt = '<b>' + esc(name) + '</b>' + (e.is_penalty ? ' <small>(pen.)</small>' : '') + (e.is_own_goal ? ' <small>(en contra)</small>' : '') + (Number.isFinite(e.score_home) ? ' <small class="sp-mut">' + e.score_home + '-' + e.score_away + '</small>' : ''); }
      else if (t.includes('yellow')) icon = '🟨';
      else if (t.includes('red')) icon = '🟥';
      else if (t.includes('sub')) { icon = '🔁'; txt = '<span class="sp-in">▲ ' + esc(e.sub_in_player ? e.sub_in_player.name : '') + '</span> <span class="sp-out">▼ ' + esc(name) + '</span>'; }
      const body = '<span>' + icon + ' ' + txt + '</span>';
      return '<div class="sp-ev"><div class="h">' + (home ? body : '') + '</div><div class="min">' + esc(min) + '</div><div class="a">' + (home ? '' : body) + '</div></div>';
    }).join('');
  }
  function statsHtml(d) {
    const periods = (d && d.periods) || [], p = periods.find(x => String(x.period).toLowerCase() === 'all') || periods[0];
    if (!p || !(p.groups || []).length) return emptyHtml('No hay estadísticas disponibles para este partido.');
    const groups = p.groups.slice().sort((a, b) => (a.group_name === 'Top stats' ? -1 : b.group_name === 'Top stats' ? 1 : 0));
    const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
    return groups.map(g => '<div class="sp-sub">' + esc(g.group_name) + '</div>' + (g.items || []).map(it => {
      const h = num(it.home), a = num(it.away), hp = h + a > 0 ? Math.round(h / (h + a) * 100) : 50;
      return '<div class="sp-stat"><div class="sp-stat-top"><span>' + esc(it.home) + '</span><span class="sp-mut">' + esc(it.title) + '</span><span>' + esc(it.away) + '</span></div><div class="sp-bar"><i style="width:' + hp + '%"></i><i class="a" style="width:' + (100 - hp) + '%"></i></div></div>';
    }).join('')).join('');
  }
  function sideHtml(side, team) {
    if (!side) return '';
    const st = side.starters || [], subs = side.subs || [], coords = st.some(p => p.pitch_x || p.pitch_y);
    const last = n => String(n || '').trim().split(/\s+/).slice(-1)[0];
    const pitch = coords ? '<div class="sp-pitch">' + st.map(p => '<div class="sp-pl" style="left:' + Math.min(92, Math.max(8, (p.pitch_x || 0) * 100)) + '%;top:' + Math.min(93, Math.max(7, (1 - (p.pitch_y || 0)) * 100)) + '%"><b>' + esc(p.shirt_number || '') + '</b><span>' + esc(last(p.name)) + (p.is_captain ? ' (C)' : '') + '</span></div>').join('') + '</div>'
      : '<div class="sp-list">' + st.map(p => '<div>' + esc(p.shirt_number || '') + ' · ' + esc(p.name) + '</div>').join('') + '</div>';
    return '<div class="sp-lineup"><div class="sp-sub" style="margin-top:0">' + esc(team.name) + (side.formation ? ' · ' + esc(side.formation) : '') + '</div>'
      + (side.confirmed === false ? '<div class="sp-note">Alineación probable (aún no confirmada)</div>' : '') + pitch
      + (side.coach && side.coach.name ? '<div class="sp-note">DT: ' + esc(side.coach.name) + '</div>' : '')
      + (subs.length ? '<div class="sp-sub">Suplentes</div><div class="sp-list">' + subs.map(p => '<div>' + esc(p.shirt_number || '') + ' · ' + esc(p.name) + '</div>').join('') + '</div>' : '') + '</div>';
  }
  function lineupsHtml(d, m) {
    if (!d || (!d.home && !d.away) || !(((d.home || {}).starters || []).length || ((d.away || {}).starters || []).length)) return emptyHtml('Las alineaciones todavía no están disponibles (se publican cerca del inicio).');
    return '<div class="sp-lineups">' + sideHtml(d.home, m.home_team) + sideHtml(d.away, m.away_team) + '</div>';
  }
  function h2hHtml(d, m) {
    if (!d) return emptyHtml('Sin datos de enfrentamientos previos.');
    const t = (d.home_wins || 0) + (d.draws || 0) + (d.away_wins || 0), pc = v => t ? Math.round(v / t * 100) : 0;
    const rec = (d.recent_matches || []).slice().sort((a, b) => String(b.time_utc).localeCompare(String(a.time_utc)));
    return '<div class="sp-h2h"><div><b>' + (d.home_wins || 0) + '</b><small>' + esc(m.home_team.name) + '</small></div><div><b>' + (d.draws || 0) + '</b><small>Empates</small></div><div><b>' + (d.away_wins || 0) + '</b><small>' + esc(m.away_team.name) + '</small></div></div>'
      + '<div class="sp-bar tri"><i style="width:' + pc(d.home_wins || 0) + '%"></i><i class="d" style="width:' + pc(d.draws || 0) + '%"></i><i class="a" style="width:' + pc(d.away_wins || 0) + '%"></i></div>'
      + '<div class="sp-sub">Últimos y próximos cruces</div>' + (rec.length ? rec.map(r => '<div class="sp-h2hrow"><span class="sp-mut">' + esc(new Date(r.time_utc).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' })) + '</span><span class="sp-name" style="text-align:right">' + esc(r.home.name) + '</span><b>' + (r.finished && Number.isFinite(r.score_home) ? r.score_home + ' – ' + r.score_away : 'vs') + '</b><span class="sp-name">' + esc(r.away.name) + '</span></div>').join('') : '<div class="sp-none">Sin historial.</div>');
  }
  const TABS = { summary: ['Resumen', '/events', eventsHtml], stats: ['Estadísticas', '/stats', statsHtml], lineups: ['Alineaciones', '/lineups', lineupsHtml], h2h: ['Cara a cara', '/h2h', h2hHtml] };
  async function paintDetailTab(force) {
    if (!det) return;
    const d = det, tab = d.tab, box = $('spDetailPane');
    document.querySelectorAll('[data-sp-dtab]').forEach(b => b.classList.toggle('active', b.dataset.spDtab === tab));
    if (d.data[tab] !== undefined && !force) { box.innerHTML = TABS[tab][2](d.data[tab], d.m); return; }
    box.innerHTML = loadingHtml('Cargando…');
    try { d.data[tab] = await api('/v1/matches/' + d.id + TABS[tab][1], null, { ttl: 30000, force }); }
    catch (e) { if (det !== d) return; if (e.status === 404 || e.status === 400) d.data[tab] = null; else { box.innerHTML = errorHtml(e, 'detail'); return; } }
    if (det === d && d.tab === tab) box.innerHTML = TABS[tab][2](d.data[tab], d.m);
  }
  async function openDetail(id, force) {
    const d = det = { id, tab: 'summary', data: {}, m: null };
    $('spDetailBackdrop').classList.add('open');
    $('spDetailBody').innerHTML = loadingHtml('Cargando partido…');
    try {
      const m = await api('/v1/matches/' + id, null, { ttl: 30000, force });
      if (det !== d) return; d.m = m;
      $('spDetailBody').innerHTML = '<div id="spDetailHero">' + heroHtml(m) + '</div><div class="flow-seg sp-dtabs" role="tablist">' + Object.entries(TABS).map(([k, v]) => '<button type="button" data-sp-dtab="' + k + '">' + v[0] + '</button>').join('') + '</div><div id="spDetailPane"></div>';
      paintDetailTab(force);
    } catch (e) { if (det === d) $('spDetailBody').innerHTML = errorHtml(e, 'detail'); }
  }
  function closeAll() { ['spDetailBackdrop', 'spManageBackdrop'].forEach(i => $(i).classList.remove('open')); det = null; }

  /* ------------------------------------------------------------- instalación */
  const TROPHY = '<svg viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-1.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98 1.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>';
  const CSS = `
#sportsView [hidden],.sp-modal [hidden]{display:none!important}
.sp-tabs{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 16px}
.sp-layout{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(260px,1fr);gap:15px;align-items:start}
.sp-col{display:grid;gap:15px;min-width:0}
.sp-daybar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.sp-daybar .icon-btn{width:34px;height:34px;font-size:18px;line-height:1}
.sp-daytitle{font-size:14px;font-weight:600;letter-spacing:-.3px;text-transform:capitalize;flex:1;min-width:140px}
.sp-strip{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin-bottom:14px}
.sp-dayb{border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:12px;padding:8px 2px;display:grid;gap:3px;justify-items:center}
.sp-dayb small{font:9px 'DM Mono',monospace;text-transform:uppercase;color:var(--muted)}
.sp-dayb b{font-size:14px;font-weight:600}
.sp-dayb:hover{background:var(--soft)}
.sp-dayb.today b{text-decoration:underline;text-underline-offset:4px;text-decoration-color:var(--green)}
.sp-dayb.active{background:var(--ink);border-color:var(--ink);color:var(--paper)}
.sp-dayb.active small{color:inherit;opacity:.75}
.sp-lg{display:flex;align-items:center;gap:9px;padding:16px 2px 8px;font-size:12px;font-weight:600;border-bottom:1px solid var(--line)}
.sp-lg:first-child{padding-top:4px}
.sp-lg small{color:var(--muted);font-weight:400;font-size:10px}
.sp-pin{color:#d9a93c;margin-left:auto;font-size:12px}
.sp-match{display:grid;grid-template-columns:48px minmax(0,1fr) 60px minmax(0,1fr) 62px;align-items:center;gap:8px;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--ink);padding:12px 4px;border-radius:0}
.sp-match.dated{grid-template-columns:104px minmax(0,1fr) 54px minmax(0,1fr)}
.sp-match.dated .sp-state{display:none}
.sp-match:hover{background:var(--soft)}
.sp-when{font:11px 'DM Mono',monospace;color:var(--muted);white-space:nowrap}
.sp-when.live{color:var(--red)}
.sp-side{display:flex;align-items:center;gap:8px;min-width:0;font-size:12px}
.sp-side.home{justify-content:flex-end;text-align:right}
.sp-side.f .sp-name{font-weight:700}
.sp-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.sp-crest{width:22px;height:22px;object-fit:contain;flex-shrink:0;border-radius:6px}
.sp-crest.sm{width:18px;height:18px}
.sp-crest.lg{width:56px;height:56px;border-radius:16px}
.sp-crest-ph{display:inline-grid;place-items:center;background:var(--soft);font:9px 'DM Mono',monospace;color:var(--muted)}
.sp-crest-ph.lg{font-size:14px}
.sp-score{font:600 13px 'DM Mono',monospace;text-align:center;letter-spacing:-.3px;white-space:nowrap}
.sp-score.ns{color:var(--muted);font-weight:400}
.sp-score.live{color:var(--red)}
.sp-state{font:9px 'DM Mono',monospace;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);text-align:right}
.sp-state.live{color:var(--red);font-weight:500}
.sp-sub{font:10px 'DM Mono',monospace;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px}
.sp-none{font-size:11px;color:var(--muted);padding:6px 0}
.sp-chips{display:flex;flex-wrap:wrap;gap:6px}
.sp-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--soft);border-radius:999px;padding:4px 5px 4px 8px;font-size:11px;max-width:100%}
.sp-chip button{border:0;background:transparent;color:var(--muted);font-size:15px;line-height:1;padding:0 4px}
.sp-chip button:hover{color:var(--ink)}
.sp-scroll{overflow-x:auto;margin:0 -4px;padding:0 4px}
.sp-table{table-layout:auto;min-width:540px;font-size:12px}
.sp-table th,.sp-table td{padding:10px 8px;text-align:center;white-space:nowrap}
.sp-table th:nth-child(2),.sp-table td:nth-child(2){text-align:left;width:100%}
.sp-table td{font-variant-numeric:tabular-nums}
.sp-table .pts{font-weight:700}
.sp-table tr.f td{background:color-mix(in srgb,var(--accent) 22%,transparent)}
.sp-team-cell{display:flex;align-items:center;gap:9px;min-width:150px}
.sp-team-cell .sp-name{max-width:190px}
.sp-star{border:0;background:transparent;color:var(--muted);font-size:15px;padding:2px 4px;border-radius:7px;line-height:1;margin-left:auto}
.sp-star.on{color:#d9a93c}
.sp-star:hover{background:var(--soft)}
.sp-form{display:inline-flex;gap:3px}
.sp-form i{width:16px;height:16px;border-radius:5px;font:500 8px/16px 'DM Mono',monospace;font-style:normal;color:#fff;text-align:center}
.sp-form .w{background:#4d7654}.sp-form .d{background:#a9a89b}.sp-form .l{background:#c96952}
.sp-foot{font-size:10px;color:var(--muted);line-height:1.6;margin:12px 2px 0}
.sp-controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
.sp-controls .filter-select{max-width:260px;flex:1;min-width:150px}
.sp-modal{width:min(100%,640px);max-height:calc(100dvh - 36px);overflow:auto}
.sp-manage-body{max-height:50vh;overflow:auto;margin:0 -6px;padding:0 6px}
.sp-mrow{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);font-size:12px}
.sp-mrow .sp-name{flex:1}
.sp-fbtn{border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:10px;padding:6px 10px;font-size:11px;white-space:nowrap}
.sp-fbtn:hover{background:var(--soft)}
.sp-fbtn.on{background:var(--ink);border-color:var(--ink);color:var(--paper)}
.sp-hero{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;text-align:center;margin:4px 0 10px}
.sp-hero-team{display:grid;justify-items:center;gap:8px;font-size:12px;font-weight:600;min-width:0}
.sp-hero-team>span{max-width:100%;overflow-wrap:anywhere}
.sp-hero-score{font:600 30px 'DM Mono',monospace;letter-spacing:-1px;white-space:nowrap}
.sp-meta{text-align:center;font-size:11px;color:var(--muted);line-height:1.6;margin-bottom:16px}
.sp-dtabs{display:flex;width:100%;overflow-x:auto;margin-bottom:12px}
.sp-dtabs button{flex:1;white-space:nowrap}
.sp-ev{display:grid;grid-template-columns:1fr 52px 1fr;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line);font-size:12px}
.sp-ev .h{text-align:right}
.sp-ev .min{text-align:center;font:10px 'DM Mono',monospace;color:var(--muted)}
.sp-mut{color:var(--muted)}
.sp-in{color:var(--green)}.sp-out{color:var(--red)}
.sp-stat{padding:8px 0}
.sp-stat-top{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;font-size:12px;font-variant-numeric:tabular-nums}
.sp-stat-top span:first-child{text-align:left;font-weight:600}
.sp-stat-top span:last-child{text-align:right;font-weight:600}
.sp-stat-top .sp-mut{font-size:11px;font-weight:400;text-align:center}
.sp-bar{display:flex;gap:3px;height:5px;margin-top:6px}
.sp-bar i{display:block;height:100%;border-radius:20px;background:var(--green)}
.sp-bar i.a{background:#d18b76}.sp-bar i.d{background:#c7c1b2}
.sp-bar.tri{height:7px;margin:8px 0 4px}
.sp-h2h{display:grid;grid-template-columns:repeat(3,1fr);text-align:center;gap:8px}
.sp-h2h b{display:block;font:600 24px 'DM Mono',monospace}
.sp-h2h small{font-size:10px;color:var(--muted)}
.sp-h2hrow{display:grid;grid-template-columns:70px 1fr 56px 1fr;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line);font-size:11px}
.sp-h2hrow b{font:600 12px 'DM Mono',monospace;text-align:center}
.sp-lineups{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.sp-pitch{position:relative;aspect-ratio:3/4;background:linear-gradient(#5f8c5b,#4d7a4d);border-radius:14px;overflow:hidden}
.sp-pitch:before{content:'';position:absolute;inset:6px;border:1.5px solid #ffffff59;border-radius:6px}
.sp-pitch:after{content:'';position:absolute;left:6px;right:6px;top:50%;border-top:1.5px solid #ffffff59}
.sp-pl{position:absolute;transform:translate(-50%,-50%);display:grid;justify-items:center;gap:2px;width:60px;z-index:1}
.sp-pl b{width:24px;height:24px;border-radius:50%;background:#fff;color:#243019;display:grid;place-items:center;font:600 10px 'DM Mono',monospace}
.sp-pl span{font-size:9px;color:#fff;text-shadow:0 1px 2px #0009;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60px}
.sp-list{font-size:11px;display:grid;gap:6px;line-height:1.4}
.sp-note{font-size:10px;color:var(--muted);margin:6px 0}
.sp-stat-next{font-size:14px;font-weight:600;letter-spacing:-.3px;margin:15px 0 7px;line-height:1.3}
html[data-theme="dark"] .sp-dayb.active,html[data-theme="dark"] .sp-fbtn.on{background:var(--accent);border-color:var(--accent);color:#243019}
html[data-theme="dark"] .sp-table tr.f td{background:color-mix(in srgb,var(--accent) 14%,transparent)}
@media(max-width:1000px){.sp-layout{grid-template-columns:minmax(0,1fr)}}
@media(max-width:700px){
.sp-match{grid-template-columns:38px minmax(0,1fr) 50px minmax(0,1fr);gap:6px;padding:12px 2px}
.sp-match.dated{grid-template-columns:78px minmax(0,1fr) 48px minmax(0,1fr)}
.sp-when{font-size:10px}
.sp-state{display:none}
.sp-side{gap:6px;font-size:11px}
.sp-crest{width:20px;height:20px}
.sp-hide-sm{display:none}
.sp-table{min-width:0}
.sp-team-cell{min-width:0}.sp-team-cell .sp-name{max-width:110px}
.sp-lineups{grid-template-columns:1fr}
.sp-hero-score{font-size:26px}
.sp-daybar .secondary{padding:8px 10px}
}`;

  const SECTION = `
<div class="page-head"><div><div class="eyebrow">TU FÚTBOL, EN CONTEXTO</div><h1>Deportes<span>.</span></h1><p>Partidos, resultados y tablas de los equipos y competiciones que seguís.</p></div>
<button class="primary" id="spManageBtn" type="button"><span aria-hidden="true">＋</span> Seguir</button></div>
<div class="grid task-stats-grid">
<div class="card task-stat"><div class="stat-top">Partidos hoy</div><div class="stat-value" id="spStatToday">0</div><div class="stat-bottom" id="spStatTodaySub">de lo que seguís</div></div>
<div class="card task-stat"><div class="stat-top">Equipos y selecciones</div><div class="stat-value" id="spStatTeams">0</div><div class="stat-bottom" id="spStatLeagues">0 competiciones</div></div>
<div class="card task-stat"><div class="stat-top">Próximo partido</div><div class="sp-stat-next" id="spStatNext">—</div><div class="stat-bottom" id="spStatNextSub">Seguí algo para verlo</div></div>
</div>
<div class="sp-tabs"><div class="flow-seg" role="tablist"><button type="button" class="active" data-sp-tab="matches">Partidos</button><button type="button" data-sp-tab="tables">Tablas y competiciones</button></div></div>
<div id="spTabMatches"><div class="sp-layout">
<div class="card"><div class="card-head"><div><div class="card-title">Partidos del día</div><div class="card-sub" id="spDaySub"></div></div>
<div class="flow-seg" role="group" aria-label="Qué partidos mostrar"><button type="button" data-sp-scope="mine">Mis seguidos</button><button type="button" data-sp-scope="all">Todos</button></div></div>
<div class="sp-daybar"><button type="button" class="icon-btn" data-sp-shift="-1" aria-label="Día anterior">‹</button><div class="sp-daytitle" id="spDayTitle"></div><button type="button" class="icon-btn" data-sp-shift="1" aria-label="Día siguiente">›</button><input type="date" id="spDayInput" aria-label="Elegir fecha"><button type="button" class="secondary" id="spTodayBtn">Hoy</button><button type="button" class="icon-btn" id="spRefreshBtn" aria-label="Actualizar" title="Actualizar">↻</button></div>
<div class="sp-strip" id="spStrip"></div><div id="spDayList"></div></div>
<div class="sp-col">
<div class="card"><div class="card-head"><div><div class="card-title">Siguiendo</div><div class="card-sub">Equipos, selecciones y competiciones</div></div><button class="text-action" type="button" data-sp-open="manage">Gestionar</button></div><div id="spFollowing"></div></div>
<div class="card"><div class="card-head"><div><div class="card-title">Próximos partidos</div><div class="card-sub">Lo que viene de lo que seguís</div></div><button class="text-action" type="button" data-sp-retry="upcoming" title="Actualizar">↻</button></div><div id="spUpcoming"></div></div>
</div></div></div>
<div id="spTabTables" hidden><div class="card"><div class="sp-controls"><select class="filter-select" id="spTableLeague" aria-label="Competición"></select><select class="filter-select" id="spTableSeason" aria-label="Temporada" style="max-width:130px"></select><button type="button" class="secondary" id="spTableFollow">☆ Seguir competición</button></div><div id="spTableBody"></div></div></div>`;

  const MODALS = `
<div class="modal-backdrop" id="spDetailBackdrop" role="dialog" aria-modal="true" aria-label="Detalle del partido"><div class="modal sp-modal"><div class="modal-head"><div><h2>Partido</h2><p>Resumen, estadísticas, alineaciones y cara a cara.</p></div><div style="display:flex;gap:6px"><button class="close-btn" type="button" data-sp-retry="detail" aria-label="Actualizar" title="Actualizar" style="font-size:16px">↻</button><button class="close-btn" type="button" data-sp-close aria-label="Cerrar">×</button></div></div><div id="spDetailBody"></div></div></div>
<div class="modal-backdrop" id="spManageBackdrop" role="dialog" aria-modal="true" aria-label="Seguir equipos y competiciones"><div class="modal sp-modal"><div class="modal-head"><div><h2>Qué querés seguir</h2><p>Los partidos de lo que sigas aparecen en tu agenda de Deportes.</p></div><button class="close-btn" type="button" data-sp-close aria-label="Cerrar">×</button></div>
<div class="flow-seg" style="display:flex;margin-bottom:12px"><button type="button" style="flex:1" data-sp-mtab="leagues">Competiciones</button><button type="button" style="flex:1" data-sp-mtab="teams">Equipos y selecciones</button></div>
<div id="spManageLeagueWrap" class="sp-controls" style="margin-bottom:8px" hidden><select class="filter-select" id="spManageLeague" aria-label="Competición" style="max-width:none"></select></div>
<div class="filters" style="padding:0;margin-bottom:6px"><input class="search-input" id="spManageSearch" type="search" placeholder="Buscar…" aria-label="Buscar"></div>
<div class="sp-manage-body" id="spManageBody"></div><div class="modal-actions"><button type="button" class="primary" data-sp-close>Listo</button></div></div></div>`;

  function install() {
    const style = document.createElement('style'); style.id = 'sportsStyles'; style.textContent = CSS; document.head.appendChild(style);
    // sección
    const sec = document.createElement('section'); sec.id = 'sportsView'; sec.className = 'view'; sec.hidden = true; sec.innerHTML = SECTION;
    const main = document.querySelector('main.main'), ph = $('placeholderView');
    if (ph && ph.parentNode) ph.parentNode.insertBefore(sec, ph); else (main || document.body).appendChild(sec);
    const wrap = document.createElement('div'); wrap.innerHTML = MODALS; while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    // registro de la página
    try { PAGE_VIEWS.sports = 'sportsView'; PAGE_NAMES.sports = 'Deportes'; } catch { }
    // navegación: Inbox -> Deportes
    if (!document.querySelector('.sidebar .nav-item[data-page="sports"]')) {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'nav-item'; btn.dataset.page = 'sports'; btn.innerHTML = TROPHY + 'Deportes';
      if (document.documentElement.classList.contains('sb-collapsed')) btn.title = 'Deportes';
      const old = document.querySelector('.sidebar .nav-item[data-page="inbox"]');
      if (old) old.replaceWith(btn); else { const nav = document.querySelector('.sidebar .nav'); if (nav) nav.appendChild(btn); }
      btn.addEventListener('click', () => window.setPage('sports'));
    }
    const mnav = document.querySelector('.mobile-nav');
    if (mnav && !mnav.querySelector('[data-page="sports"]')) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.page = 'sports'; b.innerHTML = TROPHY + 'Deportes';
      b.addEventListener('click', () => window.setPage('sports')); mnav.appendChild(b);
    }
    bind();
    new MutationObserver(() => { if (!sec.hidden) onShow(); }).observe(sec, { attributes: true, attributeFilter: ['hidden'] });
    if (!sec.hidden) onShow();
  }

  function onShow() {
    const sec = $('sportsView');
    sec.querySelectorAll('.card').forEach((el, i) => el.style.setProperty('--d', 80 + i * 70));
    sec.classList.remove('enter'); void sec.offsetWidth; sec.classList.add('enter'); setTimeout(() => sec.classList.remove('enter'), 1800);
    if (!shown) {
      shown = true; paintFollowing(); paintDay();
      loadLeagues().then(() => { paintFollowing(); if (ui.tab === 'tables') openTablesTab(); else paintDay(); }).catch(() => { });
      setTab(ui.tab); renderUpcoming();
    } else {
      paintFollowing(); if (ui.tab === 'matches' && Date.now() - lastDayLoad > 60000) renderDay(false, true);
    }
  }

  /* ------------------------------------------------------------------ eventos */
  const retry = {
    day: () => renderDay(true), upcoming: () => renderUpcoming(true), table: () => renderTable(true),
    manage: async () => { try { await loadLeagues(true); } catch { } openManage(); },
    manageTeams: () => paintManageTeams(), detail: () => det && openDetail(det.id, true)
  };
  function bind() {
    const view = $('sportsView');
    const onClick = e => {
      const t = e.target, q = sel => t.closest(sel);
      let el;
      if ((el = q('[data-sp-retry]'))) return (retry[el.dataset.spRetry] || (() => { }))();
      if ((el = q('[data-sp-close]'))) return closeAll();
      if ((el = q('[data-sp-open]'))) return openManage();
      if ((el = q('[data-sp-tab]'))) return setTab(el.dataset.spTab);
      if ((el = q('[data-sp-scope]'))) { store().scope = el.dataset.spScope; persist(); return paintDay(); }
      if ((el = q('[data-sp-shift]'))) { ui.day = addDays(ui.day, Number(el.dataset.spShift)); return renderDay(); }
      if ((el = q('[data-day]'))) { ui.day = el.dataset.day; return renderDay(); }
      if ((el = q('[data-sp-mtab]'))) { ui.manageTab = el.dataset.spMtab; ui.manageQuery = ''; $('spManageSearch').value = ''; return paintManage(); }
      if ((el = q('[data-sp-dtab]'))) { if (det) { det.tab = el.dataset.spDtab; paintDetailTab(); } return; }
      if ((el = q('[data-unfollow-team]'))) { follow('team', { id: el.dataset.unfollowTeam }); return afterFollowChange(); }
      if ((el = q('[data-unfollow-league]'))) { follow('league', { id: el.dataset.unfollowLeague }); return afterFollowChange(); }
      if ((el = q('[data-follow-team]'))) {
        const on = follow('team', { id: el.dataset.followTeam, name: el.dataset.name, leagueId: el.dataset.league });
        document.querySelectorAll('[data-follow-team="' + el.dataset.followTeam + '"]').forEach(b => {
          if (b.classList.contains('sp-star')) { b.classList.toggle('on', on); b.textContent = on ? '★' : '☆'; b.title = on ? 'Dejar de seguir' : 'Seguir equipo'; b.closest('tr') && b.closest('tr').classList.toggle('f', on); }
          else { b.classList.toggle('on', on); b.textContent = on ? '★ Siguiendo' : '☆ Seguir'; }
        });
        say(on ? 'Ahora seguís a ' + el.dataset.name : 'Dejaste de seguir a ' + el.dataset.name);
        return afterFollowChange();
      }
      if ((el = q('[data-follow-league]'))) {
        const on = follow('league', { id: el.dataset.followLeague, name: el.dataset.name, country: el.dataset.country });
        el.classList.toggle('on', on); el.textContent = on ? '★ Siguiendo' : '☆ Seguir';
        say(on ? 'Ahora seguís ' + el.dataset.name : 'Dejaste de seguir ' + el.dataset.name);
        return afterFollowChange();
      }
      if ((el = q('[data-match]'))) return openDetail(el.dataset.match);
    };
    view.addEventListener('click', onClick);
    $('spDetailBackdrop').addEventListener('click', e => { if (e.target === e.currentTarget) closeAll(); else onClick(e); });
    $('spManageBackdrop').addEventListener('click', e => { if (e.target === e.currentTarget) closeAll(); else onClick(e); });
    $('spManageBtn').onclick = openManage;
    $('spTodayBtn').onclick = () => { ui.day = today(); renderDay(); };
    $('spRefreshBtn').onclick = () => { renderDay(true); renderUpcoming(true); };
    $('spDayInput').onchange = e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { ui.day = e.target.value; renderDay(); } };
    $('spTableLeague').onchange = e => { ui.tableLeague = e.target.value; ui.season = ''; renderTable(); };
    $('spTableSeason').onchange = e => { ui.season = e.target.value; renderTable(); };
    $('spTableFollow').onclick = () => {
      const lg = L.byId.get(ui.tableLeague); if (!lg) return;
      const on = follow('league', { id: lg.id, name: lg.name, country: lg.country_code });
      say(on ? 'Ahora seguís ' + lg.name : 'Dejaste de seguir ' + lg.name); afterFollowChange();
    };
    $('spManageSearch').addEventListener('input', e => { ui.manageQuery = e.target.value; if (ui.manageTab === 'leagues') paintManage(); else paintManageTeams(); });
    $('spManageLeague').addEventListener('change', e => { ui.manageLeague = e.target.value; paintManageTeams(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
    // actualización automática del día de hoy mientras haya partidos en juego
    setInterval(() => {
      const sec = $('sportsView'); if (!sec || sec.hidden || document.visibilityState !== 'visible' || ui.tab !== 'matches' || ui.day !== today()) return;
      const now = Date.now();
      if (dayCache.some(m => { const st = statusInfo(m); return st.k === 'live' || (st.k === 'ns' && now > kickoff(m) && now - kickoff(m) < 3.5 * 36e5); })) renderDay(true, true);
    }, 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();