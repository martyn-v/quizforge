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
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
