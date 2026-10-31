const elements = {
  list: document.querySelector('#change-log-list'),
  count: document.querySelector('#change-log-count'),
  resetAll: document.querySelector('#reset-all'),
  status: document.querySelector('#change-log-status'),
  confirmDialog: document.querySelector('#reset-confirm-dialog'),
  confirmReset: document.querySelector('#reset-confirm'),
  cancelReset: document.querySelector('#reset-cancel'),
};

let changeEntries = [];

function starsForRating(rating) {
  return rating >= 88 ? 5 : rating >= 56 ? 1 + Math.floor((rating - 56) / 4) * 0.5 : 0.5;
}

function setClubCrest(image, club) {
  image.src = club.team_id === null || club.team_id === undefined
    ? '/images/clubs/placeholder.svg'
    : `/images/clubs/${encodeURIComponent(club.team_id)}.png`;
  image.alt = '';
  image.onerror = () => {
    image.onerror = null;
    image.src = '/images/clubs/placeholder.svg';
  };
}

function appendClub(container, club, className = '') {
  const item = document.createElement('span');
  item.className = `change-club${className ? ` ${className}` : ''}`;
  const crest = document.createElement('img');
  setClubCrest(crest, club);
  const name = document.createElement('span');
  name.className = 'change-club-name';
  name.textContent = club.name;
  item.append(crest, name);
  container.append(item);
}

function appendRatingStars(container, rating) {
  const tier = starsForRating(rating);
  const value = document.createElement('span');
  value.className = 'change-rating-value';
  value.textContent = `${tier} / 5`;
  const stars = document.createElement('span');
  stars.className = 'change-rating-stars';
  stars.setAttribute('aria-label', `${tier} stars`);
  for (let index = 0; index < 5; index += 1) {
    const star = document.createElement('span');
    const fill = Math.max(0, Math.min(1, tier - index));
    star.className = `change-rating-star${fill === 1 ? ' is-full' : fill === 0.5 ? ' is-half' : ''}`;
    star.textContent = '★';
    stars.append(star);
  }
  container.append(stars, value);
}

function appendChangeRow(card, label, content, className = '') {
  const row = document.createElement('div');
  row.className = `change-detail-row${className ? ` ${className}` : ''}`;
  const field = document.createElement('span');
  field.className = 'change-detail-label';
  field.textContent = label;
  row.append(field, content);
  card.append(row);
}

function createComparison(appendBefore, appendAfter) {
  const comparison = document.createElement('div');
  comparison.className = 'change-comparison';
  const before = document.createElement('div');
  before.className = 'change-comparison-side is-before';
  const beforeLabel = document.createElement('span');
  beforeLabel.className = 'change-comparison-label';
  beforeLabel.textContent = 'BEFORE';
  const beforeValue = document.createElement('div');
  beforeValue.className = 'change-comparison-value';
  appendBefore(beforeValue);
  before.append(beforeLabel, beforeValue);

  const arrow = document.createElement('span');
  arrow.className = 'change-comparison-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '→';

  const after = document.createElement('div');
  after.className = 'change-comparison-side is-after';
  const afterLabel = document.createElement('span');
  afterLabel.className = 'change-comparison-label';
  afterLabel.textContent = 'AFTER';
  const afterValue = document.createElement('div');
  afterValue.className = 'change-comparison-value';
  appendAfter(afterValue);
  after.append(afterLabel, afterValue);
  comparison.append(before, arrow, after);
  return comparison;
}

function appendPositionChips(container, positions) {
  if (!positions.length) {
    const empty = document.createElement('span');
    empty.className = 'change-position-empty';
    empty.textContent = 'None';
    container.append(empty);
    return;
  }
  positions.forEach((position) => {
    const chip = document.createElement('span');
    chip.className = 'change-position-chip';
    chip.textContent = position;
    container.append(chip);
  });
}

function createPlayerAvatar(player) {
  const image = document.createElement('img');
  image.className = 'change-player-face';
  image.src = `https://cdn.futwiz.com/assets/img/fc27/faces/${encodeURIComponent(player.id)}.png?25`;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', () => {
    const fallback = document.createElement('span');
    fallback.className = 'change-player-face change-player-fallback';
    fallback.setAttribute('aria-hidden', 'true');
    fallback.textContent = player.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase();
    image.replaceWith(fallback);
  }, { once: true });
  return image;
}

function appendPositionDetails(card, entry) {
  const primaryChanged = entry.position !== entry.originalPosition;
  const originalAlternates = [...entry.originalAlternatePositions].sort();
  const currentAlternates = [...entry.alternatePositions].sort();
  const secondaryChanged = originalAlternates.length !== currentAlternates.length
    || originalAlternates.some((position, index) => position !== currentAlternates[index]);
  if (!primaryChanged && !secondaryChanged) return;

  if (primaryChanged) {
    const primary = createComparison(
      (side) => appendPositionChips(side, [entry.originalPosition]),
      (side) => appendPositionChips(side, [entry.position]),
    );
    appendChangeRow(card, 'MAIN POSITION', primary, 'is-position-row');
  }
  if (secondaryChanged) {
    const secondary = createComparison(
      (side) => appendPositionChips(side, originalAlternates),
      (side) => appendPositionChips(side, currentAlternates),
    );
    appendChangeRow(card, 'ALT. POSITIONS', secondary, 'is-position-row');
  }
}

