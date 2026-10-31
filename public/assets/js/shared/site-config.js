(() => {
  const SITE_ORIGIN = 'https://football-sim-rho.vercel.app/';
  const siteOrigin = SITE_ORIGIN.trim().replace(/\/+$/, '') || window.location.origin;
  const canonicalUrl = `${siteOrigin}${window.location.pathname}`;
  const canonicalLink = document.createElement('link');
  canonicalLink.rel = 'canonical';
  canonicalLink.href = canonicalUrl;
  document.head.append(canonicalLink);

  window.siteConfig = Object.freeze({ siteOrigin, canonicalUrl });
})();
