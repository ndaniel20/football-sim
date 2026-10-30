const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const CONFIG_DIR = path.join(ROOT, 'teams');
const API_URL = 'https://be.cmtracker.net/api/v2/player';
const DATABASE_ID = '6ae27a7fd7846debfa09de52';
const PAGE_SIZE = 25;
const CONCURRENCY = 3;
const MAX_RETRIES = 3;
const POSITION_BY_ID = new Map([
  [0, 'GK'], [3, 'RB'], [5, 'CB'], [7, 'LB'], [10, 'CDM'], [12, 'RM'],
  [14, 'CM'], [16, 'LM'], [18, 'CAM'], [23, 'RW'], [25, 'ST'], [27, 'LW'],
]);
const OUTPUT_COLUMNS = [
  'player_id', 'common_name', 'first_name', 'last_name', 'overall_rating',
  'position', 'alternate_positions', 'club', 'nationality', 'pace', 'shooting',
  'passing', 'dribbling', 'defending', 'physicality', 'potential',
];
const TEAM_NAME_ALIASES = new Map([
  ['inter', 'Lombardia FC'],
  ['milan', 'Milano FC'],
  ['lazio', 'SS Lazio'],
  ['atalanta', 'Bergamo Calcio'],
  ['napoli', 'SSC Napoli'],
  ['man utd', 'Manchester United'],
  ['spurs', 'Tottenham Hotspur'],
  ['ol', 'Olympique Lyonnais'],
  ['om', 'Olympique de Marseille'],
  ['paris sg', 'Paris SG'],
  ['nott\'m forest', 'Nott\'m Forest'],
  ['celta', 'Celta'],
]);
const REQUEST_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  accept: 'application/json, text/plain, */*',
  referer: 'https://cmtracker.net/',
  origin: 'https://cmtracker.net',
};

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function listTeamConfigs() {
  const configs = [];
  for (const directory of fs.readdirSync(CONFIG_DIR, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    const configPath = path.join(CONFIG_DIR, directory.name, 'teams.json');
    if (!fs.existsSync(configPath)) continue;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    for (const team of config.teams || []) configs.push({ ...team, configPath });
  }
  return configs;
}

function resolveTeamByName(clubName, teamsByName) {
  if (!clubName) return null;
  const alias = TEAM_NAME_ALIASES.get(String(clubName).toLowerCase());
  return teamsByName.get(normalize(alias || clubName)) || null;
}

function getLoanDestination(player) {
  const contract = player.info?.contract || {};
  const parentClub = player.info?.teams?.club_team || {};
  const destination = contract.loanedto_club || parentClub.loanedto_club;
  if (!destination) return null;
  if (typeof destination === 'string') return { id: null, name: destination };
  return {
    id: destination.teamid ?? destination.id ?? null,
    name: destination.name || '',
  };
}

function getCurrentTeam(player, teamsById, teamsByName) {
  const parentClub = player.info?.teams?.club_team || {};
  const loanDestination = getLoanDestination(player);
  const isLoanedOut = Number(player.info?.contract?.isloanedout) === 1;
  if (isLoanedOut && loanDestination) {
    const loanTeam = (loanDestination.id != null && teamsById.get(Number(loanDestination.id)))
      || resolveTeamByName(loanDestination.name, teamsByName);
    return { team: loanTeam, isLoaned: true, displayedName: loanDestination.name || loanTeam?.name || '' };
  }
  const parentTeam = (parentClub.id != null && teamsById.get(Number(parentClub.id)))
    || resolveTeamByName(parentClub.name, teamsByName);
  return { team: parentTeam, isLoaned: false, displayedName: parentClub.name || parentTeam?.name || '' };
}

function getPositionLabels(player) {
  const positionSlots = player.info?.positions || {};
  const slotNumbers = Object.keys(positionSlots).sort((a, b) => Number(a) - Number(b));
  const mapped = slotNumbers
    .map((slot) => Number(positionSlots[slot]))
    .filter((positionId) => positionId >= 0)
    .map((positionId) => POSITION_BY_ID.get(positionId) || '')
    .filter(Boolean);
  const primaryPosition = mapped[0] || '';
  const alternatePositions = [...new Set(mapped.slice(1).filter((position) => position !== primaryPosition))];
  return { primaryPosition, alternatePositions };
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsvRow(player, currentClub) {
  const info = player.info || {};
  const name = info.name || {};
  const attributes = player.card_attrs || {};
  const { primaryPosition, alternatePositions } = getPositionLabels(player);
  const values = [
    player.playerid || info.playerid || '',
    name.knownas || '',
    name.firstname || '',
    name.lastname || '',
    info.overallrating ?? '',
    primaryPosition,
    alternatePositions.join(' '),
    currentClub,
    info.nation?.name || '',
    attributes.pac ?? '',
    attributes.sho ?? '',
    attributes.pas ?? '',
    attributes.dri ?? '',
    attributes.def ?? '',
    attributes.phy ?? '',
    info.potential ?? '',
  ];
  return values.map(csvEscape).join(',');
}

async function getJson(url) {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, { headers: REQUEST_HEADERS });
      if (response.ok) return await response.json();
      const responseText = await response.text();
      lastError = new Error(`HTTP ${response.status}: ${responseText.slice(0, 100)}`);
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
    await wait(300 * (attempt + 1));
  }
  throw lastError || new Error('Request failed without a response.');
}

