const DRAW_KEY = 'ucl-simulator-draw';
const LEAGUE_PHASE_KEY = 'ucl-simulator-league-phase';
const TEAM_COUNT = 36;
const MATCHDAY_COUNT = 8;
const placeholderBadge = '/images/clubs/placeholder.svg';

const elements = {
  loading: document.querySelector('#schedule-loading'),
  error: document.querySelector('#league-error'),
  errorMessage: document.querySelector('#league-error-message'),
  standings: document.querySelector('#standings-body'),
  leaders: document.querySelector('#leaders-grid'),
  fixtures: document.querySelector('#fixture-list'),
  matchdayLabel: document.querySelector('#matchday-label'),
  previous: document.querySelector('#matchday-previous'),
  next: document.querySelector('#matchday-next'),
  dockMatchdayLabel: document.querySelector('#dock-matchday-label'),
  dockPrevious: document.querySelector('#dock-matchday-previous'),
  dockNext: document.querySelector('#dock-matchday-next'),
  simulationStatus: document.querySelector('#simulation-status'),
  simulateSelected: document.querySelector('#simulate-selected'),
  simulateMatchday: document.querySelector('#simulate-matchday'),
  proceedKnockout: document.querySelector('#proceed-knockout'),
  matchModal: document.querySelector('#match-modal'),
  modalMatchday: document.querySelector('#match-modal-matchday'),
  modalTitle: document.querySelector('#match-modal-title'),
  modalClose: document.querySelector('#match-modal-close'),
  liveScoreboard: document.querySelector('#live-scoreboard'),
  liveMatchStats: document.querySelector('#live-match-stats'),
  matchTimeline: document.querySelector('#match-timeline'),
  skipToFullTime: document.querySelector('#skip-to-full-time'),
  matchModalFooter: document.querySelector('.match-modal-footer'),
  leaderModal: document.querySelector('#leader-modal'),
  leaderModalTitle: document.querySelector('#leader-modal-title'),
  leaderModalKicker: document.querySelector('#leader-modal-kicker'),
  leaderModalClose: document.querySelector('#leader-modal-close'),
  leaderModalList: document.querySelector('#leader-modal-list'),
};

let leaguePhase = null;
let selectedMatchday = 0;
let selectedFixtureId = null;
let batchSimulationRunning = false;
let animationRun = null;
let viewedFixtureId = null;
const activeFixtureIds = new Set();
let modalScrollY = 0;

function openDialog(dialog) {
  if (!dialog.open) {
    if (!document.querySelector('dialog[open]')) {
      modalScrollY = window.scrollY;
      document.documentElement.classList.add('league-modal-open');
      document.body.classList.add('league-modal-open');
      document.body.style.top = `-${modalScrollY}px`;
    }
    dialog.showModal();
  }
  if (dialog === elements.matchModal) {
    const resetScroll = () => {
      dialog.scrollTop = 0;
      dialog.querySelector('.match-modal-shell').scrollTop = 0;
      elements.matchTimeline.scrollTop = 0;
    };
    resetScroll();
    window.requestAnimationFrame(resetScroll);
  }
}

function releaseModalScrollLock() {
  if (document.querySelector('dialog[open]')) return;
  document.documentElement.classList.remove('league-modal-open');
  document.body.classList.remove('league-modal-open');
  document.body.style.top = '';
  window.scrollTo(0, modalScrollY);
}

function normalizeName(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
}

function clubKey(team) {
  return team.league_key
    ? `${team.league_key}:${normalizeName(team.name)}`
    : `${team.key || ''}:${normalizeName(team.name)}`;
}

function getBadgeUrl(team) {
  return team?.team_id === null || team?.team_id === undefined
    ? placeholderBadge
    : `/images/clubs/${encodeURIComponent(team.team_id)}.png`;
}

function getTournamentTeamByName(name) {
  const normalized = normalizeName(name);
  return leaguePhase?.teams?.find((team) => normalizeName(team.name) === normalized) || null;
}

function addBadgeFallback(image) {
  image.addEventListener('error', () => {
    image.onerror = null;
    image.src = placeholderBadge;
  }, { once: true });
}

function appendBadge(container, team, className) {
  const image = document.createElement('img');
  image.className = className;
  image.src = getBadgeUrl(team);
  image.alt = '';
  image.loading = 'lazy';
  addBadgeFallback(image);
  container.append(image);
}

function readDraw() {
  try {
    const draw = JSON.parse(window.localStorage.getItem(DRAW_KEY) || 'null');
    if (!draw || !Array.isArray(draw.assignments) || draw.assignments.length !== TEAM_COUNT) return null;
    if (!Array.isArray(draw.revealedFixtures) || draw.revealedFixtures.length !== TEAM_COUNT * 4) return null;
    return draw;
  } catch {
    return null;
  }
}

function readSavedLeaguePhase(signature) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(LEAGUE_PHASE_KEY) || 'null');
    if (saved?.signature !== signature || !Array.isArray(saved.matchdays) || saved.matchdays.length !== MATCHDAY_COUNT) return null;
    if (saved.matchdays.some((day) => !Array.isArray(day.fixtures) || day.fixtures.length !== TEAM_COUNT / 2)) return null;
    for (const day of saved.matchdays) {
      if (day.fixtures.every((fixture) => fixture.kickoff)) continue;
      for (let index = day.fixtures.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [day.fixtures[index], day.fixtures[randomIndex]] = [day.fixtures[randomIndex], day.fixtures[index]];
      }
      day.fixtures.forEach((fixture, index) => {
        fixture.kickoff = index < 2 ? '17:45' : '20:00';
      });
    }
    return saved;
  } catch {
    return null;
  }
}

function getDrawSignature(draw) {
  const fixtures = draw.assignments.flatMap((assignment) => assignment.opponents.map((opponent) => {
    const opponentKey = opponent.team?.key || opponent.key;
    return `${assignment.key}:${opponentKey}:${opponent.venue}`;
  })).sort();
  return `${draw.signature || ''}::${fixtures.join('|')}`;
}

function saveLeaguePhase() {
  window.localStorage.setItem(LEAGUE_PHASE_KEY, JSON.stringify(leaguePhase));
}

