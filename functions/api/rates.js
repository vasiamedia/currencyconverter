/**
 * API Endpoint: GET /api/rates?base=USD
 * 
 * Returns latest currency exchange rates for a given base currency.
 * Data source priority:
 * 1. KV cache (fastest, 6hr TTL)
 * 2. D1 database (fallback, historical data)
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Get base currency from query param (default: USD)
  const base = (url.searchParams.get("base") || "USD").toUpperCase();
  
  // Validate base currency (3-letter code)
  if (!/^[A-Z]{3}$/.test(base)) {
    return Response.json(
      { error: "Invalid base currency. Must be 3-letter code (e.g., USD, EUR)" },
      { status: 400 }
    );
  }

  try {
    // Try KV first (fast edge cache)
    const kvKey = `rates:${base}`;
    const kvData = await env.CURRENCY_RATES.get(kvKey, { type: "json" });
    
    if (kvData) {
      return Response.json({
        source: "kv",
        base,
        rates: kvData.rates,
        timestamp: kvData.at,
        cache: "hit"
      }, {
        headers: {
          "Cache-Control": "public, max-age=300", // 5 min browser cache
          "Content-Type": "application/json"
        }
      });
    }

    // Fallback to D1 database
    const { results } = await env.DB
      .prepare(`
        SELECT base, quote, rate, fetched_at
        FROM rates
        WHERE base = ?
        ORDER BY fetched_at DESC
        LIMIT 200
      `)
      .bind(base)
      .all();

    if (!results || results.length === 0) {
      return Response.json({
        error: `No rates found for base currency: ${base}`,
        message: "Cron worker may not have fetched data yet. Try USD, EUR, or GBP."
      }, { status: 404 });
    }

    // Convert D1 rows to rates object
    const rates = {};
    const timestamp = results[0].fetched_at;
    
    for (const row of results) {
      rates[row.quote] = row.rate;
    }

    return Response.json({
      source: "d1",
      base,
      rates,
      timestamp,
      cache: "miss"
    }, {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Content-Type": "application/json"
      }
    });

  } catch (error) {
    console.error("Error fetching rates:", error);
    return Response.json({
      error: "Failed to fetch rates",
      message: error.message
    }, { status: 500 });
  }
}

