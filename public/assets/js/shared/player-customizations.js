(() => {
  const STORAGE_KEY = 'football-sim-player-customizations-v1';
  const emptyChanges = () => ({ version: 1, order: [], players: {} });
  let loadPromise;

  function isValidChanges(value) {
    return Boolean(value && value.version === 1 && value.players
      && typeof value.players === 'object' && !Array.isArray(value.players));
  }

  function readSavedChanges() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      return isValidChanges(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function saveChanges(changes) {
    if (!isValidChanges(changes)) throw new Error('The saved player changes are invalid.');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(changes));
    return changes;
  }

  async function loadChanges() {
    const saved = readSavedChanges();
    if (saved) return saved;
    if (!loadPromise) {
      loadPromise = (async () => {
        const response = await fetch('/api/player-customizations/migrate', { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Unable to load saved player changes.');
        const result = await response.json();
        if (!isValidChanges(result.customizations)) throw new Error('The previous player changes could not be loaded.');
        const changes = result.customizations;
        saveChanges(changes);
        try {
          await fetch('/api/player-customizations/migrate', { method: 'POST' });
        } catch {
        }
        return changes;
      })().catch((error) => {
        loadPromise = null;
        throw error;
      });
    }
    return loadPromise;
  }

  window.playerCustomizations = {
    key: STORAGE_KEY,
    load: loadChanges,
    read: () => readSavedChanges() || emptyChanges(),
    save: saveChanges,
  };
})();
