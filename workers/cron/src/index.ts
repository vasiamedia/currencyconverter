/**
 * Cloudflare Worker - Cron Job
 * 
 * Runs every 30 minutes to fetch fresh currency exchange rates.
 * Stores data in KV (fast cache with 6hr TTL)
 */

export interface Env {
  CURRENCY_RATES: KVNamespace;
  RATES_BASES?: string;
}

const DEFAULT_BASES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD"];

export default {
  /**
   * Scheduled event handler - runs on cron schedule
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log("Cron triggered at:", new Date(event.scheduledTime).toISOString());
    
    // Parse base currencies from env var
    const bases = env.RATES_BASES
      ? env.RATES_BASES.split(",").map(s => s.trim().toUpperCase()).filter(Boolean)
      : DEFAULT_BASES;
    
    console.log("Fetching rates for base currencies:", bases.join(", "));
    
    const timestamp = new Date().toISOString();
    
    // Fetch rates for each base currency in parallel
    const promises = bases.map(base => updateBase(base, env, timestamp));
    
    // Wait for all to complete
    const results = await Promise.allSettled(promises);
    
    // Log results
    const succeeded = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;
    
    console.log(`Cron complete: ${succeeded} succeeded, ${failed} failed`);
    
    // Log any errors
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        console.error(`Failed to update ${bases[i]}:`, result.reason);
      }
    });
  },

  /**
   * HTTP handler for manual testing
   * GET /
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Manual trigger endpoint
    if (url.pathname === "/trigger") {
      const base = url.searchParams.get("base")?.toUpperCase() || "USD";
      const timestamp = new Date().toISOString();
      
      try {
        await updateBase(base, env, timestamp);
        return Response.json({
          success: true,
          message: `Updated rates for ${base}`,
          timestamp
        });
      } catch (error) {
        return Response.json({
          success: false,
          error: (error as Error).message
        }, { status: 500 });
      }
    }
    
    return Response.json({
      service: "currencyconverter-cron",
      status: "running",
      endpoints: {
        trigger: "/trigger?base=USD"
      }
    });
  }
};

/**
 * Fetch rates for a single base currency and store in KV
 */
async function updateBase(base: string, env: Env, timestamp: string): Promise<void> {
  console.log(`Fetching rates for ${base}...`);
  
  // Fetch from exchange rate API
  // Using exchangerate.host (free tier, no API key required)
  const apiUrl = `https://api.exchangerate.host/latest?base=${encodeURIComponent(base)}`;
  
  const response = await fetch(apiUrl, {
    headers: {
      "User-Agent": "currencyconverter.org cron worker"
    }
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json() as {
    base: string;
    date: string;
    rates: Record<string, number>;
  };
  
  if (!data.rates || Object.keys(data.rates).length === 0) {
    throw new Error(`No rates returned for ${base}`);
  }
  
  console.log(`Fetched ${Object.keys(data.rates).length} rates for ${base}`);
  
  // Store in KV (fast cache)
  const kvKey = `rates:${base}`;
  const kvValue = {
    rates: data.rates,
    at: timestamp,
    source: "exchangerate.host"
  };
  
  await env.CURRENCY_RATES.put(
    kvKey,
    JSON.stringify(kvValue),
    {
      expirationTtl: 60 * 60 * 6 // 6 hours
    }
  );
  
  console.log(`Stored ${base} rates in KV with 6hr TTL`);
}

