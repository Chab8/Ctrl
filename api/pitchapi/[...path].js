/**
 * Ctrl Sports — server-side PitchAPI proxy for Vercel.
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

  const parts = req.query.path;
  const pathParts = Array.isArray(parts) ? parts : (parts ? [parts] : []);
  if (!pathParts.length || pathParts.some(part => typeof part !== 'string' || part.includes('..'))) {
    return res.status(400).json({ error: 'Invalid PitchAPI path' });
  }

  const incoming = new URL(req.url, 'https://ctrl.invalid');
  const target = new URL('/' + pathParts.map(encodeURIComponent).join('/'), 'https://api.pitchapi.dev');
  target.search = incoming.search;
  target.searchParams.delete('path');

  try {
    const upstream = await fetch(target.toString(), {
      method: 'GET',
      headers: {
        'X-API-KEY': key,
        'Accept': 'application/json'
      }
    });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(body);
  } catch (error) {
    return res.status(502).json({
      error: { message: 'No se pudo conectar con PitchAPI.' }
    });
  }
};
