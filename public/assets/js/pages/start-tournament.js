const TOTAL_TEAMS = 36;
const STORAGE_KEY = 'ucl-simulator-tournament';
const DRAW_KEY = 'ucl-simulator-draw';
const LEAGUE_PHASE_KEY = 'ucl-simulator-league-phase';
const KNOCKOUT_KEY = 'ucl-simulator-knockout';
const TOTAL_FIXTURES = TOTAL_TEAMS * 4;
const placeholderBadge = '/images/clubs/placeholder.svg';
const elements = {
  groups: document.querySelector('#team-groups'),
  status: document.querySelector('#selection-status'),
  confirm: document.querySelector('#confirm-selection'),
  dialog: document.querySelector('#team-picker'),
  pickerFlag: document.querySelector('#picker-flag'),
  pickerLeagueName: document.querySelector('#picker-league-name'),
  pickerDescription: document.querySelector('#picker-description'),
  pickerSearch: document.querySelector('#picker-search'),
  pickerCount: document.querySelector('#picker-available-count'),
  pickerList: document.querySelector('#picker-list'),
};

let leagues = [];
let slots = [];
let activeSlotIndex = null;
let defaultTeamKeys = new Set();
let pickerScrollY = 0;

function lockPickerBackgroundScroll() {
  if (document.querySelector('dialog[open]')) return;
  pickerScrollY = window.scrollY;
  document.documentElement.classList.add('league-modal-open');
  document.body.classList.add('league-modal-open');
  document.body.style.top = `-${pickerScrollY}px`;
}

function releasePickerBackgroundScroll() {
  if (document.querySelector('dialog[open]')) return;
  document.documentElement.classList.remove('league-modal-open');
  document.body.classList.remove('league-modal-open');
  document.body.style.top = '';
  window.scrollTo(0, pickerScrollY);
}

function normalizeName(name) {
  return String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
}

function getTeamKey(team, leagueKey) {
  return `${leagueKey}:${normalizeName(team.name)}`;
}

function selectionSignature(teams) {
  return teams.map((team) => [getTeamKey(team, team.league_key), team.team_id ?? '', team.uefa_coefficient_rank ?? '', normalizeName(team.league)]
    .join('~')).sort().join('|');
}

function getSavedTournamentDestination() {
  let selection;
  let draw;
  let phase;
  let knockout;
  try {
    selection = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    draw = JSON.parse(window.localStorage.getItem(DRAW_KEY) || 'null');
    phase = JSON.parse(window.localStorage.getItem(LEAGUE_PHASE_KEY) || 'null');
    knockout = JSON.parse(window.localStorage.getItem(KNOCKOUT_KEY) || 'null');
  } catch {
    return null;
  }
  if (!Array.isArray(selection?.teams) || selection.teams.length !== TOTAL_TEAMS) return null;
  const hasMatchingDraw = Array.isArray(draw?.assignments) && draw.assignments.length === TOTAL_TEAMS
    && draw.signature === selectionSignature(selection.teams);
  if (!hasMatchingDraw || !Array.isArray(draw.revealedFixtures) || draw.revealedFixtures.length !== TOTAL_FIXTURES) return '/draw.html';
  const validPhase = phase?.signature && Array.isArray(phase.matchdays) && phase.matchdays.length === 8;
  const leagueComplete = validPhase && phase.matchdays.every((day) => day.fixtures?.every((fixture) => fixture.played));
  if (leagueComplete && knockout?.signature === phase.signature && Array.isArray(knockout.rounds?.playoff)) return '/knockout.html';
  return '/league-phase.html';
}

function getBadgeUrl(team) {
  return team.team_id === null || team.team_id === undefined
    ? placeholderBadge
    : `/images/clubs/${encodeURIComponent(team.team_id)}.png`;
}

function attachBadgeFallback(image) {
  image.addEventListener('error', () => {
    image.onerror = null;
    image.src = placeholderBadge;
  }, { once: true });
}

function flagUrl(league) {
  return `/images/flags/${league.flag}.svg`;
}

function renderLeagueGroups() {
  elements.groups.replaceChildren();
  const potsByTeamKey = getSelectedTeamPots();

  leagues.forEach((league) => {
    const leagueSlots = slots
      .map((slot, index) => ({ ...slot, index }))
      .filter((slot) => slot.leagueKey === league.key)
      .sort((first, second) => first.team.name.localeCompare(second.team.name, undefined, { sensitivity: 'base' }));
    if (!leagueSlots.length) return;

    const section = document.createElement('section');
    section.className = 'league-group';
    section.setAttribute('aria-labelledby', `league-title-${league.key}`);

    const heading = document.createElement('div');
    heading.className = 'league-heading';
    heading.innerHTML = `
      <div class="league-heading-title">
        <img class="league-flag" src="${flagUrl(league)}" alt="" aria-hidden="true">
        <h3 id="league-title-${league.key}">${league.name}</h3>
      </div>
      <span class="league-count">${leagueSlots.length} <span>CLUBS</span></span>
    `;

    const grid = document.createElement('div');
    grid.className = 'team-grid';
    leagueSlots.forEach((slot) => grid.append(renderTeamCard(slot, league, potsByTeamKey.get(getTeamKey(slot.team, slot.leagueKey)))));
    section.append(heading, grid);
    elements.groups.append(section);
  });
}

