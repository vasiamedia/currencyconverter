/**
 * API Endpoint: GET /api/rate?from=USD&to=EUR
 * 
 * Returns just the exchange rate as a plain number.
 * Uses cross-rate calculation with USD as base.
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Get currencies from query params
  const fromCurrency = (url.searchParams.get("from") || "USD").toUpperCase();
  const toCurrency = (url.searchParams.get("to") || "EUR").toUpperCase();
  
  // Validate currencies (3-letter codes)
  if (!/^[A-Z]{3}$/.test(fromCurrency) || !/^[A-Z]{3}$/.test(toCurrency)) {
    return new Response("Invalid currency code", { status: 400 });
  }

  try {
    // Get USD rates from KV
    const usdRatesData = await env.CURRENCY_RATES.get('usd-rates', { type: "json" });
    
    if (!usdRatesData || !usdRatesData.rates) {
      return new Response('Exchange rates not available', { status: 503 });
    }
    
    // Calculate conversion rate using cross-rate formula: USD/TO ÷ USD/FROM
    let rate;
    
    if (fromCurrency === 'USD') {
      // Direct conversion from USD
      rate = usdRatesData.rates[toCurrency];
    } else if (toCurrency === 'USD') {
      // Inverse conversion to USD
      rate = 1 / usdRatesData.rates[fromCurrency];
    } else {
      // Cross-rate: (USD/TO) ÷ (USD/FROM)
      const usdToTarget = usdRatesData.rates[toCurrency];
      const usdToSource = usdRatesData.rates[fromCurrency];
      
      if (!usdToTarget || !usdToSource) {
        return new Response(`Currency not found: ${!usdToTarget ? toCurrency : fromCurrency}`, { status: 404 });
      }
      
      rate = usdToTarget / usdToSource;
    }
    
    if (!rate || !Number.isFinite(rate)) {
      return new Response(`Unable to calculate rate for ${fromCurrency} to ${toCurrency}`, { status: 404 });
    }

    // Return just the rate as plain text
    return new Response(rate.toString(), {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (error) {
    console.error("Error fetching rate:", error);
    return new Response("Error fetching rate", { status: 500 });
  }
}

