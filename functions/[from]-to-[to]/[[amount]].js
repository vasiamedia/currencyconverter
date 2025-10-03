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
    // Fetch the template.html file
    const templateUrl = new URL('/template.html', request.url);
    const templateResponse = await fetch(templateUrl.toString());
    
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
      // Update page title
      .on('title', {
        element(element) {
          element.setInnerContent(pageTitle);
        }
      })
      // Add/update meta description
      .on('head', {
        element(element) {
          element.append(`<meta name="description" content="${metaDescription}">`, { html: true });
          element.append(`<meta property="og:title" content="${pageTitle}">`, { html: true });
          element.append(`<meta property="og:description" content="${metaDescription}">`, { html: true });
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
      // Replace {{CONVERSION}} with actual conversion result
      .on('#conversion', {
        element(element) {
          element.setInnerContent(`
            <div style="text-align: center;">
              <div style="font-size: 2rem; font-weight: bold; margin-bottom: 0.5rem;">
                ${conversionText}
              </div>
              <div style="font-size: 1rem; color: #666;">
                ${rateText}
              </div>
              <div style="font-size: 0.875rem; color: #999; margin-top: 0.5rem;">
                Last updated: ${new Date(usdRatesData.timestamp).toLocaleString()}
              </div>
            </div>
          `, { html: true });
        }
      })
      // Update the Convert button to recalculate on click
      .on('a#button', {
        element(element) {
          // Remove the button, replace with a script that handles conversion
          element.remove();
        }
      })
      // Add dynamic conversion script
      .on('.hide.w-embed.w-script', {
        element(element) {
          element.setInnerContent(`
            <script>
              // Update the conversion button behavior
              const form = document.getElementById("email-form");
              const button = document.createElement("a");
              button.id = "button";
              button.href = "#";
              button.className = "w-button";
              button.textContent = "Convert";
              document.querySelector(".div-block-2").prepend(button);
              
              button.addEventListener("click", function(e) {
                e.preventDefault();
                const from = document.getElementById("from").value.toLowerCase();
                const to = document.getElementById("to").value.toLowerCase();
                const amount = document.getElementById("amount").value.trim();
                let path = \`/\${from}-to-\${to}\`;
                if (amount && amount !== "1") {
                  path += \`/\${amount}\`;
                }
                window.location.href = path;
              });
            </script>
          `, { html: true });
        }
      });
    
    // Transform the response
    const transformedResponse = rewriter.transform(templateResponse);
    
    // Add caching headers
    const response = new Response(transformedResponse.body, transformedResponse);
    response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
    response.headers.set('Content-Type', 'text/html; charset=utf-8');
    
    return response;
    
  } catch (error) {
    console.error('Error processing currency conversion:', error);
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