async function fetchTeamPages(teamId) {
  const players = [];
  let total = null;
  for (let page = 0; total == null || page * PAGE_SIZE < total; page += 1) {
    const url = new URL(API_URL);
    url.searchParams.set('sort', 'overallrating:desc');
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('page', String(page));
    url.searchParams.set('team__in', String(teamId));
    url.searchParams.set('gender__in', 'Male');
    url.searchParams.set('db1', DATABASE_ID);
    const data = await getJson(url);
    if (!Array.isArray(data.players) || !Number.isFinite(Number(data.total))) {
      throw new Error(`Team ${teamId} response is missing players or total.`);
    }
    total = Number(data.total);
    players.push(...data.players);
    if (data.players.length === 0 && page * PAGE_SIZE < total) {
      throw new Error(`Team ${teamId} returned an empty page before all ${total} records were read.`);
    }
  }
  if (players.length !== total) {
    throw new Error(`Team ${teamId}: expected ${total} records across pages, received ${players.length}.`);
  }
  return { total, players };
}

function validatePlayer(player) {
  const info = player.info || {};
  const attributes = player.card_attrs || {};
  const positions = getPositionLabels(player);
  return Boolean(
    (player.playerid || info.playerid)
    && info.name?.firstname
    && info.name?.lastname
    && Number(info.overallrating) > 0
    && positions.primaryPosition
    && info.nation?.name
    && ['pac', 'sho', 'pas', 'dri', 'def', 'phy'].every((key) => attributes[key] != null)
  );
}

