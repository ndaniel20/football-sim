const blossom = require('edmonds-blossom');

const TEAM_COUNT = 36;
const MATCHES_PER_TEAM = 8;
const MATCHDAY_COUNT = 8;
const FIXTURES_PER_MATCHDAY = TEAM_COUNT / 2;
const SCHEDULE_ATTEMPTS = 120;

function getFixtureKey(firstKey, secondKey) {
  return [firstKey, secondKey].sort().join('|');
}

function validateAssignments(assignments) {
  if (!Array.isArray(assignments) || assignments.length !== TEAM_COUNT) {
    throw new Error(`Fixture generation requires exactly ${TEAM_COUNT} club assignments.`);
  }

  const assignmentsByKey = new Map(assignments.map((assignment) => [assignment.key, assignment]));
  if (assignmentsByKey.size !== TEAM_COUNT) throw new Error('The draw contains duplicate club assignments.');
  const fixturesByKey = new Map();
  const opponentCounts = new Map(assignments.map((assignment) => [assignment.key, 0]));

  for (const assignment of assignments) {
    if (!Array.isArray(assignment.opponents) || assignment.opponents.length !== MATCHES_PER_TEAM) {
      throw new Error(`${assignment.team?.name || 'A club'} does not have exactly ${MATCHES_PER_TEAM} drawn opponents.`);
    }

    for (const opponent of assignment.opponents) {
      const opponentKey = opponent.team?.key || opponent.key;
      const other = assignmentsByKey.get(opponentKey);
      if (!other || !['home', 'away'].includes(opponent.venue) || opponentKey === assignment.key) {
        throw new Error('The draw contains an unknown club or invalid home/away assignment.');
      }
      opponentCounts.set(assignment.key, opponentCounts.get(assignment.key) + 1);
      const key = getFixtureKey(assignment.key, opponentKey);
      const fixture = fixturesByKey.get(key) || { key, appearances: [] };
      fixture.appearances.push({ assignment, opponent, opponentKey });
      fixturesByKey.set(key, fixture);
    }
  }

  const fixtures = [];
  for (const fixture of fixturesByKey.values()) {
    if (fixture.appearances.length !== 2) throw new Error('The draw contains a one-sided fixture.');
    const [first, second] = fixture.appearances;
    if (first.assignment.key !== second.opponentKey
      || second.assignment.key !== first.opponentKey
      || first.opponent.venue === second.opponent.venue) {
      throw new Error('The draw contains an inconsistent home and away fixture.');
    }
    const homeAppearance = first.opponent.venue === 'home' ? first : second;
    const awayAppearance = first.opponent.venue === 'away' ? first : second;
    fixtures.push({
      key: fixture.key,
      homeKey: homeAppearance.assignment.key,
      awayKey: awayAppearance.assignment.key,
      homeTeam: homeAppearance.assignment.team,
      awayTeam: awayAppearance.assignment.team,
    });
  }

  if (fixtures.length !== TEAM_COUNT * MATCHES_PER_TEAM / 2
    || [...opponentCounts.values()].some((count) => count !== MATCHES_PER_TEAM)) {
    throw new Error('The draw does not contain the expected number of fixtures.');
  }

  const homeCounts = new Map(assignments.map((assignment) => [assignment.key, 0]));
  fixtures.forEach((fixture) => homeCounts.set(fixture.homeKey, homeCounts.get(fixture.homeKey) + 1));
  if ([...homeCounts.values()].some((count) => count !== MATCHES_PER_TEAM / 2)) {
    throw new Error('The draw must give every club four home and four away fixtures.');
  }

  return fixtures;
}

