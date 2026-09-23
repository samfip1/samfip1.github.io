import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteCompression from 'vite-plugin-compression';

// "/" is the static start page, the 3D app lives under /portfolio/ (rooms: /portfolio/studio, ...).
// GitHub Pages serves 404.html (a copy of the app) for room URLs; this does the same in dev/preview.
function rewritePortfolioRoutes(req, _res, next) {
  const [pathname, query = ''] = req.url.split('?');

  if (/^\/portfolio(\/[a-z]*)?\/?$/.test(pathname)) {
    req.url = `/portfolio/index.html${query ? `?${query}` : ''}`;
  }

  next();
}

function servePortfolioRoutes() {
  return {
    name: 'serve-portfolio-routes',
    configureServer(server) {
      server.middlewares.use(rewritePortfolioRoutes);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewritePortfolioRoutes);
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [servePortfolioRoutes(), react(), viteCompression()],
  build: {
    rollupOptions: {
      input: {
        start: 'index.html',
        portfolio: 'portfolio/index.html',
      },
    },
  },
  server: {
    proxy: {
      '/sanity-cdn': {
        target: 'https://cdn.sanity.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sanity-cdn/, '')
      }
    }
  }
})