function buildStandings() {
  const standings = new Map(leaguePhase.teams.map((team) => [clubKey(team), {
    key: clubKey(team),
    team,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    form: [],
  }]));

  const completedFixtures = leaguePhase.matchdays.flatMap((day) => day.fixtures
    .filter((fixture) => fixture.played && Number.isFinite(fixture.homeGoals) && Number.isFinite(fixture.awayGoals))
    .map((fixture) => ({ ...fixture, matchday: day.matchday })));

  for (const fixture of completedFixtures) {
    const home = standings.get(fixture.home.key);
    const away = standings.get(fixture.away.key);
    if (!home || !away) continue;
    home.played += 1;
    away.played += 1;
    home.goalsFor += fixture.homeGoals;
    home.goalsAgainst += fixture.awayGoals;
    away.goalsFor += fixture.awayGoals;
    away.goalsAgainst += fixture.homeGoals;
    const matchResult = {
      matchday: fixture.matchday,
      homeTeamName: fixture.home.team.name,
      awayTeamName: fixture.away.team.name,
      homeGoals: fixture.homeGoals,
      awayGoals: fixture.awayGoals,
    };
    if (fixture.homeGoals > fixture.awayGoals) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
      home.form.push({ ...matchResult, result: 'W' });
      away.form.push({ ...matchResult, result: 'L' });
    } else if (fixture.homeGoals < fixture.awayGoals) {
      away.wins += 1;
      home.losses += 1;
      away.points += 3;
      home.form.push({ ...matchResult, result: 'L' });
      away.form.push({ ...matchResult, result: 'W' });
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
      home.form.push({ ...matchResult, result: 'D' });
      away.form.push({ ...matchResult, result: 'D' });
    }
  }

  for (const team of standings.values()) {
    team.goalDifference = team.goalsFor - team.goalsAgainst;
    team.form.sort((first, second) => first.matchday - second.matchday);
    team.form = team.form.slice(-5);
  }

  return [...standings.values()].sort((first, second) => second.points - first.points
    || second.goalDifference - first.goalDifference
    || second.goalsFor - first.goalsFor
    || second.wins - first.wins
    || first.team.name.localeCompare(second.team.name, undefined, { sensitivity: 'base' }));
}

function getMathematicalQualificationStatuses(standings) {
  const remainingMatches = new Map(standings.map((row) => [row.key, 0]));
  for (const day of leaguePhase.matchdays) {
    for (const fixture of day.fixtures) {
      if (fixture.played) continue;
      if (remainingMatches.has(fixture.home.key)) {
        remainingMatches.set(fixture.home.key, remainingMatches.get(fixture.home.key) + 1);
      }
      if (remainingMatches.has(fixture.away.key)) {
        remainingMatches.set(fixture.away.key, remainingMatches.get(fixture.away.key) + 1);
      }
    }
  }

  const possibilities = standings.map((row) => ({
    row,
    maximumPoints: row.points + remainingMatches.get(row.key) * 3,
  }));
  const currentOrder = new Map(standings.map((row, index) => [row.key, index]));
  const statuses = new Map();

  for (const possibility of possibilities) {
    const others = possibilities.filter((other) => other.row.key !== possibility.row.key);
    const teamsAlreadyAboveMaximum = others.filter((other) => {
      if (other.row.points > possibility.maximumPoints) return true;
      if (other.row.points < possibility.maximumPoints) return false;
      if (remainingMatches.get(other.row.key) > 0 || remainingMatches.get(possibility.row.key) > 0) return false;
      return currentOrder.get(other.row.key) < currentOrder.get(possibility.row.key);
    }).length;
    const teamsCouldFinishAbove = others.filter((other) => {
      if (other.maximumPoints > possibility.row.points) return true;
      if (other.maximumPoints < possibility.row.points) return false;
      if (remainingMatches.get(other.row.key) > 0) return true;
      return currentOrder.get(other.row.key) < currentOrder.get(possibility.row.key);
    }).length;

    if (teamsAlreadyAboveMaximum >= 24) statuses.set(possibility.row.key, 'eliminated');
    else if (teamsCouldFinishAbove < 8) statuses.set(possibility.row.key, 'top-eight');
    else if (teamsCouldFinishAbove < 24) statuses.set(possibility.row.key, 'playoff');
  }

  return statuses;
}

function createQualificationIndicator(status) {
  const indicators = {
    'top-eight': { symbol: '★', label: 'Mathematically confirmed top eight' },
    playoff: { symbol: '◆', label: 'Mathematically confirmed play-off place' },
    eliminated: { symbol: '×', label: 'Mathematically eliminated from qualification' },
  };
  const indicator = indicators[status];
  if (!indicator) return null;

  const badge = document.createElement('span');
  badge.className = `qualification-status is-${status}`;
  badge.textContent = indicator.symbol;
  badge.title = indicator.label;
  badge.setAttribute('aria-label', indicator.label);
  return badge;
}

let formResultTooltip = null;
let formResultTooltipTarget = null;

function hideFormResultTooltip() {
  if (!formResultTooltip) return;
  formResultTooltipTarget?.removeAttribute('aria-describedby');
  formResultTooltip.remove();
  formResultTooltip = null;
  formResultTooltipTarget = null;
}

