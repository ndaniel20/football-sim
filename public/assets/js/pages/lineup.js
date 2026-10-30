const elements = {
  leagueTabs: document.querySelector('#league-tabs'),
  clubDropdown: document.querySelector('#club-dropdown'),
  clubSelectButton: document.querySelector('#club-select-button'),
  clubSelectCrest: document.querySelector('#club-select-crest'),
  clubSelectCurrent: document.querySelector('#club-select-current'),
  clubOptions: document.querySelector('#club-options'),
  clubName: document.querySelector('#selected-club-name'),
  clubCrest: document.querySelector('#lineup-club-crest'),
  formation: document.querySelector('#formation-pill'),
  pitch: document.querySelector('#lineup-pitch'),
  formationRows: document.querySelector('#formation-rows'),
  xiCount: document.querySelector('#xi-count'),
  bench: document.querySelector('#bench-grid'),
  benchCount: document.querySelector('#bench-count'),
  reserves: document.querySelector('#reserves-grid'),
  reservesCount: document.querySelector('#reserves-count'),
  editor: document.querySelector('#player-editor-dialog'),
  lineupMain: document.querySelector('.lineup-main'),
  editorForm: document.querySelector('#player-editor-form'),
  editorTitle: document.querySelector('#player-editor-title'),
  editorFace: document.querySelector('#editor-player-face'),
  editorClose: document.querySelector('#editor-close'),
  editorCancel: document.querySelector('#editor-cancel'),
  editorError: document.querySelector('#editor-error'),
  editorClubPicker: document.querySelector('#editor-club-picker'),
  editorSelectedCrest: document.querySelector('#editor-selected-crest'),
  editorSelectedName: document.querySelector('#editor-selected-name'),
  editorClubSearch: document.querySelector('#editor-club-search'),
  editorClubOptions: document.querySelector('#editor-club-options'),
  editorPrimaryTrigger: document.querySelector('#editor-primary-trigger'),
  editorPrimaryCurrent: document.querySelector('#editor-primary-current'),
  editorPrimaryOptions: document.querySelector('#editor-primary-options'),
  editorSecondaryPositions: document.querySelector('#editor-secondary-positions'),
  editorRatingStars: document.querySelector('#editor-rating-stars'),
  editorRatingMinus: document.querySelector('#editor-rating-minus'),
  editorRatingPlus: document.querySelector('#editor-rating-plus'),
  editorSave: document.querySelector('#editor-save'),
};

const formationRows = {
  '4-2-3-1': [['ST'], ['LM', 'CAM', 'RM'], ['LDM', 'RDM'], ['LB', 'LCB', 'RCB', 'RB'], ['GK']],
  '4-3-3': [['LW', 'ST', 'RW'], ['LCM', 'CDM', 'RCM'], ['LB', 'LCB', 'RCB', 'RB'], ['GK']],
  '4-4-2': [['LST', 'RST'], ['LM', 'LCM', 'RCM', 'RM'], ['LB', 'LCB', 'RCB', 'RB'], ['GK']],
  '3-4-3': [['LW', 'ST', 'RW'], ['LM', 'LCM', 'RCM', 'RM'], ['LCB', 'CB', 'RCB'], ['GK']],
  '3-5-2': [['LST', 'RST'], ['LM', 'LCM', 'CDM', 'RCM', 'RM'], ['LCB', 'CB', 'RCB'], ['GK']],
};
const starPath = 'M12 1.8 15.1 8l6.9 1-5 4.9 1.2 6.9L12 17.5l-6.2 3.3L7 13.9 2 9l6.9-1L12 1.8Z';
const placeholderBadge = '/images/clubs/placeholder.svg';
const positionCodes = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];
const positionNames = {
  GK: 'Goalkeeper', CB: 'Centre-back', LB: 'Left-back', RB: 'Right-back',
  CDM: 'Defensive midfielder', CM: 'Central midfielder', CAM: 'Attacking midfielder',
  LM: 'Left midfielder', RM: 'Right midfielder', LW: 'Left winger', RW: 'Right winger', ST: 'Striker',
};
let leagues = [];
let activeLeague = null;
let selectedTeam = null;
let requestVersion = 0;
let playerEditorDraft = null;