async function main() {
  const write = process.argv.includes('--write');
  const configs = listTeamConfigs();
  const teamsById = new Map();
  const teamsByName = new Map();
  const targets = [];
  const unresolvedConfigs = [];
  for (const config of configs) {
    if (config.team_id == null || !Number.isFinite(Number(config.team_id))) {
      unresolvedConfigs.push(config);
      continue;
    }
    const target = { ...config, id: Number(config.team_id), outputPath: path.resolve(ROOT, config.players_path) };
    if (teamsById.has(target.id)) throw new Error(`Duplicate configured team ID ${target.id}.`);
    teamsById.set(target.id, target);
    teamsByName.set(normalize(target.name), target);
    targets.push(target);
  }

  const outputOwners = new Map();
  for (const target of targets) {
    const previousOwner = outputOwners.get(target.outputPath);
    if (previousOwner) throw new Error(`Teams ${previousOwner} and ${target.name} share ${target.players_path}.`);
    outputOwners.set(target.outputPath, target.name);
  }

  const uniquePlayers = new Map();
  const requestErrors = [];
  let nextTarget = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, targets.length) }, async () => {
    while (true) {
      const index = nextTarget;
      nextTarget += 1;
      if (index >= targets.length) return;
      const target = targets[index];
      try {
        const result = await fetchTeamPages(target.id);
        target.apiTotal = result.total;
        target.apiPlayerCount = result.players.length;
        for (let rank = 0; rank < result.players.length; rank += 1) {
          const player = result.players[rank];
          const playerId = String(player.playerid || player.info?.playerid || '');
          if (!playerId) throw new Error(`Team ${target.name} contains a player without an ID.`);
          const current = uniquePlayers.get(playerId);
          if (!current || rank < current.rank) uniquePlayers.set(playerId, { player, rank, queriedFrom: target.name });
        }
        console.log(`FETCHED ${target.name} (ID ${target.id}): ${result.total} source records`);
      } catch (error) {
        requestErrors.push({ team: target.name, id: target.id, error: error.message });
        console.error(`ERROR ${target.name} (ID ${target.id}): ${error.message}`);
      }
    }
  });
  await Promise.all(workers);

  const rosterCandidates = new Map(targets.map((target) => [target.id, new Map()]));
  let femaleRecords = 0;
  let missingCurrentClub = 0;
  let invalidRecords = 0;
  const loanMoves = [];
  for (const { player } of uniquePlayers.values()) {
    if (player.info?.gender !== 'Male') {
      femaleRecords += 1;
      continue;
    }
    if (!validatePlayer(player)) {
      invalidRecords += 1;
      continue;
    }
    const current = getCurrentTeam(player, teamsById, teamsByName);
    if (!current.team) {
      missingCurrentClub += 1;
      continue;
    }
    const playerId = String(player.playerid || player.info.playerid);
    const targetRoster = rosterCandidates.get(current.team.id);
    if (!targetRoster) {
      missingCurrentClub += 1;
      continue;
    }
    const row = toCsvRow(player, current.displayedName || current.team.name);
    const previous = targetRoster.get(playerId);
    const candidate = { player, row, isLoaned: current.isLoaned };
    if (!previous || candidate.isLoaned) targetRoster.set(playerId, candidate);
    if (current.isLoaned) {
      const parent = player.info?.teams?.club_team?.name || 'unknown parent club';
      loanMoves.push(`${player.info.name.knownas || `${player.info.name.firstname} ${player.info.name.lastname}`}: ${parent} → ${current.displayedName || current.team.name}`);
    }
  }

  const ready = [];
  for (const target of targets) {
    if (requestErrors.some((error) => error.team === target.name)) continue;
    const candidates = [...(rosterCandidates.get(target.id)?.values() || [])]
      .sort((a, b) => Number(b.player.info.overallrating) - Number(a.player.info.overallrating))
      .slice(0, PAGE_SIZE);
    const missingAttributes = candidates.filter(({ player }) => !validatePlayer(player));
    if (missingAttributes.length) {
      requestErrors.push({ team: target.name, id: target.id, error: `${missingAttributes.length} roster candidate(s) failed validation.` });
      continue;
    }
    ready.push({
      target,
      players: candidates.map(({ player }) => player),
      rows: candidates.map(({ row }) => row),
    });
    if (candidates.length < PAGE_SIZE) {
      console.warn(`SHORT ROSTER ${target.name}: only ${candidates.length} current-club players found after loan reassignment.`);
    }
  }

  const plannedRows = ready.reduce((sum, item) => sum + item.rows.length, 0);
  console.log(`AUDIT: ${targets.length} configured clubs queried; ${ready.length} complete club responses; ${uniquePlayers.size} unique players; ${plannedRows} roster rows (maximum ${PAGE_SIZE} per club); ${loanMoves.length} loan assignments; ${femaleRecords} non-male records ignored; ${missingCurrentClub} records outside configured clubs; ${invalidRecords} records missing required fields; ${requestErrors.length} request failures; ${unresolvedConfigs.length} clubs have no configured EA ID.`);
  for (const move of [...new Set(loanMoves)].sort()) console.log(`LOAN MOVE ${move}`);
  for (const config of unresolvedConfigs) console.log(`NO TEAM ID: ${config.name} (${config.players_path})`);
  for (const error of requestErrors) console.error(`FAILED CLUB: ${error.team} (${error.id}): ${error.error}`);
  if (!write) {
    console.log('DRY RUN ONLY: no CSVs were changed. Pass --write to replace the ready club rosters.');
    return;
  }

  for (const item of ready) {
    fs.mkdirSync(path.dirname(item.target.outputPath), { recursive: true });
    fs.writeFileSync(item.target.outputPath, `${[OUTPUT_COLUMNS.join(','), ...item.rows].join('\n')}\n`, 'utf8');
    console.log(`WROTE ${item.target.players_path}: ${item.rows.length} current-club men`);
  }
  console.log(`COMPLETE: replaced ${ready.length} club CSVs with ${plannedRows} current-club male players. Failed or unconfigured clubs were left untouched.`);
}

main().catch((error) => {
  console.error(`ROSTER REBUILD ABORTED: ${error.message}`);
  process.exitCode = 1;
});
