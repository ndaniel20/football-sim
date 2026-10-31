function normalizeName(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
}

function teamKey(team) {
  if (!team) return '';
  return `${team.league_key || team.key || ''}:${normalizeName(team.name)}`;
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

function makeBadge(team, className = '') {
  const image = document.createElement('img');
  image.className = className;
  image.src = team ? getBadgeUrl(team) : placeholderBadge;
  image.alt = '';
  addBadgeFallback(image);
  return image;
}

function saveKnockout() {
  if (!window.tournamentStorage.save(KNOCKOUT_KEY, knockout)) {
    elements.status.textContent = 'Browser storage is full. Your progress is still available until this page is closed.';
  }
}

function getFinalStandings(phase) {
  const standings = new Map(phase.teams.map((team) => [teamKey(team), {
    team, played: 0, wins: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
  }]));
  for (const day of phase.matchdays) {
    for (const fixture of day.fixtures) {
      if (!fixture.played || !Number.isFinite(fixture.homeGoals) || !Number.isFinite(fixture.awayGoals)) continue;
      const home = standings.get(fixture.home.key || teamKey(fixture.home.team));
      const away = standings.get(fixture.away.key || teamKey(fixture.away.team));
      if (!home || !away) continue;
      home.played += 1;
      away.played += 1;
      home.goalsFor += fixture.homeGoals;
      home.goalsAgainst += fixture.awayGoals;
      away.goalsFor += fixture.awayGoals;
      away.goalsAgainst += fixture.homeGoals;
      if (fixture.homeGoals > fixture.awayGoals) {
        home.wins += 1;
        home.points += 3;
      } else if (fixture.homeGoals < fixture.awayGoals) {
        away.wins += 1;
        away.points += 3;
      } else {
        home.points += 1;
        away.points += 1;
      }
    }
  }
  return [...standings.values()].map((row) => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst }))
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference
      || b.goalsFor - a.goalsFor || b.wins - a.wins
      || a.team.name.localeCompare(b.team.name, undefined, { sensitivity: 'base' }));
}

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function createBracket(phase) {
  const standings = getFinalStandings(phase);
  const ranked = standings.map((row, index) => ({ ...row.team, rank: index + 1 }));
  const rankedByPosition = new Map(ranked.map((team) => [team.rank, team]));
  const playoffPairs = [[9, 10, 23, 24], [11, 12, 21, 22], [13, 14, 19, 20], [15, 16, 17, 18]];
  const playoff = [];
  for (const [upperA, upperB, lowerA, lowerB] of playoffPairs) {
    const lowerTeams = shuffled([rankedByPosition.get(lowerA), rankedByPosition.get(lowerB)]);
    const upperTeams = shuffled([rankedByPosition.get(upperA), rankedByPosition.get(upperB)]);
    upperTeams.forEach((higherTeam, index) => {
      const lowerTeam = lowerTeams[index];
      playoff.push({
        id: `playoff-${higherTeam.rank}`,
        higherSeed: higherTeam.rank,
        slots: [
          { type: 'team', team: higherTeam, privilegeSeed: higherTeam.rank },
          { type: 'team', team: lowerTeam, privilegeSeed: lowerTeam.rank },
        ],
        legs: [null, null],
        winnerTeam: null,
        inheritedSeed: null,
      });
    });
  }
  const playoffBySeed = new Map(playoff.map((tie) => [tie.higherSeed, tie]));
  const r16Seeds = [1, 8, 4, 5, 2, 7, 3, 6];
  const playoffOpponentSeeds = [15, 10, 14, 11, 16, 9, 13, 12];
  const r16 = r16Seeds.map((seed, index) => ({
    id: `r16-${index + 1}`,
    slots: [
      { type: 'team', team: rankedByPosition.get(seed), privilegeSeed: seed },
      { type: 'winner', round: 'playoff', tieId: playoffBySeed.get(playoffOpponentSeeds[index])?.id, privilegeSeed: playoffOpponentSeeds[index] },
    ],
    legs: [null, null],
    winnerTeam: null,
    inheritedSeed: null,
  }));
  const winnerSlots = (round, count) => Array.from({ length: count }, (_, index) => ({
    type: 'winner', round, tieId: `${round}-${index + 1}`,
  }));
  const qf = Array.from({ length: 4 }, (_, index) => ({
    id: `qf-${index + 1}`,
    slots: [
      { ...winnerSlots('r16', 8)[index * 2], privilegeSeed: Math.min(...r16[index * 2].slots.map((slot) => slot.privilegeSeed || 99)) },
      { ...winnerSlots('r16', 8)[index * 2 + 1], privilegeSeed: Math.min(...r16[index * 2 + 1].slots.map((slot) => slot.privilegeSeed || 99)) },
    ],
    legs: [null, null], winnerTeam: null, inheritedSeed: null,
  }));
  const sf = Array.from({ length: 2 }, (_, index) => ({
    id: `sf-${index + 1}`,
    slots: [
      { ...winnerSlots('qf', 4)[index * 2], privilegeSeed: Math.min(...qf[index * 2].slots.map((slot) => slot.privilegeSeed || 99)) },
      { ...winnerSlots('qf', 4)[index * 2 + 1], privilegeSeed: Math.min(...qf[index * 2 + 1].slots.map((slot) => slot.privilegeSeed || 99)) },
    ],
    legs: [null, null], winnerTeam: null, inheritedSeed: null,
  }));
  const final = [{
    id: 'final-1',
    slots: [
      { type: 'winner', round: 'sf', tieId: 'sf-1' },
      { type: 'winner', round: 'sf', tieId: 'sf-2' },
    ],
    legs: [null], winnerTeam: null, inheritedSeed: null,
  }];
  return {
    signature: phase.signature,
    rounds: { playoff, r16, qf, sf, final },
    selectedRound: 'playoff',
    champion: null,
    celebrationShown: false,
    createdAt: Date.now(),
  };
}