function sortTeams(first, second) {
  return first.name.localeCompare(second.name, undefined, { sensitivity: 'base' });
}

function setBadge(image, team) {
  image.src = team.team_id === null || team.team_id === undefined
    ? placeholderBadge
    : `/images/clubs/${encodeURIComponent(team.team_id)}.png`;
  image.alt = `${team.name} badge`;
  image.onerror = () => {
    image.onerror = null;
    image.src = placeholderBadge;
  };
}

function showMessage(message, isError = false) {
  elements.formationRows.replaceChildren();
  const notice = document.createElement('div');
  notice.className = `lineup-message${isError ? ' is-error' : ''}`;
  notice.textContent = message;
  elements.formationRows.append(notice);
  elements.bench.replaceChildren();
  elements.benchCount.textContent = '';
  elements.reserves.replaceChildren();
  elements.reservesCount.textContent = '';
}

function renderLeagueTabs() {
  elements.leagueTabs.replaceChildren();
  leagues.forEach((league) => {
    const button = document.createElement('button');
    button.className = `league-tab${league.key === activeLeague?.key ? ' is-active' : ''}`;
    button.type = 'button';
    button.id = `league-tab-${league.key}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(league.key === activeLeague?.key));
    button.setAttribute('aria-controls', 'club-options');
    button.addEventListener('click', () => selectLeague(league));

    const flag = document.createElement('img');
    flag.src = `/images/flags/${league.flag}.svg`;
    flag.alt = '';
    flag.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.textContent = league.name;
    button.append(flag, name);
    elements.leagueTabs.append(button);
  });
}

function selectLeague(league) {
  activeLeague = league;
  const teams = [...league.teams].sort(sortTeams);
  renderLeagueTabs();
  closeClubOptions();
  elements.clubOptions.replaceChildren();
  elements.clubSelectButton.disabled = teams.length === 0;
  if (!teams.length) {
    selectedTeam = null;
    elements.clubName.textContent = 'No clubs available';
    elements.clubSelectCurrent.textContent = 'No clubs available';
    elements.formation.textContent = '—';
    elements.clubCrest.src = placeholderBadge;
    elements.clubSelectCrest.src = placeholderBadge;
    showMessage('There are no clubs available in this league.');
    return;
  }
  selectTeam(teams[0]);
}

function selectTeam(team) {
  selectedTeam = team;
  elements.clubName.textContent = team.name;
  setBadge(elements.clubCrest, team);
  setBadge(elements.clubSelectCrest, team);
  elements.clubSelectCurrent.textContent = team.name;
  elements.formation.textContent = team.formation || '—';
  renderClubOptions();
  closeClubOptions();
  loadLineup(team);
}

function renderClubOptions() {
  elements.clubOptions.replaceChildren();
  const teams = [...(activeLeague?.teams || [])].sort(sortTeams);
  teams.forEach((team) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `club-option${team.name === selectedTeam?.name ? ' is-selected' : ''}`;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(team.name === selectedTeam?.name));
    option.dataset.teamName = team.name;
    const crest = document.createElement('img');
    crest.className = 'club-option-crest';
    crest.alt = '';
    setBadge(crest, team);
    const name = document.createElement('span');
    name.className = 'club-option-name';
    name.textContent = team.name;
    const indicator = document.createElement('span');
    indicator.className = 'club-option-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.textContent = team.name === selectedTeam?.name ? '✓' : '';
    option.append(crest, name, indicator);
    option.addEventListener('click', () => {
      selectTeam(team);
      elements.clubSelectButton.focus();
    });
    elements.clubOptions.append(option);
  });
}

function openClubOptions() {
  if (!activeLeague?.teams.length) return;
  elements.clubOptions.hidden = false;
  elements.clubSelectButton.setAttribute('aria-expanded', 'true');
  elements.clubOptions.querySelector('[aria-selected="true"]')?.focus();
}

function closeClubOptions(returnFocus = false) {
  elements.clubOptions.hidden = true;
  elements.clubSelectButton.setAttribute('aria-expanded', 'false');
  if (returnFocus) elements.clubSelectButton.focus();
}

function moveClubOptionFocus(key) {
  const options = [...elements.clubOptions.querySelectorAll('.club-option')];
  if (!options.length) return;
  const currentIndex = options.indexOf(document.activeElement);
  let nextIndex = currentIndex;
  if (key === 'ArrowDown') nextIndex = (currentIndex + 1 + options.length) % options.length;
  if (key === 'ArrowUp') nextIndex = (currentIndex - 1 + options.length) % options.length;
  if (key === 'Home') nextIndex = 0;
  if (key === 'End') nextIndex = options.length - 1;
  options[nextIndex]?.focus();
}

function createPlayerFace(player, className) {
  const label = String(player?.name || '?').trim();
  const fallback = () => {
    const face = document.createElement('span');
    face.className = `${className} is-fallback`;
    face.setAttribute('aria-hidden', 'true');
    face.textContent = initials(label);
    return face;
  };
  if (!player?.id) return fallback();

  const image = document.createElement('img');
  image.className = className;
  image.src = `https://cdn.futwiz.com/assets/img/fc27/faces/${encodeURIComponent(player.id)}.png?25`;
  image.alt = `${label} face`;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', () => image.replaceWith(fallback()), { once: true });
  return image;
}

function initials(name) {
  return String(name || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase() || '?';
}

function createStarDisplay(stars) {
  const wrapper = document.createElement('span');
  wrapper.className = 'player-rating-stars';
  wrapper.setAttribute('role', 'img');
  wrapper.setAttribute('aria-label', `${stars} out of 5 stars`);
  wrapper.title = `${stars} out of 5 stars`;

  for (let index = 0; index < 5; index += 1) {
    const fill = Math.max(0, Math.min(1, stars - index));
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.classList.add('rating-star', fill === 1 ? 'is-full' : fill === 0.5 ? 'is-half' : 'is-empty');
    const base = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    base.setAttribute('d', starPath);
    base.classList.add('rating-star-base');
    const foreground = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    foreground.setAttribute('d', starPath);
    foreground.classList.add('rating-star-fill');
    icon.append(base, foreground);
    wrapper.append(icon);
  }
  return wrapper;
}

function createStarRating(rating) {
  const stars = rating >= 88 ? 5 : rating >= 56 ? 1 + Math.floor((rating - 56) / 4) * 0.5 : 0.5;
  return createStarDisplay(stars);
}

function makePlayerEditable(card, player) {
  if (!player) return card;
  card.classList.add('is-editable');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Edit ${player.name}`);
  card.addEventListener('click', () => openPlayerEditor(player));
  card.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openPlayerEditor(player);
  });
  return card;
}

function createPlayerCard(entry) {
  const card = document.createElement('article');
  card.className = `lineup-player${entry.player ? '' : ' is-empty'}`;
  const role = document.createElement('span');
  role.className = 'player-position';
  role.textContent = entry.slot;
  card.append(role);
  if (!entry.player) {
    const empty = document.createElement('span');
    empty.className = 'lineup-player-name';
    empty.textContent = '—';
    card.append(empty);
    return card;
  }
  const avatar = createPlayerFace(entry.player, 'player-avatar');
  const name = document.createElement('strong');
  name.className = 'lineup-player-name';
  name.textContent = entry.player.name;
  card.append(avatar, name, createStarRating(entry.player.rating));
  return makePlayerEditable(card, entry.player);
}

function renderStartingXI(data) {
  const entries = new Map(data.lineup.map((entry) => [entry.slot, entry]));
  const rows = formationRows[data.team.formation];
  if (!rows) throw new Error(`Unsupported formation: ${data.team.formation}`);
  elements.formationRows.replaceChildren();
  let selectedCount = 0;

  rows.forEach((roles) => {
    const row = document.createElement('div');
    row.className = 'formation-row';
    roles.forEach((role) => {
      const entry = entries.get(role) || { slot: role, player: null };
      if (entry.player) selectedCount += 1;
      row.append(createPlayerCard(entry));
    });
    elements.formationRows.append(row);
  });
  elements.xiCount.textContent = `${selectedCount} / 11 players`;
}

function renderBench(bench) {
  elements.bench.replaceChildren();
  elements.benchCount.textContent = `${bench.length} / 9 players`;
  Array.from({ length: 9 }, (_, index) => bench[index] || null).forEach((entry, index) => {
    const card = document.createElement('article');
    card.className = `bench-player${entry ? '' : ' is-empty'}`;
    const number = document.createElement('span');
    number.className = 'bench-number';
    number.textContent = String(index + 1).padStart(2, '0');
    if (entry) card.append(number, createPlayerFace(entry.player, 'bench-player-face'));
    const copy = document.createElement('div');
    copy.className = 'bench-player-copy';
    const top = document.createElement('div');
    top.className = 'bench-player-top';
    const name = document.createElement('strong');
    name.className = 'bench-player-name';
    name.textContent = entry?.player.name || '—';
    const position = document.createElement('span');
    position.className = 'bench-player-position';
    position.textContent = entry?.slot || '';
    top.append(name, position);
    copy.append(top);
    if (entry) copy.append(createStarRating(entry.player.rating));
    if (!entry) card.append(number);
    card.append(copy);
    elements.bench.append(card);
    if (entry) makePlayerEditable(card, entry.player);
  });
}

function allEditorClubs() {
  return leagues.flatMap((league) => league.teams.map((team) => ({
    ...team,
    leagueName: league.name,
  }))).sort((first, second) => first.name.localeCompare(second.name, undefined, { sensitivity: 'base' })
    || first.leagueName.localeCompare(second.leagueName));
}

function selectedEditorClub() {
  return allEditorClubs().find((club) => club.customizationKey === playerEditorDraft?.clubKey);
}

function normalizeSearchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

function renderSelectedEditorClub() {
  const club = selectedEditorClub();
  elements.editorSelectedName.textContent = club?.name || 'Choose a club';
  if (club) setBadge(elements.editorSelectedCrest, club);
  else elements.editorSelectedCrest.src = placeholderBadge;
}

function closeEditorClubOptions() {
  elements.editorClubOptions.hidden = true;
  elements.editorClubSearch.setAttribute('aria-expanded', 'false');
}

function renderEditorClubOptions(query = '') {
  const normalizedQuery = normalizeSearchText(query.trim());
  const searchTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const clubs = allEditorClubs().filter((club) => {
    const searchable = normalizeSearchText(`${club.name} ${club.leagueName}`);
    return searchTokens.every((token) => searchable.includes(token));
  });
  elements.editorClubOptions.replaceChildren();
  if (!clubs.length) {
    const empty = document.createElement('p');
    empty.className = 'editor-club-empty';
    empty.textContent = 'No clubs match your search.';
    elements.editorClubOptions.append(empty);
  } else {
    clubs.forEach((club) => {
      const option = document.createElement('button');
      option.className = 'editor-club-option';
      option.type = 'button';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(club.customizationKey === playerEditorDraft.clubKey));
      const crest = document.createElement('img');
      crest.alt = '';
      setBadge(crest, club);
      const copy = document.createElement('span');
      copy.className = 'editor-club-option-copy';
      const name = document.createElement('strong');
      name.textContent = club.name;
      const league = document.createElement('small');
      league.textContent = club.leagueName;
      copy.append(name, league);
      option.append(crest, copy);
      option.addEventListener('click', () => {
        playerEditorDraft.clubKey = club.customizationKey;
        elements.editorClubSearch.value = '';
        elements.editorClubPicker.classList.remove('is-searching');
        closeEditorClubOptions();
        renderSelectedEditorClub();
      });
      elements.editorClubOptions.append(option);
    });
  }
  elements.editorClubOptions.hidden = false;
  elements.editorClubSearch.setAttribute('aria-expanded', 'true');
}

function closeEditorPositionOptions(returnFocus = false) {
  elements.editorPrimaryOptions.hidden = true;
  elements.editorPrimaryTrigger.setAttribute('aria-expanded', 'false');
  if (returnFocus) elements.editorPrimaryTrigger.focus();
}

function renderEditorPositions() {
  elements.editorPrimaryCurrent.replaceChildren();
  const currentCode = document.createElement('strong');
  currentCode.textContent = playerEditorDraft.position;
  const currentName = document.createElement('span');
  currentName.textContent = positionNames[playerEditorDraft.position] || playerEditorDraft.position;
  elements.editorPrimaryCurrent.append(currentCode, currentName);
  elements.editorPrimaryOptions.replaceChildren();
  positionCodes.forEach((position) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'editor-primary-option';
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(position === playerEditorDraft.position));
    const code = document.createElement('strong');
    code.textContent = position;
    const name = document.createElement('span');
    name.textContent = positionNames[position];
    option.append(code, name);
    option.addEventListener('click', () => {
      playerEditorDraft.position = position;
      playerEditorDraft.alternatePositions = playerEditorDraft.alternatePositions
        .filter((alternate) => alternate !== position);
      renderEditorPositions();
      closeEditorPositionOptions(true);
    });
    elements.editorPrimaryOptions.append(option);
  });
  elements.editorSecondaryPositions.replaceChildren();
  positionCodes.filter((position) => position !== playerEditorDraft.position).forEach((position) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'editor-position-option';
    option.textContent = position;
    const selected = playerEditorDraft.alternatePositions.includes(position);
    option.setAttribute('aria-pressed', String(selected));
    option.addEventListener('click', () => {
      const alternates = new Set(playerEditorDraft.alternatePositions);
      if (alternates.has(position)) alternates.delete(position);
      else alternates.add(position);
      playerEditorDraft.alternatePositions = [...alternates];
      option.setAttribute('aria-pressed', String(alternates.has(position)));
    });
    elements.editorSecondaryPositions.append(option);
  });
}

function renderEditorRating() {
  elements.editorRatingStars.replaceChildren(createStarDisplay(playerEditorDraft.ratingStars));
  elements.editorRatingMinus.disabled = playerEditorDraft.ratingStars <= 0.5;
  elements.editorRatingPlus.disabled = playerEditorDraft.ratingStars >= 5;
}

function openPlayerEditor(player) {
  if (!player?.playerKey || !leagues.length) return;
  playerEditorDraft = {
    playerKey: player.playerKey,
    clubKey: player.clubKey,
    position: player.position,
    alternatePositions: [...(player.alternatePositions || [])],
    ratingStars: player.rating >= 88 ? 5 : player.rating >= 56 ? 1 + Math.floor((player.rating - 56) / 4) * 0.5 : 0.5,
  };
  elements.editorTitle.textContent = player.name;
  elements.editorFace.replaceChildren(createPlayerFace(player, 'player-editor-face-image'));
  elements.editorClubSearch.value = '';
  elements.editorClubPicker.classList.remove('is-searching');
  elements.editorError.hidden = true;
  elements.editorError.textContent = '';
  closeEditorClubOptions();
  closeEditorPositionOptions();
  renderSelectedEditorClub();
  renderEditorPositions();
  renderEditorRating();
  elements.editor.showModal();
}

function renderReserves(reserves) {
  elements.reserves.replaceChildren();
  elements.reservesCount.textContent = `${reserves.length} players`;
  if (!reserves.length) {
    const empty = document.createElement('p');
    empty.className = 'reserve-empty';
    empty.textContent = 'No reserve players are available.';
    elements.reserves.append(empty);
    return;
  }

  reserves.forEach((player, index) => {
    const card = document.createElement('article');
    card.className = 'bench-player reserve-player';
    const number = document.createElement('span');
    number.className = 'bench-number';
    number.textContent = String(index + 1).padStart(2, '0');
    card.append(number, createPlayerFace(player, 'bench-player-face'));

    const copy = document.createElement('div');
    copy.className = 'bench-player-copy';
    const top = document.createElement('div');
    top.className = 'bench-player-top';
    const name = document.createElement('strong');
    name.className = 'bench-player-name';
    name.textContent = player.name;
    const position = document.createElement('span');
    position.className = 'bench-player-position';
    position.textContent = player.position;
    top.append(name, position);
    copy.append(top, createStarRating(player.rating));
    card.append(copy);
    elements.reserves.append(card);
    makePlayerEditable(card, player);
  });
}

async function loadLineup(team, { softRefresh = false } = {}) {
  const currentRequest = ++requestVersion;
  if (softRefresh) {
    elements.lineupMain.classList.add('is-refreshing');
    elements.lineupMain.setAttribute('aria-busy', 'true');
  } else {
    elements.lineupMain.classList.remove('is-refreshing');
    elements.lineupMain.removeAttribute('aria-busy');
    elements.formationRows.innerHTML = '<div class="pitch-loading"><span class="loading-spinner" aria-hidden="true"></span>Building the line-up…</div>';
    elements.bench.replaceChildren();
    elements.benchCount.textContent = '';
    elements.reserves.replaceChildren();
    elements.reservesCount.textContent = '';
  }
  try {
    const customizations = await window.playerCustomizations.load();
    const response = await fetch('/api/team-lineup', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        league: activeLeague.key,
        team: team.name,
        customizations,
        settings: window.appSettings.get(),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to load this club.');
    if (currentRequest !== requestVersion || selectedTeam?.name !== team.name) return;
    renderStartingXI(result);
    renderBench(result.bench);
    renderReserves(result.reserves || []);
  } catch (error) {
    if (currentRequest !== requestVersion) return;
    if (!softRefresh) showMessage(error.message || 'Unable to load this club’s line-up.', true);
  } finally {
    if (softRefresh && currentRequest === requestVersion) {
      elements.lineupMain.classList.remove('is-refreshing');
      elements.lineupMain.removeAttribute('aria-busy');
    }
  }
}

async function savePlayerEditor(event) {
  event.preventDefault();
  if (!playerEditorDraft) return;
  elements.editorError.hidden = true;
  elements.editorSave.disabled = true;
  elements.editorSave.textContent = 'Saving…';
  try {
    const customizations = await window.playerCustomizations.load();
    const response = await fetch('/api/player-customizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...playerEditorDraft,
        customizations,
        settings: window.appSettings.get(),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to save player changes.');
    window.playerCustomizations.save(result.customizations);
    elements.editor.close();
    playerEditorDraft = null;
    if (selectedTeam) await loadLineup(selectedTeam, { softRefresh: true });
  } catch (error) {
    elements.editorError.textContent = error.message || 'Unable to save player changes.';
    elements.editorError.hidden = false;
  } finally {
    elements.editorSave.disabled = false;
    elements.editorSave.textContent = 'Save changes';
  }
}

let lastUsePotentialSetting = window.appSettings.get().usePotential;
document.body.classList.toggle('uses-potential-ratings', lastUsePotentialSetting);
window.addEventListener('app-settings-change', (event) => {
  const usePotential = event.detail?.usePotential;
  if (usePotential === lastUsePotentialSetting) return;
  lastUsePotentialSetting = usePotential;
  document.body.classList.toggle('uses-potential-ratings', usePotential);
  if (selectedTeam) loadLineup(selectedTeam, { softRefresh: true });
});

async function initialize() {
  elements.editorClose.addEventListener('click', () => elements.editor.close());
  elements.editorCancel.addEventListener('click', () => elements.editor.close());
  elements.editorForm.addEventListener('submit', savePlayerEditor);
  elements.editorPrimaryTrigger.addEventListener('click', () => {
    const opening = elements.editorPrimaryOptions.hidden;
    if (opening) {
      elements.editorPrimaryOptions.hidden = false;
      elements.editorPrimaryTrigger.setAttribute('aria-expanded', 'true');
      elements.editorPrimaryOptions.querySelector('[aria-selected="true"]')?.focus();
    } else closeEditorPositionOptions();
  });
  elements.editorPrimaryTrigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      elements.editorPrimaryOptions.hidden = false;
      elements.editorPrimaryTrigger.setAttribute('aria-expanded', 'true');
      const options = [...elements.editorPrimaryOptions.querySelectorAll('.editor-primary-option')];
      (event.key === 'ArrowDown' ? options[0] : options.at(-1))?.focus();
    }
  });
  elements.editorPrimaryOptions.addEventListener('keydown', (event) => {
    const options = [...elements.editorPrimaryOptions.querySelectorAll('.editor-primary-option')];
    const index = options.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      closeEditorPositionOptions(true);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? options.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    }
  });
  elements.editorRatingMinus.addEventListener('click', () => {
    playerEditorDraft.ratingStars = Math.max(0.5, playerEditorDraft.ratingStars - 0.5);
    renderEditorRating();
  });
  elements.editorRatingPlus.addEventListener('click', () => {
    playerEditorDraft.ratingStars = Math.min(5, playerEditorDraft.ratingStars + 0.5);
    renderEditorRating();
  });
  elements.editorClubSearch.addEventListener('focus', () => {
    elements.editorClubPicker.classList.add('is-searching');
    elements.editorClubSearch.value = '';
    renderEditorClubOptions(elements.editorClubSearch.value);
  });
  elements.editorClubSearch.addEventListener('input', () => {
    elements.editorClubPicker.classList.add('is-searching');
    renderEditorClubOptions(elements.editorClubSearch.value);
  });
  elements.editorClubSearch.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeEditorClubOptions();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      elements.editorClubOptions.querySelector('.editor-club-option')?.focus();
    } else if (event.key === 'Enter' && !elements.editorClubOptions.hidden) {
      event.preventDefault();
      elements.editorClubOptions.querySelector('.editor-club-option')?.click();
    }
  });
  elements.editorClubSearch.addEventListener('blur', (event) => {
    if (event.relatedTarget && elements.editorClubPicker.contains(event.relatedTarget)) return;
    elements.editorClubPicker.classList.remove('is-searching');
    elements.editorClubSearch.value = '';
    closeEditorClubOptions();
  });
  elements.editorClubOptions.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeEditorClubOptions();
      elements.editorClubSearch.focus();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.editor-club-picker')) closeEditorClubOptions();
    if (!event.target.closest('.editor-position-picker')) closeEditorPositionOptions();
  });

  elements.clubSelectButton.addEventListener('click', () => {
    if (elements.clubOptions.hidden) openClubOptions();
    else closeClubOptions();
  });
  elements.clubSelectButton.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openClubOptions();
      moveClubOptionFocus(event.key);
    }
  });
  elements.clubOptions.addEventListener('keydown', (event) => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      moveClubOptionFocus(event.key);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeClubOptions(true);
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!elements.clubDropdown.contains(event.target)) closeClubOptions();
  });
  try {
    const response = await fetch('/api/teams');
    const result = await response.json();
    if (!response.ok || !Array.isArray(result.leagues)) throw new Error(result.error || 'Unable to load leagues.');
    leagues = result.leagues;
    if (!leagues.length) throw new Error('No leagues are available.');
    selectLeague(leagues[0]);
  } catch (error) {
    elements.leagueTabs.replaceChildren();
    showMessage(error.message || 'Unable to load league data.', true);
    elements.clubName.textContent = 'Unavailable';
  }
}

initialize();
