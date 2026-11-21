import {rm} from 'node:fs/promises';

// Preserve the source and stored history, but exclude the retired player and
// media URLs from deployments. The final-course exam still shares style.css.
const retiredAssets = [
  'mo-phong/app.mjs',
  'mo-phong/core.mjs',
  'data/mo-phong-120-media.json',
  'data/mo-phong-120-timing-source.json'
];

await Promise.all(retiredAssets.map(path =>
  rm(new URL(`../dist/${path}`, import.meta.url), {force: true})
));

console.log('Retired simulation player and media manifests excluded from deployment.');
