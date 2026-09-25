// The one resolve hook of the Node checks, for a check that imports a module of the page.
//
// The page takes three.js by the bare names `three` and `three/addons/...`, and the import map of
// index.html resolves them in the browser. Node has no import map, so this hook points the same
// names at vendor/. Nothing about the way the browser loads the modules changes.
//
// Import this file first, with a static import, and import the modules of the page after it with
// import(). The body of this file runs before the body of the check, so the hook stands before the
// first module that takes three.js. A static import of such a module would load before the hook.
//
// root is the URL of the repository, with a trailing slash, for those imports.
import { register } from 'node:module';

export const root = new URL('../', import.meta.url).href;

register('data:text/javascript,' + encodeURIComponent(`
const root = ${JSON.stringify(root)};
const ADDONS = 'three/addons/';
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: root + 'vendor/three.module.js', shortCircuit: true };
  if (spec.startsWith(ADDONS)) return { url: root + 'vendor/addons/' + spec.slice(ADDONS.length), shortCircuit: true };
  return next(spec, ctx);
}`));
