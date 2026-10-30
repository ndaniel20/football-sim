const SELECTION_KEY = 'ucl-simulator-tournament';
const DRAW_KEY = 'ucl-simulator-draw';
const TEAM_COUNT = 36;
const OPPONENTS_PER_TEAM = 8;
const TOTAL_FIXTURES = TEAM_COUNT * OPPONENTS_PER_TEAM / 2;
const placeholderBadge = '/images/clubs/placeholder.svg';

const elements = {
  pots: document.querySelector('#pots-grid'),
  results: document.querySelector('#draw-results'),
  error: document.querySelector('#draw-error'),
  errorMessage: document.querySelector('#draw-error-message'),
  teamCount: document.querySelector('#draw-team-count'),
  fixtureCount: document.querySelector('#draw-fixture-count'),
  progress: document.querySelector('#results-progress'),
  stepStatus: document.querySelector('#draw-step-status'),
  liveDot: document.querySelector('.draw-live-dot'),
  next: document.querySelector('#draw-next'),
  play: document.querySelector('#draw-play'),
  finalize: document.querySelector('#draw-finalize'),
  continue: document.querySelector('#draw-continue'),
};

let drawState = null;
let playTimer = null;

function normalizeName(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
}

function teamKey(team) {
  return `${team.league_key}:${normalizeName(team.name)}`;
}

function selectionSignature(teams) {
  return teams.map((team) => [teamKey(team), team.team_id ?? '', team.uefa_coefficient_rank ?? '', normalizeName(team.league)]
    .join('~')).sort().join('|');
}

function fixtureKey(firstKey, secondKey) {
  return [firstKey, secondKey].sort().join('::');
}

function getBadgeUrl(team) {
  return team.team_id === null || team.team_id === undefined
    ? placeholderBadge
    : `/images/clubs/${encodeURIComponent(team.team_id)}.png`;
}

function addBadgeFallback(image) {
  image.addEventListener('error', () => {
    image.onerror = null;
    image.src = placeholderBadge;
  }, { once: true });
}

function makeBadge(team, className) {
  const image = document.createElement('img');
  image.className = className;
  image.src = getBadgeUrl(team);
  image.alt = '';
  image.loading = 'lazy';
  addBadgeFallback(image);
  return image;
}

function getAssignment(key) {
  return drawState.assignments.find((assignment) => assignment.key === key);
}

function createDrawOrder(assignments) {
  const order = [];
  for (let pot = 1; pot <= 4; pot += 1) {
    const potTeams = assignments.filter((assignment) => assignment.pot === pot).map((assignment) => assignment.key);
    const start = Math.floor(Math.random() * potTeams.length);
    order.push(...potTeams.slice(start), ...potTeams.slice(0, start));
  }
  return order;
}

function getAllFixtureKeys() {
  const fixtures = new Set();
  for (const assignment of drawState.assignments) {
    for (const opponent of assignment.opponents) {
      fixtures.add(fixtureKey(assignment.key, opponent.team.key));
    }
  }
  return [...fixtures];
}

function getRevealedFixtureSet() {
  return new Set(drawState.revealedFixtures);
}

function getUnrevealedOpponents(assignment) {
  const revealed = getRevealedFixtureSet();
  return assignment.opponents.filter((opponent) => !revealed.has(fixtureKey(assignment.key, opponent.team.key)));
}

function advanceToNextOpenTeam() {
  while (drawState.activeTeamIndex < TEAM_COUNT) {
    drawState.startedCount = Math.max(drawState.startedCount, drawState.activeTeamIndex + 1);
    const current = getAssignment(drawState.drawOrder[drawState.activeTeamIndex]);
    if (current && getUnrevealedOpponents(current).length) return;
    drawState.activeTeamIndex += 1;
  }
  drawState.startedCount = TEAM_COUNT;
}

function saveDrawState() {
  window.localStorage.setItem(DRAW_KEY, JSON.stringify(drawState));
}

function restoreDrawState(signature) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DRAW_KEY) || 'null');
    if (!saved || saved.signature !== signature || !Array.isArray(saved.assignments) || saved.assignments.length !== TEAM_COUNT) return null;
    if (!Array.isArray(saved.drawOrder) || saved.drawOrder.length !== TEAM_COUNT) return null;
    if (new Set(saved.drawOrder).size !== TEAM_COUNT || !Array.isArray(saved.revealedFixtures)) return null;
    if (!Number.isInteger(saved.activeTeamIndex) || saved.activeTeamIndex < 0 || saved.activeTeamIndex > TEAM_COUNT) return null;
    if (!Number.isInteger(saved.startedCount) || saved.startedCount < 0 || saved.startedCount > TEAM_COUNT) return null;
    if (saved.revealedFixtures.length > TOTAL_FIXTURES || saved.startedCount < Math.min(saved.activeTeamIndex + 1, TEAM_COUNT)) return null;
    if (saved.activeTeamIndex === TEAM_COUNT && saved.revealedFixtures.length !== TOTAL_FIXTURES) return null;

    drawState = saved;
    const allFixtures = new Set(getAllFixtureKeys());
    if (saved.revealedFixtures.some((key) => !allFixtures.has(key))) return null;
    if (new Set(saved.revealedFixtures).size !== saved.revealedFixtures.length) return null;
    return saved;
  } catch {
    return null;
  } finally {
    drawState = null;
  }
}