function renderTeamCard(slot, league, pot) {
  const button = document.createElement('button');
  button.type = 'button';
  const isChanged = !defaultTeamKeys.has(getTeamKey(slot.team, slot.leagueKey));
  button.className = isChanged ? 'team-card is-changed' : 'team-card';
  button.dataset.slotIndex = String(slot.index);
  button.setAttribute('aria-label', `Replace ${slot.team.name} in ${league.name}${isChanged ? ', changed' : ''}`);
  const potLabel = pot === null ? 'POTS RANDOM AT DRAW' : `POT ${pot || '—'}`;
  button.innerHTML = `
    <span class="team-card-topline">
      <span class="team-card-league"><img src="${flagUrl(league)}" alt="" aria-hidden="true">${league.name}</span>
      <span class="team-card-number">${String(slot.index + 1).padStart(2, '0')}</span>
    </span>
    <span class="team-card-main">
      <img class="team-crest" src="${getBadgeUrl(slot.team)}" alt="" loading="lazy">
      <span class="team-card-name">${slot.team.name}</span>
    </span>
    <span class="team-card-bottom"><span class="team-card-pot">${potLabel}</span><span class="team-card-change">CHANGE <span aria-hidden="true">↗</span></span></span>
  `;
  attachBadgeFallback(button.querySelector('.team-crest'));
  return button;
}

function getSelectedTeamPots() {
  if (!window.appSettings.get().coefficientSeeding) {
    return new Map(slots.map((slot) => [getTeamKey(slot.team, slot.leagueKey), null]));
  }
  const rankedSlots = [...slots].sort((first, second) => {
    const firstRank = Number(first.team.uefa_coefficient_rank) || Number.MAX_SAFE_INTEGER;
    const secondRank = Number(second.team.uefa_coefficient_rank) || Number.MAX_SAFE_INTEGER;
    return firstRank - secondRank || first.team.name.localeCompare(second.team.name, undefined, { sensitivity: 'base' });
  });
  return new Map(rankedSlots.map((slot, index) => [
    getTeamKey(slot.team, slot.leagueKey),
    Math.floor(index / 9) + 1,
  ]));
}

function renderPickerOptions() {
  if (activeSlotIndex === null) return;
  const slot = slots[activeSlotIndex];
  const league = leagues.find((item) => item.key === slot.leagueKey);
  if (!league) return;

  const query = normalizeName(elements.pickerSearch.value);
  const selectedKeys = new Set(slots.map((selectedSlot) => getTeamKey(selectedSlot.team, selectedSlot.leagueKey)));
  const options = [...league.teams]
    .sort((first, second) => first.name.localeCompare(second.name, undefined, { sensitivity: 'base' }))
    .filter((team) => normalizeName(team.name).includes(query));

  elements.pickerList.replaceChildren();
  elements.pickerCount.textContent = `${options.length} ${options.length === 1 ? 'CLUB' : 'CLUBS'}`;

  if (!options.length) {
    const emptyState = document.createElement('p');
    emptyState.className = 'picker-empty';
    emptyState.textContent = 'No clubs match your search.';
    elements.pickerList.append(emptyState);
    return;
  }

  options.forEach((team) => {
    const key = getTeamKey(team, league.key);
    const isCurrent = key === getTeamKey(slot.team, slot.leagueKey);
    const selectedElsewhere = selectedKeys.has(key) && !isCurrent;
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'picker-option';
    if (isCurrent) option.setAttribute('aria-current', 'true');
    option.disabled = selectedElsewhere;
    option.dataset.teamKey = key;
    option.innerHTML = `
      <img class="picker-crest" src="${getBadgeUrl(team)}" alt="" loading="lazy">
      <span class="picker-option-name">${team.name}</span>
      <span class="picker-option-state">${isCurrent ? 'CURRENT' : selectedElsewhere ? 'SELECTED' : 'SELECT'}</span>
    `;
    attachBadgeFallback(option.querySelector('.picker-crest'));
    option.addEventListener('click', () => {
      if (option.disabled || activeSlotIndex === null) return;
      slots[activeSlotIndex] = { leagueKey: league.key, team };
      elements.dialog.close();
      renderLeagueGroups();
      updateSelectionStatus();
    });
    elements.pickerList.append(option);
  });
}

