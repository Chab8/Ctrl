/**
 * Ctrl Sports — server-side PitchAPI proxy for Vercel.
 * Required environment variable: PITCHAPI_API_KEY
 * Recibe /api/pitchapi/v1/... (vía rewrite en vercel.json).
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

    // 1) ruta original si Vercel la conserva; 2) parámetro ?path= del rewrite.
    let parts = incoming.pathname.replace(/^\/api\/pitchapi\/?/, '').split('/').filter(Boolean);
    try {
        parts = parts.map(p => decodeURIComponent(p));
    } catch {
        return res.status(400).json({ error: { message: 'Invalid PitchAPI path' } });
    }
    if (!parts.length) {
        const q = incoming.searchParams.get('path') || (req.query && req.query.path) || '';
        parts = (Array.isArray(q) ? q.join('/') : String(q)).split('/').filter(Boolean);
    }
    if (!parts.length || parts.some(p => p === '.' || p === '..' || /[\\]/.test(p))) {
        return res.status(400).json({ error: { message: 'Invalid PitchAPI path' } });
    }
    if (parts[0] !== 'v1') parts.unshift('v1');

    const target = new URL('/' + parts.map(encodeURIComponent).join('/'), 'https://api.pitchapi.dev');
    incoming.searchParams.forEach((value, name) => {
        if (name !== 'path') target.searchParams.append(name, value);
    });

    try {
        const upstream = await fetch(target.toString(), {
            method: 'GET',
            headers: { 'X-API-KEY': key, Accept: 'application/json' }
        });
        const body = await upstream.text();
        if (!upstream.ok) console.error('[pitchapi]', upstream.status, target.pathname + target.search, body.slice(0, 300));
        res.status(upstream.status);
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
        res.setHeader('X-Pitchapi-Target', target.pathname + target.search);
        res.setHeader('Cache-Control', 'no-store');
        return res.send(body);
    } catch (error) {
        return res.status(502).json({ error: { message: 'No se pudo conectar con PitchAPI.' } });
    }
};