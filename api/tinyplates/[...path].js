/**
 * Ctrl Cocina — Tiny Plates API proxy.
 * Configure TINYPLATES_API_KEY in Vercel Environment Variables.
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const key = process.env.TINYPLATES_API_KEY;
  if (!key) {
    return res.status(503).json({
      error: { message: 'Falta configurar TINYPLATES_API_KEY en el entorno del servidor.' }
    });
  }

  // Vercel normalmente expone el catch-all como req.query.path, pero
  // algunos entornos locales no lo rellenan. En ese caso, derivamos la ruta
  // del pathname real para que /api/tinyplates/search funcione igualmente.
  const incoming = new URL(req.url, 'https://ctrl.invalid');
  const parts = req.query && req.query.path;
  let pathParts = Array.isArray(parts) ? parts : (parts ? [parts] : []);
  if (!pathParts.length) {
    const pathname = incoming.pathname.replace(/^\\/api\\/tinyplates\\/?/, '');
    try {
      pathParts = pathname ? pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part)) : [];
    } catch (_) {
      return res.status(400).json({ error: { message: 'Ruta de Tiny Plates no válida.' } });
    }
  }
  const validTopLevel = ['search', 'popular'];
  const isRecipeDetail = pathParts.length === 2 && pathParts[0] === 'recipes' && /^[a-zA-Z0-9_-]+$/.test(pathParts[1]);
  const isListEndpoint = pathParts.length === 1 && validTopLevel.includes(pathParts[0]);
  if ((!isListEndpoint && !isRecipeDetail) || pathParts.some(part => typeof part !== 'string' || part.includes('..'))) {
    return res.status(400).json({ error: { message: 'Ruta de Tiny Plates no permitida.' } });
  }

  const target = new URL('/' + pathParts.map(encodeURIComponent).join('/'), 'https://api.tinyplates.dev');
  target.search = incoming.search;
  target.searchParams.delete('path');

  try {
    const upstream = await fetch(target.toString(), {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + key,
        Accept: 'application/json'
      }
    });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    if (upstream.ok) {
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=3600');
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }
    return res.send(body);
  } catch (_) {
    return res.status(502).json({ error: { message: 'No se pudo conectar con Tiny Plates.' } });
  }
};
