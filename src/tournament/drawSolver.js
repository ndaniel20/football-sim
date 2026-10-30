const solver = require('javascript-lp-solver');

const TEAM_COUNT = 36;
const POT_SIZE = 9;
const MATCHES_PER_POT = 2;

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase();
}

function getAssociation(team) {
  const association = normalizeName(team.league);
  return association === 'potugal' ? 'portugal' : association;
}

function getTeamKey(team) {
  return `${team.league_key}:${normalizeName(team.name)}`;
}

function buildPots(selection, randomizePots = false) {
  const rankedTeams = [...selection];
  if (randomizePots) {
    for (let index = rankedTeams.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [rankedTeams[index], rankedTeams[randomIndex]] = [rankedTeams[randomIndex], rankedTeams[index]];
    }
  } else {
    rankedTeams.sort((first, second) => {
      const firstRank = Number(first.uefa_coefficient_rank) || Number.MAX_SAFE_INTEGER;
      const secondRank = Number(second.uefa_coefficient_rank) || Number.MAX_SAFE_INTEGER;
      return firstRank - secondRank || first.name.localeCompare(second.name, undefined, { sensitivity: 'base' });
    });
  }

  return rankedTeams.map((team, index) => ({ ...team, key: getTeamKey(team), pot: Math.floor(index / POT_SIZE) + 1 }));
}

function validateSelection(selection) {
  if (!Array.isArray(selection) || selection.length !== TEAM_COUNT) {
    throw new Error(`The draw requires exactly ${TEAM_COUNT} clubs.`);
  }

  const keys = new Set();
  for (const team of selection) {
    if (!team || typeof team.name !== 'string' || !team.name.trim() || !team.league_key || !getAssociation(team)) {
      throw new Error('A selected club is missing its name, source league, or country association.');
    }
    const key = getTeamKey(team);
    if (keys.has(key)) throw new Error(`The selected club list contains a duplicate: ${team.name}.`);
    keys.add(key);
  }
}

function solveDraw(selection, { randomizePots = false, attempts = 0 } = {}) {
  validateSelection(selection);
  const teams = buildPots(selection, randomizePots === true);
  const countryNames = [...new Set(teams.map(getAssociation))];
  const countryIndices = new Map(countryNames.map((country, index) => [country, index]));
  const constraints = {};
  const variables = {};
  const binaries = {};
  const variableMatches = new Map();

  for (const team of teams) {
    for (let pot = 1; pot <= 4; pot += 1) {
      constraints[`home_${team.key}_${pot}`] = { equal: MATCHES_PER_POT / 2 };
      constraints[`away_${team.key}_${pot}`] = { equal: MATCHES_PER_POT / 2 };
    }

    for (let countryIndex = 0; countryIndex < countryNames.length; countryIndex += 1) {
      if (countryNames[countryIndex] === getAssociation(team)) continue;
      constraints[`country_${team.key}_${countryIndex}`] = { max: 2 };
    }
  }

  for (let firstIndex = 0; firstIndex < teams.length; firstIndex += 1) {
    const first = teams[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < teams.length; secondIndex += 1) {
      const second = teams[secondIndex];
      const firstCountry = getAssociation(first);
      const secondCountry = getAssociation(second);
      if (firstCountry === secondCountry) continue;

      const pairConstraint = `pair_${firstIndex}_${secondIndex}`;
      constraints[pairConstraint] = { max: 1 };
      const firstCountryIndex = countryIndices.get(firstCountry);
      const secondCountryIndex = countryIndices.get(secondCountry);
      const firstHosts = `match_${firstIndex}_${secondIndex}_first_home`;
      const secondHosts = `match_${firstIndex}_${secondIndex}_second_home`;

      variables[firstHosts] = {
        cost: Math.random(),
        [`home_${first.key}_${second.pot}`]: 1,
        [`away_${second.key}_${first.pot}`]: 1,
        [pairConstraint]: 1,
        [`country_${first.key}_${secondCountryIndex}`]: 1,
        [`country_${second.key}_${firstCountryIndex}`]: 1,
      };
      variables[secondHosts] = {
        cost: Math.random(),
        [`home_${second.key}_${first.pot}`]: 1,
        [`away_${first.key}_${second.pot}`]: 1,
        [pairConstraint]: 1,
        [`country_${second.key}_${firstCountryIndex}`]: 1,
        [`country_${first.key}_${secondCountryIndex}`]: 1,
      };
      binaries[firstHosts] = 1;
      binaries[secondHosts] = 1;
      variableMatches.set(firstHosts, { home: first, away: second });
      variableMatches.set(secondHosts, { home: second, away: first });
    }
  }

  const result = solver.Solve({ optimize: 'cost', opType: 'min', constraints, variables, binaries });
  if (!result.feasible) {
    if (randomizePots && attempts < 99) return solveDraw(selection, { randomizePots: true, attempts: attempts + 1 });
    throw new Error('No complete draw satisfies the selected clubs’ country and pot restrictions. Try changing some clubs and drawing again.');
  }

  const opponentsByTeam = new Map(teams.map((team) => [team.key, []]));
  let fixtureCount = 0;
  for (const [variableName, match] of variableMatches) {
    if (Number(result[variableName] || 0) < 0.5) continue;
    fixtureCount += 1;
    opponentsByTeam.get(match.home.key).push({ team: match.away, venue: 'home' });
    opponentsByTeam.get(match.away.key).push({ team: match.home, venue: 'away' });
  }

  const assignments = teams.map((team) => {
    const opponents = opponentsByTeam.get(team.key)
      .sort((first, second) => first.team.pot - second.team.pot || (first.venue === 'home' ? -1 : 1));
    validateTeamOpponents(team, opponents);
    return { key: team.key, team, pot: team.pot, opponents };
  });

  if (fixtureCount !== TEAM_COUNT * MATCHES_PER_POT * 4 / 2) {
    throw new Error('The draw solver returned an incomplete fixture list. Please try again.');
  }
  validateFixtureSymmetry(assignments, fixtureCount);

  return { assignments, fixtureCount };
}

