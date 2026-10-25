import { providers, normalize } from './providers.js';

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'x-content-type-options': 'nosniff'
};
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers }); }
function validTitle(value) { return typeof value === 'string' && value.trim().length > 0 && value.length <= 200; }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'access-control-allow-methods': 'GET, OPTIONS' } });
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
    if (url.pathname === '/api/health') return json({ ok: true, service: 'xot-online', provider_count: providers.length });
    if (url.pathname === '/api/providers') return json({ providers: providers.map(p => ({ id: p.id, name: p.name })) });
    if (url.pathname === '/api/search') {
      const query = {
        title: (url.searchParams.get('title') || '').trim(),
        tmdb_id: (url.searchParams.get('tmdb_id') || '').trim(),
        year: (url.searchParams.get('year') || '').trim()
      };
      if (!validTitle(query.title) && !/^\d{1,12}$/.test(query.tmdb_id)) {
        return json({ error: 'title_or_tmdb_id_required' }, 400);
      }
      if (query.year && !/^\d{4}$/.test(query.year)) return json({ error: 'invalid_year' }, 400);
      const settled = await Promise.allSettled(providers.map(async provider => {
        const found = await Promise.race([
          provider.search(query, env),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 7000))
        ]);
        return Array.isArray(found) ? found.map(item => normalize(item, provider)).filter(Boolean) : [];
      }));
      return json({
        query,
        results: settled.flatMap(r => r.status === 'fulfilled' ? r.value : []),
        provider_status: settled.map((r, i) => ({ id: providers[i].id, ok: r.status === 'fulfilled' }))
      });
    }
    return env.ASSETS ? env.ASSETS.fetch(request) : json({ error: 'not_found' }, 404);
  }
};
