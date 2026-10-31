(() => {
  // Set this to the canonical production origin after attaching your domain in Vercel.
  // Example: 'https://ucl.example.com' (no trailing slash).
  const SITE_ORIGIN = '';
  const siteOrigin = SITE_ORIGIN.trim().replace(/\/+$/, '') || window.location.origin;
  const canonicalUrl = `${siteOrigin}${window.location.pathname}`;
  const canonicalLink = document.createElement('link');
  canonicalLink.rel = 'canonical';
  canonicalLink.href = canonicalUrl;
  document.head.append(canonicalLink);

  window.siteConfig = Object.freeze({ siteOrigin, canonicalUrl });
})();