function validateFixtureSymmetry(assignments, expectedFixtures) {
  const fixtures = new Map();
  for (const assignment of assignments) {
    for (const opponent of assignment.opponents) {
      const key = [assignment.key, opponent.team.key].sort().join('|');
      const appearances = fixtures.get(key) || [];
      appearances.push({ teamKey: assignment.key, venue: opponent.venue });
      fixtures.set(key, appearances);
    }
  }

  if (fixtures.size !== expectedFixtures) {
    throw new Error('The draw solver returned duplicate or missing fixtures. Please try again.');
  }
  for (const appearances of fixtures.values()) {
    if (appearances.length !== 2
      || appearances[0].teamKey === appearances[1].teamKey
      || appearances[0].venue === appearances[1].venue) {
      throw new Error('The draw solver returned inconsistent home and away fixtures. Please try again.');
    }
  }
}

function validateTeamOpponents(team, opponents) {
  if (opponents.length !== 8) throw new Error(`The draw solver returned an invalid number of fixtures for ${team.name}.`);
  const perPot = new Map();
  const perCountry = new Map();
  for (const opponent of opponents) {
    if (getAssociation(team) === getAssociation(opponent.team)) {
      throw new Error(`The draw solver returned a same-country fixture for ${team.name}.`);
    }
    const potState = perPot.get(opponent.team.pot) || { home: 0, away: 0 };
    potState[opponent.venue] += 1;
    perPot.set(opponent.team.pot, potState);
    const country = getAssociation(opponent.team);
    perCountry.set(country, (perCountry.get(country) || 0) + 1);
  }

  for (let pot = 1; pot <= 4; pot += 1) {
    const state = perPot.get(pot);
    if (!state || state.home !== 1 || state.away !== 1) {
      throw new Error(`The draw solver returned invalid home/away assignments for ${team.name}, Pot ${pot}.`);
    }
  }
  if ([...perCountry.values()].some((count) => count > 2)) {
    throw new Error(`The draw solver exceeded the two-opponents-per-country limit for ${team.name}.`);
  }
}

module.exports = { solveDraw };
