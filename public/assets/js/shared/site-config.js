(() => {
  const SITE_ORIGIN = 'https://www.ucl-simulator.com';
  const siteOrigin = SITE_ORIGIN.trim().replace(/\/+$/, '') || window.location.origin;
  let canonicalLink = document.querySelector('link[rel="canonical"]');
  if (!canonicalLink) {
    canonicalLink = document.createElement('link');
    canonicalLink.rel = 'canonical';
    canonicalLink.href = `${siteOrigin}${window.location.pathname}`;
    document.head.append(canonicalLink);
  }
  const canonicalUrl = canonicalLink.href;

  window.siteConfig = Object.freeze({ siteOrigin, canonicalUrl });
})();
