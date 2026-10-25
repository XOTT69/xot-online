// Registry: register only providers with authorized, supported APIs.
// A provider implements { id, name, search({ title, tmdb_id, year }, env) }.
// Result records must be normalized and must never expose secrets.
export const providers = [];

export function normalize(item, provider) {
  if (!item || typeof item !== 'object') return null;
  const title = String(item.title || '').trim();
  if (!title) return null;
  return {
    provider: provider.id,
    title: title.slice(0, 200),
    quality: typeof item.quality === 'string' ? item.quality.slice(0, 40) : null,
    language: typeof item.language === 'string' ? item.language.slice(0, 60) : null
  };
}