function renderPots() {
  elements.pots.replaceChildren();
  const startedKeys = new Set(drawState.drawOrder.slice(0, drawState.startedCount));
  for (let pot = 1; pot <= 4; pot += 1) {
    const teams = drawState.assignments.filter((assignment) => assignment.pot === pot);
    const card = document.createElement('section');
    card.className = 'pot-card';
    card.setAttribute('aria-labelledby', `pot-title-${pot}`);

    const heading = document.createElement('div');
    heading.className = 'pot-card-heading';
    const title = document.createElement('h3');
    title.id = `pot-title-${pot}`;
    title.textContent = `POT ${pot}`;
    const count = document.createElement('span');
    count.textContent = `${teams.length} CLUBS`;
    heading.append(title, count);

    const list = document.createElement('div');
    list.className = 'pot-team-list';
    teams.forEach((assignment) => {
      const hasStarted = startedKeys.has(assignment.key);
      const item = document.createElement('div');
      item.className = `pot-team${hasStarted ? ' is-drawn' : ''}`;
      if (hasStarted) item.setAttribute('aria-label', `${assignment.team.name}, turn picked`);
      item.append(makeBadge(assignment.team, 'pot-crest'));
      const name = document.createElement('span');
      name.textContent = assignment.team.name;
      item.append(name);
      list.append(item);
    });

    card.append(heading, list);
    elements.pots.append(card);
  }
}

function createOpponentSlot(opponent, isLatest) {
  const item = document.createElement('div');
  item.className = `opponent-slot${opponent.venue === 'away' ? ' is-away' : ''}${isLatest ? ' is-recent' : ''}`;
  item.dataset.venue = opponent.venue;
  item.append(makeBadge(opponent.team, 'opponent-crest'));
  const name = document.createElement('span');
  name.textContent = opponent.team.name;
  const venue = document.createElement('em');
  venue.textContent = opponent.venue === 'home' ? 'HOME' : 'AWAY';
  item.append(name, venue);
  return item;
}

function createEmptyOpponentSlot(venue) {
  const item = document.createElement('div');
  item.className = `opponent-slot is-empty${venue === 'away' ? ' is-away' : ''}`;
  item.dataset.venue = venue;
  item.setAttribute('aria-hidden', 'true');
  return item;
}

function countRevealedOpponents(assignment, revealed) {
  return assignment.opponents.filter((opponent) => revealed.has(fixtureKey(assignment.key, opponent.team.key))).length;
}

function renderResults(animation = {}) {
  elements.results.replaceChildren();
  const revealed = getRevealedFixtureSet();
  const isComplete = drawState.revealedFixtures.length >= TOTAL_FIXTURES;

  drawState.drawOrder.slice(0, drawState.startedCount).forEach((key, index) => {
    const assignment = getAssignment(key);
    if (!assignment) return;

    const knownOpponents = assignment.opponents.filter((opponent) => revealed.has(fixtureKey(assignment.key, opponent.team.key)));
    const isCurrent = !isComplete && index === drawState.activeTeamIndex;
    const card = document.createElement('article');
    const newCard = animation.newTeams?.has(key);
    card.className = `team-result${isCurrent ? ' is-current' : ''}${newCard ? ' is-new-result' : ''}`;
    card.dataset.teamKey = assignment.key;

    const cardHeading = document.createElement('div');
    cardHeading.className = 'team-result-heading';
    cardHeading.append(makeBadge(assignment.team, 'result-crest'));
    const clubInfo = document.createElement('div');
    const clubName = document.createElement('strong');
    clubName.textContent = assignment.team.name;
    const clubPot = document.createElement('span');
    clubPot.textContent = `POT ${assignment.pot}`;
    clubInfo.append(clubName, clubPot);
    const teamProgress = document.createElement('span');
    teamProgress.className = 'team-result-progress';
    teamProgress.textContent = `${knownOpponents.length}/8`;
    cardHeading.append(clubInfo, teamProgress);

    const opponents = document.createElement('div');
    opponents.className = 'team-opponents';
    assignment.opponents.forEach((opponent) => {
      const keyForFixture = fixtureKey(assignment.key, opponent.team.key);
      const isRevealed = revealed.has(keyForFixture);
      opponents.append(isRevealed
        ? createOpponentSlot(opponent, animation.fixtureKey === keyForFixture)
        : createEmptyOpponentSlot(opponent.venue));
    });
    card.append(cardHeading, opponents);
    elements.results.append(card);
  });

  elements.progress.textContent = `${drawState.startedCount} / ${TEAM_COUNT} CLUBS DRAWN`;
  if (animation.scrollToCurrent) {
    elements.results.querySelector('.team-result.is-current')?.scrollIntoView({ behavior: animation.animate ? 'smooth' : 'auto', block: 'nearest' });
  }
}

