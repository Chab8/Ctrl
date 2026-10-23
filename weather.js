(() => {
  'use strict';

  const API = 'https://api.open-meteo.com/v1/forecast';
  const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
  const STORAGE_KEY = 'ctrl.weather.location.v1';
  const $ = id => document.getElementById(id);
  const BUENOS_AIRES = { name: 'Buenos Aires', admin1: 'Ciudad Autónoma de Buenos Aires', country: 'Argentina', latitude: -34.6037, longitude: -58.3816 };
  const state = { defaultLocation: { ...BUENOS_AIRES }, location: { ...BUENOS_AIRES }, forecast: null, defaultForecast: null, loading: false, lastLoaded: 0 };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && Number.isFinite(saved.latitude) && Number.isFinite(saved.longitude) && saved.name) state.defaultLocation = { ...saved };
    state.location = { ...state.defaultLocation };
  } catch (_) {}

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const weatherInfo = code => {
    if (code === 0) return ['Soleado', '☀️'];
    if ([1, 2].includes(code)) return ['Parcialmente nublado', '🌤️'];
    if (code === 3) return ['Nublado', '☁️'];
    if ([45, 48].includes(code)) return ['Niebla', '🌫️'];
    if ([51, 53, 55, 56, 57].includes(code)) return ['Llovizna', '🌦️'];
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ['Lluvia', '🌧️'];
    if ([71, 73, 75, 77, 85, 86].includes(code)) return ['Nieve', '🌨️'];
    if ([95, 96, 99].includes(code)) return ['Tormenta', '⛈️'];
    return ['Condiciones variables', '🌡️'];
  };
  const fmtDay = (date, options) => new Date(date + 'T12:00:00').toLocaleDateString('es-AR', options);
  const fmtHour = value => new Date(value).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const temp = value => Math.round(value) + '°';

  function sameLocation(a, b) {
    return !!a && !!b && Math.abs(a.latitude - b.latitude) < 0.001 && Math.abs(a.longitude - b.longitude) < 0.001;
  }

  function locationLabel() {
    return [state.location.name, state.location.admin1 && state.location.admin1 !== state.location.name ? state.location.admin1 : '', state.location.country].filter(Boolean).join(', ');
  }

  function renderDefaultLocationAction() {
    const isDefault = sameLocation(state.location, state.defaultLocation);
    const button = $('weatherSetDefaultBtn');
    if (button) button.hidden = isDefault;
    const back = $('weatherBackBtn');
    if (back) {
      back.hidden = isDefault;
      back.innerHTML = '<i data-lucide="arrow-left"></i> Volver a ' + esc(state.defaultLocation.name);
      if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
    }
  }

  function returnToDefaultLocation() {
    state.location = { ...state.defaultLocation };
    state.forecast = state.defaultForecast;
    state.lastLoaded = state.forecast ? Date.now() : 0;
    const input = $('weatherCityInput');
    if (input) input.value = '';
    const choices = $('weatherLocationChoices');
    if (choices) { choices.hidden = true; choices.innerHTML = ''; }
    renderDefaultLocationAction();
    showStatus('');
    if (state.forecast) renderWeather();
    else fetchForecast(true);
  }

  function showStatus(message, isError = false) {
    const status = $('weatherStatus');
    if (status) { status.textContent = message; status.classList.toggle('is-error', isError); status.hidden = !message; }
  }

  async function fetchForecast(force = false) {
    if (state.loading) return;
    if (!force && state.forecast && Date.now() - state.lastLoaded < 15 * 60 * 1000) {
      renderWeather();
      return;
    }
    state.loading = true;
    const refresh = $('weatherRefreshBtn');
    if (refresh) { refresh.disabled = true; refresh.innerHTML = '<i data-lucide="loader-circle"></i>'; refresh.setAttribute('aria-label', 'Actualizando clima'); }
    showStatus('Consultando el pronóstico…');
    try {
      const params = new URLSearchParams({
        latitude: String(state.location.latitude),
        longitude: String(state.location.longitude),
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
        hourly: 'temperature_2m,precipitation_probability,weather_code',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max',
        timezone: 'auto',
        forecast_days: '7',
        forecast_hours: '24'
      });
      const response = await fetch(API + '?' + params.toString());
      if (!response.ok) throw new Error('El servicio respondió con error (' + response.status + ').');
      state.forecast = await response.json();
      state.lastLoaded = Date.now();
      if (sameLocation(state.location, state.defaultLocation)) state.defaultForecast = state.forecast;
      renderWeather();
      renderHomeWeather();
      showStatus('Actualizado ' + new Date(state.lastLoaded).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
    } catch (error) {
      console.error('Ctrl · Clima:', error);
      showStatus('No se pudo cargar el clima. Revisá tu conexión e intentá de nuevo.', true);
      const current = $('weatherCurrent');
      if (current && !state.forecast) current.innerHTML = '<div class="weather-empty">No se pudo conectar con Open-Meteo. Intentá actualizar en unos segundos.</div>';
      renderHomeWeather();
    } finally {
      state.loading = false;
      if (refresh) { refresh.disabled = false; refresh.innerHTML = '<i data-lucide="refresh-cw"></i>'; refresh.setAttribute('aria-label', 'Actualizar clima'); }
      if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
    }
  }

  function renderWeather() {
    const data = state.forecast;
    if (!data || !data.current) return;
    const c = data.current;
    const [description, icon] = weatherInfo(c.weather_code);
    const current = $('weatherCurrent');
    if (current) current.innerHTML = `
      <div class="weather-current-main">
        <div class="weather-place"><span class="weather-symbol">${icon}</span><div><div class="weather-place-name">${esc(state.location.name)}</div><div class="weather-place-meta">${esc([state.location.admin1, state.location.country].filter(Boolean).join(' · '))}</div></div></div>
        <div class="weather-temperature">${temp(c.temperature_2m)}<span>Sensación de ${temp(c.apparent_temperature)}</span></div>
        <div class="weather-description">${description}</div>
      </div>
      <div class="weather-current-details">
        <div><span>Humedad</span><strong>${Math.round(c.relative_humidity_2m)}%</strong></div>
        <div><span>Viento</span><strong>${Math.round(c.wind_speed_10m)} km/h</strong></div>
        <div><span>Precipitación</span><strong>${Number(c.precipitation || 0).toLocaleString('es-AR')} mm</strong></div>
      </div>`;
    const hourly = $('weatherHourly');
    if (hourly) {
      const times = data.hourly?.time || [];
      const offset = Math.max(0, times.findIndex(t => t >= c.time.slice(0, 13)));
      hourly.innerHTML = times.slice(offset, offset + 24).map((time, i) => {
        const idx = offset + i, info = weatherInfo(data.hourly.weather_code[idx]);
        return '<div class="weather-hour"><span>' + (i === 0 ? 'Ahora' : esc(fmtHour(time))) + '</span><span class="weather-hour-icon">' + info[1] + '</span><strong>' + temp(data.hourly.temperature_2m[idx]) + '</strong><small>' + (data.hourly.precipitation_probability?.[idx] ?? 0) + '% lluvia</small></div>';
      }).join('');
    }
    const daily = $('weatherDaily');
    if (daily) daily.innerHTML = (data.daily?.time || []).map((date, i) => {
      const info = weatherInfo(data.daily.weather_code[i]);
      const day = i === 0 ? 'Hoy' : fmtDay(date, { weekday: 'short' }).replace('.', '');
      return '<div class="weather-day"><span class="weather-day-name">' + esc(day) + '<small>' + esc(fmtDay(date, { day: 'numeric', month: 'short' }).replace('.', '')) + '</small></span><span class="weather-day-icon">' + info[1] + '<small>' + esc(info[0]) + '</small></span><span class="weather-day-rain">' + (data.daily.precipitation_probability_max?.[i] ?? 0) + '%<small>lluvia</small></span><div class="weather-day-range"><span>' + temp(data.daily.temperature_2m_min[i]) + '</span><div><i style="--range-start:' + Math.max(0, Math.min(100, (data.daily.temperature_2m_min[i] + 5) * 2)) + '%;--range-width:' + Math.max(8, Math.min(92, (data.daily.temperature_2m_max[i] - data.daily.temperature_2m_min[i]) * 2)) + '%"></i></div><strong>' + temp(data.daily.temperature_2m_max[i]) + '</strong></div></div>';
    }).join('');
    const sun = $('weatherSun');
    if (sun && data.daily?.sunrise?.[0]) sun.innerHTML = '<div><span>Salida del sol</span><strong>↗ ' + esc(fmtHour(data.daily.sunrise[0])) + '</strong></div><div><span>Puesta del sol</span><strong>↘ ' + esc(fmtHour(data.daily.sunset[0])) + '</strong></div>';
    const place = $('weatherLocationLabel');
    if (place) place.textContent = locationLabel();
    renderDefaultLocationAction();
    renderHomeWeather();
  }

  function renderHomeWeather() {
    const homeForecast = state.defaultForecast;
    const topTemp = $('topWeatherTemp');
    if (topTemp) {
      if (homeForecast?.current) {
        topTemp.textContent = temp(homeForecast.current.temperature_2m);
        topTemp.title = 'Temperatura actual en ' + state.defaultLocation.name;
        topTemp.setAttribute('aria-label', 'Temperatura actual en ' + state.defaultLocation.name + ': ' + topTemp.textContent);
      } else {
        topTemp.textContent = '—°';
        topTemp.title = 'Consultando temperatura actual';
        topTemp.setAttribute('aria-label', 'Consultando temperatura actual');
      }
    }
    const host = $('homeWeatherSummary');
    if (!host) return;
    if (!homeForecast?.current) {
      host.innerHTML = '<div class="home-weather-loading"><span>☁️</span><div><strong>Clima de ' + esc(state.defaultLocation.name) + '</strong><small>Consultando el pronóstico…</small></div><button type="button" data-open-weather>Ver clima ↗</button></div>';
      return;
    }
    const c = homeForecast.current, info = weatherInfo(c.weather_code);
    host.innerHTML = '<button type="button" class="home-weather-link" data-open-weather><span class="home-weather-icon">' + info[1] + '</span><span class="home-weather-place"><strong>' + esc(state.defaultLocation.name) + '</strong><small>' + esc(info[0]) + ' · Máx. ' + temp(homeForecast.daily.temperature_2m_max[0]) + ' / Mín. ' + temp(homeForecast.daily.temperature_2m_min[0]) + '</small></span><strong class="home-weather-temp">' + temp(c.temperature_2m) + '</strong><span class="home-weather-arrow">↗</span></button>';
  }

  async function searchLocation(query) {
    const input = $('weatherCityInput');
    const submit = $('weatherSearchBtn');
    const value = String(query || '').trim();
    if (!value) { showStatus('Escribí una ciudad para buscarla.', true); input?.focus(); return; }
    if (submit) submit.disabled = true;
    showStatus('Buscando ciudad…');
    try {
      const url = GEO + '?' + new URLSearchParams({ name: value, count: '8', language: 'es', format: 'json' });
      const response = await fetch(url);
      if (!response.ok) throw new Error('No se pudo buscar la ciudad.');
      const result = await response.json();
      const places = (result.results || []).filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
      if (!places.length) { showStatus('No encontramos esa ciudad. Probá con otro nombre.', true); return; }
      if (places.length > 1) {
        const choices = $('weatherLocationChoices');
        choices.innerHTML = places.map((p, i) => '<button type="button" class="weather-location-choice" data-location-index="' + i + '"><strong>' + esc(p.name) + '</strong><span>' + esc([p.admin1, p.country].filter(Boolean).join(', ')) + '</span><span>›</span></button>').join('');
        choices.hidden = false;
        choices.querySelectorAll('[data-location-index]').forEach(button => button.addEventListener('click', () => selectLocation(places[Number(button.dataset.locationIndex)])));
        showStatus('Elegí la ciudad correcta.');
        return;
      }
      selectLocation(places[0]);
    } catch (error) {
      console.error('Ctrl · búsqueda de ciudad:', error);
      showStatus('No se pudo buscar la ciudad. Intentá de nuevo.', true);
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  function selectLocation(place) {
    state.location = { name: place.name, admin1: place.admin1 || '', country: place.country || '', latitude: place.latitude, longitude: place.longitude };
    const input = $('weatherCityInput');
    if (input) input.value = '';
    const choices = $('weatherLocationChoices');
    if (choices) { choices.hidden = true; choices.innerHTML = ''; }
    state.forecast = null;
    state.lastLoaded = 0;
    renderDefaultLocationAction();
    showStatus('');
    fetchForecast(true);
  }

  function setDefaultLocation() {
    state.defaultLocation = { ...state.location };
    state.defaultForecast = state.forecast;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.defaultLocation)); } catch (_) {}
    renderDefaultLocationAction();
    renderHomeWeather();
    showStatus('Ciudad predeterminada actualizada.');
  }

  document.addEventListener('click', event => {
    if (event.target.closest('[data-open-weather]')) {
      if (typeof window.setPage === 'function') window.setPage('weather');
    }
  });
  $('weatherSearchForm')?.addEventListener('submit', event => { event.preventDefault(); searchLocation($('weatherCityInput')?.value); });
  $('weatherRefreshBtn')?.addEventListener('click', () => fetchForecast(true));
  $('weatherSetDefaultBtn')?.addEventListener('click', setDefaultLocation);
  $('weatherBackBtn')?.addEventListener('click', returnToDefaultLocation);
  $('weatherRetryBtn')?.addEventListener('click', () => fetchForecast(true));
  $('weatherCityInput')?.addEventListener('keydown', event => { if (event.key === 'Escape') { $('weatherLocationChoices').hidden = true; $('weatherLocationChoices').innerHTML = ''; } });
  window.CtrlWeather = { refresh: () => fetchForecast(true), getLocation: () => ({ ...state.location }) };
  renderHomeWeather();
  renderDefaultLocationAction();
  fetchForecast();
})();