function showFormResultTooltip(badge, result) {
  hideFormResultTooltip();
  const tooltip = document.createElement('div');
  tooltip.className = 'form-result-tooltip';
  tooltip.id = 'form-result-tooltip';
  tooltip.setAttribute('role', 'tooltip');

  const matchday = document.createElement('span');
  matchday.className = 'form-result-tooltip-matchday';
  matchday.textContent = `MATCHDAY ${result.matchday}`;
  const score = document.createElement('div');
  score.className = 'form-result-tooltip-score';
  const homeBadge = document.createElement('span');
  homeBadge.className = 'form-result-tooltip-club-badge';
  appendBadge(homeBadge, getTournamentTeamByName(result.homeTeamName), 'form-result-tooltip-badge');
  const homeName = document.createElement('span');
  homeName.className = 'form-result-tooltip-team';
  homeName.textContent = result.homeTeamName;
  const scoreValue = document.createElement('span');
  scoreValue.className = 'form-result-tooltip-score-value';
  scoreValue.textContent = `${result.homeGoals}–${result.awayGoals}`;
  const awayName = document.createElement('span');
  awayName.className = 'form-result-tooltip-team';
  awayName.textContent = result.awayTeamName;
  const awayBadge = document.createElement('span');
  awayBadge.className = 'form-result-tooltip-club-badge';
  appendBadge(awayBadge, getTournamentTeamByName(result.awayTeamName), 'form-result-tooltip-badge');
  score.append(homeBadge, homeName, scoreValue, awayName, awayBadge);
  tooltip.append(matchday, score);
  document.body.append(tooltip);
  formResultTooltip = tooltip;
  formResultTooltipTarget = badge;
  badge.setAttribute('aria-describedby', tooltip.id);

  const badgeRect = badge.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const edgePadding = 10;
  const left = Math.max(edgePadding, Math.min(
    window.innerWidth - tooltipRect.width - edgePadding,
    badgeRect.left + badgeRect.width / 2 - tooltipRect.width / 2,
  ));
  const above = badgeRect.top - tooltipRect.height - 8;
  tooltip.classList.toggle('is-below', above < edgePadding);
  const top = above >= edgePadding
    ? above
    : Math.min(window.innerHeight - tooltipRect.height - edgePadding, badgeRect.bottom + 8);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(edgePadding, top)}px`;
}

window.addEventListener('scroll', hideFormResultTooltip, true);
window.addEventListener('resize', hideFormResultTooltip);

function createForm(standings) {
  const form = document.createElement('div');
  form.className = 'form-list';
  if (!standings.form.length) {
    const empty = document.createElement('span');
    empty.className = 'form-empty';
    empty.textContent = '—';
    form.append(empty);
    return form;
  }

  for (const result of standings.form) {
    const badge = document.createElement('span');
    badge.className = `form-result is-${result.result.toLocaleLowerCase() === 'w' ? 'win' : result.result.toLocaleLowerCase() === 'd' ? 'draw' : 'loss'}`;
    badge.textContent = result.result;
    badge.tabIndex = 0;
    badge.setAttribute('aria-label', `Matchday ${result.matchday}: ${result.homeTeamName} ${result.homeGoals}–${result.awayGoals} ${result.awayTeamName}, ${result.result}`);
    badge.addEventListener('pointerenter', () => showFormResultTooltip(badge, result));
    badge.addEventListener('pointerleave', () => {
      if (document.activeElement !== badge) hideFormResultTooltip();
    });
    badge.addEventListener('focus', () => showFormResultTooltip(badge, result));
    badge.addEventListener('blur', hideFormResultTooltip);
    form.append(badge);
  }
  return form;
}

function renderStandings() {
  const standings = buildStandings();
  const qualificationStatuses = getMathematicalQualificationStatuses(standings);
  elements.standings.replaceChildren();

  standings.forEach((row, index) => {
    const position = index + 1;
    const tableRow = document.createElement('tr');
    const positionCell = document.createElement('td');
    positionCell.className = 'position-cell';
    const positionContent = document.createElement('span');
    positionContent.className = 'position-content';
    const marker = document.createElement('span');
    marker.className = `position-marker${position <= 8 ? ' is-top-eight' : position <= 24 ? ' is-playoff' : ''}`;
    marker.setAttribute('aria-hidden', 'true');
    const rank = document.createElement('span');
    rank.textContent = String(position).padStart(2, '0');
    positionContent.append(marker, rank);
    positionCell.append(positionContent);

    const clubCell = document.createElement('td');
    clubCell.className = 'club-cell';
    const clubContent = document.createElement('span');
    clubContent.className = 'club-content';
    appendBadge(clubContent, row.team, 'standings-crest');
    const clubName = document.createElement('span');
    clubName.className = 'club-name';
    clubName.textContent = row.team.name;
    clubContent.append(clubName);
    const qualificationIndicator = createQualificationIndicator(qualificationStatuses.get(row.key));
    if (qualificationIndicator) clubContent.append(qualificationIndicator);
    clubCell.append(clubContent);

    const values = [
      { value: row.played, className: 'stats-start' },
      { value: row.wins },
      { value: row.draws },
      { value: row.losses },
      { value: `${row.goalsFor}–${row.goalsAgainst}`, className: 'goals-cell' },
      { value: row.goalDifference > 0 ? `+${row.goalDifference}` : String(row.goalDifference) },
      { value: row.points, className: 'points-cell' },
    ];
    const cells = values.map(({ value, className = '' }) => {
      const cell = document.createElement('td');
      cell.className = className;
      cell.textContent = String(value);
      return cell;
    });
    const formCell = document.createElement('td');
    formCell.append(createForm(row));
    tableRow.append(positionCell, clubCell, ...cells, formCell);
    elements.standings.append(tableRow);
  });
}

function getPlayerLeaders() {
  return leaguePhase.playerLeaders || { scorers: [], assists: [], cleanSheets: [] };
}

function createPlayerFace(playerId, playerName, className = 'player-face') {
  const initials = String(playerName || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase();
  if (!playerId) {
    const fallback = document.createElement('span');
    fallback.className = `${className} is-fallback`;
    fallback.textContent = initials || '?';
    return fallback;
  }

  const image = document.createElement('img');
  image.className = className;
  image.src = `https://cdn.futwiz.com/assets/img/fc27/faces/${encodeURIComponent(playerId)}.png?25`;
  image.alt = `${playerName || 'Player'} face`;
  image.loading = 'lazy';
  image.addEventListener('error', () => {
    const fallback = document.createElement('span');
    fallback.className = `${className} is-fallback`;
    fallback.textContent = initials || '?';
    image.replaceWith(fallback);
  }, { once: true });
  return image;
}

function createLeaderRow(entry, index, statistic) {
  const row = document.createElement('div');
  row.className = 'leader-row';
  const rank = document.createElement('span');
  rank.className = 'leader-rank';
  rank.textContent = String(index + 1).padStart(2, '0');
  const face = createPlayerFace(entry.playerId, entry.playerName || entry.name || 'Unknown player', 'leader-face');
  const player = document.createElement('span');
  player.className = 'leader-player';
  player.append(document.createTextNode(entry.playerName || entry.name || 'Unknown player'));
  const teamName = entry.teamName || entry.clubName;
  if (teamName) {
    const club = document.createElement('small');
    club.className = 'leader-club';
    appendBadge(club, getTournamentTeamByName(teamName), 'leader-club-badge');
    const clubLabel = document.createElement('span');
    clubLabel.className = 'leader-club-name';
    clubLabel.textContent = teamName;
    club.append(clubLabel);
    player.append(club);
  }
  const value = document.createElement('span');
  value.className = 'leader-value';
  value.textContent = String(entry[statistic] || 0);
  row.append(rank, face, player, value);
  return row;
}