function updateControls() {
  const ready = Boolean(drawState);
  const finished = ready && drawState.revealedFixtures.length >= TOTAL_FIXTURES;
  const current = ready && !finished ? getAssignment(drawState.drawOrder[drawState.activeTeamIndex]) : null;
  const knownCount = current ? OPPONENTS_PER_TEAM - getUnrevealedOpponents(current).length : 0;

  elements.next.disabled = !ready || finished;
  elements.play.disabled = !ready || finished;
  elements.finalize.disabled = !ready || finished;
  elements.continue.disabled = !finished;
  elements.play.innerHTML = playTimer
    ? '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7 5v10M13 5v10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Pause</span>'
    : '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m7 4.5 9 5.5-9 5.5v-11Z" fill="currentColor"/></svg><span>Play</span>';
  elements.liveDot.classList.toggle('is-playing', Boolean(playTimer));

  if (!ready) {
    elements.stepStatus.textContent = 'Preparing draw';
  } else if (finished) {
    elements.stepStatus.textContent = 'Draw complete';
  } else {
    elements.stepStatus.textContent = `Pot ${current.pot} · ${current.team.name} · ${knownCount}/8`;
  }
}

function renderDraw(animation = {}) {
  renderResults(animation);
  renderPots();
  updateControls();
}

function revealNext(animate = false) {
  if (!drawState || drawState.revealedFixtures.length >= TOTAL_FIXTURES) {
    stopPlaying();
    return;
  }

  advanceToNextOpenTeam();
  if (drawState.activeTeamIndex >= TEAM_COUNT) {
    stopPlaying();
    return;
  }

  const previousStartedCount = drawState.startedCount;
  const assignment = getAssignment(drawState.drawOrder[drawState.activeTeamIndex]);
  const opponent = getUnrevealedOpponents(assignment)[0];
  if (!opponent) return;

  const revealedKey = fixtureKey(assignment.key, opponent.team.key);
  drawState.revealedFixtures.push(revealedKey);
  advanceToNextOpenTeam();
  saveDrawState();

  const newTeams = new Set(drawState.drawOrder.slice(previousStartedCount, drawState.startedCount));
  renderDraw({
    animate,
    fixtureKey: animate ? revealedKey : null,
    newTeams,
    scrollToCurrent: drawState.startedCount > previousStartedCount,
  });
  if (drawState.revealedFixtures.length >= TOTAL_FIXTURES) stopPlaying();
}

function startPlaying() {
  if (!drawState || drawState.revealedFixtures.length >= TOTAL_FIXTURES || playTimer) return;
  playTimer = window.setInterval(() => revealNext(true), 760);
  updateControls();
}

function stopPlaying() {
  if (playTimer) window.clearInterval(playTimer);
  playTimer = null;
  updateControls();
}

function drawNext() {
  if (playTimer) stopPlaying();
  revealNext(false);
}

function finalizeDraw() {
  if (!drawState) return;
  stopPlaying();
  drawState.revealedFixtures = getAllFixtureKeys();
  drawState.activeTeamIndex = TEAM_COUNT;
  drawState.startedCount = TEAM_COUNT;
  saveDrawState();
  renderDraw();
}

async function initialize() {
  let tournament;
  try {
    tournament = JSON.parse(window.localStorage.getItem(SELECTION_KEY) || 'null');
  } catch {
    tournament = null;
  }

  if (!tournament || !Array.isArray(tournament.teams) || tournament.teams.length !== TEAM_COUNT) {
    window.location.replace('/start-tournament.html');
    return;
  }

  elements.teamCount.textContent = String(TEAM_COUNT);
  const signature = selectionSignature(tournament.teams);
  const saved = restoreDrawState(signature);
  if (saved) {
    if (saved.revealedFixtures.length === TOTAL_FIXTURES) {
      window.location.replace('/league-phase.html');
      return;
    }
    drawState = saved;
    advanceToNextOpenTeam();
    renderDraw();
    return;
  }

  try {
    const response = await fetch('/api/draw', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teams: tournament.teams,
        randomizePots: !window.appSettings.get().coefficientSeeding,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'A valid draw could not be prepared.');

    drawState = {
      signature,
      assignments: payload.assignments,
      drawOrder: createDrawOrder(payload.assignments),
      revealedFixtures: [],
      activeTeamIndex: 0,
      startedCount: 1,
    };
    advanceToNextOpenTeam();
    saveDrawState();
    elements.fixtureCount.textContent = String(payload.fixtureCount);
    renderDraw();
  } catch (error) {
    drawState = null;
    elements.pots.replaceChildren();
    elements.results.replaceChildren();
    elements.errorMessage.textContent = error.message;
    elements.error.hidden = false;
    elements.progress.textContent = 'Draw could not be created';
    elements.stepStatus.textContent = 'Draw unavailable';
    updateControls();
  }
}

elements.next.addEventListener('click', drawNext);
elements.play.addEventListener('click', () => (playTimer ? stopPlaying() : startPlaying()));
elements.finalize.addEventListener('click', finalizeDraw);
elements.continue.addEventListener('click', () => window.location.assign('/league-phase.html'));

initialize();