function getTie(roundKey, tieId) {
  return knockout.rounds[roundKey]?.find((tie) => tie.id === tieId) || null;
}

function resolveSlot(slot) {
  if (!slot) return null;
  if (slot.type === 'team') return { team: slot.team, privilegeSeed: slot.privilegeSeed || slot.team.rank || 99 };
  const source = getTie(slot.round, slot.tieId);
  if (!source?.winnerTeam) return null;
  return {
    team: source.winnerTeam,
    privilegeSeed: Number.isFinite(source.inheritedSeed) ? source.inheritedSeed : (slot.privilegeSeed || 99),
  };
}

function getParticipants(tie) {
  return tie.slots.map(resolveSlot);
}

function tieWinner(tie) {
  if (!tie.winnerTeam) return null;
  return tie.winnerTeam;
}

function roundTieComplete(roundKey, tie) {
  return Boolean(tie.winnerTeam) || (roundKey === 'final' && Boolean(knockout.champion));
}

function isRoundComplete(roundKey) {
  return knockout.rounds[roundKey].every((tie) => roundTieComplete(roundKey, tie));
}

function isRoundUnlocked(roundKey) {
  const roundIndex = ROUND_KEYS.indexOf(roundKey);
  return roundIndex <= 0 || isRoundComplete(ROUND_KEYS[roundIndex - 1]);
}

function getLegTeams(tie, roundKey, legIndex) {
  const participants = getParticipants(tie);
  if (roundKey === 'final') return participants.map((participant) => participant?.team || null);
  const slots = tie.slots.map((slot, index) => ({
    participant: participants[index],
    privilegeSeed: participants[index]?.privilegeSeed ?? slot.privilegeSeed ?? 99,
  })).sort((a, b) => a.privilegeSeed - b.privilegeSeed);
  const higherPriority = slots[0];
  const lowerPriority = slots[1];
  return legIndex === 0
    ? [lowerPriority.participant?.team || null, higherPriority.participant?.team || null]
    : [higherPriority.participant?.team || null, lowerPriority.participant?.team || null];
}

function getCurrentLeg(roundKey) {
  if (roundKey === 'final') return 0;
  const ties = knockout.rounds[roundKey];
  return ties.some((tie) => !tie.legs[0] || (animationRun?.tie.id === tie.id && animationRun.legIndex === 0)) ? 0 : 1;
}

function getTieCurrentLeg(tie, roundKey) {
  if (roundKey === 'final') return tie.legs[0] ? null : 0;
  if (!tie.legs[0]) return 0;
  if (!tie.legs[1]) return 1;
  return null;
}

function getAggregateBefore(tie, homeTeam, awayTeam, excludedLegIndex = null) {
  const goalsByTeam = new Map([[teamKey(homeTeam), 0], [teamKey(awayTeam), 0]]);
  for (const [legIndex, leg] of tie.legs.entries()) {
    if (legIndex === excludedLegIndex) continue;
    if (!leg) continue;
    const homeKey = teamKey(leg.homeTeam);
    const awayKey = teamKey(leg.awayTeam);
    if (goalsByTeam.has(homeKey)) goalsByTeam.set(homeKey, goalsByTeam.get(homeKey) + leg.result.homeGoals);
    if (goalsByTeam.has(awayKey)) goalsByTeam.set(awayKey, goalsByTeam.get(awayKey) + leg.result.awayGoals);
  }
  return [goalsByTeam.get(teamKey(homeTeam)) || 0, goalsByTeam.get(teamKey(awayTeam)) || 0];
}

