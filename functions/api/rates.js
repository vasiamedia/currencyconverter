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
    // Get data from KV - try both key formats
    const kvKey = `${base.toLowerCase()}-rates`; // e.g., "usd-rates"
    const kvData = await env.CURRENCY_RATES.get(kvKey, { type: "json" });
    
    if (kvData) {
      return Response.json({
        success: true,
        base,
        ...kvData  // Spread the entire KV data
      }, {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
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