function openPicker(slotIndex) {
  const slot = slots[slotIndex];
  if (!slot) return;
  const league = leagues.find((item) => item.key === slot.leagueKey);
  if (!league) return;

  activeSlotIndex = slotIndex;
  elements.pickerFlag.src = flagUrl(league);
  elements.pickerFlag.alt = '';
  elements.pickerLeagueName.textContent = league.name;
  elements.pickerDescription.textContent = `Replace ${slot.team.name} with another club from ${league.name}.`;
  elements.pickerSearch.value = '';
  renderPickerOptions();
  lockPickerBackgroundScroll();
  elements.dialog.showModal();
  window.requestAnimationFrame(() => elements.pickerSearch.focus());
}

function restoreSavedSelection() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || !Array.isArray(saved.teams) || saved.teams.length !== TOTAL_TEAMS) return null;

    const restored = saved.teams.map((savedTeam) => {
      const league = leagues.find((item) => item.key === savedTeam.league_key)
        || leagues.find((item) => item.key === savedTeam.league);
      const currentTeam = league?.teams.find((team) => getTeamKey(team, league.key) === getTeamKey(savedTeam, league.key));
      return currentTeam && league ? { leagueKey: league.key, team: currentTeam } : null;
    });
    if (restored.some((slot) => !slot)) return null;
    if (new Set(restored.map((slot) => getTeamKey(slot.team, slot.leagueKey))).size !== TOTAL_TEAMS) return null;
    return restored;
  } catch {
    return null;
  }
}

function updateSelectionStatus() {
  const selectedKeys = slots.map((slot) => getTeamKey(slot.team, slot.leagueKey));
  const hasDuplicates = new Set(selectedKeys).size !== selectedKeys.length;
  const complete = slots.length === TOTAL_TEAMS && !hasDuplicates;
  const selectedKeySet = new Set(selectedKeys);
  const changes = [...defaultTeamKeys].filter((key) => !selectedKeySet.has(key)).length;
  elements.status.textContent = `${changes} changes made`;
  elements.confirm.disabled = !complete;
}

function saveSelection() {
  if (slots.length !== TOTAL_TEAMS) return;
  const selectedKeys = slots.map((slot) => getTeamKey(slot.team, slot.leagueKey));
  if (new Set(selectedKeys).size !== TOTAL_TEAMS) return;

  const tournament = {
    season: '2026/27',
    teams: slots.map(({ team, leagueKey }) => ({ ...team, league_key: leagueKey })),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tournament));
    window.location.assign('/draw.html');
  } catch {
    elements.status.textContent = 'Unable to save selection';
  }
}

async function initialize() {
  const savedTournamentDestination = getSavedTournamentDestination();
  if (savedTournamentDestination) {
    window.location.replace(savedTournamentDestination);
    return;
  }

  try {
    const response = await fetch('/api/teams', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('The team list could not be loaded.');
    const data = await response.json();
    if (!Array.isArray(data.leagues)) throw new Error('The team list has an invalid format.');

    leagues = data.leagues;
    defaultTeamKeys = new Set(leagues.flatMap((league) => league.teams
      .filter((team) => team.ucl_default === true)
      .map((team) => getTeamKey(team, league.key))));
    const restored = restoreSavedSelection();
    slots = restored || leagues.flatMap((league) => league.teams
      .filter((team) => team.ucl_default === true)
      .map((team) => ({ leagueKey: league.key, team })));

    if (slots.length !== TOTAL_TEAMS) {
      throw new Error(`Expected ${TOTAL_TEAMS} clubs, but found ${slots.length}.`);
    }

    renderLeagueGroups();
    updateSelectionStatus();
  } catch (error) {
    elements.groups.innerHTML = `<div class="load-error"><strong>We couldn’t load the club list.</strong><span>${error.message}</span><button class="button button-secondary" type="button" onclick="window.location.reload()">Try again</button></div>`;
    elements.status.textContent = 'Club list unavailable';
    elements.confirm.disabled = true;
  }
}

elements.groups.addEventListener('click', (event) => {
  const card = event.target.closest('[data-slot-index]');
  if (card) openPicker(Number(card.dataset.slotIndex));
});
elements.pickerSearch.addEventListener('input', renderPickerOptions);
document.querySelector('#picker-close').addEventListener('click', () => elements.dialog.close());
elements.dialog.addEventListener('click', (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});
elements.dialog.addEventListener('close', () => {
  activeSlotIndex = null;
  releasePickerBackgroundScroll();
});
elements.confirm.addEventListener('click', saveSelection);
window.addEventListener('app-settings-change', () => {
  if (slots.length) renderLeagueGroups();
});
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (!elements.dialog.open) {
      const firstCard = elements.groups.querySelector('[data-slot-index]');
      if (firstCard) openPicker(Number(firstCard.dataset.slotIndex));
    }
    elements.pickerSearch.focus();
  }
});

initialize();
