/**
 * Ctrl Sports — explicit PitchAPI v1 route for Vercel.
 *
 * Some Vercel Dev versions invoke catch-all handlers without populating
 * req.query.path. Fall back to reading the route suffix from req.url.
 * Required environment variable: PITCHAPI_API_KEY
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.PITCHAPI_API_KEY;
  if (!key) {
    return res.status(503).json({
      error: { message: 'Falta configurar PITCHAPI_API_KEY en el entorno del servidor.' }
    });
  }

  const incoming = new URL(req.url, 'https://ctrl.invalid');
  const parts = req.query && req.query.path;
  let pathParts = Array.isArray(parts) ? parts : (parts ? [parts] : []);

  // Fallback for local Vercel Dev when the catch-all param is missing.
  if (!pathParts.length) {
    const prefix = '/api/pitchapi/v1/';
    if (!incoming.pathname.startsWith(prefix)) {
      return res.status(400).json({ error: 'Invalid PitchAPI path' });
    }

    try {
      pathParts = incoming.pathname.slice(prefix.length)
        .split('/')
        .filter(Boolean)
        .map(part => decodeURIComponent(part));
    } catch {
      return res.status(400).json({ error: 'Invalid PitchAPI path' });
    }
  }

  if (!pathParts.length || pathParts.some(part =>
    typeof part !== 'string' ||
    !part ||
    part === '.' ||
    part === '..' ||
    /[\\/]/.test(part)
  )) {
    return res.status(400).json({ error: 'Invalid PitchAPI path' });
  }

  const target = new URL(
    '/v1/' + pathParts.map(encodeURIComponent).join('/'),
    'https://api.pitchapi.dev'
  );
  incoming.searchParams.forEach((value, name) => {
    if (name !== 'path') target.searchParams.append(name, value);
  });

  try {
    const upstream = await fetch(target.toString(), {
      method: 'GET',
      headers: {
        'X-API-KEY': key,
        Accept: 'application/json'
      }
    });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || 'application/json; charset=utf-8'
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.send(body);
  } catch (error) {
    return res.status(502).json({
      error: { message: 'No se pudo conectar con PitchAPI.' }
    });
  }
};
