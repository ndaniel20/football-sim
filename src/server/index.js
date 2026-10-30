const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { generateLeagueSchedule } = require('../tournament/leagueSchedule');
const { solveDraw } = require('../tournament/drawSolver');
const { simulateMatch } = require('../simulation/engine');
const { PlayerCustomizationStore } = require('../players/playerCustomizations');

const projectRoot = path.resolve(__dirname, '../..');
const publicDirectory = path.join(projectRoot, 'public');
const teamsDirectory = path.join(projectRoot, 'teams');
const port = Number(process.env.PORT) || 3000;
const leagueSources = [
  { key: 'england', name: 'England', flag: 'england', file: 'premier-league' },
  { key: 'spain', name: 'Spain', flag: 'spain', file: 'la-liga' },
  { key: 'germany', name: 'Germany', flag: 'germany', file: 'bundesliga' },
  { key: 'italy', name: 'Italy', flag: 'italy', file: 'serie-a' },
  { key: 'france', name: 'France', flag: 'france', file: 'ligue-1' },
  { key: 'potugal', name: 'Portugal', flag: 'portugal', file: 'portuguese-league' },
  { key: 'turkey', name: 'Turkey', flag: 'turkey', file: 'turkish-league' },
  { key: 'others', name: 'Other leagues', flag: 'others', file: 'others' },
];
const customizationStore = new PlayerCustomizationStore({
  projectRoot,
  teamsDirectory,
  leagueSources,
});
const DEFAULT_SIMULATION_SETTINGS = {
  goalLikelihood: 'medium',
  gameSpeed: 100,
  awayGoals: false,
  usePotential: false,
  coefficientSeeding: true,
};
const GOAL_CHANCE_MULTIPLIERS = { low: 0.72, medium: 1, high: 1.3 };

function normalizeSimulationSettings(value) {
  const settings = value && typeof value === 'object' ? value : {};
  return {
    goalLikelihood: Object.hasOwn(GOAL_CHANCE_MULTIPLIERS, settings.goalLikelihood)
      ? settings.goalLikelihood : DEFAULT_SIMULATION_SETTINGS.goalLikelihood,
    gameSpeed: Number.isFinite(Number(settings.gameSpeed))
      ? Math.max(50, Math.min(200, Math.round(Number(settings.gameSpeed))))
      : DEFAULT_SIMULATION_SETTINGS.gameSpeed,
    awayGoals: typeof settings.awayGoals === 'boolean' ? settings.awayGoals : DEFAULT_SIMULATION_SETTINGS.awayGoals,
    usePotential: typeof settings.usePotential === 'boolean' ? settings.usePotential : DEFAULT_SIMULATION_SETTINGS.usePotential,
    coefficientSeeding: typeof settings.coefficientSeeding === 'boolean'
      ? settings.coefficientSeeding : DEFAULT_SIMULATION_SETTINGS.coefficientSeeding,
  };
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function sendJson(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

function readJsonBody(request, maximumSize) {
  return new Promise((resolve, reject) => {
    let requestBody = '';
    let bodySize = 0;
    let settled = false;
    request.on('data', (chunk) => {
      bodySize += chunk.length;
      if (bodySize > maximumSize) {
        settled = true;
        const error = new Error('The request data is too large.');
        error.statusCode = 413;
        reject(error);
        return;
      }
      if (!settled) requestBody += chunk;
    });
    request.on('end', () => {
      if (settled) return;
      try {
        resolve(JSON.parse(requestBody));
      } catch {
        reject(new Error('The request contains invalid JSON.'));
      }
    });
    request.on('error', (error) => {
      if (!settled) reject(error);
    });
  });
}

function handleDrawRequest(request, response) {
  let requestBody = '';
  let bodySize = 0;
  let tooLarge = false;

  request.on('data', (chunk) => {
    bodySize += chunk.length;
    if (bodySize > 128 * 1024) {
      tooLarge = true;
      response.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'The selected club list is too large.' }));
      request.destroy();
      return;
    }
    requestBody += chunk;
  });

  request.on('end', () => {
    if (tooLarge) return;
    try {
      const payload = JSON.parse(requestBody);
      const draw = solveDraw(payload.teams, { randomizePots: payload.randomizePots === true });
      sendJson(response, 200, draw);
    } catch (error) {
      sendJson(response, 422, { error: error.message || 'Unable to create a valid draw.' });
    }
  });
}