function openLeaderModal(key, title, unit) {
  const entries = [...(getPlayerLeaders()[key] || [])].sort((first, second) => (second[unit] || 0) - (first[unit] || 0)
    || String(first.playerName || first.name || '').localeCompare(String(second.playerName || second.name || '')));
  elements.leaderModalTitle.textContent = title;
  elements.leaderModalKicker.textContent = `ALL ${unit.toLocaleUpperCase()}`;
  elements.leaderModalList.replaceChildren();
  entries.forEach((entry, index) => elements.leaderModalList.append(createLeaderRow(entry, index, unit)));
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'leader-empty';
    empty.textContent = 'No player stats yet';
    elements.leaderModalList.append(empty);
  }
  openDialog(elements.leaderModal);
  const resetScroll = () => {
    elements.leaderModal.scrollTop = 0;
    elements.leaderModalList.scrollTop = 0;
  };
  resetScroll();
  window.requestAnimationFrame(resetScroll);
}

function renderLeaderCard({ key, title, statistic, unit }) {
  const entries = [...(getPlayerLeaders()[key] || [])].sort((first, second) => (second[statistic] || 0) - (first[statistic] || 0)
    || String(first.playerName || first.name || '').localeCompare(String(second.playerName || second.name || '')));
  const visibleEntries = entries.slice(0, 5);
  const card = document.createElement('article');
  card.className = 'leader-card';
  const heading = document.createElement('div');
  heading.className = 'leader-card-heading';
  const titleElement = document.createElement('h3');
  titleElement.textContent = title;
  const unitElement = document.createElement('span');
  unitElement.textContent = unit.toLocaleUpperCase();
  heading.append(titleElement, unitElement);
  card.append(heading);

  if (!visibleEntries.length) {
    const empty = document.createElement('div');
    empty.className = 'leader-empty';
    empty.textContent = 'No player stats yet';
    card.append(empty);
    return card;
  }

  const list = document.createElement('div');
  list.className = 'leader-list';
  visibleEntries.forEach((entry, index) => list.append(createLeaderRow(entry, index, statistic)));
  card.append(list);

  if (entries.length > 5) {
    const toggle = document.createElement('button');
    toggle.className = 'leader-toggle';
    toggle.type = 'button';
    toggle.textContent = `Show all ${entries.length}`;
    toggle.addEventListener('click', () => openLeaderModal(key, title, statistic));
    card.append(toggle);
  }
  return card;
}

function renderLeaders() {
  elements.leaders.replaceChildren(
    renderLeaderCard({ key: 'scorers', title: 'Top scorers', statistic: 'goals', unit: 'Goals' }),
    renderLeaderCard({ key: 'assists', title: 'Top assisters', statistic: 'assists', unit: 'Assists' }),
    renderLeaderCard({ key: 'cleanSheets', title: 'Most clean sheets', statistic: 'cleanSheets', unit: 'Clean sheets' }),
  );
}

function currentMatchdayIndex() {
  if (!leaguePhase) return 0;
  const index = leaguePhase.matchdays.findIndex((day) => day.fixtures.some((fixture) => !fixture.played));
  return index < 0 ? MATCHDAY_COUNT - 1 : index;
}

function updateMatchdayNavigation() {
  const day = leaguePhase?.matchdays[selectedMatchday];
  if (!day) return;
  const label = `MATCHDAY ${day.matchday} / ${MATCHDAY_COUNT}`;
  elements.matchdayLabel.textContent = label;
  elements.dockMatchdayLabel.textContent = label;
  [elements.previous, elements.dockPrevious].forEach((button) => {
    button.disabled = selectedMatchday === 0 || batchSimulationRunning;
  });
  [elements.next, elements.dockNext].forEach((button) => {
    button.disabled = selectedMatchday === MATCHDAY_COUNT - 1 || batchSimulationRunning;
  });
}

function getUnfinishedFixtures(day) {
  return day.fixtures.filter((fixture) => !fixture.played && fixture.status !== 'inProgress'
    && !activeFixtureIds.has(fixture.id));
}

function updateSimulationControls() {
  if (!leaguePhase) return;
  const day = leaguePhase.matchdays[selectedMatchday];
  const currentIndex = currentMatchdayIndex();
  const selected = day.fixtures.find((fixture) => fixture.id === selectedFixtureId);
  const isCurrentDay = selectedMatchday === currentIndex;
  const selectedCanRun = isCurrentDay && selected && !selected.played
    && selected.status !== 'inProgress' && !activeFixtureIds.has(selected.id)
    && activeFixtureIds.size === 0 && !batchSimulationRunning;
  const remaining = isCurrentDay ? getUnfinishedFixtures(day).length : 0;
  const allComplete = leaguePhase.matchdays.every((matchday) => matchday.fixtures.every((fixture) => fixture.played));
  elements.simulationStatus.classList.toggle('is-loading', batchSimulationRunning);
  elements.simulationStatus.setAttribute('aria-busy', String(batchSimulationRunning));
  elements.simulateSelected.disabled = !selectedCanRun || batchSimulationRunning;
  elements.simulateMatchday.disabled = remaining === 0 || batchSimulationRunning;
  elements.proceedKnockout.disabled = !allComplete;
  updateMatchdayNavigation();

  if (batchSimulationRunning) {
    elements.simulationStatus.textContent = `Simulating ${remaining} fixtures in Matchday ${day.matchday}…`;
  } else if (selectedCanRun) {
    elements.simulationStatus.textContent = `${selected.home.team.name} vs ${selected.away.team.name} selected.`;
  } else if (allComplete) {
    elements.simulationStatus.textContent = 'League phase complete — knockout stages unlocked.';
  } else if (!isCurrentDay) {
    elements.simulationStatus.textContent = `Matchday ${day.matchday} is not the active matchday.`;
  } else if (day.fixtures.some((fixture) => fixture.status === 'inProgress')) {
    elements.simulationStatus.textContent = 'A selected match is in progress; you can simulate the other fixtures.';
  } else {
    elements.simulationStatus.textContent = 'Select an unfinished fixture to simulate it.';
  }
}

function kickoffLabel(fixture, index) {
  const kickoff = fixture.kickoff || (index < 2 ? '17:45' : '20:00');
  return kickoff === '17:45' ? '5:45 PM' : '8:00 PM';
}