function createMatchdayMatching(fixtures, assignmentIndexes, previousVenues) {
  const edgeList = fixtures.map((fixture) => {
    let repeatedVenueCount = 0;
    if (previousVenues.get(fixture.homeKey) === 'home') repeatedVenueCount += 1;
    if (previousVenues.get(fixture.awayKey) === 'away') repeatedVenueCount += 1;
    const weight = 100_000 - (repeatedVenueCount * 1_000) + Math.random() * 100;
    return [assignmentIndexes.get(fixture.homeKey), assignmentIndexes.get(fixture.awayKey), weight];
  });
  const partners = blossom(edgeList);
  const fixturesByPair = new Map(fixtures.map((fixture) => [
    `${assignmentIndexes.get(fixture.homeKey)}:${assignmentIndexes.get(fixture.awayKey)}`,
    fixture,
  ]));
  const matched = [];
  for (let teamIndex = 0; teamIndex < partners.length; teamIndex += 1) {
    const partnerIndex = partners[teamIndex];
    if (partnerIndex < 0 || teamIndex > partnerIndex) continue;
    const fixture = fixturesByPair.get(`${teamIndex}:${partnerIndex}`)
      || fixturesByPair.get(`${partnerIndex}:${teamIndex}`);
    if (fixture) matched.push(fixture);
  }
  return matched;
}

function shuffleFixtures(fixtures) {
  for (let index = fixtures.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [fixtures[index], fixtures[randomIndex]] = [fixtures[randomIndex], fixtures[index]];
  }
  return fixtures;
}

function buildSchedule(fixtures, assignmentIndexes) {
  const matchdays = Array.from({ length: MATCHDAY_COUNT }, (_, index) => ({ matchday: index + 1, fixtures: [] }));
  const remaining = new Map(fixtures.map((fixture) => [fixture.key, fixture]));
  const previousVenues = new Map();
  let repeatedVenueTransitions = 0;

  for (const matchday of matchdays) {
    const selected = shuffleFixtures(createMatchdayMatching([...remaining.values()], assignmentIndexes, previousVenues));
    if (selected.length !== FIXTURES_PER_MATCHDAY) return null;

    for (const fixture of selected) {
      matchday.fixtures.push({
        id: fixture.key,
        home: { key: fixture.homeKey, team: fixture.homeTeam },
        away: { key: fixture.awayKey, team: fixture.awayTeam },
        homeGoals: null,
        awayGoals: null,
        played: false,
        kickoff: matchday.fixtures.length < 2 ? '17:45' : '20:00',
      });
      remaining.delete(fixture.key);
      if (previousVenues.get(fixture.homeKey) === 'home') repeatedVenueTransitions += 1;
      if (previousVenues.get(fixture.awayKey) === 'away') repeatedVenueTransitions += 1;
      previousVenues.set(fixture.homeKey, 'home');
      previousVenues.set(fixture.awayKey, 'away');
    }
  }

  if (remaining.size || previousVenues.size !== TEAM_COUNT) return null;
  return { matchdays, repeatedVenueTransitions };
}

function generateLeagueSchedule(assignments) {
  const fixtures = validateAssignments(assignments);
  const assignmentIndexes = new Map(assignments.map((assignment, index) => [assignment.key, index]));
  let bestSchedule = null;

  for (let attempt = 0; attempt < SCHEDULE_ATTEMPTS; attempt += 1) {
    const candidate = buildSchedule(fixtures, assignmentIndexes);
    if (!candidate) continue;
    if (!bestSchedule || candidate.repeatedVenueTransitions < bestSchedule.repeatedVenueTransitions) {
      bestSchedule = candidate;
    }
    if (bestSchedule.repeatedVenueTransitions === 0) break;
  }

  if (!bestSchedule) {
    throw new Error('Could not place every drawn fixture into eight matchdays without scheduling a club twice on one day.');
  }
  if (bestSchedule.matchdays.some((matchday) => matchday.fixtures.length !== FIXTURES_PER_MATCHDAY)) {
    throw new Error('Every matchday must contain exactly 18 fixtures.');
  }

  return {
    teamCount: TEAM_COUNT,
    fixtureCount: fixtures.length,
    matchdays: bestSchedule.matchdays,
    repeatedVenueTransitions: bestSchedule.repeatedVenueTransitions,
  };
}

module.exports = { generateLeagueSchedule };