function handleFixtureRequest(request, response) {
  let requestBody = '';
  let bodySize = 0;
  let tooLarge = false;

  request.on('data', (chunk) => {
    bodySize += chunk.length;
    if (bodySize > 128 * 1024) {
      tooLarge = true;
      response.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'The draw data is too large.' }));
      request.destroy();
      return;
    }
    requestBody += chunk;
  });

  request.on('end', () => {
    if (tooLarge) return;
    try {
      const payload = JSON.parse(requestBody);
      const schedule = generateLeagueSchedule(payload.assignments);
      sendJson(response, 200, schedule);
    } catch (error) {
      sendJson(response, 422, { error: error.message || 'Unable to generate league fixtures.' });
    }
  });
}

let availableTeamNamesPromise;
function getAvailableTeamNames() {
  if (!availableTeamNamesPromise) {
    availableTeamNamesPromise = Promise.all(leagueSources.map(async (league) => {
      const dataPath = path.join(teamsDirectory, league.file, 'teams.json');
      const data = JSON.parse(await fs.promises.readFile(dataPath, 'utf8'));
      return (Array.isArray(data.teams) ? data.teams : []).map((team) => team.name);
    })).then((nameLists) => new Set(nameLists.flat()));
  }
  return availableTeamNamesPromise;
}

async function handleTeamLineupRequest(request, response) {
  let leagueKey;
  let teamName;
  let changes;
  let settings = normalizeSimulationSettings();
  try {
    if (request.method === 'POST') {
      const payload = await readJsonBody(request, 2 * 1024 * 1024);
      leagueKey = payload.league;
      teamName = payload.team;
      changes = payload.customizations;
      settings = normalizeSimulationSettings(payload.settings);
    } else {
      const requestUrl = new URL(request.url, 'http://localhost');
      leagueKey = requestUrl.searchParams.get('league');
      teamName = requestUrl.searchParams.get('team');
    }
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: error.message });
    return;
  }
  const league = leagueSources.find((item) => item.key === leagueKey);
  if (!league || !teamName) {
    sendJson(response, 400, { error: 'Choose a league and club.' });
    return;
  }

  try {
    const configPath = path.join(teamsDirectory, league.file, 'teams.json');
    const config = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
    const team = (Array.isArray(config.teams) ? config.teams : []).find((item) => item.name === teamName);
    if (!team) {
      sendJson(response, 404, { error: 'Club not found in this league.' });
      return;
    }

    const result = await customizationStore.getTeamXI(league.key, teamName, changes, settings);
    const serializePlayer = (player) => player ? {
      id: player.id,
      name: player.name,
      rating: player.rating,
      position: player.position,
      alternatePositions: player.alternatePositions,
      playerKey: player.playerKey,
      clubKey: player.clubKey,
      club: player.club,
    } : null;
    const selectedPlayerKeys = new Set([...result.lineup, ...result.bench]
      .map(({ player }) => player)
      .filter(Boolean)
      .map((player) => player.playerKey));
    const reserves = result.players
      .filter((player) => !selectedPlayerKeys.has(player.playerKey))
      .sort((first, second) => second.rating - first.rating || first.name.localeCompare(second.name))
      .map(serializePlayer);
    sendJson(response, 200, {
      team: {
        team_id: team.team_id,
        name: team.name,
        league: team.league,
        formation: team.formation,
        customizationKey: result.team.customizationKey,
      },
      lineup: result.lineup.map(({ player, slot }) => ({ slot: slot.label, player: serializePlayer(player) })),
      bench: result.bench.map(({ player, slot }) => ({ slot: slot.label, player: serializePlayer(player) })),
      reserves,
    });
  } catch (error) {
    console.error(`Unable to load lineup for ${teamName}: ${error.message}`);
    sendJson(response, 500, { error: `Unable to load the lineup for ${teamName}.` });
  }
}