function createFixtureCard(fixture, index) {
  const canOpen = fixture.played || fixture.status === 'inProgress';
  const canSelect = !batchSimulationRunning && selectedMatchday === currentMatchdayIndex() && !fixture.played
    && fixture.status !== 'inProgress' && !activeFixtureIds.has(fixture.id);
  const card = document.createElement('button');
  card.className = `fixture-card${fixture.played ? ' is-played' : ''}${fixture.id === selectedFixtureId ? ' is-selected' : ''}${canSelect ? ' is-selectable' : ''}${canOpen ? ' is-reviewable' : ''}`;
  card.type = 'button';
  card.disabled = !canSelect && !canOpen;
  card.setAttribute('aria-pressed', String(fixture.id === selectedFixtureId));
  card.addEventListener('click', () => {
    if (canOpen) {
      openFixtureDetails(fixture, leaguePhase.matchdays[selectedMatchday]);
      return;
    }
    selectedFixtureId = fixture.id;
    renderMatchday();
  });

  const meta = document.createElement('span');
  meta.className = 'fixture-meta';
  const time = document.createElement('span');
  time.className = 'fixture-kickoff';
  time.textContent = kickoffLabel(fixture, index);
  const status = document.createElement('span');
  status.className = `fixture-state${fixture.status === 'inProgress' ? ' is-live' : fixture.played ? ' is-complete' : ''}`;
  status.textContent = fixture.status === 'inProgress' ? 'LIVE' : fixture.played ? 'FULL TIME' : 'LEAGUE PHASE';
  meta.append(time, status);

  const home = document.createElement('span');
  home.className = 'fixture-side is-home';
  appendBadge(home, fixture.home.team, 'fixture-crest');
  const homeName = document.createElement('span');
  homeName.textContent = fixture.home.team.name;
  home.append(homeName);

  const score = document.createElement('span');
  score.className = `fixture-score${fixture.played ? ' is-played' : ''}`;
  score.textContent = fixture.played ? `${fixture.homeGoals}–${fixture.awayGoals}` : fixture.status === 'inProgress' ? 'LIVE' : 'VS';

  const away = document.createElement('span');
  away.className = 'fixture-side is-away';
  appendBadge(away, fixture.away.team, 'fixture-crest');
  const awayName = document.createElement('span');
  awayName.textContent = fixture.away.team.name;
  away.append(awayName);

  card.append(meta, home, score, away);
  return card;
}

function renderMatchday() {
  if (!leaguePhase) return;
  const day = leaguePhase.matchdays[selectedMatchday];
  updateMatchdayNavigation();
  elements.fixtures.replaceChildren(...day.fixtures.map(createFixtureCard));
  updateSimulationControls();
}

function updatePlayerLeaders() {
  const scorers = new Map();
  const assists = new Map();
  const cleanSheets = new Map();
  for (const day of leaguePhase.matchdays) {
    for (const fixture of day.fixtures) {
      if (!fixture.played || !fixture.result) continue;
      for (const event of fixture.result.events || []) {
        if (event.type === 'substitution') continue;
        const team = event.teamIndex === 0 ? fixture.home.team.name : fixture.away.team.name;
        const scorerKey = `${team}:${event.scorerId || event.scorer}`;
        const scorer = scorers.get(scorerKey) || { playerId: event.scorerId, playerName: event.scorer, teamName: team, goals: 0 };
        scorer.goals += 1;
        scorers.set(scorerKey, scorer);
        if (event.assister) {
          const assistKey = `${team}:${event.assisterId || event.assister}`;
          const assister = assists.get(assistKey) || { playerId: event.assisterId, playerName: event.assister, teamName: team, assists: 0 };
          assister.assists += 1;
          assists.set(assistKey, assister);
        }
      }
      if (fixture.awayGoals === 0) {
        const playerName = fixture.result.homeGoalkeeper || 'Unknown goalkeeper';
        const playerId = fixture.result.homeGoalkeeperId;
        const key = `${fixture.home.team.name}:${playerId || playerName}`;
        const entry = cleanSheets.get(key) || { playerId, playerName, teamName: fixture.home.team.name, cleanSheets: 0 };
        entry.cleanSheets += 1;
        cleanSheets.set(key, entry);
      }
      if (fixture.homeGoals === 0) {
        const playerName = fixture.result.awayGoalkeeper || 'Unknown goalkeeper';
        const playerId = fixture.result.awayGoalkeeperId;
        const key = `${fixture.away.team.name}:${playerId || playerName}`;
        const entry = cleanSheets.get(key) || { playerId, playerName, teamName: fixture.away.team.name, cleanSheets: 0 };
        entry.cleanSheets += 1;
        cleanSheets.set(key, entry);
      }
    }
  }
  leaguePhase.playerLeaders = {
    scorers: [...scorers.values()],
    assists: [...assists.values()],
    cleanSheets: [...cleanSheets.values()],
  };
}

function renderLiveStats(fixture, stats = {}) {
  const homeXG = Number(stats.homeXG || 0);
  const awayXG = Number(stats.awayXG || 0);
  const homePossession = Number(stats.homePossession ?? 50);
  const awayPossession = Number(stats.awayPossession ?? 50);
  elements.liveMatchStats.replaceChildren();

  const expectedGoals = document.createElement('div');
  expectedGoals.className = 'match-stat-block';
  const expectedLabel = document.createElement('span');
  expectedLabel.className = 'match-stat-label';
  expectedLabel.textContent = 'EXPECTED GOALS';
  const expectedValues = document.createElement('div');
  expectedValues.className = 'match-stat-values';
  const homeExpected = document.createElement('div');
  homeExpected.className = 'stat-value-chip';
  const homeExpectedValue = document.createElement('strong');
  homeExpectedValue.textContent = homeXG.toFixed(2);
  homeExpected.append(homeExpectedValue);
  const expectedTitle = document.createElement('span');
  expectedTitle.textContent = 'xG';
  const awayExpected = document.createElement('div');
  awayExpected.className = 'stat-value-chip';
  const awayExpectedValue = document.createElement('strong');
  awayExpectedValue.textContent = awayXG.toFixed(2);
  awayExpected.append(awayExpectedValue);
  expectedValues.append(homeExpected, expectedTitle, awayExpected);
  expectedGoals.append(expectedLabel, expectedValues);

  const possession = document.createElement('div');
  possession.className = 'match-stat-block';
  const possessionLabel = document.createElement('span');
  possessionLabel.className = 'match-stat-label';
  possessionLabel.textContent = 'POSSESSION';
  const possessionValues = document.createElement('div');
  possessionValues.className = 'match-stat-values';
  const homePossessionValue = document.createElement('div');
  homePossessionValue.className = 'stat-value-chip';
  const homePossessionText = document.createElement('strong');
  homePossessionText.textContent = `${Math.round(homePossession)}%`;
  homePossessionValue.append(homePossessionText);
  const possessionTitle = document.createElement('span');
  possessionTitle.textContent = 'BALL';
  const awayPossessionValue = document.createElement('div');
  awayPossessionValue.className = 'stat-value-chip';
  const awayPossessionText = document.createElement('strong');
  awayPossessionText.textContent = `${Math.round(awayPossession)}%`;
  awayPossessionValue.append(awayPossessionText);
  possessionValues.append(homePossessionValue, possessionTitle, awayPossessionValue);
  const possessionBar = document.createElement('div');
  possessionBar.className = 'possession-bar';
  const homeBar = document.createElement('span');
  homeBar.style.width = `${Math.max(0, Math.min(100, homePossession))}%`;
  const awayBar = document.createElement('span');
  awayBar.style.width = `${Math.max(0, Math.min(100, awayPossession))}%`;
  possessionBar.append(homeBar, awayBar);
  possession.append(possessionLabel, possessionValues, possessionBar);
  elements.liveMatchStats.append(expectedGoals, possession);
}

