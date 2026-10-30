function buildLeaders() {
  const scorers = new Map();
  const assists = new Map();
  const cleanSheets = new Map();
  for (const match of allTournamentResults()) {
    for (const event of match.result.events || []) {
      if (event.type === 'substitution') continue;
      const team = event.teamIndex === 0 ? match.homeName : match.awayName;
      const key = `${team}:${event.scorerId || event.scorer}`;
      const entry = scorers.get(key) || { playerId: event.scorerId, playerName: event.scorer, teamName: team, goals: 0 };
      entry.goals += 1;
      scorers.set(key, entry);
      if (event.assister) {
        const assistKey = `${team}:${event.assisterId || event.assister}`;
        const assistEntry = assists.get(assistKey) || { playerId: event.assisterId, playerName: event.assister, teamName: team, assists: 0 };
        assistEntry.assists += 1;
        assists.set(assistKey, assistEntry);
      }
    }
    if (match.result.awayGoals === 0) {
      const key = `${match.homeName}:${match.result.homeGoalkeeperId || match.result.homeGoalkeeper || 'unknown'}`;
      const entry = cleanSheets.get(key) || { playerId: match.result.homeGoalkeeperId, playerName: match.result.homeGoalkeeper || 'Unknown goalkeeper', teamName: match.homeName, cleanSheets: 0 };
      entry.cleanSheets += 1;
      cleanSheets.set(key, entry);
    }
    if (match.result.homeGoals === 0) {
      const key = `${match.awayName}:${match.result.awayGoalkeeperId || match.result.awayGoalkeeper || 'unknown'}`;
      const entry = cleanSheets.get(key) || { playerId: match.result.awayGoalkeeperId, playerName: match.result.awayGoalkeeper || 'Unknown goalkeeper', teamName: match.awayName, cleanSheets: 0 };
      entry.cleanSheets += 1;
      cleanSheets.set(key, entry);
    }
  }
  const sort = (map, statistic) => [...map.values()].sort((a, b) => b[statistic] - a[statistic] || a.playerName.localeCompare(b.playerName));
  return { scorers: sort(scorers, 'goals'), assists: sort(assists, 'assists'), cleanSheets: sort(cleanSheets, 'cleanSheets') };
}

function getTournamentDataFingerprint(matches) {
  const source = JSON.stringify({
    phase: leaguePhase.signature,
    champion: typeof knockout.champion === 'string' ? knockout.champion : knockout.champion?.name || null,
    teams: leaguePhase.teams.map((team) => [team.name, team.formation || '']),
    matches: matches.map(({ roundKey, homeName, awayName, result }) => [
      roundKey,
      homeName,
      awayName,
      result.homeGoals,
      result.awayGoals,
      result.homeGoalkeeper,
      result.awayGoalkeeper,
      result.homeGoalkeeperId,
      result.awayGoalkeeperId,
      result.events || [],
      result.playerStats || [],
    ]),
  });
  let firstHash = 0x811c9dc5;
  let secondHash = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    firstHash = Math.imul(firstHash ^ code, 0x01000193);
    secondHash = Math.imul(secondHash ^ (code + index), 0x85ebca6b);
  }
  return `${source.length}-${(firstHash >>> 0).toString(36)}-${(secondHash >>> 0).toString(36)}`;
}

function readTournamentViewCache(fingerprint) {
  try {
    const cached = JSON.parse(window.localStorage.getItem(TOURNAMENT_VIEW_CACHE_KEY) || 'null');
    if (cached?.version === 1 && cached.fingerprint === fingerprint
      && Array.isArray(cached.leaders?.scorers)
      && Array.isArray(cached.leaders?.assists)
      && Array.isArray(cached.leaders?.cleanSheets)
      && ['hidden', 'unavailable', 'incomplete', 'ready'].includes(cached.teamOfSeason?.status)
      && (cached.teamOfSeason.status !== 'ready'
        || (Array.isArray(cached.teamOfSeason.lineup)
          && Array.isArray(cached.teamOfSeason.candidateRankings)))) return cached;
  } catch {
  }
  return null;
}

function getTournamentDerivedData() {
  const matches = allTournamentResults();
  const fingerprint = getTournamentDataFingerprint(matches);
  if (tournamentViewCache?.fingerprint === fingerprint) return tournamentViewCache;

  const saved = readTournamentViewCache(fingerprint);
  if (saved) {
    tournamentViewCache = saved;
    return saved;
  }

  const leaders = buildLeaders();
  let teamOfSeason = { status: 'hidden' };
  if (knockout.champion) {
    const hasCompletePlayerStats = matches.length > 0
      && matches.every((match) => Array.isArray(match.result.playerStats) && match.result.playerStats.length >= 22);
    if (!hasCompletePlayerStats) {
      teamOfSeason = { status: 'unavailable' };
    } else {
      const lineup = calculateTeamOfSeason(buildTournamentPlayerStats(leaders));
      teamOfSeason = {
        status: lineup.length === TEAM_OF_SEASON_ROLES.length ? 'ready' : 'incomplete',
        lineup: [...lineup],
        candidateRankings: lineup.candidateRankings || [],
      };
    }
  }

  const derived = { version: 1, fingerprint, leaders, teamOfSeason };
  tournamentViewCache = derived;
  if (knockout.champion) {
    try {
      window.localStorage.setItem(TOURNAMENT_VIEW_CACHE_KEY, JSON.stringify(derived));
    } catch {
    }
  }
  return derived;
}

