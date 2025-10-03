/**
 * API Endpoint: GET /api/rates?base=USD
 * 
 * Returns latest currency exchange rates for a given base currency.
 * Data source: KV cache (6hr TTL)
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
    // Get data from KV
    const kvKey = `rates:${base}`;
    const kvData = await env.CURRENCY_RATES.get(kvKey, { type: "json" });
    
    if (kvData) {
      return Response.json({
        success: true,
        base,
        rates: kvData.rates,
        timestamp: kvData.at,
        source: kvData.source || "exchangerate.host"
      }, {
        headers: {
          "Cache-Control": "public, max-age=300", // 5 min browser cache
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // No data in KV
    return Response.json({
      error: `No rates found for base currency: ${base}`,
      message: "Cron worker may not have fetched data yet. Try USD, EUR, or GBP.",
      available: "Make sure the cron worker has run at least once."
    }, { 
      status: 404,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (error) {
    console.error("Error fetching rates:", error);
    return Response.json({
      error: "Failed to fetch rates",
      message: error.message
    }, { 
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}

