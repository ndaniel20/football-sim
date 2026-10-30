function allTournamentResults() {
  const matches = [];
  for (const day of leaguePhase.matchdays) {
    for (const fixture of day.fixtures) {
      if (fixture.played && fixture.result) matches.push({
        fixture,
        result: fixture.result,
        homeName: fixture.home.team.name,
        awayName: fixture.away.team.name,
        roundKey: 'league',
      });
    }
  }
  for (const roundKey of ROUND_KEYS) {
    for (const tie of knockout.rounds[roundKey]) {
      for (const leg of tie.legs) {
        if (leg) matches.push({
          fixture: null,
          result: leg.result,
          homeName: leg.homeTeam.name,
          awayName: leg.awayTeam.name,
          roundKey,
        });
      }
    }
  }
  return matches;
}

function getPositionFamily(position) {
  const code = String(position || '').trim().toUpperCase();
  if (code === 'GK') return 'GK';
  if (['CB', 'LCB', 'RCB', 'CCB'].includes(code)) return 'CB';
  if (['LB', 'LWB'].includes(code)) return 'LB';
  if (['RB', 'RWB'].includes(code)) return 'RB';
  if (['CAM', 'LAM', 'RAM'].includes(code)) return 'CAM';
  if (['CDM', 'LDM', 'RDM', 'CM', 'LCM', 'RCM'].includes(code)) return 'CM';
  if (['LW', 'LM'].includes(code)) return 'LW';
  if (['RW', 'RM'].includes(code)) return 'RW';
  if (['ST', 'LST', 'RST', 'CF'].includes(code)) return 'ST';
  return null;
}

function getPositionCode(position) {
  return String(position || '').trim().toUpperCase();
}

function getTournamentPositionFamilies(player) {
  const lineupPosition = player.lineupRole || player.position;
  const primaryFamily = getPositionFamily(lineupPosition);
  if (['LB', 'CB', 'RB'].includes(primaryFamily)) return new Set([primaryFamily]);

  return new Set([lineupPosition, player.position, ...(player.alternatePositions || [])]
    .map(getPositionFamily)
    .filter(Boolean));
}

function getTournamentStarts(performance, substitutionInKeys) {
  const recordedStarts = Number(performance.starts);
  if (Number.isFinite(recordedStarts)) return recordedStarts;
  if (!(Number(performance.appearances) > 0)) return 0;

  const playerKey = `${performance.teamName}:${performance.playerId || performance.playerName}`;
  return substitutionInKeys.has(playerKey) ? 0 : 1;
}

