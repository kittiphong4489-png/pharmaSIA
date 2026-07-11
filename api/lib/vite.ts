import { serveStatic } from "@hono/node-server/serve-static";

export async function serveStaticFiles(app: any) {
  app.use(
    "/*",
    serveStatic({
      root: "./dist/public",
      rewriteRequestPath: (path) => {
        if (path.startsWith("/api/") || path.startsWith("/trpc") || path.startsWith("/forte-img") || path === "/health") {
          return path; // Don't rewrite API paths
        }
        // Serve PWA files directly
        if (path === "/sw.js" || path === "/manifest.json") {
          return path;
        }
        if (path === "/" || !path.startsWith("/assets")) {
          return "/index.html";
        }
        return path;
      },
    })
  );
}
