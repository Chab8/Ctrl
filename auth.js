import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';

const SUPABASE_URL = 'https://oebzfnhiosrlmardyasi.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_xnM66NOtkH64-rvcKviwhQ_cBa6h-ec';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, storage: window.localStorage }
});
window.ctrlSupabase = supabase;

const DATA_KEYS = [
  'ctrl.personal.v1',
  'ctrl.notes.v1',
  'ctrl.weather.location.v1',
  'ctrl.cuisine.personal.v1',
  'ctrl.cuisine.favorites.v1'
];
const MIGRATION_OWNER_KEY = 'ctrl.cloud.migration-owner.v1';
const CLOUD_TABLE = 'ctrl_user_data';
const originalSetItem = Storage.prototype.setItem;
const originalRemoveItem = Storage.prototype.removeItem;
let activeUserId = null;
let initializingUserId = null;
let initializePromise = null;
let cloudReady = false;
let syncTimer = null;
let syncQueue = Promise.resolve();
let suppressSync = false;
const cloudData = {};

function equalValue(a, b) { return a === b; }
function localValue(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function applyCloudData(data) {
  suppressSync = true;
  let changed = false;
  try {
    DATA_KEYS.forEach(key => {
      const next = Object.prototype.hasOwnProperty.call(data, key) ? String(data[key]) : null;
      const previous = localValue(key);
      if (next === null) {
        if (previous !== null) { window.localStorage.removeItem(key); changed = true; }
      } else if (!equalValue(previous, next)) {
        originalSetItem.call(window.localStorage, key, next);
        changed = true;
      }
    });
  } finally { suppressSync = false; }
  return changed;
}
function scheduleCloudSync(key, value, remove = false) {
  if (!cloudReady || suppressSync || !activeUserId || !DATA_KEYS.includes(key)) return;
  cloudData[key] = remove ? null : String(value);
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const userId = activeUserId;
    const changedKey = key;
    const changedValue = cloudData[key];
    const isRemove = changedValue === null;
    syncQueue = syncQueue.then(async () => {
      if (!cloudReady || activeUserId !== userId) return;
      const { data: row, error: readError } = await supabase
        .from(CLOUD_TABLE).select('data').eq('user_id', userId).maybeSingle();
      if (readError) throw readError;
      const merged = row && row.data && typeof row.data === 'object' ? { ...row.data } : {};
      if (isRemove) delete merged[changedKey];
      else merged[changedKey] = changedValue;
      const { error } = await supabase.from(CLOUD_TABLE).upsert({
        user_id: userId, data: merged, updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      if (error) throw error;
      Object.keys(cloudData).forEach(k => {
        if (cloudData[k] === null) delete cloudData[k];
      });
    }).catch(error => {
      console.error('[Ctrl] No se pudieron sincronizar los datos:', error);
      window.dispatchEvent(new CustomEvent('ctrl:sync-error', { detail: { message: error.message } }));
    });
  }, 450);
}
Storage.prototype.setItem = function(key, value) {
  originalSetItem.call(this, key, value);
  scheduleCloudSync(String(key), String(value), false);
};
Storage.prototype.removeItem = function(key) {
  originalRemoveItem.call(this, key);
  scheduleCloudSync(String(key), null, true);
};

async function initializeUser(user) {
  if (!user?.id) return;
  if (activeUserId === user.id && cloudReady) { hideAuth(user); return; }
  if (initializingUserId === user.id && initializePromise) return initializePromise;
  initializingUserId = user.id;
  initializePromise = (async () => {
    cloudReady = false;
    const { data: row, error } = await supabase.from(CLOUD_TABLE)
      .select('data').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    let data = row && row.data && typeof row.data === 'object' && !Array.isArray(row.data)
      ? { ...row.data } : null;
    if (!data) {
      let migrationOwner = null;
      try { migrationOwner = window.localStorage.getItem(MIGRATION_OWNER_KEY); } catch {}
      data = {};
      // Import legacy device data only once, for the first account that adopts this browser.
      if (!migrationOwner) {
        DATA_KEYS.forEach(key => {
          const value = localValue(key);
          if (value !== null) data[key] = value;
        });
        originalSetItem.call(window.localStorage, MIGRATION_OWNER_KEY, user.id);
      }
      const { error: insertError } = await supabase.from(CLOUD_TABLE).upsert({
        user_id: user.id, data, updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      if (insertError) throw insertError;
    }
    Object.keys(cloudData).forEach(key => delete cloudData[key]);
    Object.assign(cloudData, data);
    activeUserId = user.id;
    const changed = applyCloudData(data);
    cloudReady = true;
    if (changed) {
      // The app modules read storage during startup; reload once so every view initializes
      // from the authenticated user's cloud snapshot rather than the previous account.
      window.location.reload();
      return;
    }
    hideAuth(user);
    window.dispatchEvent(new CustomEvent('ctrl:data-ready', { detail: { userId: user.id } }));
  })().catch(error => {
    console.error('[Ctrl] No se pudieron cargar los datos de la cuenta:', error);
    cloudReady = false;
    activeUserId = null;
    showAuth();
    showMessage('No pudimos cargar tus datos guardados. Revisá tu conexión e intentá de nuevo. No se modificaron tus datos en la nube.');
  }).finally(() => {
    initializingUserId = null;
    initializePromise = null;
  });
  return initializePromise;
}

function clearAccountCache() {
  cloudReady = false;
  activeUserId = null;
  Object.keys(cloudData).forEach(key => delete cloudData[key]);
  suppressSync = true;
  try { DATA_KEYS.forEach(key => originalRemoveItem.call(window.localStorage, key)); }
  finally { suppressSync = false; }
}

const root = document.createElement('div');
root.id = 'ctrl-auth-root';
root.hidden = true;
root.innerHTML = `
  <div class="ctrl-auth-backdrop">
    <main class="ctrl-auth-shell">
      <div class="ctrl-auth-brand"><span class="ctrl-auth-mark">c.</span><span>Ctrl</span></div>
      <section class="ctrl-auth-card" aria-labelledby="ctrl-auth-title">
        <p class="ctrl-auth-eyebrow" id="ctrl-auth-eyebrow">Tu espacio personal</p>
        <h1 class="ctrl-auth-title" id="ctrl-auth-title">Todo en su lugar.</h1>
        <p class="ctrl-auth-subtitle" id="ctrl-auth-subtitle">Iniciá sesión para continuar donde lo dejaste.</p>
        <form class="ctrl-auth-form" id="ctrl-auth-form">
          <div class="ctrl-auth-field" id="ctrl-auth-name-wrap" hidden>
            <label for="ctrl-auth-name">Nombre</label>
            <input id="ctrl-auth-name" name="name" autocomplete="name" placeholder="Cómo te llamás" maxlength="80">
          </div>
          <div class="ctrl-auth-field" id="ctrl-auth-email-wrap">
            <label for="ctrl-auth-email">Email</label>
            <input id="ctrl-auth-email" name="email" type="email" autocomplete="email" placeholder="vos@ejemplo.com" required>
          </div>
          <div class="ctrl-auth-field">
            <label for="ctrl-auth-password">Contraseña</label>
            <input id="ctrl-auth-password" name="password" type="password" autocomplete="current-password" placeholder="Mínimo 8 caracteres" minlength="8" required>
          </div>
          <div class="ctrl-auth-forgot" id="ctrl-auth-forgot-wrap"><button class="ctrl-auth-link" type="button" id="ctrl-auth-forgot">Olvidé mi contraseña</button></div>
          <p class="ctrl-auth-message" id="ctrl-auth-message" role="status" aria-live="polite"></p>
          <button class="ctrl-auth-submit" id="ctrl-auth-submit" type="submit"><span id="ctrl-auth-submit-text">Iniciar sesión</span><span aria-hidden="true">↗</span></button>
        </form>
        <p class="ctrl-auth-switch" id="ctrl-auth-switch">¿Todavía no tenés cuenta? <button class="ctrl-auth-link" id="ctrl-auth-toggle" type="button">Crear cuenta</button></p>
        <p class="ctrl-auth-foot">Tu sesión queda guardada en este dispositivo hasta que cierres sesión.</p>
      </section>
    </main>
  </div>`;
document.body.appendChild(root);
document.documentElement.classList.add('ctrl-auth-pending');

const $ = id => document.getElementById(id);
let mode = 'login';
let busy = false;

function showMessage(text, type = 'error') {
  const box = $('ctrl-auth-message');
  box.textContent = text;
  box.className = 'ctrl-auth-message show ' + type;
}
function clearMessage() {
  $('ctrl-auth-message').textContent = '';
  $('ctrl-auth-message').className = 'ctrl-auth-message';
}
function setBusy(value, label) {
  busy = value;
  $('ctrl-auth-submit').disabled = value;
  $('ctrl-auth-submit-text').textContent = label || (mode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión');
}
function setMode(next) {
  mode = next;
  clearMessage();
  const signup = mode === 'signup';
  const recovery = mode === 'recovery';
  $('ctrl-auth-name-wrap').hidden = !signup;
  $('ctrl-auth-email-wrap').hidden = recovery;
  $('ctrl-auth-email').required = !recovery;
  $('ctrl-auth-name').required = signup;
  $('ctrl-auth-password').autocomplete = (signup || recovery) ? 'new-password' : 'current-password';
  if (signup || recovery) $('ctrl-auth-password').setAttribute('minlength', '8');
  else $('ctrl-auth-password').removeAttribute('minlength');
  $('ctrl-auth-password').placeholder = (signup || recovery) ? 'Mínimo 8 caracteres' : 'Tu contraseña';
  $('ctrl-auth-eyebrow').textContent = signup ? 'Empezá con Ctrl' : recovery ? 'Seguridad de tu cuenta' : 'Tu espacio personal';
  $('ctrl-auth-title').textContent = signup ? 'Una cuenta. Todo conectado.' : recovery ? 'Elegí una nueva contraseña.' : 'Todo en su lugar.';
  $('ctrl-auth-subtitle').textContent = signup ? 'Creá tu cuenta para mantener tu espacio disponible cada vez que vuelvas.' : recovery ? 'Usá una contraseña nueva para proteger tu cuenta.' : 'Iniciá sesión para continuar donde lo dejaste.';
  $('ctrl-auth-submit-text').textContent = signup ? 'Crear cuenta' : recovery ? 'Guardar contraseña' : 'Iniciar sesión';
  $('ctrl-auth-forgot-wrap').hidden = signup || recovery;
  $('ctrl-auth-switch').hidden = recovery;
  $('ctrl-auth-switch').innerHTML = signup
    ? '¿Ya tenés cuenta? <button class="ctrl-auth-link" id="ctrl-auth-toggle" type="button">Iniciar sesión</button>'
    : '¿Todavía no tenés cuenta? <button class="ctrl-auth-link" id="ctrl-auth-toggle" type="button">Crear cuenta</button>';
  $('ctrl-auth-toggle').addEventListener('click', () => setMode(signup ? 'login' : 'signup'));
}
function showAuth() {
  $('ctrl-account-chip')?.remove();
  root.hidden = false;
  document.documentElement.classList.add('ctrl-auth-pending');
  document.body.style.overflow = 'hidden';
}
function hideAuth(user) {
  root.hidden = true;
  document.documentElement.classList.remove('ctrl-auth-pending');
  document.body.style.overflow = '';
  showAccountChip(user);
}
function showAccountChip(user) {
  let chip = $('ctrl-account-chip');
  if (!chip) {
    chip = document.createElement('div');
    chip.id = 'ctrl-account-chip';
    document.body.appendChild(chip);
  }
  const email = user.email || 'Cuenta';
  const initial = (user.user_metadata?.full_name || email).trim().charAt(0).toUpperCase();
  chip.innerHTML = `<span class="ctrl-account-avatar">${escapeHtml(initial)}</span><span class="ctrl-account-email" title="${escapeHtml(email)}">${escapeHtml(email)}</span><button type="button" id="ctrl-account-signout">Cerrar sesión</button>`;
  $('ctrl-account-signout').addEventListener('click', async () => {
    if (!confirm('¿Querés cerrar la sesión de Ctrl en este dispositivo?')) return;
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) alert('No se pudo cerrar la sesión. Probá de nuevo.');
    else clearAccountCache();
  });
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function friendlyError(error) {
  const message = error?.message || '';
  if (/invalid login credentials/i.test(message)) return 'El email o la contraseña no son correctos.';
  if (/email not confirmed/i.test(message)) return 'Confirmá tu email desde el enlace que te enviamos antes de iniciar sesión.';
  if (/user already registered/i.test(message)) return 'Ya existe una cuenta con ese email. Iniciá sesión.';
  if (/password should be at least/i.test(message)) return 'La contraseña debe tener al menos 8 caracteres.';
  if (/rate limit/i.test(message)) return 'Hubo muchos intentos seguidos. Esperá un momento y volvé a probar.';
  if (/failed to fetch|network/i.test(message)) return 'No pudimos conectar con Supabase. Revisá tu conexión e intentá de nuevo.';
  return message || 'Ocurrió un error inesperado. Intentá de nuevo.';
}

$('ctrl-auth-toggle').addEventListener('click', () => setMode('signup'));
$('ctrl-auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  clearMessage();
  const email = $('ctrl-auth-email').value.trim();
  const password = $('ctrl-auth-password').value;
  setBusy(true, mode === 'signup' ? 'Creando cuenta…' : mode === 'recovery' ? 'Guardando…' : 'Ingresando…');
  try {
    if (mode === 'recovery') {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut({ scope: 'local' });
      setMode('login');
      showMessage('Contraseña actualizada. Ya podés iniciar sesión con la nueva contraseña.', 'success');
    } else if (mode === 'signup') {
      const fullName = $('ctrl-auth-name').value.trim();
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
      if (data.session) {
        showMessage('Tu cuenta está lista. Bienvenido a Ctrl.', 'success');
        await initializeUser(data.user);
      } else {
        setMode('login');
        showMessage('Cuenta creada. Revisá tu email y confirmá la dirección para poder iniciar sesión.', 'success');
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session) throw new Error('No se pudo iniciar la sesión. Volvé a intentarlo.');
      await initializeUser(data.user);
    }
  } catch (error) {
    showMessage(friendlyError(error));
  } finally {
    setBusy(false);
  }
});
$('ctrl-auth-forgot').addEventListener('click', async () => {
  clearMessage();
  const email = $('ctrl-auth-email').value.trim();
  if (!email) {
    showMessage('Escribí tu email y después elegí “Olvidé mi contraseña”.');
    $('ctrl-auth-email').focus();
    return;
  }
  $('ctrl-auth-forgot').disabled = true;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    if (error) throw error;
    showMessage('Si existe una cuenta con ese email, te va a llegar un enlace para restablecer la contraseña.', 'success');
  } catch (error) {
    showMessage(friendlyError(error));
  } finally {
    $('ctrl-auth-forgot').disabled = false;
  }
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY' && session?.user) {
    $('ctrl-auth-email').value = session.user.email || '';
    setMode('recovery');
    showAuth();
    showMessage('Ahora ingresá tu nueva contraseña.', 'success');
    return;
  }
  if (session?.user) {
    // Defer Supabase calls out of its auth callback to avoid locking the auth client.
    Promise.resolve().then(() => initializeUser(session.user));
  } else if (event === 'SIGNED_OUT') {
    clearAccountCache();
    showAuth();
  } else if (event === 'INITIAL_SESSION') {
    showAuth();
  }
});

(async () => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session?.user) await initializeUser(data.session.user);
    else showAuth();
  } catch (error) {
    showAuth();
    showMessage('No se pudo verificar la sesión. Comprobá tu conexión y volvé a cargar la página.');
  } finally {
    document.documentElement.classList.remove('ctrl-auth-pending');
  }
})();
