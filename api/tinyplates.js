/**
 * Ctrl Cocina — Tiny Plates API proxy (Vercel).
 * Required environment variable: TINYPLATES_API_KEY
 * Recibe /api/tinyplates/<ruta> (vía rewrite en vercel.json, igual que PitchAPI).
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

    const incoming = new URL(req.url, 'https://ctrl.invalid');

    // 1) ruta original si Vercel la conserva; 2) parámetro ?path= del rewrite.
    let parts = incoming.pathname.replace(/^\/api\/tinyplates\/?/, '').split('/').filter(Boolean);
    try {
        parts = parts.map(p => decodeURIComponent(p));
    } catch (_) {
        return res.status(400).json({ error: { message: 'Ruta de Tiny Plates inválida.' } });
    }
    if (!parts.length) {
        const q = incoming.searchParams.get('path') || (req.query && req.query.path) || '';
        parts = (Array.isArray(q) ? q.join('/') : String(q)).split('/').filter(Boolean);
    }

    const isRecipeDetail = parts.length === 2 && parts[0] === 'recipes' && /^[a-zA-Z0-9_-]+$/.test(parts[1]);
    const isListEndpoint = parts.length === 1 && ['search', 'popular'].includes(parts[0]);
    if (!isListEndpoint && !isRecipeDetail) {
        return res.status(400).json({ error: { message: 'Ruta de Tiny Plates no permitida: /' + parts.join('/') } });
    }

    const target = new URL('/' + parts.map(encodeURIComponent).join('/'), 'https://api.tinyplates.dev');
    incoming.searchParams.forEach((value, name) => {
        if (name !== 'path') target.searchParams.append(name, value);
    });

    try {
        const upstream = await fetch(target.toString(), {
            method: 'GET',
            headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' }
        });
        const body = await upstream.text();
        if (!upstream.ok) console.error('[tinyplates]', upstream.status, target.pathname + target.search, body.slice(0, 300));
        res.status(upstream.status);
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
        res.setHeader('X-Tinyplates-Target', target.pathname + target.search);
        res.setHeader('Cache-Control', upstream.ok ? 'public, s-maxage=3600, stale-while-revalidate=3600' : 'no-store');
        return res.send(body);
    } catch (_) {
        return res.status(502).json({ error: { message: 'No se pudo conectar con Tiny Plates.' } });
    }
};