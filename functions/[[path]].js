/**
 * Cloudflare Pages Function - Catch-all route
 * 
 * This function runs at the edge for ALL requests.
 * It handles:
 * - Edge caching for HTML pages
 * - Future: SSR/dynamic meta tags via HTMLRewriter
 * - Pass-through for API routes and static assets
 */

export async function onRequest(context) {
  const { request, next, env } = context;

  // Only process HTML GET requests
  const accept = request.headers.get("accept") || "";
  if (request.method !== "GET" || !accept.includes("text/html")) {
    return next();
  }

  const url = new URL(request.url);
  
  // Check edge cache first
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), request);
  
  let cached = await cache.match(cacheKey);
  if (cached) {
    console.log(`Cache HIT: ${url.pathname}`);
    return cached;
  }

  console.log(`Cache MISS: ${url.pathname}`);

  // Get the static HTML from Pages
  let response = await next();
  
  // TODO: Add HTMLRewriter here for dynamic SEO
  // Example:
  // const rewriter = new HTMLRewriter()
  //   .on('title', {
  //     element(element) {
  //       element.setInnerContent('Custom Title');
  //     }
  //   });
  // response = rewriter.transform(response);

  // Clone and add cache headers
  response = new Response(response.body, response);
  response.headers.set("Cache-Control", "public, max-age=600, s-maxage=3600");
  response.headers.set("X-Cache-Status", "MISS");
  
  // Store in edge cache
  context.waitUntil(cache.put(cacheKey, response.clone()));
  
  return response;
}