function createChangeCard(entry) {
  const card = document.createElement('article');
  card.className = 'change-log-entry';
  const avatar = createPlayerAvatar(entry);
  const content = document.createElement('div');
  content.className = 'change-log-entry-content';
  const header = document.createElement('div');
  header.className = 'change-log-entry-header';
  const identity = document.createElement('div');
  identity.className = 'change-log-entry-identity';
  const name = document.createElement('h3');
  name.textContent = entry.name;
  const changedFields = [];
  if (entry.originalClub.key !== entry.currentClub.key) changedFields.push('club');
  if (entry.position !== entry.originalPosition
    || [...entry.originalAlternatePositions].sort().join('|') !== [...entry.alternatePositions].sort().join('|')) {
    changedFields.push('positions');
  }
  if (starsForRating(entry.originalRating) !== starsForRating(entry.rating)) changedFields.push('rating');
  const changeCount = document.createElement('span');
  changeCount.className = 'change-entry-summary';
  changeCount.textContent = `${changedFields.length} ${changedFields.length === 1 ? 'edit' : 'edits'}`;
  identity.append(name, changeCount);
  const remove = document.createElement('button');
  remove.className = 'change-remove-button';
  remove.type = 'button';
  remove.setAttribute('aria-label', `Restore original details for ${entry.name}`);
  remove.title = `Restore ${entry.name} to their original details`;
  remove.innerHTML = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.2 8a6.1 6.1 0 1 1-.1 4M4.2 4.5V8h3.5M10 6.7a3.3 3.3 0 1 1-3.1 4.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Restore</span>';
  remove.addEventListener('click', () => removePlayerChanges(entry.playerKey));
  header.append(identity, remove);
  content.append(header);

  if (entry.originalClub.key !== entry.currentClub.key) {
    const transfer = createComparison(
      (side) => appendClub(side, entry.originalClub, 'is-original'),
      (side) => appendClub(side, entry.currentClub, 'is-current'),
    );
    appendChangeRow(content, 'CLUB', transfer);
  }

  appendPositionDetails(content, entry);
  if (starsForRating(entry.originalRating) !== starsForRating(entry.rating)) {
    const ratings = createComparison(
      (side) => appendRatingStars(side, entry.originalRating),
      (side) => appendRatingStars(side, entry.rating),
    );
    appendChangeRow(content, 'STAR RATING', ratings);
  }

  card.append(avatar, content);
  return card;
}

function renderChanges(entries) {
  changeEntries = entries;
  elements.list.replaceChildren();
  elements.count.textContent = `${entries.length} ${entries.length === 1 ? 'CHANGE' : 'CHANGES'}`;
  elements.resetAll.disabled = entries.length === 0;
  elements.list.setAttribute('aria-busy', 'false');
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'change-log-empty';
    const icon = document.createElement('span');
    icon.className = 'change-log-empty-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '✓';
    const title = document.createElement('strong');
    title.textContent = 'No custom changes yet';
    const copy = document.createElement('p');
    copy.textContent = 'Your squad is using its original clubs, positions, and ratings.';
    const link = document.createElement('a');
    link.href = '/lineup';
    link.textContent = 'Edit players';
    empty.append(icon, title, copy, link);
    elements.list.append(empty);
    return;
  }
  entries.forEach((entry) => elements.list.append(createChangeCard(entry)));
}

function announce(message) {
  elements.status.textContent = message;
  elements.status.hidden = false;
  window.clearTimeout(announce.timeout);
  announce.timeout = window.setTimeout(() => {
    elements.status.hidden = true;
  }, 3500);
}

function removePlayerChanges(playerKey) {
  const changes = window.playerCustomizations.read();
  if (!Object.hasOwn(changes.players, playerKey)) return;
  delete changes.players[playerKey];
  changes.order = (changes.order || Object.keys(changes.players)).filter((key) => key !== playerKey);
  changes.updatedAt = Object.keys(changes.players).length ? new Date().toISOString() : null;
  window.playerCustomizations.save(changes);
  const playerName = changeEntries.find((entry) => entry.playerKey === playerKey)?.name || 'Player';
  renderChanges(changeEntries.filter((entry) => entry.playerKey !== playerKey));
  announce(`${playerName} restored to their original details.`);
}

async function loadChangeLog() {
  try {
    const customizations = await window.playerCustomizations.load();
    const response = await fetch('/api/player-customizations/catalog', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ customizations, settings: window.appSettings.get() }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to load your changes.');
    renderChanges(result.players.reverse());
  } catch (error) {
    elements.count.textContent = 'UNAVAILABLE';
    elements.resetAll.disabled = true;
    elements.list.setAttribute('aria-busy', 'false');
    elements.list.replaceChildren();
    const message = document.createElement('p');
    message.className = 'change-log-error';
    message.textContent = error.message || 'Unable to load your changes.';
    elements.list.append(message);
  }
}

function resetAllChanges() {
  const changes = { version: 1, updatedAt: null, order: [], players: {} };
  window.playerCustomizations.save(changes);
  renderChanges([]);
  elements.confirmDialog.close();
  announce('All player changes have been reset.');
}

elements.resetAll.addEventListener('click', () => elements.confirmDialog.showModal());
elements.cancelReset.addEventListener('click', () => elements.confirmDialog.close());
elements.confirmReset.addEventListener('click', resetAllChanges);
elements.confirmDialog.addEventListener('click', (event) => {
  if (event.target === elements.confirmDialog) elements.confirmDialog.close();
});

let lastUsePotentialSetting = window.appSettings.get().usePotential;
window.addEventListener('app-settings-change', (event) => {
  const usePotential = event.detail?.usePotential;
  if (usePotential === lastUsePotentialSetting) return;
  lastUsePotentialSetting = usePotential;
  loadChangeLog();
});

loadChangeLog();