function canPlayerFillTeamOfSeasonRole(player, role) {
  if (['LB', 'CB', 'RB'].includes(role.family)) {
    const lineupFamily = getPositionFamily(player.lineupRole || player.position);
    if (lineupFamily === role.family) return true;

    const teamFormation = getTournamentTeamByName(player.teamName)?.formation || player.formation || '';
    const wideMidfieldFamily = role.family === 'LB' ? 'LW' : role.family === 'RB' ? 'RW' : null;
    if (!/^3-/.test(teamFormation) || lineupFamily !== wideMidfieldFamily) return false;

    const declaredFamilies = [player.position, ...(player.alternatePositions || [])]
      .map(getPositionFamily);
    return declaredFamilies.includes(role.family);
  }
  const declaredPositionCodes = new Set([
    player.position,
    ...(player.alternatePositions || []),
  ].map(getPositionCode));
  if (role.family === 'CAM') {
    return ['CAM', 'LAM', 'RAM'].some((position) => declaredPositionCodes.has(position));
  }
  const eligibleCodes = new Set([
    player.lineupRole,
    player.position,
    ...(player.alternatePositions || []),
  ].map(getPositionCode));
  if (role.category === 'midfield-balanced' || role.category === 'midfield-runner-up') {
    const xiCode = getPositionCode(player.lineupRole || player.position);
    const centralMidfieldCodes = ['CM', 'CDM', 'LCM', 'RCM', 'LDM', 'RDM'];
    if (centralMidfieldCodes.includes(xiCode)) return true;
    if (!['CAM', 'LAM', 'RAM'].includes(xiCode)) return false;
    return (player.alternatePositions || []).some((position) =>
      ['CM', 'CDM'].includes(getPositionCode(position)));
  }
  return player.positions.has(role.family);
}
function buildTournamentPlayerStats(leaders = buildLeaders()) {
  const totals = new Map();
  const stagesReachedByTeam = new Map();
  const stageOrder = Object.keys(TEAM_OF_SEASON_STAGE_BONUSES);
  const topFiveWithTies = (entries, statistic) => {
    const fifthPlaceValue = entries[4]?.[statistic];
    return entries.filter((entry, index) => index < 5
      || (fifthPlaceValue > 0 && entry[statistic] === fifthPlaceValue));
  };
  const standoutCandidateKeys = new Set([
    ...topFiveWithTies(leaders.scorers, 'goals'),
    ...topFiveWithTies(leaders.assists, 'assists'),
    ...topFiveWithTies(leaders.cleanSheets, 'cleanSheets'),
  ].map((leader) => `${leader.teamName}:${leader.playerId || leader.playerName}`));
  const weightedFields = [
    'appearances', 'goals', 'assists', 'shots', 'shotsOnTarget', 'xG',
    'saves', 'chancesCreated', 'offensiveDuelsWon', 'defensiveDuelsStopped', 'goalsConceded', 'cleanSheets',
  ];
  const matches = allTournamentResults();
  const championName = typeof knockout.champion === 'string'
    ? knockout.champion
    : knockout.champion?.name;
  const championTeamKey = normalizeName(championName);
  const eligibleTournamentTeams = new Set(matches
    .filter((match) => ['r16', 'qf', 'sf', 'final'].includes(match.roundKey))
    .flatMap((match) => [match.homeName, match.awayName]));
  for (const match of matches) {
    const stageIndex = stageOrder.indexOf(match.roundKey);
    if (stageIndex < 0) continue;
    for (const teamName of [match.homeName, match.awayName]) {
      const reachedStages = stagesReachedByTeam.get(teamName) || new Set();
      reachedStages.add(match.roundKey);
      stagesReachedByTeam.set(teamName, reachedStages);
    }
  }
  for (const match of matches) {
    const playoffWeight = match.roundKey === 'playoff' ? ROUND_OF_32_TOTS_WEIGHT : 1;
    const substitutionInKeys = new Set((match.result.events || [])
      .filter((event) => event.type === 'substitution')
      .map((event) => {
        const teamName = event.teamIndex === 0 ? match.homeName : match.awayName;
        const playerId = event.playerOnId || event.playerOn;
        return playerId ? `${teamName}:${playerId}` : null;
      })
      .filter(Boolean));
    const eventCounts = new Map();
    for (const event of match.result.events || []) {
      if (event.type === 'substitution') continue;
      const teamName = event.teamIndex === 0 ? match.homeName : match.awayName;
      const recordEvent = (actorId, actorName, field) => {
        const actor = actorId || actorName;
        if (!actor) return;
        const key = `${teamName}:${actor}`;
        const counts = eventCounts.get(key) || { goals: 0, assists: 0 };
        counts[field] += 1;
        eventCounts.set(key, counts);
      };
      recordEvent(event.scorerId, event.scorer, 'goals');
      recordEvent(event.assisterId, event.assister, 'assists');
    }
    for (const performance of match.result.playerStats || []) {
      const key = `${performance.teamName}:${performance.playerId || performance.playerName}`;
      const standoutCandidate = standoutCandidateKeys.has(key);
      if (!eligibleTournamentTeams.has(performance.teamName) && !standoutCandidate) continue;
      const player = totals.get(key) || {
        key,
        playerId: performance.playerId,
        playerName: performance.playerName,
        teamName: performance.teamName,
        teamId: performance.teamId,
        position: performance.position,
        lineupRole: performance.lineupRole || performance.position,
        lineupRoleCounts: {},
        alternatePositions: performance.alternatePositions || [],
        starts: 0,
        ...Object.fromEntries(weightedFields.map((field) => [field, 0])),
      };
      const eventCountsForPlayer = eventCounts.get(key) || {};
      for (const field of weightedFields) {
        const playerMatchValue = Number(performance[field] || 0);
        const eventMatchValue = eventCountsForPlayer[field] || 0;
        player[field] += (field === 'goals' || field === 'assists'
          ? Math.max(playerMatchValue, eventMatchValue)
          : playerMatchValue) * playoffWeight;
      }
          player.starts += getTournamentStarts(performance, substitutionInKeys);
      const lineupRole = performance.lineupRole || performance.position;
      if (lineupRole) player.lineupRoleCounts[lineupRole] = (player.lineupRoleCounts[lineupRole] || 0) + 1;
      totals.set(key, player);
    }
  }
  for (const player of totals.values()) {
    player.lineupRole = Object.entries(player.lineupRoleCounts)
      .sort((first, second) => second[1] - first[1]
        || first[0].localeCompare(second[0]))[0]?.[0] || player.position;
    delete player.lineupRoleCounts;
    const reachedStages = stagesReachedByTeam.get(player.teamName) || new Set();
    player.stageBonus = stageOrder.filter((stage) => reachedStages.has(stage))
      .reduce((bonus, stage) => bonus + TEAM_OF_SEASON_STAGE_BONUSES[stage], 0);
    const teamKey = normalizeName(player.teamName);
    player.championBonus = championTeamKey && teamKey === championTeamKey ? TEAM_OF_SEASON_CHAMPION_BONUS : 0;
    player.progressionBonus = player.stageBonus + player.championBonus;
    player.reachedSemiFinals = reachedStages.has('sf') || reachedStages.has('final');
  }
  return totals;
}

