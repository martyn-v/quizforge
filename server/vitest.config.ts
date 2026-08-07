import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    root: '.',
  },
  // Vitest transforms with esbuild by default, which silently drops
  // emitDecoratorMetadata. Nest then injects undefined instead of erroring.
  // SWC emits the metadata, so DI works the same way it does at runtime.
  //
  // The cast is load-bearing. Two vite majors live in the workspace (web
  // uses 8, vitest pins 7). unplugin-swc declares no vite peer, so its
  // Plugin type binds to whichever copy pnpm hoists, and each install can
  // flip that coin. The plugin works against both; the cast keeps the
  // typecheck independent of the flip.
  plugins: [swc.vite({ module: { type: 'es6' } }) as never],
});