function addKickoffEntry(fixture) {
  const row = document.createElement('div');
  row.className = 'timeline-note';
  row.innerHTML = '<span class="timeline-note-dot" aria-hidden="true"></span><span>Kick-off</span>';
  elements.matchTimeline.append(row);
}

function addGoalEntry(fixture, event, newestFirst = true) {
  const team = event.teamIndex === 0 ? fixture.home.team.name : fixture.away.team.name;
  const row = document.createElement('article');
  row.className = 'timeline-goal';
  const minute = document.createElement('span');
  minute.className = `timeline-minute ${event.teamIndex === 0 ? 'is-home' : 'is-away'}`;
  minute.textContent = `${event.minute}′`;
  const scorerFace = createPlayerFace(event.scorerId, event.scorer, 'event-face');
  const details = document.createElement('div');
  details.className = 'goal-details';
  const scorer = document.createElement('strong');
  scorer.className = 'goal-scorer';
  scorer.textContent = event.scorer;
  const goalTag = document.createElement('span');
  goalTag.className = 'goal-tag';
  goalTag.textContent = 'GOAL';
  const club = document.createElement('small');
  club.textContent = team;
  details.append(goalTag, scorer, club);
  row.append(minute, scorerFace, details);
  if (event.assister) {
    const assist = document.createElement('div');
    assist.className = 'goal-assist';
    assist.append(createPlayerFace(event.assisterId, event.assister, 'assist-face'));
    const assistCopy = document.createElement('span');
    assistCopy.innerHTML = '<small>ASSIST</small>';
    const assister = document.createElement('strong');
    assister.textContent = event.assister;
    assistCopy.append(assister);
    assist.append(assistCopy);
    row.append(assist);
  }
  if (newestFirst) elements.matchTimeline.prepend(row);
  else elements.matchTimeline.append(row);
}

function createWhistleIcon() {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M4 9h10.5a5.5 5.5 0 1 1-5.3 7H8a4 4 0 0 1-4-4V9Zm10.5 0V6h3m-1-2h5m-2-2 2 2-2 2');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  icon.append(path);
  return icon;
}

function addMatchPeriodEntry(fixture, label, homeGoals, awayGoals, newestFirst = true) {
  const row = document.createElement('div');
  row.className = `timeline-period${label === 'HALF-TIME' ? ' is-halftime' : ' is-fulltime'}`;
  row.append(createWhistleIcon());
  const title = document.createElement('strong');
  title.textContent = label;
  const score = document.createElement('span');
  score.className = 'period-score';
  score.textContent = `${fixture.home.team.name}  ${homeGoals}–${awayGoals}  ${fixture.away.team.name}`;
  row.append(title, score);
  if (newestFirst) elements.matchTimeline.prepend(row);
  else elements.matchTimeline.append(row);
}

function addHalfTimeEntry(fixture, homeGoals, awayGoals, newestFirst = true) {
  addMatchPeriodEntry(fixture, 'HALF-TIME', homeGoals, awayGoals, newestFirst);
}

function addFullTimeEntry(fixture, homeGoals, awayGoals) {
  addMatchPeriodEntry(fixture, 'FULL-TIME', homeGoals, awayGoals, true);
}

function renderFixtureTimeline(fixture, events, { halftimeReached = true, fullTime = false, homeGoals = 0, awayGoals = 0 } = {}) {
  elements.matchTimeline.replaceChildren();
  addKickoffEntry(fixture);
  const orderedEvents = [...events].sort((first, second) => first.minute - second.minute);
  const halftimeEvents = orderedEvents.filter((event) => event.type !== 'substitution' && event.minute <= 45);
  const halftimeHomeGoals = halftimeEvents.filter((event) => event.teamIndex === 0).length;
  const halftimeAwayGoals = halftimeEvents.filter((event) => event.teamIndex === 1).length;
  let halftimeAdded = false;

  for (const event of orderedEvents) {
    if (!halftimeAdded && halftimeReached && event.minute > 45) {
      addHalfTimeEntry(fixture, halftimeHomeGoals, halftimeAwayGoals);
      halftimeAdded = true;
    }
    if (event.type !== 'substitution') addGoalEntry(fixture, event);
  }
  if (halftimeReached && !halftimeAdded) addHalfTimeEntry(fixture, halftimeHomeGoals, halftimeAwayGoals);
  if (fullTime) addFullTimeEntry(fixture, homeGoals, awayGoals);
  elements.matchTimeline.scrollTop = 0;
}

function renderScoreboard(fixture, homeGoals, awayGoals, minute) {
  elements.liveScoreboard.replaceChildren();
  const home = document.createElement('div');
  home.className = 'scoreboard-team';
  appendBadge(home, fixture.home.team, '');
  const homeName = document.createElement('span');
  homeName.textContent = fixture.home.team.name;
  home.append(homeName);
  const away = document.createElement('div');
  away.className = 'scoreboard-team';
  appendBadge(away, fixture.away.team, '');
  const awayName = document.createElement('span');
  awayName.textContent = fixture.away.team.name;
  away.append(awayName);
  const center = document.createElement('div');
  center.className = 'scoreboard-center';
  const score = document.createElement('strong');
  score.className = 'scoreboard-score';
  score.textContent = `${homeGoals}–${awayGoals}`;
  const clock = document.createElement('span');
  clock.className = 'scoreboard-clock';
  clock.textContent = minute >= 90 ? 'FULL TIME' : minute === 45 ? 'HALF-TIME' : minute > 45 ? `${minute}′ · SECOND HALF` : `${minute}′ · FIRST HALF`;
  center.append(score, clock);
  elements.liveScoreboard.append(home, center, away);
}

