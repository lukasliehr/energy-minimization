import { defineConfig } from 'vite';

// Each visualization is a page of its own in a folder named after its problem,
// for example 8-S2 for eight points on the sphere S^2. To add one, create the
// folder with an index.html and list it under input.
//
// A relative base lets the built site run from any path,
// for example https://<user>.github.io/<repository>/.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      input: {
        index: 'index.html',
        '8-S2': '8-S2/index.html',
      },
    },
  },
});