function getAwayGoalsBefore(tie, homeTeam, awayTeam, excludedLegIndex = null) {
  const homeKey = teamKey(homeTeam);
  const awayKey = teamKey(awayTeam);
  const awayGoals = [0, 0];
  for (const [legIndex, leg] of tie.legs.entries()) {
    if (!leg || legIndex === excludedLegIndex) continue;
    if (teamKey(leg.awayTeam) === homeKey) awayGoals[0] += leg.result.awayGoals;
    if (teamKey(leg.awayTeam) === awayKey) awayGoals[1] += leg.result.awayGoals;
  }
  return awayGoals;
}

function getTieAggregate(tie) {
  const totals = new Map();
  for (const leg of tie.legs) {
    if (!leg) continue;
    const homeKey = teamKey(leg.homeTeam);
    const awayKey = teamKey(leg.awayTeam);
    totals.set(homeKey, (totals.get(homeKey) || 0) + leg.result.homeGoals);
    totals.set(awayKey, (totals.get(awayKey) || 0) + leg.result.awayGoals);
  }
  return totals;
}

function getDisplayedTieAggregate(tie) {
  const totals = getTieAggregate(tie);
  const run = animationRun?.tie.id === tie.id ? animationRun : null;
  const savedLeg = run ? tie.legs[run.legIndex] : null;
  if (!run || !savedLeg) return totals;
  const homeKey = teamKey(savedLeg.homeTeam);
  const awayKey = teamKey(savedLeg.awayTeam);
  totals.set(homeKey, (totals.get(homeKey) || 0) - savedLeg.result.homeGoals + run.homeGoals);
  totals.set(awayKey, (totals.get(awayKey) || 0) - savedLeg.result.awayGoals + run.awayGoals);
  return totals;
}

function finalizeTie(tie, roundKey) {
  if (roundKey === 'final') {
    const finalLeg = tie.legs[0];
    if (!finalLeg) return;
    const result = finalLeg.result;
    const winnerIndex = result.penalties?.winnerIndex
      ?? (result.homeGoals > result.awayGoals ? 0 : 1);
    tie.winnerTeam = winnerIndex === 0 ? finalLeg.homeTeam : finalLeg.awayTeam;
    const participants = getParticipants(tie).filter(Boolean);
    tie.inheritedSeed = Math.min(...participants.map((participant) => participant.privilegeSeed));
    knockout.champion = tie.winnerTeam;
    return;
  }
  if (!tie.legs[0] || !tie.legs[1]) return;
  const totals = getTieAggregate(tie);
  const firstTeam = resolveSlot(tie.slots[0]);
  const secondTeam = resolveSlot(tie.slots[1]);
  if (!firstTeam || !secondTeam) return;
  const firstGoals = totals.get(teamKey(firstTeam.team)) || 0;
  const secondGoals = totals.get(teamKey(secondTeam.team)) || 0;
  if (firstGoals === secondGoals) {
    const lastLeg = tie.legs[1];
    const [firstAwayGoals, secondAwayGoals] = getAwayGoalsBefore(tie, firstTeam.team, secondTeam.team);
    const awayGoalsRuleUsed = lastLeg.result.awayGoalsRuleUsed ?? window.appSettings.get().awayGoals;
    if (awayGoalsRuleUsed && firstAwayGoals !== secondAwayGoals) {
      tie.winnerTeam = firstAwayGoals > secondAwayGoals ? firstTeam.team : secondTeam.team;
    } else {
      const winnerIndex = lastLeg.result.penalties?.winnerIndex;
      if (winnerIndex !== 0 && winnerIndex !== 1) return;
      tie.winnerTeam = winnerIndex === 0 ? lastLeg.homeTeam : lastLeg.awayTeam;
    }
  } else {
    tie.winnerTeam = firstGoals > secondGoals ? firstTeam.team : secondTeam.team;
  }
  tie.inheritedSeed = Math.min(firstTeam.privilegeSeed, secondTeam.privilegeSeed);
}

function currentRoundTies() {
  return knockout.rounds[knockout.selectedRound] || [];
}

function getCurrentTournamentRound() {
  for (const roundKey of ROUND_KEYS) {
    if (!isRoundComplete(roundKey)) return roundKey;
  }
  return ROUND_KEYS.at(-1);
}

function advanceCompletedRound(roundKey) {
  const roundIndex = ROUND_KEYS.indexOf(roundKey);
  if (roundIndex < 0 || roundIndex >= ROUND_KEYS.length - 1 || !isRoundComplete(roundKey)) return;
  knockout.selectedRound = ROUND_KEYS[roundIndex + 1];
  selectedTieId = null;
  selectedTieLegIndex = null;
}

function legResultFor(tie, legIndex) {
  return tie.legs[legIndex] || null;
}

