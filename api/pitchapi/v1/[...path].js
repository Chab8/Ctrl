/**
 * Ctrl Sports — explicit PitchAPI v1 route for Vercel.
 *
 * Vercel Dev can fail to resolve the parent catch-all for nested /v1/* paths.
 * Keep this route explicit and forward the remaining path under /v1.
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
  if (!pathParts.length || pathParts.some(part =>
    typeof part !== 'string' || part === '.' || part === '..' || /[\\/]/.test(part)
  )) {
    return res.status(400).json({ error: 'Invalid PitchAPI path' });
  }

  const incoming = new URL(req.url, 'https://ctrl.invalid');
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
