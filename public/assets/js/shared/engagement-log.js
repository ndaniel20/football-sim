(() => {
  const ENDPOINT = '/api/engagement';
  const events = [];
  let flushTimer = 0;
  const page = window.location.pathname.replace(/\/+$/, '') || '/';

  function queueEvent(event, details = {}) {
    events.push({ event, page, ...details });
    if (events.length >= 10) flush();
    else if (!flushTimer) flushTimer = window.setTimeout(flush, 1500);
  }

  function flush() {
    if (flushTimer) window.clearTimeout(flushTimer);
    flushTimer = 0;
    if (!events.length) return;

    const batch = events.splice(0, 20);
    const body = JSON.stringify({ events: batch });
    if (navigator.sendBeacon
      && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {});
  }

  queueEvent('page_view');
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('button');
    if (!button || button.disabled || button.dataset.engagement === 'ignore') return;
    const label = (button.dataset.engagementLabel
      || button.getAttribute('aria-label')
      || button.textContent
      || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!label && !button.id) return;
    queueEvent('button_click', {
      label,
      ...(button.id ? { buttonId: button.id } : {}),
    });
  }, { passive: true });

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
})();
