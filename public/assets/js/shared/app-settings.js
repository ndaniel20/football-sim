(() => {
  const STORAGE_KEY = 'ucl-simulator-settings-v1';
  const DEFAULTS = Object.freeze({
    goalLikelihood: 'medium',
    gameSpeed: 100,
    awayGoals: false,
    usePotential: false,
    coefficientSeeding: true,
  });
  const goalOptions = new Set(['low', 'medium', 'high']);
  const gearIcon = '<svg viewBox="0 0 512 512" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="M487.4 315.7l-42.6-24.6c2.4-14 3.7-28.4 3.7-43.1s-1.3-29.1-3.7-43.1l42.6-24.6c8.5-4.9 11.4-15.8 6.5-24.3l-43-74.5c-4.9-8.5-15.8-11.4-24.3-6.5l-42.6 24.6c-22-18.2-47.6-32.9-75.3-42.7V8c0-9.9-8.1-18-18-18h-86c-9.9 0-18 8.1-18 18v49.2c-27.7 9.8-53.3 24.5-75.3 42.7L68.8 75.3c-8.5-4.9-19.4-2-24.3 6.5l-43 74.5c-4.9 8.5-2 19.4 6.5 24.3l42.6 24.6c-2.4 14-3.7 28.4-3.7 43.1s1.3 29.1 3.7 43.1L8 315.7c-8.5 4.9-11.4 15.8-6.5 24.3l43 74.5c4.9 8.5 15.8 11.4 24.3 6.5l42.6-24.6c22 18.2 47.6 32.9 75.3 42.7V488c0 9.9 8.1 18 18 18h86c9.9 0 18-8.1 18-18v-49.2c27.7-9.8 53.3-24.5 75.3-42.7l42.6 24.6c8.5 4.9 19.4 2 24.3-6.5l43-74.5c4.9-8.5 2-19.4-6.5-24.3zM256 336c-48.5 0-88-39.5-88-88s39.5-88 88-88 88 39.5 88 88-39.5 88-88 88z"/></svg>';
  const homeIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="m3.5 10.5 8.5-7 8.5 7v9a1 1 0 0 1-1 1h-5.2v-6.2H9.7v6.2H4.5a1 1 0 0 1-1-1v-9Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function normalize(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      goalLikelihood: goalOptions.has(source.goalLikelihood) ? source.goalLikelihood : DEFAULTS.goalLikelihood,
      gameSpeed: Number.isFinite(Number(source.gameSpeed))
        ? Math.max(50, Math.min(200, Math.round(Number(source.gameSpeed))))
        : DEFAULTS.gameSpeed,
      awayGoals: typeof source.awayGoals === 'boolean' ? source.awayGoals : DEFAULTS.awayGoals,
      usePotential: typeof source.usePotential === 'boolean' ? source.usePotential : DEFAULTS.usePotential,
      coefficientSeeding: typeof source.coefficientSeeding === 'boolean'
        ? source.coefficientSeeding : DEFAULTS.coefficientSeeding,
    };
  }

  function read() {
    try {
      return normalize(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null'));
    } catch {
      return { ...DEFAULTS };
    }
  }

  let settings = read();

  function save(patch) {
    settings = normalize({ ...settings, ...patch });
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
    }
    window.dispatchEvent(new CustomEvent('app-settings-change', { detail: { ...settings } }));
    renderControls();
    return { ...settings };
  }

  function interval(baseMilliseconds) {
    return Math.max(25, Math.round(Number(baseMilliseconds) * 100 / settings.gameSpeed));
  }

  window.appSettings = { defaults: { ...DEFAULTS }, get: () => ({ ...settings }), save, interval };

  function createTrigger() {
    const existing = document.querySelector('.nav-settings');
    const triggers = [];
    if (existing) {
      existing.removeAttribute('aria-disabled');
      existing.innerHTML = gearIcon;
      existing.setAttribute('aria-haspopup', 'dialog');
      existing.setAttribute('aria-controls', 'app-settings-dialog');
      triggers.push(existing);
    }

    const needsTopbarTrigger = !existing || document.body.matches('.setup-page, .draw-page');
    const topbar = document.querySelector('.topbar');
    if (needsTopbarTrigger && topbar) {
      const button = document.createElement('button');
      button.className = 'settings-topbar-trigger';
      button.type = 'button';
      button.setAttribute('aria-label', 'Settings');
      button.setAttribute('title', 'Settings');
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', 'app-settings-dialog');
      button.innerHTML = gearIcon;
      const actions = document.createElement('div');
      actions.className = 'topbar-actions';
      if (!existing) {
        const home = document.createElement('a');
        home.className = 'home-topbar-trigger';
        home.href = '/';
        home.setAttribute('aria-label', 'Home');
        home.setAttribute('title', 'Home');
        home.innerHTML = homeIcon;
        actions.append(home);
      }
      actions.append(button);
      topbar.insertBefore(actions, topbar.querySelector('.league-season, .season-callout') || null);
      triggers.push(button);
    }
    return triggers;
  }

  function createMobileNavigation() {
    if (document.querySelector('.side-rail')) return;
    const items = [
      ['/', 'Home', '<path d="m3.5 10.5 8.5-7 8.5 7v9a1 1 0 0 1-1 1h-5.2v-6.2H9.7v6.2H4.5a1 1 0 0 1-1-1v-9Z"/>'],
      ['/lineup', 'Line-up', '<path d="M14.7 6.3a5 5 0 0 0-6.4-6.4l3.2 3.2-3.5 3.5-3.2-3.2a5 5 0 0 0 6.4 6.4l7.2 7.2a2 2 0 0 0 2.8-2.8l-6.5-6.5Z" transform="translate(1 1)"/>'],
      ['/changelog', 'Change log', '<path d="M4.5 3.5h8l4.5 4.5v3.5m-12.5-8v17h9m-6-12h5m-5 4h3"/><path d="M17.5 13a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z"/><path d="M17.5 15.2v2.2l1.4.9"/>'],
      ['/match-simulator', 'Match simulator', '<circle cx="12" cy="12" r="9.25"/><path d="m12 7.4 3.1 2.2-1.2 3.7h-3.8l-1.2-3.7L12 7.4Zm0 0V2.8m3.1 6.8 4.4-1.4M13.9 13.3l2.8 4m-6.6-4-2.8 4M8.9 9.6 4.5 8.2"/>'],
    ];
    const navigation = document.createElement('nav');
    navigation.className = 'mobile-navigation';
    navigation.setAttribute('aria-label', 'Primary navigation');
    const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
    items.forEach(([href, label, icon]) => {
      const link = document.createElement('a');
      link.className = 'mobile-navigation-item';
      link.href = href;
      link.setAttribute('aria-label', label);
      link.setAttribute('title', label);
      if (currentPath === href || (href !== '/' && currentPath.startsWith(`${href}/`))) {
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'page');
      }
      link.innerHTML = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`;
      navigation.append(link);
    });
    document.body.append(navigation);
  }

  function createDialog() {
    const dialog = document.createElement('dialog');
    dialog.id = 'app-settings-dialog';
    dialog.className = 'app-settings-dialog';
    dialog.setAttribute('aria-labelledby', 'app-settings-title');
    dialog.innerHTML = `
      <div class="app-settings-shell">
        <header class="app-settings-heading">
          <div><p class="app-settings-kicker">PREFERENCES</p><h2 id="app-settings-title">Settings</h2></div>
          <button class="app-settings-close" type="button" aria-label="Close settings">×</button>
        </header>
        <div class="app-settings-content">
          <section class="app-settings-section" aria-labelledby="settings-match-title">
            <div class="app-settings-section-title"><span>01</span><div><h3 id="settings-match-title">Match simulation</h3></div></div>
            <div class="app-setting-row app-setting-goals">
              <div class="app-setting-copy"><strong>Goal frequency</strong><span>Choose how often chances become goals.</span></div>
              <div class="settings-choice-group" role="group" aria-label="Goal frequency">
                <button type="button" data-goal-likelihood="low">Low</button>
                <button type="button" data-goal-likelihood="medium">Medium</button>
                <button type="button" data-goal-likelihood="high">High</button>
              </div>
            </div>
            <div class="app-setting-row app-setting-speed">
              <div class="app-setting-copy"><strong>Preview speed</strong><span>Adjust how quickly the match clock advances.</span></div>
              <label class="settings-speed-control"><input id="settings-game-speed" type="range" min="50" max="200" step="5" aria-label="Match preview speed"><output id="settings-game-speed-value" for="settings-game-speed">1×</output><span class="settings-speed-labels"><span>Slower</span><span>Faster</span></span></label>
            </div>
          </section>
          <section class="app-settings-section" aria-labelledby="settings-players-title">
            <div class="app-settings-section-title"><span>02</span><div><h3 id="settings-players-title">Squad ratings</h3></div></div>
            <label class="app-setting-row app-setting-toggle">
              <span class="app-setting-copy"><strong>Use potential ratings</strong><span>Use potential when available; otherwise use overall. Line-up rating edits always take priority.</span></span>
              <input type="checkbox" data-setting="usePotential"><span class="settings-switch" aria-hidden="true"></span>
            </label>
          </section>
          <section class="app-settings-section" aria-labelledby="settings-tournament-title">
            <div class="app-settings-section-title"><span>03</span><div><h3 id="settings-tournament-title">Tournament rules</h3></div></div>
            <label class="app-setting-row app-setting-toggle">
              <span class="app-setting-copy"><strong>Away goals rule</strong><span>On aggregate level in a two-leg tie, the team with more away goals advances before extra time.</span></span>
              <input type="checkbox" data-setting="awayGoals"><span class="settings-switch" aria-hidden="true"></span>
            </label>
            <label class="app-setting-row app-setting-toggle">
              <span class="app-setting-copy"><strong>UEFA coefficient pot seeding</strong><span>On uses coefficient rankings. Off randomizes the four pots when a new draw is created.</span></span>
              <input type="checkbox" data-setting="coefficientSeeding"><span class="settings-switch" aria-hidden="true"></span>
            </label>
          </section>
        </div>
        <footer class="app-settings-footer"><button class="app-settings-reset" type="button">Reset to defaults</button></footer>
      </div>`;
    document.body.append(dialog);
    return dialog;
  }

  const triggers = createTrigger();
  createMobileNavigation();
  const dialog = createDialog();
  const speedInput = dialog.querySelector('#settings-game-speed');
  const speedOutput = dialog.querySelector('#settings-game-speed-value');

  function renderControls() {
    if (!dialog.isConnected) return;
    dialog.querySelectorAll('[data-goal-likelihood]').forEach((button) => {
      const selected = button.dataset.goalLikelihood === settings.goalLikelihood;
      button.setAttribute('aria-pressed', String(selected));
    });
    dialog.querySelectorAll('[data-setting]').forEach((input) => {
      input.checked = settings[input.dataset.setting];
    });
    speedInput.value = String(settings.gameSpeed);
    speedOutput.textContent = `${(settings.gameSpeed / 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}×`;
  }

  const openSettings = () => {
    renderControls();
    if (!dialog.open) {
      document.documentElement.classList.add('app-settings-open');
      dialog.showModal();
    }
  };
  triggers.forEach((trigger) => trigger.addEventListener('click', openSettings));
  dialog.querySelector('.app-settings-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => document.documentElement.classList.remove('app-settings-open'));
  dialog.querySelector('.app-settings-reset').addEventListener('click', () => save(DEFAULTS));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.querySelectorAll('[data-goal-likelihood]').forEach((button) => {
    button.addEventListener('click', () => save({ goalLikelihood: button.dataset.goalLikelihood }));
  });
  dialog.querySelectorAll('[data-setting]').forEach((input) => {
    input.addEventListener('change', () => save({ [input.dataset.setting]: input.checked }));
  });
  speedInput.addEventListener('input', () => save({ gameSpeed: Number(speedInput.value) }));
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    settings = read();
    renderControls();
    window.dispatchEvent(new CustomEvent('app-settings-change', { detail: { ...settings } }));
  });
  renderControls();
})();
