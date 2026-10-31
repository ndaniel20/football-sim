(() => {
  const SITE_ORIGIN = 'https://football-sim-rho.vercel.app/';
  const siteOrigin = SITE_ORIGIN.trim().replace(/\/+$/, '') || window.location.origin;
  const canonicalUrl = `${siteOrigin}${window.location.pathname}`;
  const canonicalLink = document.createElement('link');
  canonicalLink.rel = 'canonical';
  canonicalLink.href = canonicalUrl;
  document.head.append(canonicalLink);

  window.siteConfig = Object.freeze({ siteOrigin, canonicalUrl });

  // Initialize Vercel Web Analytics
  // Create queue for analytics events
  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };

  // Load the analytics script
  const analyticsScript = document.createElement('script');
  analyticsScript.src = 'https://cdn.vercel-insights.com/v1/script.js';
  analyticsScript.defer = true;
  document.head.appendChild(analyticsScript);
})();
