(() => {
  'use strict';
  const API = '/api/tinyplates';
  const CACHE_KEY = 'ctrl.cuisine.api-cache.v1';
  const FAVORITES_KEY = 'ctrl.cuisine.favorites.v1';
  const PERSONAL_KEY = 'ctrl.cuisine.personal.v1';
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let loaded = false, loading = false, activeLanguage = 'es', activeRecipes = [], activeQuery = '', showingFavorites = false, currentRecipe = null, requestToken = 0;
  let personalRecipes = readStorage(PERSONAL_KEY, []);
  if (!Array.isArray(personalRecipes)) personalRecipes = [];
  let favorites = readStorage(FAVORITES_KEY, []);
  if (!Array.isArray(favorites)) favorites = [];

  function readStorage(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value == null ? fallback : value; }
    catch (_) { return fallback; }
  }
  function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { status('No se pudo guardar en este dispositivo. Puede que el almacenamiento esté lleno.', true); return false; }
  }
  function readCache() {
    const cache = readStorage(CACHE_KEY, {});
    return cache && typeof cache === 'object' ? cache : {};
  }
  function cachedRequest(path, params) {
    const query = new URLSearchParams(params || {}).toString();
    const url = API + '/' + path + (query ? '?' + query : '');
    const cacheKey = url;
    const cache = readCache();
    const cached = cache[cacheKey];
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);
    return fetch(url, { headers: { Accept: 'application/json' } }).then(async response => {
      let data;
      try { data = await response.json(); } catch (_) { data = {}; }
      if (!response.ok) {
        const message = data && data.error && (data.error.message || data.error);
        const error = new Error(typeof message === 'string' ? message : 'La API respondió con error (' + response.status + ').');
        error.status = response.status;
        throw error;
      }
      const next = readCache();
      next[cacheKey] = { expiresAt: Date.now() + CACHE_TTL, data };
      const keys = Object.keys(next).sort((a, b) => (next[b].expiresAt || 0) - (next[a].expiresAt || 0));
      keys.slice(20).forEach(key => delete next[key]);
      writeStorage(CACHE_KEY, next);
      return data;
    });
  }
  function status(message, isError) {
    const el = $('cuisineStatus');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('is-error', !!isError);
  }
  function recipeList(payload) {
    const list = Array.isArray(payload) ? payload : payload && Array.isArray(payload.recipes) ? payload.recipes : payload && Array.isArray(payload.results) ? payload.results : [];
    return list.map(recipe => ({ ...recipe, id: recipe.id || recipe.slug || recipe.recipeId || recipe.url }));
  }
  async function searchMealDbFallback(query) {
    const response = await fetch('https://www.themealdb.com/api/json/v1/1/search.php?s=' + encodeURIComponent(query), { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('La búsqueda alternativa respondió con un error.');
    const payload = await response.json();
    return (Array.isArray(payload.meals) ? payload.meals : []).map(meal => {
      const ingredients = [];
      for (let i = 1; i <= 20; i++) {
        const name = String(meal['strIngredient' + i] || '').trim();
        if (!name) continue;
        const measure = String(meal['strMeasure' + i] || '').trim();
        ingredients.push({ display: [measure, name].filter(Boolean).join(' ') });
      }
      const instructions = String(meal.strInstructions || '').split(/\r?\n+/).map(step => step.trim()).filter(Boolean);
      return {
        id: 'mealdb-' + meal.idMeal,
        title: meal.strMeal || 'Receta',
        description: [meal.strArea, meal.strCategory].filter(Boolean).join(' · '),
        image: meal.strMealThumb || '',
        ingredients,
        instructions,
        servings: 'Consultar fuente original',
        times: { total: { seconds: 0 } },
        language: 'en',
        url: meal.strSource || '',
        categories: meal.strCategory ? [meal.strCategory] : [],
        courses: [],
        isFallback: true
      };
    });
  }
  function recipeImage(recipe) {
    const media = Array.isArray(recipe.media) ? recipe.media : [];
    const image = media.find(item => item && item.type === 'image' && item.role === 'hero') || media.find(item => item && item.type === 'image');
    return image && image.url ? image.url : '';
  }
  function safeHttpUrl(value) {
    try { const url = new URL(String(value || '')); return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''; }
    catch (_) { return ''; }
  }
  function imageSource(value) {
    const text = String(value || '');
    if (/^data:image\/(jpeg|png|webp);base64,/i.test(text)) return text;
    return safeHttpUrl(text);
  }
  function sourceName(recipe) {
    const url = safeHttpUrl(recipe.url);
    if (!url) return 'Fuente original';
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return 'Fuente original'; }
  }
  function totalSeconds(recipe) {
    const times = recipe.times || {};
    return times.total && Number(times.total.seconds) > 0 ? Number(times.total.seconds) : null;
  }
  function timeText(recipe) {
    const seconds = totalSeconds(recipe);
    if (!seconds) return 'Tiempo no indicado';
    const minutes = Math.max(1, Math.round(seconds / 60));
    return minutes + ' min';
  }
  function difficulty(recipe) {
    if (['easy', 'medium', 'hard'].includes(recipe && recipe.difficulty)) return recipe.difficulty;
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients.length : Number(recipe.ingredientCount || 0);
    const steps = Array.isArray(recipe.instructions) ? recipe.instructions.length : Number(recipe.stepCount || 0);
    if (ingredients && steps && ingredients <= 6 && steps <= 5) return 'easy';
    if ((ingredients && ingredients > 10) || (steps && steps > 9)) return 'hard';
    return 'medium';
  }
  function difficultyLabel(value) {
    return ({easy:'Fácil',medium:'Intermedia',hard:'Avanzada'})[value] || 'Intermedia';
  }
  function typeText(recipe) {
    const all = [].concat(recipe.courses || [], recipe.categories || [], recipe.tags || []).join(' ').toLowerCase();
    if (/dessert|postre|cake|cookie|pudding|brownie|sweet/.test(all)) return 'Postre';
    if (/breakfast|brunch|desayuno/.test(all)) return 'Desayuno';
    if (/soup|sopa|stew/.test(all)) return 'Sopa';
    if (/salad|ensalada/.test(all)) return 'Ensalada';
    if (/snack|merienda|appetizer|starter/.test(all)) return 'Snack';
    if (/side|guarnici|side-dish/.test(all)) return 'Guarnición';
    if (/main|dinner|lunch|plato-principal|entree/.test(all)) return 'Plato principal';
    return (recipe.courses && recipe.courses[0]) || (recipe.categories && recipe.categories[0]) || 'Receta';
  }
  function matchesType(recipe, type) {
    if (type === 'all') return true;
    const all = [].concat(recipe.courses || [], recipe.categories || [], recipe.tags || [], [recipe.title || '', recipe.description || '']).join(' ').toLowerCase();
    const terms = {
      breakfast: /breakfast|brunch|desayuno|panqueque|pancake|waffle/,
      main: /main|dinner|lunch|entree|plato principal|cena|almuerzo|pasta|chicken|pollo|beef|carne|fish|pescado/,
      side: /side|guarnici|side-dish|accompaniment/,
      soup: /soup|sopa|broth|caldo|crema de/,
      salad: /salad|ensalada/,
      dessert: /dessert|postre|cake|cookie|brownie|pudding|tarta|torta|flan|helado|ice cream|sweet/,
      snack: /snack|merienda|appetizer|starter|dip|bocad/
    };
    return (terms[type] || new RegExp(type)).test(all);
  }
  function recipeSummary(recipe) {
    return recipe.description || (Array.isArray(recipe.tags) && recipe.tags.length ? recipe.tags.slice(0, 3).join(' · ') : '');
  }
  function favoriteIds() { return new Set(favorites.map(item => String(item.id))); }
  function isFavorite(id) { return favoriteIds().has(String(id)); }
  function favoriteMeta(recipe) {
    return {
      id: String(recipe.id), title: recipe.title || 'Receta sin título', url: safeHttpUrl(recipe.url), isPersonal: !!recipe.isPersonal,
      ingredients: recipe.isPersonal ? (recipe.ingredients || []) : undefined, instructions: recipe.isPersonal ? (recipe.instructions || []) : undefined, servings: recipe.isPersonal ? recipe.servings : undefined,
      image: imageSource(recipe.image) || imageSource(recipeImage(recipe)), language: recipe.language || activeLanguage,
      description: recipe.description || '', times: recipe.times || {},
      courses: recipe.courses || [], categories: recipe.categories || [], tags: recipe.tags || [],
      ingredientCount: Array.isArray(recipe.ingredients) ? recipe.ingredients.length : Number(recipe.ingredientCount || 0),
      stepCount: Array.isArray(recipe.instructions) ? recipe.instructions.length : Number(recipe.stepCount || 0),
      savedAt: new Date().toISOString()
    };
  }
  function toggleFavorite(recipe) {
    if (!recipe || !recipe.id) return;
    if (isFavorite(recipe.id)) favorites = favorites.filter(item => String(item.id) !== String(recipe.id));
    else favorites.unshift(favoriteMeta(recipe));
    writeStorage(FAVORITES_KEY, favorites);
    if (showingFavorites) renderCards();
    else renderCards();
    if (currentRecipe && String(currentRecipe.id) === String(recipe.id)) renderDetail(currentRecipe);
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons({attrs:{'stroke-width':1.8}});
  }
  function cardMarkup(recipe) {
    const image = imageSource(recipe.image || recipeImage(recipe));
    const title = recipe.title || 'Receta sin título';
    const saved = isFavorite(recipe.id);
    const time = timeText(recipe);
    const diff = difficulty(recipe);
    const summary = recipeSummary(recipe);
    const src = safeHttpUrl(recipe.url);
    const imageMarkup = image
      ? '<img class="cuisine-card-image" src="' + esc(image) + '" alt="' + esc(title) + '" loading="lazy">'
      : '<div class="cuisine-card-image-placeholder"><i data-lucide="cooking-pot"></i></div>';
    return '<article class="cuisine-card">'
      + imageMarkup
      + '<div class="cuisine-card-content"><div class="cuisine-card-top"><span>' + esc(typeText(recipe)) + (recipe.isPersonal ? ' · Propia' : '') + '</span><span class="cuisine-difficulty">' + esc(difficultyLabel(diff)) + '</span></div>'
      + '<h3>' + esc(title) + '</h3>'
      + (summary ? '<p class="cuisine-card-description">' + esc(summary) + '</p>' : '')
      + '<div class="cuisine-card-meta"><span><i data-lucide="clock-3"></i>' + esc(time) + '</span><span><i data-lucide="list-checks"></i>' + (recipe.ingredientCount || (recipe.ingredients || []).length || '—') + ' ingredientes</span></div>'
      + '</div><div class="cuisine-card-actions"><button type="button" class="cuisine-open-btn" data-cuisine-open="' + esc(recipe.id) + '">Ver receta <i data-lucide="arrow-up-right"></i></button>'
      + (recipe.isPersonal
          ? '<button type="button" class="cuisine-action-btn" data-cuisine-edit="' + esc(recipe.id) + '" title="Editar receta" aria-label="Editar receta"><i data-lucide="pencil"></i></button>'
            + '<button type="button" class="cuisine-action-btn cuisine-action-danger" data-cuisine-delete="' + esc(recipe.id) + '" title="Eliminar receta" aria-label="Eliminar receta"><i data-lucide="trash-2"></i></button>'
          : '')
      + '<button type="button" class="cuisine-action-btn cuisine-fav-btn" data-cuisine-favorite="' + esc(recipe.id) + '" aria-label="' + (saved ? 'Quitar de favoritas' : 'Guardar en favoritas') + '" title="' + (saved ? 'Quitar de favoritas' : 'Guardar en favoritas') + '" aria-pressed="' + saved + '"><i data-lucide="heart"></i></button></div>'
      + (src ? '<span class="sr-only">Fuente: ' + esc(sourceName(recipe)) + '</span>' : '') + '</article>';
  }
  function filteredRecipes() {
    const type = $('cuisineType').value;
    const maxTime = $('cuisineMaxTime').value;
    const difficultyFilter = $('cuisineDifficulty').value;
    let list = showingFavorites ? favorites.slice() : [...personalRecipes, ...activeRecipes];
    const q = ($('cuisineSearchInput').value || '').trim().toLowerCase();
    list = list.filter(recipe => {
      const haystack = [recipe.title, recipe.description, (recipe.tags || []).join(' '), (recipe.categories || []).join(' '), (recipe.courses || []).join(' ')].join(' ').toLowerCase();
      const matchesQuery = !q || haystack.includes(q);
      const seconds = totalSeconds(recipe);
      const matchesTime = maxTime === 'all' || (seconds != null && seconds <= Number(maxTime) * 60);
      const matchesDifficulty = difficultyFilter === 'all' || difficulty(recipe) === difficultyFilter;
      return matchesQuery && matchesTime && matchesDifficulty && matchesType(recipe, type);
    });
    return list;
  }
  function renderCards() {
    if (currentRecipe) {
      $('cuisineRecipeGrid').hidden = true;
      $('cuisineResultsMeta').hidden = true;
      $('cuisineEmpty').hidden = true;
      const pageHead = document.querySelector('.cuisine-page-head');
      if (pageHead) pageHead.hidden = true;
      const toolbar = document.querySelector('.cuisine-toolbar');
      if (toolbar) toolbar.hidden = true;
      return;
    }
    const pageHead = document.querySelector('.cuisine-page-head');
    if (pageHead) pageHead.hidden = false;
    const toolbar = document.querySelector('.cuisine-toolbar');
    if (toolbar) toolbar.hidden = false;
    $('cuisineDetail').hidden = true;
    $('cuisineRecipeGrid').hidden = false;
    const list = filteredRecipes();
    $('cuisineRecipeGrid').innerHTML = list.map(cardMarkup).join('');
    $('cuisineRecipeGrid').querySelectorAll('[data-cuisine-open]').forEach(button => {
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); openRecipe(button.dataset.cuisineOpen); });
    });
    $('cuisineEmpty').hidden = list.length > 0;
    $('cuisineResultsMeta').hidden = list.length === 0;
    $('cuisineResultsMeta').textContent = showingFavorites
      ? list.length + (list.length === 1 ? ' favorita guardada' : ' favoritas guardadas')
      : list.length + (list.length === 1 ? ' receta encontrada' : ' recetas encontradas') + (activeQuery ? ' para «' + activeQuery + '»' : '');
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons({attrs:{'stroke-width':1.8}});
  }
  function renderDetail(recipe) {
    currentRecipe = recipe;
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients.map(item => typeof item === 'string' ? { display: item } : item) : [];
    const steps = Array.isArray(recipe.instructions) ? recipe.instructions : [];
    const image = safeHttpUrl(recipe.image || recipeImage(recipe));
    const servings = typeof recipe.servings === 'string' ? recipe.servings : recipe.servings && (recipe.servings.original || recipe.servings.quantity) ? (recipe.servings.original || 'Rinde ' + recipe.servings.quantity) : 'Raciones no indicadas';
    const nutrition = recipe.nutrition || {};
    const nutritionBits = [
      nutrition.calories && nutrition.calories.value != null ? '<span><strong>' + esc(Math.round(nutrition.calories.value)) + ' kcal</strong>por porción / según fuente</span>' : '',
      nutrition.protein && nutrition.protein.value != null ? '<span><strong>' + esc(Math.round(nutrition.protein.value * 10) / 10) + ' g</strong>proteína</span>' : '',
      nutrition.carbohydrates && nutrition.carbohydrates.value != null ? '<span><strong>' + esc(Math.round(nutrition.carbohydrates.value * 10) / 10) + ' g</strong>carbohidratos</span>' : ''
    ].filter(Boolean).join('');
    const source = safeHttpUrl(recipe.url);
    const ingredientRows = ingredients.map(item => '<li><span>' + esc(item.display || item.original || item.name || 'Ingrediente') + (item.optional ? ' <small>(opcional)</small>' : '') + '</span></li>').join('');
    const stepRows = steps.map((step, index) => '<li><span class="cuisine-step-number">' + esc(step.step || index + 1) + '</span><p>' + esc(typeof step === 'string' ? step : step.text || '') + '</p></li>').join('');
    const description = recipe.description ? '<p class="cuisine-detail-description">' + esc(recipe.description) + '</p>' : '';
    
    // Ocultar catálogo para que la receta ocupe toda la pantalla
    const pageHead = document.querySelector('.cuisine-page-head');
    if (pageHead) pageHead.hidden = true;
    const toolbar = document.querySelector('.cuisine-toolbar');
    if (toolbar) toolbar.hidden = true;
    const personalPanel = $('cuisinePersonalPanel');
    if (personalPanel) personalPanel.hidden = true;
    $('cuisineRecipeGrid').hidden = true;
    $('cuisineResultsMeta').hidden = true;
    $('cuisineEmpty').hidden = true;
    $('cuisineStatus').hidden = true;
    $('cuisineDetail').hidden = false;

    // Badges / metadatos unificados con icono y texto
    const metaChips = [
      '<span class="cuisine-detail-chip"><i data-lucide="clock-3"></i> ' + esc(timeText(recipe)) + '</span>',
      '<span class="cuisine-detail-chip"><i data-lucide="gauge"></i> ' + esc(difficultyLabel(difficulty(recipe))) + (recipe.isPersonal ? '' : ' · estimada') + '</span>',
      '<span class="cuisine-detail-chip"><i data-lucide="utensils"></i> ' + esc(servings) + '</span>',
      recipe.isPersonal ? '<span class="cuisine-detail-chip cuisine-personal-chip"><i data-lucide="sparkles"></i> Receta propia</span>' : ''
    ].filter(Boolean).join('');

    // Acciones: solo icono sin texto para favoritos, editar, eliminar y fuente
    const saved = isFavorite(recipe.id);
    const actionsMarkup = '<div class="cuisine-detail-actions">'
      + '<button type="button" class="cuisine-action-btn cuisine-fav-btn" id="cuisineDetailFavorite" title="' + (saved ? 'Quitar de favoritas' : 'Guardar en favoritas') + '" aria-label="' + (saved ? 'Quitar de favoritas' : 'Guardar en favoritas') + '" aria-pressed="' + saved + '"><i data-lucide="heart"></i></button>'
      + (recipe.isPersonal
          ? '<button type="button" class="cuisine-action-btn" id="cuisineDetailEdit" title="Editar receta" aria-label="Editar receta"><i data-lucide="pencil"></i></button>'
            + '<button type="button" class="cuisine-action-btn cuisine-action-danger" id="cuisineDetailDelete" title="Eliminar receta" aria-label="Eliminar receta"><i data-lucide="trash-2"></i></button>'
          : '')
      + (source ? '<a class="cuisine-action-btn" href="' + esc(source) + '" target="_blank" rel="noopener noreferrer" title="Ver fuente original (' + esc(sourceName(recipe)) + ')" aria-label="Ver fuente original"><i data-lucide="external-link"></i></a>' : '')
      + '</div>';

    $('cuisineDetail').innerHTML = '<button type="button" class="cuisine-detail-back" id="cuisineBackBtn"><i data-lucide="arrow-left"></i> Volver a recetas</button>'
      + '<div class="cuisine-detail-hero"><div><div class="cuisine-detail-eyebrow">' + esc(typeText(recipe)) + (!recipe.isPersonal && recipe.language === 'en' ? ' · English' : '') + '</div><h2>' + esc(recipe.title || 'Receta') + '</h2>' + description
      + '<div class="cuisine-detail-meta">' + metaChips + '</div>'
      + actionsMarkup
      + (source ? '<div class="cuisine-detail-source">Receta de <a href="' + esc(source) + '" target="_blank" rel="noopener noreferrer">' + esc(sourceName(recipe)) + '</a>. Consultá la publicación original para más contexto.</div>' : '')
      + '</div>' + (image ? '<img class="cuisine-detail-image" src="' + esc(image) + '" alt="' + esc(recipe.title || 'Receta') + '">' : '<div class="cuisine-card-image-placeholder"><i data-lucide="cooking-pot"></i></div>') + '</div>'
      + '<div class="cuisine-detail-columns"><section class="cuisine-detail-section"><h3>Ingredientes <span style="font-weight:400;color:var(--muted);font-size:11px">(' + ingredients.length + ')</span></h3>'
      + (ingredients.length ? '<ul class="cuisine-ingredient-list">' + ingredientRows + '</ul>' : '<p class="cuisine-card-description">Esta receta no tiene ingredientes estructurados disponibles.</p>')
      + (nutritionBits ? '<div class="cuisine-nutrition">' + nutritionBits + '</div>' : '') + '</section>'
      + '<section class="cuisine-detail-section"><h3>Preparación</h3>' + (steps.length ? '<ol class="cuisine-step-list">' + stepRows + '</ol>' : '<p class="cuisine-card-description">Esta receta no tiene instrucciones disponibles.</p>') + '</section></div>';
    
    $('cuisineBackBtn').onclick = closeDetail;
    $('cuisineDetailFavorite').onclick = () => toggleFavorite(currentRecipe);
    if (recipe.isPersonal) {
      const editBtn = $('cuisineDetailEdit');
      if (editBtn) editBtn.onclick = () => editPersonalRecipe(recipe);
      const delBtn = $('cuisineDetailDelete');
      if (delBtn) delBtn.onclick = () => deletePersonalRecipe(recipe.id);
    }
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons({attrs:{'stroke-width':1.8}});
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function closeDetail() {
    currentRecipe = null;
    $('cuisineDetail').hidden = true;
    const pageHead = document.querySelector('.cuisine-page-head');
    if (pageHead) pageHead.hidden = false;
    const toolbar = document.querySelector('.cuisine-toolbar');
    if (toolbar) toolbar.hidden = false;
    $('cuisineStatus').hidden = false;
    $('cuisineRecipeGrid').hidden = false;
    renderCards();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  async function openRecipe(id) {
    const fromList = [...personalRecipes, ...activeRecipes].find(item => String(item.id) === String(id));
    const fromFav = favorites.find(item => String(item.id) === String(id));
    let recipe = fromList || fromFav;
    if (recipe && (recipe.isPersonal || (Array.isArray(recipe.ingredients) && Array.isArray(recipe.instructions)))) { renderDetail(recipe); window.scrollTo({top:0,behavior:'smooth'}); return; }
    if (!recipe) { status('No se encontró esta receta. Volvé a buscarla e intentá de nuevo.', true); return; }
    status('Cargando la receta completa…');
    try {
      const payload = await cachedRequest('recipes/' + encodeURIComponent(id), { units: 'metric' });
      recipe = payload.recipe || payload;
      if (!recipe.id) recipe.id = String(id);
      if (fromFav) Object.assign(recipe, { title: recipe.title || fromFav.title, url: recipe.url || fromFav.url });
      renderDetail(recipe);
      status('');
      window.scrollTo({top:0,behavior:'smooth'});
    } catch (error) {
      status(error.message || 'No se pudo cargar esta receta.', true);
    }
  }
  async function load(force) {
    if (loading && !force) return;
    activeLanguage = 'all';
    const query = ($('cuisineSearchInput').value || '').trim();
    activeQuery = query;
    const token = ++requestToken;
    loading = true;
    status(query ? 'Buscando recetas…' : 'Cargando recetas populares…');
    $('cuisineRecipeGrid').innerHTML = '';
    try {
      let payload = query
        ? await cachedRequest('search', { query: query, limit: '20' })
        : await cachedRequest('popular', { limit: '24', offset: '0' });
      if (token !== requestToken) return;
      activeRecipes = recipeList(payload);
      // Priorizar español e inglés sin excluir otros idiomas.
      const languageRank = recipe => {
        const lang = String(recipe.language || recipe.locale || '').toLowerCase();
        if (lang === 'es' || lang.startsWith('es-') || lang.includes('spanish')) return 0;
        if (lang === 'en' || lang.startsWith('en-') || lang.includes('english')) return 1;
        return 2;
      };
      activeRecipes.sort((a, b) => languageRank(a) - languageRank(b));

      loaded = true;
      showingFavorites = false;
      $('cuisineFavoritesToggle').setAttribute('aria-pressed', 'false');
      renderCards();
      status(activeRecipes.length ? '' : 'No encontramos recetas. Probá otra búsqueda.');
    } catch (error) {
      if (token !== requestToken) return;
      if (query) {
        try {
          const fallbackRecipes = await searchMealDbFallback(query);
          if (token !== requestToken) return;
          if (fallbackRecipes.length) {
            activeRecipes = fallbackRecipes;
            loaded = true;
            showingFavorites = false;
            $('cuisineFavoritesToggle').setAttribute('aria-pressed', 'false');
            renderCards();
            status('Tiny Plates no respondió. Mostramos resultados alternativos; abrí la fuente original para consultar todos los detalles.');
            return;
          }
        } catch (_) {
          // Preserve the original Tiny Plates error below if the fallback is unavailable.
        }
      }
      activeRecipes = [];
      renderCards();
      let message = error.message || 'No se pudieron cargar las recetas.';
      if (/^Something went wrong\. Please try again\.?$/i.test(message)) message = 'Tiny Plates respondió con un error interno. La búsqueda no llegó a completarse; volvé a intentar en unos minutos. Si persiste, hay que revisar el estado del servicio o la clave de API en Vercel.';
      if (error.status === 503) message = 'Falta configurar TINYPLATES_API_KEY en Vercel. Seguí los pasos de conexión que te indico debajo.';
      else if (error.status === 401) message = 'Tiny Plates rechazó la clave. Revisá TINYPLATES_API_KEY en las variables de entorno de Vercel.';
      else if (error.status === 429) message = 'Se alcanzó el límite de Tiny Plates: 50 solicitudes al día y 300 por semana por cuenta. Las búsquedas en caché no consumen otra llamada.';
      status(message, true);
    } finally {
      if (token === requestToken) loading = false;
    }
  }
  function toggleFavoritesView() {
    showingFavorites = !showingFavorites;
    $('cuisineFavoritesToggle').setAttribute('aria-pressed', String(showingFavorites));
    closeDetail();
    if (showingFavorites) {
      status('');
      renderCards();
    } else {
      renderCards();
      if (!loaded || !activeRecipes.length) load();
    }
  }
  let personalImageData = '';
  function refreshPersonalPreview() {
    const title = $('cuisinePersonalTitle')?.value.trim();
    const description = $('cuisinePersonalDescription')?.value.trim();
    const ingredients = ($('cuisinePersonalIngredients')?.value || '').split(/\n|,/).map(s => s.trim()).filter(Boolean);
    const steps = ($('cuisinePersonalSteps')?.value || '').split(/\n/).map(s => s.trim()).filter(Boolean);
    const minutes = Number($('cuisinePersonalMinutes')?.value) || 0;
    const servings = $('cuisinePersonalServings')?.value.trim();
    const difficultyValue = $('cuisinePersonalDifficulty')?.value || 'medium';
    if ($('cuisinePersonalPreviewTitle')) $('cuisinePersonalPreviewTitle').textContent = title || 'Nombre de tu receta';
    if ($('cuisinePersonalPreviewDescription')) $('cuisinePersonalPreviewDescription').textContent = description || 'La descripción va a aparecer acá.';
    if ($('cuisinePersonalPreviewDifficulty')) $('cuisinePersonalPreviewDifficulty').textContent = difficultyLabel(difficultyValue);
    if ($('cuisinePersonalPreviewTime')) $('cuisinePersonalPreviewTime').textContent = minutes > 0 ? minutes + ' min' : 'Tiempo no indicado';
    if ($('cuisinePersonalPreviewIngredients')) $('cuisinePersonalPreviewIngredients').textContent = ingredients.length + (ingredients.length === 1 ? ' ingrediente' : ' ingredientes');
    if ($('cuisinePersonalPreviewSteps')) $('cuisinePersonalPreviewSteps').textContent = steps.length + (steps.length === 1 ? ' paso' : ' pasos');
    if ($('cuisinePersonalPreviewServings')) $('cuisinePersonalPreviewServings').textContent = servings || 'Porciones no indicadas';
  }
  function setPersonalPreviewImage(imageData) {
    const previewImage = $('cuisinePersonalPreviewImage');
    const previewPlaceholder = $('cuisinePersonalPreviewPlaceholder');
    if (!previewImage || !previewPlaceholder) return;
    previewImage.src = imageData || '';
    previewImage.hidden = !imageData;
    previewPlaceholder.hidden = !!imageData;
  }
  function closePersonalForm(reset) {
    const personalPanel = $('cuisinePersonalPanel');
    const personalForm = $('cuisinePersonalForm');
    if (reset && personalForm) {
      personalForm.reset();
      personalForm.dataset.editId = '';
      personalImageData = '';
      const heading = $('cuisinePersonalHeading');
      if (heading) heading.textContent = 'Crear una receta';
      const sub = heading?.closest('.cuisine-personal-heading-copy')?.querySelector('p');
      if (sub) sub.textContent = 'Completá los datos y mirá cómo va a quedar antes de guardarla.';
      const submitBtn = personalForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.innerHTML = '<i data-lucide="check"></i> Guardar receta';
      const previewImage = $('cuisinePersonalPreviewImage');
      const previewPlaceholder = $('cuisinePersonalPreviewPlaceholder');
      if (previewImage) { previewImage.src = ''; previewImage.hidden = true; }
      if (previewPlaceholder) previewPlaceholder.hidden = false;
      refreshPersonalPreview();
    }
    if (personalPanel) personalPanel.hidden = true;
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons({attrs:{'stroke-width':1.8}});
  }
  function editPersonalRecipe(recipe) {
    if (!recipe) return;
    if (currentRecipe) closeDetail();
    const personalPanel = $('cuisinePersonalPanel');
    const personalForm = $('cuisinePersonalForm');
    if (!personalPanel || !personalForm) return;

    personalForm.dataset.editId = String(recipe.id);
    const heading = $('cuisinePersonalHeading');
    if (heading) heading.textContent = 'Editar receta';
    const sub = heading?.closest('.cuisine-personal-heading-copy')?.querySelector('p');
    if (sub) sub.textContent = 'Modificá los datos de tu receta y guardá los cambios.';
    const submitBtn = personalForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.innerHTML = '<i data-lucide="check"></i> Guardar cambios';

    if ($('cuisinePersonalTitle')) $('cuisinePersonalTitle').value = recipe.title || '';
    if ($('cuisinePersonalDescription')) $('cuisinePersonalDescription').value = recipe.description || '';
    if ($('cuisinePersonalDifficulty')) $('cuisinePersonalDifficulty').value = recipe.difficulty || 'medium';
    if ($('cuisinePersonalIngredients')) $('cuisinePersonalIngredients').value = (recipe.ingredients || []).map(i => typeof i === 'string' ? i : i.display || i.name || '').filter(Boolean).join('\n');
    if ($('cuisinePersonalSteps')) $('cuisinePersonalSteps').value = (recipe.instructions || []).map(s => typeof s === 'string' ? s : s.text || '').filter(Boolean).join('\n');
    const mins = recipe.times && recipe.times.total && recipe.times.total.seconds ? Math.round(recipe.times.total.seconds / 60) : '';
    if ($('cuisinePersonalMinutes')) $('cuisinePersonalMinutes').value = mins;
    if ($('cuisinePersonalServings')) $('cuisinePersonalServings').value = recipe.servings || '';

    personalImageData = recipe.image || '';
    setPersonalPreviewImage(personalImageData);
    refreshPersonalPreview();

    personalPanel.hidden = false;
    personalPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => $('cuisinePersonalTitle')?.focus({ preventScroll: true }), 50);
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons({attrs:{'stroke-width':1.8}});
  }
  function deletePersonalRecipe(id) {
    const recipe = personalRecipes.find(r => String(r.id) === String(id));
    if (!recipe) return;
    if (!confirm('¿Eliminar la receta “' + (recipe.title || 'esta receta') + '”?')) return;
    personalRecipes = personalRecipes.filter(r => String(r.id) !== String(id));
    favorites = favorites.filter(r => String(r.id) !== String(id));
    writeStorage(PERSONAL_KEY, personalRecipes);
    writeStorage(FAVORITES_KEY, favorites);
    if (currentRecipe && String(currentRecipe.id) === String(id)) {
      closeDetail();
    } else {
      renderCards();
    }
    status('Receta eliminada.');
    if (typeof window.toast === 'function') window.toast('Receta eliminada');
  }
  function bind() {
    $('cuisineSearchForm').addEventListener('submit', event => { event.preventDefault(); currentRecipe = null; load(true); });
    ['cuisineType','cuisineMaxTime','cuisineDifficulty'].forEach(id => $(id).addEventListener('change', renderCards));
    $('cuisineFavoritesToggle').addEventListener('click', toggleFavoritesView);
    const personalPanel = $('cuisinePersonalPanel');
    const personalForm = $('cuisinePersonalForm');
    const processRecipeImage = file => new Promise((resolve, reject) => {
      if (!file) return resolve('');
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error('Elegí una imagen JPG, PNG o WebP.'));
      if (file.size > 5 * 1024 * 1024) return reject(new Error('La imagen supera los 5 MB.'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('El archivo no parece ser una imagen válida.'));
        image.onload = () => {
          const maxSide = 1200;
          const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext('2d');
          if (!context) return reject(new Error('No se pudo procesar la imagen.'));
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
    if ($('cuisineAddRecipeBtn')) $('cuisineAddRecipeBtn').addEventListener('click', () => {
      if (!personalPanel) return;
      if (personalPanel.hidden) {
        closePersonalForm(true);
        personalPanel.hidden = false;
        refreshPersonalPreview();
        personalPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        $('cuisinePersonalTitle').focus({ preventScroll: true });
      } else {
        closePersonalForm(true);
      }
    });
    if (personalForm) {
      $('cuisineCancelPersonalBtn').addEventListener('click', () => closePersonalForm(true));
      $('cuisineDiscardPersonalBtn').addEventListener('click', () => closePersonalForm(true));
      ['cuisinePersonalTitle','cuisinePersonalDescription','cuisinePersonalIngredients','cuisinePersonalSteps','cuisinePersonalMinutes','cuisinePersonalServings','cuisinePersonalDifficulty'].forEach(id => {
        const input = $(id);
        if (input) input.addEventListener('input', refreshPersonalPreview);
        if (input && input.tagName === 'SELECT') input.addEventListener('change', refreshPersonalPreview);
      });
      $('cuisinePersonalImage').addEventListener('change', async event => {
        const file = event.target.files && event.target.files[0];
        if (!file) { personalImageData = ''; setPersonalPreviewImage(''); return; }
        status('Procesando foto…');
        try {
          personalImageData = await processRecipeImage(file);
          setPersonalPreviewImage(personalImageData);
          status('');
        } catch (error) {
          personalImageData = '';
          event.target.value = '';
          setPersonalPreviewImage('');
          status(error.message, true);
        }
      });
      personalForm.addEventListener('submit', event => {
        event.preventDefault();
        const title = $('cuisinePersonalTitle').value.trim();
        const ingredientText = $('cuisinePersonalIngredients').value.trim();
        const stepText = $('cuisinePersonalSteps').value.trim();
        if (!title || !ingredientText || !stepText) { status('Completá el nombre, los ingredientes y la preparación.', true); return; }
        
        const editId = personalForm.dataset.editId;
        if (editId) {
          const recipe = personalRecipes.find(item => String(item.id) === String(editId));
          if (recipe) {
            recipe.title = title;
            recipe.description = $('cuisinePersonalDescription').value.trim();
            if (personalImageData !== undefined) recipe.image = personalImageData;
            recipe.difficulty = $('cuisinePersonalDifficulty').value || 'medium';
            recipe.ingredients = ingredientText.split(/\n|,/).map(s => s.trim()).filter(Boolean).map(display => ({display}));
            recipe.instructions = stepText.split(/\n/).map(s => s.trim()).filter(Boolean);
            recipe.servings = $('cuisinePersonalServings').value.trim() || 'A gusto';
            recipe.times = { total: { seconds: Math.max(0, Number($('cuisinePersonalMinutes').value) || 0) * 60 } };
            
            const favIdx = favorites.findIndex(item => String(item.id) === String(editId));
            if (favIdx >= 0) {
              favorites[favIdx] = favoriteMeta(recipe);
              writeStorage(FAVORITES_KEY, favorites);
            }

            if (writeStorage(PERSONAL_KEY, personalRecipes)) {
              closePersonalForm(true);
              renderCards();
              status('Receta actualizada con éxito.');
              if (typeof window.toast === 'function') window.toast('Receta actualizada');
            }
            return;
          }
        }

        const recipe = {
          id: 'personal-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
          title, description: $('cuisinePersonalDescription').value.trim(),
          image: personalImageData,
          difficulty: $('cuisinePersonalDifficulty').value || 'medium',
          ingredients: ingredientText.split(/\n|,/).map(s => s.trim()).filter(Boolean).map(display => ({display})),
          instructions: stepText.split(/\n/).map(s => s.trim()).filter(Boolean),
          servings: $('cuisinePersonalServings').value.trim() || 'A gusto',
          times: { total: { seconds: Math.max(0, Number($('cuisinePersonalMinutes').value) || 0) * 60 } },
          language: 'es', isPersonal: true, url: '', categories: ['personal'], courses: []
        };
        personalRecipes.unshift(recipe);
        if (writeStorage(PERSONAL_KEY, personalRecipes)) {
          closePersonalForm(true);
          showingFavorites = false;
          $('cuisineFavoritesToggle').setAttribute('aria-pressed', 'false');
          currentRecipe = null; renderCards(); status('Tu receta se guardó en este dispositivo.');
          if (typeof window.toast === 'function') window.toast('Receta guardada');
        } else {
          personalRecipes = personalRecipes.filter(item => item.id !== recipe.id);
        }
      });
    }
    $('cuisineRecipeGrid').addEventListener('click', event => {
      const fav = event.target.closest('[data-cuisine-favorite]');
      if (fav) {
        event.stopPropagation();
        const recipe = [...personalRecipes, ...activeRecipes, ...favorites].find(item => String(item.id) === fav.dataset.cuisineFavorite);
        if (recipe) toggleFavorite(recipe);
        return;
      }
      const edit = event.target.closest('[data-cuisine-edit]');
      if (edit) {
        event.stopPropagation();
        const recipe = personalRecipes.find(item => String(item.id) === edit.dataset.cuisineEdit);
        if (recipe) editPersonalRecipe(recipe);
        return;
      }
      const del = event.target.closest('[data-cuisine-delete]');
      if (del) {
        event.stopPropagation();
        deletePersonalRecipe(del.dataset.cuisineDelete);
        return;
      }
    });
  }
  window.CtrlCuisine = { load: () => { if (!loaded) load(); else if (showingFavorites) renderCards(); }, reload: () => load(true) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, {once:true}); else bind();
})();
