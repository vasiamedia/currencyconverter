/**
 * Homepage handler
 * Injects convert button script without modifying index.html
 */

export async function onRequest(context) {
  const { request, next } = context;
  
  // Get the static index.html
  const response = await next();
  
  // Use HTMLRewriter to inject the convert button script
  const rewriter = new HTMLRewriter()
    .on('body', {
      element(element) {
        element.append(`
          <script>
            (function() {
              const button = document.getElementById("button");
              const amountEl = document.getElementById("amount");
              const fromEl = document.getElementById("from");
              const toEl = document.getElementById("to");
              
              if (!button || !amountEl || !fromEl || !toEl) return;
              
              button.addEventListener("click", function(e) {
                e.preventDefault();
                const from = fromEl.value.toLowerCase();
                const to = toEl.value.toLowerCase();
                const amount = amountEl.value.trim();
                let path = \`/\${from}-to-\${to}\`;
                if (amount && amount !== "1") {
                  path += \`/\${amount}\`;
                }
                window.location.href = path;
              });
            })();
          </script>
        `, { html: true });
      }
    });
  
  return rewriter.transform(response);
}

