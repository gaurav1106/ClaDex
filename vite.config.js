const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');
const path = require('path');

module.exports = defineConfig({
  plugins: [react()],
  root: path.join(__dirname, 'src', 'renderer'),
  base: './',
  build: {
    outDir: path.join(__dirname, 'renderer-dist'),
    emptyOutDir: true
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  }
});
