const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let pointerFrame = 0;

const tournamentStorageKeys = {
  selection: 'ucl-simulator-tournament',
  draw: 'ucl-simulator-draw',
  leaguePhase: 'ucl-simulator-league-phase',
  knockout: 'ucl-simulator-knockout',
  tournamentCacheV1: 'ucl-simulator-knockout-view-cache-v1',
  tournamentCacheV2: 'ucl-simulator-knockout-view-cache-v2',
};

function readSavedState(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function isValidTournament(selection) {
  return Array.isArray(selection?.teams) && selection.teams.length === 36;
}

function isValidDraw(draw) {
  return Array.isArray(draw?.assignments) && draw.assignments.length === 36
    && Array.isArray(draw.drawOrder) && draw.drawOrder.length === 36
    && Array.isArray(draw.revealedFixtures);
}

function normalizeTeamName(name) {
  return String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
}

function getSelectionSignature(teams) {
  return teams.map((team) => [
    `${team.league_key}:${normalizeTeamName(team.name)}`,
    team.team_id ?? '',
    team.uefa_coefficient_rank ?? '',
    normalizeTeamName(team.league),
  ].join('~')).sort().join('|');
}

function isValidLeaguePhase(phase) {
  return typeof phase?.signature === 'string'
    && Array.isArray(phase.matchdays) && phase.matchdays.length === 8
    && phase.matchdays.every((day) => Array.isArray(day.fixtures) && day.fixtures.length === 18);
}

function isValidKnockout(knockout, phase) {
  return typeof knockout?.signature === 'string' && knockout.signature === phase?.signature
    && Array.isArray(knockout.rounds?.playoff) && knockout.rounds.playoff.length === 8
    && Array.isArray(knockout.rounds?.final) && knockout.rounds.final.length === 1;
}

function getResumeUrl() {
  const phase = readSavedState(tournamentStorageKeys.leaguePhase);
  const draw = readSavedState(tournamentStorageKeys.draw);
  const selection = readSavedState(tournamentStorageKeys.selection);
  if (!isValidTournament(selection)) return null;
  const matchingDraw = isValidDraw(draw) && draw.signature === getSelectionSignature(selection.teams);
  if (isValidLeaguePhase(phase) && matchingDraw) {
    const knockout = readSavedState(tournamentStorageKeys.knockout);
    if (isValidKnockout(knockout, phase) && phase.matchdays.every((day) => day.fixtures.every((fixture) => fixture.played))) {
      return '/knockout';
    }
    return '/league-phase';
  }
  if (matchingDraw) return '/draw';
  return '/draw';
}

const startTournamentButton = document.querySelector('#start-tournament');
const continueTournamentButton = document.querySelector('#continue-tournament');
const resumeUrl = getResumeUrl();
continueTournamentButton.disabled = !resumeUrl;

startTournamentButton.addEventListener('click', (event) => {
  event.preventDefault();
  Object.values(tournamentStorageKeys).forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
    }
  });
  window.location.assign('/start-tournament');
});

continueTournamentButton.addEventListener('click', () => {
  const latestResumeUrl = getResumeUrl();
  if (latestResumeUrl) window.location.assign(latestResumeUrl);
});

if (!reduceMotion && window.matchMedia('(pointer: fine)').matches) {
  window.addEventListener('pointermove', (event) => {
    if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
    pointerFrame = window.requestAnimationFrame(() => {
      root.style.setProperty('--pointer-x', `${event.clientX}px`);
      root.style.setProperty('--pointer-y', `${event.clientY}px`);
      pointerFrame = 0;
    });
  }, { passive: true });
}

const featuredClubs = [
  { key: 'arsenal', name: 'Arsenal', badgeId: '1' },
  { key: 'real-madrid', name: 'Real Madrid', badgeId: '243' },
  { key: 'barcelona', name: 'FC Barcelona', badgeId: '241' },
  { key: 'atletico', name: 'Atlético de Madrid', badgeId: '240' },
  { key: 'man-city', name: 'Manchester City', badgeId: '10' },
  { key: 'man-utd', name: 'Manchester United', badgeId: '11' },
  { key: 'napoli', name: 'Napoli', badgeId: '613' },
  { key: 'inter', name: 'Inter', badgeId: '131682' },
  { key: 'bayern', name: 'Bayern', badgeId: '21' },
  { key: 'dortmund', name: 'Dortmund', badgeId: '22' },
];
const featuredStages = [
  ...Array.from({ length: 8 }, (_, index) => ({
    label: `Matchday ${String(index + 1).padStart(2, '0')}`,
    type: 'LEAGUE PHASE',
  })),
  { label: 'Round of 32', type: 'KNOCKOUT PHASE' },
  { label: 'Round of 16', type: 'KNOCKOUT PHASE' },
  { label: 'Quarter Finals', type: 'KNOCKOUT PHASE' },
  { label: 'Semi-Finals', type: 'KNOCKOUT PHASE' },
  { label: 'Final', type: 'FINAL' },
];

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function fixtureSignature(clubs) {
  return [clubs.slice(0, 2), clubs.slice(2, 4)]
    .map((fixture) => fixture.map(({ key }) => key).sort().join('|'))
    .sort()
    .join('::');
}

function getPreviousFixtureSignature() {
  try {
    return window.localStorage.getItem('ucl-simulator-featured-fixtures');
  } catch {
    return null;
  }
}

function saveFixtureSignature(signature) {
  try {
    window.localStorage.setItem('ucl-simulator-featured-fixtures', signature);
  } catch {
  }
}

function renderFeaturedFixtures() {
  const previousSignature = getPreviousFixtureSignature();
  let selection = shuffled(featuredClubs).slice(0, 4);
  for (let attempt = 0; attempt < 20 && fixtureSignature(selection) === previousSignature; attempt += 1) {
    selection = shuffled(featuredClubs).slice(0, 4);
  }
  saveFixtureSignature(fixtureSignature(selection));

  document.querySelectorAll('[data-fixture]').forEach((fixtureElement) => {
    const fixtureIndex = Number(fixtureElement.dataset.fixture);
    const fixtureClubs = selection.slice(fixtureIndex * 2, fixtureIndex * 2 + 2);
    fixtureClubs.forEach((club, clubIndex) => {
      const clubElement = fixtureElement.querySelector(`[data-club="${fixtureIndex * 2 + clubIndex}"]`);
      if (!clubElement) return;

      const badge = clubElement.querySelector('.club-crest');
      const clubName = clubElement.querySelector('span');
      badge.src = club.badgeId ? `/images/clubs/${club.badgeId}.png` : '/images/clubs/placeholder.svg';
      badge.alt = `${club.name} badge`;
      badge.onerror = () => {
        badge.onerror = null;
        badge.src = '/images/clubs/placeholder.svg';
      };
      clubName.textContent = club.name.toUpperCase();
    });

    const stage = featuredStages[Math.floor(Math.random() * featuredStages.length)];
    fixtureElement.querySelector('[data-stage-tag]').textContent = stage.type;
    fixtureElement.querySelector('[data-matchday]').textContent = stage.label;
    fixtureElement.setAttribute('aria-label', `${fixtureClubs[0].name} versus ${fixtureClubs[1].name}, ${stage.label}`);
  });
}

renderFeaturedFixtures();
