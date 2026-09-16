// Produces out/sidecar/: one ESM file plus node-pty (native, left external), so
// the Electron app can ship it as an extraResource and utilityProcess.fork it.
import { build } from 'esbuild';
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'out', 'sidecar');
const require = createRequire(import.meta.url);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [path.join(root, 'src', 'index.ts')],
  outfile: path.join(out, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['node-pty'],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});

const ptyRoot = path.dirname(require.resolve('node-pty/package.json'));
const ptyOut = path.join(out, 'node_modules', 'node-pty');
// node-pty's loader looks in build/Release (a node-gyp build, e.g. Linux where
// the tarball has no prebuild) before prebuilds/<platform>-<arch>.
const nativeDir = ['build/Release', `prebuilds/${process.platform}-${process.arch}`].find((dir) =>
  existsSync(path.join(ptyRoot, dir))
);
if (!nativeDir) {
  throw new Error(
    `node-pty has no native build for ${process.platform}-${process.arch} in ${ptyRoot}`
  );
}
for (const entry of ['package.json', 'LICENSE', 'lib', nativeDir]) {
  cpSync(path.join(ptyRoot, entry), path.join(ptyOut, entry), { recursive: true });
}
// The npm tarball ships spawn-helper as 0644; see ensureSpawnHelperExecutable in src/pty.ts.
const spawnHelper = path.join(ptyOut, nativeDir, 'spawn-helper');
if (existsSync(spawnHelper)) {
  chmodSync(spawnHelper, 0o755);
}
console.log(`bundled sidecar to ${out}`);
