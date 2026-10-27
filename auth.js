import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';

const SUPABASE_URL = 'https://oebzfnhiosrlmardyasi.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_xnM66NOtkH64-rvcKviwhQ_cBa6h-ec';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, storage: window.localStorage }
});
window.ctrlSupabase = supabase;

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
          <div class="ctrl-auth-field">
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
  $('ctrl-auth-name-wrap').hidden = !signup;
  $('ctrl-auth-name').required = signup;
  $('ctrl-auth-password').autocomplete = signup ? 'new-password' : 'current-password';
  if (signup) $('ctrl-auth-password').setAttribute('minlength', '8');
  else $('ctrl-auth-password').removeAttribute('minlength');
  $('ctrl-auth-password').placeholder = signup ? 'Mínimo 8 caracteres' : 'Tu contraseña';
  $('ctrl-auth-eyebrow').textContent = signup ? 'Empezá con Ctrl' : 'Tu espacio personal';
  $('ctrl-auth-title').textContent = signup ? 'Una cuenta. Todo conectado.' : 'Todo en su lugar.';
  $('ctrl-auth-subtitle').textContent = signup ? 'Creá tu cuenta para mantener tu espacio disponible cada vez que vuelvas.' : 'Iniciá sesión para continuar donde lo dejaste.';
  $('ctrl-auth-submit-text').textContent = signup ? 'Crear cuenta' : 'Iniciar sesión';
  $('ctrl-auth-forgot-wrap').hidden = signup;
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
  setBusy(true, mode === 'signup' ? 'Creando cuenta…' : 'Ingresando…');
  try {
    if (mode === 'signup') {
      const fullName = $('ctrl-auth-name').value.trim();
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
      if (data.session) {
        showMessage('Tu cuenta está lista. Bienvenido a Ctrl.', 'success');
        hideAuth(data.user);
      } else {
        setMode('login');
        showMessage('Cuenta creada. Revisá tu email y confirmá la dirección para poder iniciar sesión.', 'success');
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session) throw new Error('No se pudo iniciar la sesión. Volvé a intentarlo.');
      hideAuth(data.user);
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
  if (session?.user) {
    hideAuth(session.user);
  } else if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
    showAuth();
  }
});

(async () => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session?.user) hideAuth(data.session.user);
    else showAuth();
  } catch (error) {
    showAuth();
    showMessage('No se pudo verificar la sesión. Comprobá tu conexión y volvé a cargar la página.');
  } finally {
    document.documentElement.classList.remove('ctrl-auth-pending');
  }
})();