function getSnapshot(result, minute) {
  if (minute <= 0) return { homeXG: 0, awayXG: 0, homePossession: 50, awayPossession: 50 };
  return result.minuteStats?.[Math.max(0, Math.min(minute - 1, result.minuteStats.length - 1))]
    || {
      homeXG: result.homeStats.xG,
      awayXG: result.awayStats.xG,
      homePossession: result.homeStats.possessions / result.possessions * 100,
      awayPossession: result.awayStats.possessions / result.possessions * 100,
    };
}

function renderFixtureReview(fixture, day, result) {
  elements.modalMatchday.textContent = `MATCHDAY ${day.matchday} · ${kickoffLabel(fixture, day.fixtures.indexOf(fixture))}`;
  elements.modalTitle.textContent = `${fixture.home.team.name} vs ${fixture.away.team.name}`;
  renderFixtureTimeline(fixture, result.events || [], {
    fullTime: true,
    homeGoals: result.homeGoals,
    awayGoals: result.awayGoals,
  });
  renderScoreboard(fixture, result.homeGoals, result.awayGoals, 90);
  renderLiveStats(fixture, getSnapshot(result, 90));
  elements.skipToFullTime.disabled = true;
  elements.matchModalFooter.hidden = true;
  viewedFixtureId = fixture.id;
  openDialog(elements.matchModal);
}

function openFixtureDetails(fixture, day) {
  if (fixture.result) {
    const running = animationRun?.fixtureId === fixture.id ? animationRun : null;
    if (running && !fixture.played) {
      viewedFixtureId = fixture.id;
      elements.modalMatchday.textContent = `MATCHDAY ${day.matchday} · ${kickoffLabel(fixture, day.fixtures.indexOf(fixture))}`;
      elements.modalTitle.textContent = `${fixture.home.team.name} vs ${fixture.away.team.name}`;
      renderFixtureTimeline(fixture, running.events.filter((event) => event.minute <= running.minute), {
        halftimeReached: running.minute >= 45,
      });
      renderScoreboard(fixture, running.homeGoals, running.awayGoals, running.minute);
      renderLiveStats(fixture, getSnapshot(fixture.result, running.minute));
      elements.matchModalFooter.hidden = false;
      elements.skipToFullTime.disabled = false;
      openDialog(elements.matchModal);
      return;
    }
    renderFixtureReview(fixture, day, fixture.result);
    return;
  }

  viewedFixtureId = fixture.id;
  elements.modalMatchday.textContent = `MATCHDAY ${day.matchday}`;
  elements.modalTitle.textContent = `${fixture.home.team.name} vs ${fixture.away.team.name}`;
  elements.matchTimeline.replaceChildren();
  renderScoreboard(fixture, 0, 0, 0);
  renderLiveStats(fixture, {});
  elements.matchModalFooter.hidden = true;
  openDialog(elements.matchModal);
}

function finishFixture(fixture, result) {
  fixture.homeGoals = result.homeGoals;
  fixture.awayGoals = result.awayGoals;
  fixture.result = result;
  fixture.played = true;
  fixture.status = 'completed';
  activeFixtureIds.delete(fixture.id);
  if (!batchSimulationRunning) {
    const completedDayIndex = leaguePhase.matchdays.findIndex((day) =>
      day.fixtures.some((entry) => entry.id === fixture.id));
    const completedDay = leaguePhase.matchdays[completedDayIndex];
    if (completedDayIndex === selectedMatchday && completedDay && dayIsComplete(completedDay)
      && completedDayIndex < MATCHDAY_COUNT - 1) {
      selectedMatchday = completedDayIndex + 1;
      selectedFixtureId = null;
    }
  }
  saveLeaguePhase();
  updatePlayerLeaders();
  renderStandings();
  renderLeaders();
  renderMatchday();
}

function dayIsComplete(day) {
  return day.fixtures.every((fixture) => fixture.played);
}

function startMatchAnimation(fixture, result) {
  const events = [...(result.events || [])].sort((first, second) => first.minute - second.minute);
  const run = { fixtureId: fixture.id, fixture, result, events, minute: 0, homeGoals: 0, awayGoals: 0, eventIndex: 0, timer: null };
  if (viewedFixtureId === fixture.id) {
    elements.matchTimeline.replaceChildren();
    addKickoffEntry(fixture);
    renderScoreboard(fixture, 0, 0, 0);
    renderLiveStats(fixture, getSnapshot(result, 0));
    elements.matchModalFooter.hidden = false;
  }
  elements.skipToFullTime.disabled = false;
  run.advance = () => {
    run.minute += 1;
    while (run.eventIndex < events.length && events[run.eventIndex].minute <= run.minute) {
      const event = events[run.eventIndex];
      if (event.type !== 'substitution') {
        if (event.teamIndex === 0) run.homeGoals += 1;
        else run.awayGoals += 1;
        if (viewedFixtureId === fixture.id) addGoalEntry(fixture, event);
      }
      run.eventIndex += 1;
    }
    if (run.minute === 45 && viewedFixtureId === fixture.id) addHalfTimeEntry(fixture, run.homeGoals, run.awayGoals);
    if (viewedFixtureId === fixture.id) {
      renderScoreboard(fixture, run.homeGoals, run.awayGoals, run.minute);
      renderLiveStats(fixture, getSnapshot(result, run.minute));
    }
    if (run.minute >= 90) {
      if (viewedFixtureId === fixture.id) addFullTimeEntry(fixture, run.homeGoals, run.awayGoals);
      elements.skipToFullTime.disabled = true;
      if (viewedFixtureId === fixture.id) elements.matchModalFooter.hidden = true;
      window.clearInterval(run.timer);
      animationRun = null;
      finishFixture(fixture, result);
    }
  };

  animationRun = run;
  run.timer = window.setInterval(run.advance, window.appSettings.interval(180));
}

function finishAnimationImmediately() {
  if (!animationRun) return;
  window.clearInterval(animationRun.timer);
  while (animationRun) animationRun.advance();
}