function handlePlayerCustomizationRequest(request, response) {
  readJsonBody(request, 2 * 1024 * 1024)
    .then(async (payload) => {
      const { customizations, settings, ...edit } = payload;
      const result = await customizationStore.savePlayerCustomization(
        edit, customizations, normalizeSimulationSettings(settings),
      );
      const { changes, ...player } = result;
      sendJson(response, 200, { player, customizations: changes });
    })
    .catch((error) => sendJson(response, error.statusCode || 422, {
      error: error.message || 'Unable to save player changes.',
    }));
}

async function handleCustomizationMigration(request, response) {
  try {
    if (request.method === 'GET') {
      sendJson(response, 200, { customizations: await customizationStore.readLegacyChanges() });
      return;
    }
    await customizationStore.completeLegacyMigration();
    sendJson(response, 200, { migrated: true });
  } catch (error) {
    sendJson(response, 500, { error: error.message || 'Unable to migrate previous player changes.' });
  }
}

const PLAYER_MATCH_TOTALS = [
  'goals', 'assists', 'shots', 'shotsOnTarget', 'xG', 'xGOnTarget', 'saves',
  'chancesCreated', 'offensiveDuelsWon', 'defensiveDuelsStopped', 'goalsConceded',
];

function mergePlayerMatchStats(firstStats = [], secondStats = []) {
  const merged = new Map();
  for (const player of [...firstStats, ...secondStats]) {
    const key = `${player.teamName}:${player.playerId || player.playerName}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...player, alternatePositions: [...(player.alternatePositions || [])] });
      continue;
    }
    for (const field of PLAYER_MATCH_TOTALS) existing[field] = (existing[field] || 0) + (player[field] || 0);
    existing.appearances = Math.max(existing.appearances || 0, player.appearances || 0);
  }
  return [...merged.values()];
}

function finalizePlayerMatchStats(playerStats, homeTeamName, awayTeamName, homeGoals, awayGoals) {
  for (const player of playerStats) {
    player.cleanSheets = 0;
    if (player.position !== 'GK') continue;
    player.cleanSheets = (player.teamName === homeTeamName ? awayGoals : homeGoals) === 0 ? 1 : 0;
    player.xGPrevented = Number(((player.xGOnTarget || 0) - (player.goalsConceded || 0)).toFixed(2));
  }
  return playerStats;
}

function simulateKnockoutMatch(match, teamXIs, settings) {
  const neutral = match.neutral === true;
  const aggregateBefore = [match.aggregateHomeGoals || 0, match.aggregateAwayGoals || 0];
  const awayGoalsBefore = Array.isArray(match.awayGoalsBefore)
    && match.awayGoalsBefore.length === 2
    && match.awayGoalsBefore.every((goals) => Number.isInteger(goals) && goals >= 0)
    ? match.awayGoalsBefore : [0, 0];
  const goalChanceMultiplier = GOAL_CHANCE_MULTIPLIERS[settings.goalLikelihood];
  const regular = simulateMatch(match.homeTeamName, match.awayTeamName, {
    possessions: 90,
    quiet: true,
    homeTeamIndex: 0,
    neutral,
    aggregateGoals: aggregateBefore,
    teamXIs,
    goalChanceMultiplier,
  });
  let stats = regular.stats;
  let minuteStats = regular.minuteStats;
  let possessions = regular.possessions;
  let playerStats = regular.playerStats;
  let extraTime = false;
  let penalties = null;
  const aggregateAfterRegulation = [
    aggregateBefore[0] + regular.stats[0].goals,
    aggregateBefore[1] + regular.stats[1].goals,
  ];
  const awayGoalsAfterRegulation = [
    awayGoalsBefore[0],
    awayGoalsBefore[1] + regular.stats[1].goals,
  ];
  let awayGoalsWinnerIndex = null;
  if (match.resolveTie === true && aggregateAfterRegulation[0] === aggregateAfterRegulation[1]
    && settings.awayGoals && match.awayGoalsEligible === true) {
    if (awayGoalsAfterRegulation[0] !== awayGoalsAfterRegulation[1]) {
      awayGoalsWinnerIndex = awayGoalsAfterRegulation[0] > awayGoalsAfterRegulation[1] ? 0 : 1;
    }
  }
  const lastRegulationGoalMinute = regular.stats.flatMap((teamStats) => teamStats.goalEvents)
    .reduce((latest, goal) => Math.max(latest, goal.minute), Number.NEGATIVE_INFINITY);

  if (match.resolveTie === true && aggregateAfterRegulation[0] === aggregateAfterRegulation[1]
    && awayGoalsWinnerIndex === null) {
    extraTime = true;
    const extra = simulateMatch(match.homeTeamName, match.awayTeamName, {
      possessions: 30,
      quiet: true,
      homeTeamIndex: 0,
      neutral,
      teamXIs: regular.teams,
      allowSubstitutions: false,
      aggregateGoals: aggregateAfterRegulation,
      matchGoals: [regular.stats[0].goals, regular.stats[1].goals],
      lastGoalMinute: Number.isFinite(lastRegulationGoalMinute) ? lastRegulationGoalMinute - 90 : undefined,
      startingPlayerGoals: Object.fromEntries(regular.playerStats.map((player) => [
        String(player.playerId || player.playerName), player.goals || 0,
      ])),
      goalChanceMultiplier,
    });
    stats = regular.stats.map((teamStats, index) => ({
      ...teamStats,
      possessions: teamStats.possessions + extra.stats[index].possessions,
      duelsWon: teamStats.duelsWon + extra.stats[index].duelsWon,
      duelsLost: teamStats.duelsLost + extra.stats[index].duelsLost,
      midfieldDuelsWon: teamStats.midfieldDuelsWon + extra.stats[index].midfieldDuelsWon,
      midfieldDuelsLost: teamStats.midfieldDuelsLost + extra.stats[index].midfieldDuelsLost,
      shots: teamStats.shots + extra.stats[index].shots,
      shotsOnTarget: teamStats.shotsOnTarget + extra.stats[index].shotsOnTarget,
      saves: teamStats.saves + extra.stats[index].saves,
      goals: teamStats.goals + extra.stats[index].goals,
      xG: teamStats.xG + extra.stats[index].xG,
      goalEvents: [
        ...teamStats.goalEvents,
        ...extra.stats[index].goalEvents.map((event) => ({ ...event, minute: event.minute + 90 })),
      ],
    }));
    playerStats = mergePlayerMatchStats(regular.playerStats, extra.playerStats);
    const extraMinuteStats = extra.minuteStats.map((snapshot, index) => {
      const elapsed = index + 1;
      const homeExtraPossession = snapshot.homePossession / 100 * elapsed;
      const awayExtraPossession = snapshot.awayPossession / 100 * elapsed;
      const total = regular.possessions + elapsed;
      return {
        ...snapshot,
        minute: snapshot.minute + 90,
        homeXG: Number((regular.stats[0].xG + extra.stats[0].xG * elapsed / extra.possessions).toFixed(2)),
        awayXG: Number((regular.stats[1].xG + extra.stats[1].xG * elapsed / extra.possessions).toFixed(2)),
        homePossession: (regular.stats[0].possessions + homeExtraPossession) / total * 100,
        awayPossession: (regular.stats[1].possessions + awayExtraPossession) / total * 100,
      };
    });
    minuteStats = [...regular.minuteStats, ...extraMinuteStats];
    possessions += extra.possessions;

    const aggregateAfterExtraTime = [
      aggregateAfterRegulation[0] + extra.stats[0].goals,
      aggregateAfterRegulation[1] + extra.stats[1].goals,
    ];
    if (aggregateAfterExtraTime[0] === aggregateAfterExtraTime[1]) {
      const awayGoalsAfterExtraTime = [
        awayGoalsAfterRegulation[0],
        awayGoalsAfterRegulation[1] + extra.stats[1].goals,
      ];
      if (settings.awayGoals && match.awayGoalsEligible === true
        && awayGoalsAfterExtraTime[0] !== awayGoalsAfterExtraTime[1]) {
        awayGoalsWinnerIndex = awayGoalsAfterExtraTime[0] > awayGoalsAfterExtraTime[1] ? 0 : 1;
      }
    }
    if (aggregateAfterExtraTime[0] === aggregateAfterExtraTime[1] && awayGoalsWinnerIndex === null) {
      const averageOutfieldShooting = (team) => {
        const players = team.lineup.filter(({ player, slot }) => player && slot.label !== 'GK');
        return players.reduce((sum, { player }) => sum + player.shooting, 0) / Math.max(players.length, 1);
      };
      const goalkeepers = regular.teams.map((team) => team.lineup.find(({ slot }) => slot.label === 'GK')?.player);
      const shootProbability = (attackingIndex) => Math.max(0.45, Math.min(0.9,
        0.72 + (averageOutfieldShooting(regular.teams[attackingIndex]) - (goalkeepers[1 - attackingIndex]?.rating || 70)) * 0.004));
      let homeKicks = 0;
      let awayKicks = 0;
      for (let kick = 0; kick < 5; kick += 1) {
        if (Math.random() < shootProbability(0)) homeKicks += 1;
        if (Math.random() < shootProbability(1)) awayKicks += 1;
        if (homeKicks > awayKicks + 4 - kick || awayKicks > homeKicks + 4 - kick) break;
      }
      let suddenDeathRounds = 0;
      while (homeKicks === awayKicks && suddenDeathRounds < 50) {
        if (Math.random() < shootProbability(0)) homeKicks += 1;
        if (Math.random() < shootProbability(1)) awayKicks += 1;
        suddenDeathRounds += 1;
      }
      if (homeKicks === awayKicks) {
        if (Math.random() < 0.5) homeKicks += 1;
        else awayKicks += 1;
      }
      penalties = { home: homeKicks, away: awayKicks, winnerIndex: homeKicks > awayKicks ? 0 : 1 };
    }
  }

  const events = [
    ...stats.flatMap((teamStats, teamIndex) => teamStats.goalEvents.map((event) => ({
      ...event,
      teamIndex,
    }))),
    ...regular.substitutionEvents,
  ].sort((first, second) => first.minute - second.minute);
  const homeTeam = regular.teams[0];
  const awayTeam = regular.teams[1];
  playerStats = finalizePlayerMatchStats(playerStats, homeTeam.team.name, awayTeam.team.name, stats[0].goals, stats[1].goals);
  const goalkeeper = (team) => team.lineup.find(({ slot }) => slot.label === 'GK')?.player || null;
  const homeGoalkeeper = goalkeeper(homeTeam);
  const awayGoalkeeper = goalkeeper(awayTeam);
  return {
    id: match.id,
    homeGoals: stats[0].goals,
    awayGoals: stats[1].goals,
    homeTeamName: homeTeam.team.name,
    awayTeamName: awayTeam.team.name,
    homeGoalkeeper: homeGoalkeeper?.name || null,
    awayGoalkeeper: awayGoalkeeper?.name || null,
    homeGoalkeeperId: homeGoalkeeper?.id || null,
    awayGoalkeeperId: awayGoalkeeper?.id || null,
    events,
    playerStats,
    minuteStats,
    homeStats: {
      possessions: stats[0].possessions,
      shots: stats[0].shots,
      shotsOnTarget: stats[0].shotsOnTarget,
      saves: stats[0].saves,
      xG: Number(stats[0].xG.toFixed(2)),
    },
    awayStats: {
      possessions: stats[1].possessions,
      shots: stats[1].shots,
      shotsOnTarget: stats[1].shotsOnTarget,
      saves: stats[1].saves,
      xG: Number(stats[1].xG.toFixed(2)),
    },
    possessions,
    extraTime,
    penalties,
    awayGoalsWinnerIndex,
    awayGoalsRuleUsed: settings.awayGoals && match.awayGoalsEligible === true,
  };
}

function handleSimulationRequest(request, response) {
  let requestBody = '';
  let bodySize = 0;
  let tooLarge = false;

  request.on('data', (chunk) => {
    bodySize += chunk.length;
    if (bodySize > 2 * 1024 * 1024) {
      tooLarge = true;
      response.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'The simulation request is too large.' }));
      request.destroy();
      return;
    }
    requestBody += chunk;
  });

  request.on('end', async () => {
    if (tooLarge) return;
    try {
      const payload = JSON.parse(requestBody);
      if (!Array.isArray(payload.matches) || payload.matches.length < 1 || payload.matches.length > 18) {
        throw new Error('Simulation requests must contain between 1 and 18 matches.');
      }
      const availableTeamNames = await getAvailableTeamNames();
      const settings = normalizeSimulationSettings(payload.settings);
      const ids = new Set();
      const teamLineups = await customizationStore.getXIsByTeamNames(payload.matches
        .flatMap((match) => [match?.homeTeamName, match?.awayTeamName])
        .filter((name) => typeof name === 'string'), payload.customizations, settings);
      const results = payload.matches.map((match) => {
        if (!match || typeof match.id !== 'string' || ids.has(match.id)
          || !availableTeamNames.has(match.homeTeamName) || !availableTeamNames.has(match.awayTeamName)
          || match.homeTeamName === match.awayTeamName) {
          throw new Error('A simulation match contains an unknown club or invalid fixture id.');
        }
        ids.add(match.id);
        const teamXIs = [teamLineups.get(match.homeTeamName), teamLineups.get(match.awayTeamName)];
        if (teamXIs.some((teamXI) => !teamXI)) throw new Error('A match club could not be loaded.');
        if (match.knockout === true) return simulateKnockoutMatch(match, teamXIs, settings);
        const { teams, stats, possessions, minuteStats, substitutionEvents } = simulateMatch(match.homeTeamName, match.awayTeamName, {
          possessions: 90,
          quiet: true,
          homeTeamIndex: 0,
          teamXIs,
          goalChanceMultiplier: GOAL_CHANCE_MULTIPLIERS[settings.goalLikelihood],
        });
        const events = stats.flatMap((teamStats, teamIndex) => teamStats.goalEvents.map((event) => ({
          ...event,
          teamIndex,
        }))).concat(substitutionEvents).sort((first, second) => first.minute - second.minute);
        const playerStats = finalizePlayerMatchStats(
          stats.flatMap((teamStats) => [...teamStats.playerStats.values()]),
          teams[0].team.name,
          teams[1].team.name,
          stats[0].goals,
          stats[1].goals,
        );
        return {
          id: match.id,
          homeGoals: stats[0].goals,
          awayGoals: stats[1].goals,
          homeTeamName: teams[0].team.name,
          awayTeamName: teams[1].team.name,
          homeGoalkeeper: teams[0].lineup.find(({ slot }) => slot.label === 'GK')?.player?.name || null,
          awayGoalkeeper: teams[1].lineup.find(({ slot }) => slot.label === 'GK')?.player?.name || null,
          homeGoalkeeperId: teams[0].lineup.find(({ slot }) => slot.label === 'GK')?.player?.id || null,
          awayGoalkeeperId: teams[1].lineup.find(({ slot }) => slot.label === 'GK')?.player?.id || null,
          events,
          playerStats,
          minuteStats,
          homeStats: {
            possessions: stats[0].possessions,
            shots: stats[0].shots,
            shotsOnTarget: stats[0].shotsOnTarget,
            saves: stats[0].saves,
            xG: Number(stats[0].xG.toFixed(2)),
          },
          awayStats: {
            possessions: stats[1].possessions,
            shots: stats[1].shots,
            shotsOnTarget: stats[1].shotsOnTarget,
            saves: stats[1].saves,
            xG: Number(stats[1].xG.toFixed(2)),
          },
          possessions,
        };
      });
      sendJson(response, 200, { results });
    } catch (error) {
      sendJson(response, 422, { error: error.message || 'Unable to simulate the requested matches.' });
    }
  });
}

async function handleCustomizationCatalogRequest(request, response) {
  try {
    const payload = await readJsonBody(request, 2 * 1024 * 1024);
    const settings = normalizeSimulationSettings(payload.settings);
    const changes = await customizationStore.normalizeChanges(payload.customizations);
    const [{ byKey }, { byPlayerKey }] = await Promise.all([
      customizationStore.getCatalog(),
      customizationStore.getBaseRoster(),
    ]);
    const players = changes.order.map((playerKey) => {
      const edit = changes.players[playerKey];
      const base = byPlayerKey.get(playerKey);
      const originalClub = byKey.get(base.originClubKey);
      const currentClub = byKey.get(edit.clubKey);
      return {
        playerKey,
        id: base.id,
        name: base.name,
        originalClub: { key: originalClub.customizationKey, name: originalClub.name, team_id: originalClub.team_id },
        currentClub: { key: currentClub.customizationKey, name: currentClub.name, team_id: currentClub.team_id },
        originalPosition: base.position,
        originalAlternatePositions: base.alternatePositions,
        originalRating: settings.usePotential && Number.isInteger(base.potential) && base.potential > 0
          ? base.potential : base.rating,
        position: edit.position,
        alternatePositions: edit.alternatePositions,
        rating: edit.rating,
      };
    });
    sendJson(response, 200, { players });
  } catch (error) {
    sendJson(response, error.statusCode || 422, { error: error.message || 'Unable to load the change log.' });
  }
}

const server = http.createServer((request, response) => {
  let requestPath;
  try {
    requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }

  if (requestPath === '/api/draw' && request.method === 'POST') {
    handleDrawRequest(request, response);
    return;
  }

  if (requestPath === '/api/league-fixtures' && request.method === 'POST') {
    handleFixtureRequest(request, response);
    return;
  }

  if (requestPath === '/api/simulate-matches' && request.method === 'POST') {
    handleSimulationRequest(request, response);
    return;
  }

  if (requestPath === '/api/player-customizations' && request.method === 'POST') {
    handlePlayerCustomizationRequest(request, response);
    return;
  }

  if (requestPath === '/api/player-customizations/catalog' && request.method === 'POST') {
    handleCustomizationCatalogRequest(request, response);
    return;
  }

  if (requestPath === '/api/player-customizations/migrate'
    && ['GET', 'POST'].includes(request.method)) {
    handleCustomizationMigration(request, response);
    return;
  }

  if (requestPath === '/api/team-lineup' && request.method === 'POST') {
    handleTeamLineupRequest(request, response);
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method not allowed');
    return;
  }

  if (requestPath === '/api/team-lineup') {
    handleTeamLineupRequest(request, response);
    return;
  }

  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const filePath = path.resolve(publicDirectory, relativePath);

  if (requestPath === '/api/teams') {
    Promise.all(leagueSources.map(async (league) => {
      const dataPath = path.join(teamsDirectory, league.file, 'teams.json');
      const data = JSON.parse(await fs.promises.readFile(dataPath, 'utf8'));
      return {
        ...league,
        teams: (Array.isArray(data.teams) ? data.teams : []).map((team) => ({
          ...team,
          customizationKey: `${league.key}:${team.team_id === null || team.team_id === undefined
            ? team.name.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')
            : team.team_id}`,
        })),
      };
    }))
      .then((leagues) => {
        const body = Buffer.from(JSON.stringify({ leagues }));
        response.writeHead(200, {
          'Cache-Control': 'no-cache',
          'Content-Length': body.length,
          'Content-Type': 'application/json; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(request.method === 'HEAD' ? undefined : body);
      })
      .catch((error) => {
        console.error(`Unable to load tournament teams: ${error.message}`);
        response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'Unable to load tournament teams' }));
      });
    return;
  }

  if (!filePath.startsWith(`${publicDirectory}${path.sep}`)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Unable to read file');
      return;
    }

    response.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Length': content.length,
      'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`UCL Simulator XI is running at http://localhost:${port}`);
});
