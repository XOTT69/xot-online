import {readFile, writeFile} from 'node:fs/promises';

// public/ is the canonical source served by Workers. Keep raw GitHub URLs identical.
for (const name of ['m.js', 'online.js']) {
  const source = await readFile(new URL('../public/' + name, import.meta.url));
  const target = new URL('../' + name, import.meta.url);
  if (process.argv.includes('--check')) {
    const copy = await readFile(target);
    if (!source.equals(copy)) throw new Error(name + ' differs from public/. Run npm run sync.');
  } else await writeFile(target, source);
}