async function requestSimulation(fixtures) {
  const customizations = await window.playerCustomizations.load();
  const response = await fetch('/api/simulate-matches', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customizations,
      settings: window.appSettings.get(),
      matches: fixtures.map((fixture) => ({
        id: fixture.id,
        homeTeamName: fixture.home.team.name,
        awayTeamName: fixture.away.team.name,
      })),
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'The match simulation failed.');
  return payload.results;
}

window.addEventListener('app-settings-change', () => {
  if (!animationRun?.timer) return;
  window.clearInterval(animationRun.timer);
  animationRun.timer = window.setInterval(animationRun.advance, window.appSettings.interval(180));
});

async function simulateSelectedFixture() {
  const day = leaguePhase.matchdays[selectedMatchday];
  const fixture = day.fixtures.find((entry) => entry.id === selectedFixtureId);
  if (!fixture || selectedMatchday !== currentMatchdayIndex() || fixture.played
    || activeFixtureIds.size > 0 || batchSimulationRunning || activeFixtureIds.has(fixture.id)) return;
  selectedFixtureId = null;
  fixture.status = 'inProgress';
  activeFixtureIds.add(fixture.id);
  viewedFixtureId = fixture.id;
  elements.modalMatchday.textContent = `MATCHDAY ${day.matchday} · ${kickoffLabel(fixture, day.fixtures.indexOf(fixture))}`;
  elements.modalTitle.textContent = `${fixture.home.team.name} vs ${fixture.away.team.name}`;
  elements.matchTimeline.replaceChildren();
  elements.skipToFullTime.disabled = true;
  renderScoreboard(fixture, 0, 0, 0);
  renderLiveStats(fixture, getSnapshot({ minuteStats: [] }, 0));
  elements.matchModalFooter.hidden = false;
  openDialog(elements.matchModal);
  saveLeaguePhase();
  renderMatchday();

  try {
    const [result] = await requestSimulation([fixture]);
    fixture.result = result;
    saveLeaguePhase();
    startMatchAnimation(fixture, result);
  } catch (error) {
    fixture.status = undefined;
    activeFixtureIds.delete(fixture.id);
    saveLeaguePhase();
    elements.matchModalFooter.hidden = true;
    elements.simulationStatus.textContent = error.message;
    renderMatchday();
  }
}

async function simulateCurrentMatchday() {
  const day = leaguePhase.matchdays[selectedMatchday];
  if (selectedMatchday !== currentMatchdayIndex() || batchSimulationRunning) return;
  const fixtures = getUnfinishedFixtures(day);
  if (!fixtures.length) return;
  batchSimulationRunning = true;
  selectedFixtureId = null;
  renderMatchday();
  try {
    const results = await requestSimulation(fixtures);
    const resultsById = new Map(results.map((result) => [result.id, result]));
    for (const fixture of fixtures) {
      const result = resultsById.get(fixture.id);
      if (result) finishFixture(fixture, result);
    }
  } catch (error) {
    elements.simulationStatus.textContent = error.message;
  } finally {
    batchSimulationRunning = false;
    selectedMatchday = currentMatchdayIndex();
    selectedFixtureId = null;
    renderMatchday();
  }
}

function recoverSavedSimulations() {
  for (const day of leaguePhase.matchdays) {
    for (const fixture of day.fixtures) {
      if (fixture.status !== 'inProgress') continue;
      if (fixture.result) {
        fixture.homeGoals = fixture.result.homeGoals;
        fixture.awayGoals = fixture.result.awayGoals;
        fixture.played = true;
        fixture.status = 'completed';
      } else {
        fixture.status = undefined;
      }
    }
  }
  updatePlayerLeaders();
  saveLeaguePhase();
}

async function initialize() {
  const draw = readDraw();
  if (!draw) {
    window.location.replace('/draw.html');
    return;
  }

  const signature = getDrawSignature(draw);
  const saved = readSavedLeaguePhase(signature);
  if (saved) {
    leaguePhase = saved;
    recoverSavedSimulations();
    selectedMatchday = currentMatchdayIndex();
    elements.loading.hidden = true;
    renderStandings();
    renderLeaders();
    renderMatchday();
    return;
  }

  try {
    const response = await fetch('/api/league-fixtures', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments: draw.assignments }),
    });
    const schedule = await response.json();
    if (!response.ok) throw new Error(schedule.error || 'Could not generate league fixtures.');
    if (!Array.isArray(schedule.matchdays) || schedule.matchdays.length !== MATCHDAY_COUNT) {
      throw new Error('The generated schedule is incomplete.');
    }

    leaguePhase = {
      signature,
      teams: draw.assignments.map((assignment) => assignment.team),
      matchdays: schedule.matchdays,
      repeatedVenueTransitions: schedule.repeatedVenueTransitions,
      playerLeaders: { scorers: [], assists: [], cleanSheets: [] },
    };
    selectedMatchday = currentMatchdayIndex();
    saveLeaguePhase();
    elements.loading.hidden = true;
    renderStandings();
    renderLeaders();
    renderMatchday();
  } catch (error) {
    elements.loading.hidden = true;
    elements.errorMessage.textContent = error.message;
    elements.error.hidden = false;
    elements.fixtures.replaceChildren();
    elements.standings.replaceChildren();
  }
}

function navigateMatchday(delta) {
  const nextMatchday = selectedMatchday + delta;
  if (nextMatchday < 0 || nextMatchday >= MATCHDAY_COUNT || batchSimulationRunning) return;
  selectedMatchday = nextMatchday;
  selectedFixtureId = null;
  renderMatchday();
}
[elements.previous, elements.dockPrevious].forEach((button) => {
  button.addEventListener('click', () => navigateMatchday(-1));
});
[elements.next, elements.dockNext].forEach((button) => {
  button.addEventListener('click', () => navigateMatchday(1));
});
elements.simulateSelected.addEventListener('click', simulateSelectedFixture);
elements.simulateMatchday.addEventListener('click', simulateCurrentMatchday);
elements.proceedKnockout.addEventListener('click', () => {
  if (leaguePhase?.matchdays.every((day) => day.fixtures.every((fixture) => fixture.played))) {
    window.location.assign('/knockout.html');
  }
});
elements.modalClose.addEventListener('click', () => elements.matchModal.close());
elements.skipToFullTime.addEventListener('click', finishAnimationImmediately);
elements.leaderModalClose.addEventListener('click', () => elements.leaderModal.close());
[elements.matchModal, elements.leaderModal].forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', releaseModalScrollLock);
});

initialize();
