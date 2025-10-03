/**
 * Dynamic Currency Conversion Route
 * 
 * Handles routes like:
 * - /usd-to-eur
 * - /usd-to-eur/1000
 * - /gbp-to-jpy/500
 * 
 * Serves template.html with:
 * - Pre-filled amount input
 * - Pre-selected currency dropdowns
 * - Calculated conversion result
 * - SEO-friendly meta tags
 */

export async function onRequest(context) {
  const { request, env, params } = context;
  
  // Extract parameters from URL
  const fromCurrency = params.from?.toUpperCase();
  const toCurrency = params.to?.toUpperCase();
  const amount = params.amount ? parseFloat(params.amount) : 1;
  
  // Validate currencies (3-letter codes)
  if (!fromCurrency || !toCurrency || !/^[A-Z]{3}$/.test(fromCurrency) || !/^[A-Z]{3}$/.test(toCurrency)) {
    return new Response("Invalid currency pair", { status: 404 });
  }
  
  // Validate amount
  if (isNaN(amount) || amount <= 0) {
    return new Response("Invalid amount", { status: 400 });
  }
  
  try {
    // Fetch the template.html file (with edge caching for the static HTML)
    const templateUrl = new URL('/template.html', request.url);
    const templateResponse = await fetch(templateUrl.toString(), {
      cf: {
        cacheTtl: 3600, // Cache static template for 1 hour at edge
        cacheEverything: true
      }
    });
    
    if (!templateResponse.ok) {
      return new Response("Template not found", { status: 404 });
    }
    
    // Get USD rates from KV (we use USD as the base for all conversions)
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
    
    if (!rate) {
      return new Response(`Unable to calculate rate for ${fromCurrency} to ${toCurrency}`, { status: 404 });
    }
    
    const convertedAmount = (amount * rate).toFixed(2);
    
    // Format numbers with commas
    const formatNumber = (num) => {
      return parseFloat(num).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    };
    
    const formattedAmount = formatNumber(amount);
    const formattedConverted = formatNumber(convertedAmount);
    const formattedRate = formatNumber(rate);
    
    // Build conversion text
    const conversionText = `${formattedAmount} ${fromCurrency} = ${formattedConverted} ${toCurrency}`;
    const rateText = `1 ${fromCurrency} = ${formattedRate} ${toCurrency}`;
    
    // Create meta description
    const metaDescription = `Convert ${fromCurrency} to ${toCurrency}. ${conversionText}. Live exchange rates updated regularly.`;
    const pageTitle = `${formattedAmount} ${fromCurrency} to ${toCurrency} - ${formattedConverted} ${toCurrency} | Currency Converter`;
    
    // Use HTMLRewriter to modify the template
    const rewriter = new HTMLRewriter()
      // Fix all relative src and href paths to be absolute
      .on('link[href]', {
        element(element) {
          const href = element.getAttribute('href');
          if (href && !href.startsWith('http') && !href.startsWith('/') && !href.startsWith('#')) {
            element.setAttribute('href', '/' + href);
          }
        }
      })
      .on('script[src]', {
        element(element) {
          const src = element.getAttribute('src');
          if (src && !src.startsWith('http') && !src.startsWith('/')) {
            element.setAttribute('src', '/' + src);
          }
        }
      })
      .on('img[src]', {
        element(element) {
          const src = element.getAttribute('src');
          if (src && !src.startsWith('http') && !src.startsWith('/') && !src.startsWith('data:')) {
            element.setAttribute('src', '/' + src);
          }
        }
      })
      .on('a[href]', {
        element(element) {
          const href = element.getAttribute('href');
          // Only fix relative paths, not # anchors, external links, or already absolute paths
          if (href && !href.startsWith('http') && !href.startsWith('/') && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
            element.setAttribute('href', '/' + href);
          }
        }
      })
      // Update page title
      .on('title', {
        element(element) {
          element.setInnerContent(pageTitle);
        }
      })
      // Add/update meta description and inject exchange rate
      .on('head', {
        element(element) {
          element.append(`<meta name="description" content="${metaDescription}">`, { html: true });
          element.append(`<meta property="og:title" content="${pageTitle}">`, { html: true });
          element.append(`<meta property="og:description" content="${metaDescription}">`, { html: true });
          // Store the exchange rate for client-side amount updates
          element.append(`<script>window.__RATE__=${rate};window.__FROM__="${fromCurrency}";window.__TO__="${toCurrency}";</script>`, { html: true });
        }
      })
      // Set the amount input value
      .on('input#amount', {
        element(element) {
          element.setAttribute('value', amount.toString());
        }
      })
      // Set the FROM select dropdown
      .on('select#from', {
        element(element) {
          element.setAttribute('data-selected', fromCurrency);
        }
      })
      .on('select#from option', {
        element(element) {
          const value = element.getAttribute('value');
          if (value === fromCurrency) {
            element.setAttribute('selected', 'selected');
          } else {
            element.removeAttribute('selected');
          }
        }
      })
      // Set the TO select dropdown
      .on('select#to', {
        element(element) {
          element.setAttribute('data-selected', toCurrency);
        }
      })
      .on('select#to option', {
        element(element) {
          const value = element.getAttribute('value');
          if (value === toCurrency) {
            element.setAttribute('selected', 'selected');
          } else {
            element.removeAttribute('selected');
          }
        }
      })
      // Replace {{CONVERSION}} with just the converted amount
      .on('#conversion', {
        element(element) {
          element.setInnerContent(formattedConverted);
        }
      })
      // Add dynamic conversion script at end of body
      .on('body', {
        element(element) {
          element.append(`
            <script>
              (function() {
                const amountEl = document.getElementById("amount");
                const fromEl = document.getElementById("from");
                const toEl = document.getElementById("to");
                const convEl = document.getElementById("conversion");
                
                if (!amountEl || !fromEl || !toEl || !convEl) return;
                
                // Format number with commas
                function formatNum(n) {
                  return parseFloat(n).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  });
                }
                
                // Parse amount, default to 1
                function parseAmount(val) {
                  const n = parseFloat(String(val || '1').replace(/,/g, ''));
                  return (Number.isFinite(n) && n > 0) ? n : 1;
                }
                
                // Update conversion display and URL for amount changes only
                function updateAmount() {
                  const amt = parseAmount(amountEl.value);
                  const rate = window.__RATE__ || 1;
                  const from = window.__FROM__ || fromEl.value.toUpperCase();
                  const to = window.__TO__ || toEl.value.toUpperCase();
                  
                  // Update displayed conversion
                  const converted = amt * rate;
                  convEl.textContent = formatNum(converted);
                  
                  // Update URL without reload
                  const slugAmt = amt === 1 ? '' : '/' + amt;
                  const path = \`/\${from.toLowerCase()}-to-\${to.toLowerCase()}\${slugAmt}\`;
                  history.replaceState({}, '', path);
                }
                
                // Currency change → reload with new URL
                function handleCurrencyChange() {
                  const from = fromEl.value.toLowerCase();
                  const to = toEl.value.toLowerCase();
                  const amt = parseAmount(amountEl.value);
                  const slugAmt = amt === 1 ? '' : '/' + amt;
                  window.location.href = \`/\${from}-to-\${to}\${slugAmt}\`;
                }
                
                // Amount blur → update display + URL only
                amountEl.addEventListener("blur", updateAmount);
                amountEl.addEventListener("keydown", function(e) {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    updateAmount();
                  }
                });
                
                // Currency change → reload
                fromEl.addEventListener("change", handleCurrencyChange);
                toEl.addEventListener("change", handleCurrencyChange);
              })();
            </script>
          `, { html: true });
        }
      });
    
    // Transform the response
    const transformedResponse = rewriter.transform(templateResponse);
    
    // Add caching headers - no cache to ensure fresh rates on every page load
    const response = new Response(transformedResponse.body, transformedResponse);
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    response.headers.set('Content-Type', 'text/html; charset=utf-8');
    
    return response;
    
  } catch (error) {
    console.error('Error processing currency conversion:', error);
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

