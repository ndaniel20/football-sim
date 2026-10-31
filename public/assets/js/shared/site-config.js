(() => {
  const SITE_ORIGIN = 'https://www.ucl-simulator.com';
  const siteOrigin = SITE_ORIGIN.trim().replace(/\/+$/, '') || window.location.origin;
  const canonicalUrl = `${siteOrigin}${window.location.pathname}`;
  const canonicalLink = document.createElement('link');
  canonicalLink.rel = 'canonical';
  canonicalLink.href = canonicalUrl;
  document.head.append(canonicalLink);

  window.siteConfig = Object.freeze({ siteOrigin, canonicalUrl });
})();
