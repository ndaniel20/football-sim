const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '../..');

const teamToTest = 'Real Madrid';

const formations = {
  '4-2-3-1': [
    { label: 'GK', preferred: ['GK'], accepted: ['GK'] },
    { label: 'LCB', preferred: ['CB'], accepted: ['CB'] },
    { label: 'RCB', preferred: ['CB'], accepted: ['CB'] },
    { label: 'LB', preferred: ['LB'], accepted: ['LB'] },
    { label: 'RB', preferred: ['RB'], accepted: ['RB'] },
    { label: 'LDM', preferred: ['CDM'], accepted: ['CDM', 'CM'] },
    { label: 'RDM', preferred: ['CDM'], accepted: ['CDM', 'CM'] },
    { label: 'CAM', preferred: ['CAM'], accepted: ['CAM'] },
    { label: 'LM', preferred: ['LW'], accepted: ['LW', 'LM'] },
    { label: 'RM', preferred: ['RW'], accepted: ['RW', 'RM'] },
    { label: 'ST', preferred: ['ST'], accepted: ['ST'] },
  ],
  '4-3-3': [
    { label: 'GK', preferred: ['GK'], accepted: ['GK'] },
    { label: 'LCB', preferred: ['CB'], accepted: ['CB'] },
    { label: 'RCB', preferred: ['CB'], accepted: ['CB'] },
    { label: 'LB', preferred: ['LB'], accepted: ['LB'] },
    { label: 'RB', preferred: ['RB'], accepted: ['RB'] },
    { label: 'CDM', preferred: ['CDM'], accepted: ['CDM'] },
    { label: 'LCM', preferred: ['CM'], accepted: ['CM', 'CDM', 'CAM'] },
    { label: 'RCM', preferred: ['CM'], accepted: ['CM', 'CDM', 'CAM'] },
    { label: 'LW', preferred: ['LW'], accepted: ['LW', 'LM'] },
    { label: 'RW', preferred: ['RW'], accepted: ['RW', 'RM'] },
    { label: 'ST', preferred: ['ST'], accepted: ['ST'] },
  ],
  '4-4-2': [
    { label: 'GK', preferred: ['GK'], accepted: ['GK'] },
    { label: 'LCB', preferred: ['CB'], accepted: ['CB'] },
    { label: 'RCB', preferred: ['CB'], accepted: ['CB'] },
    { label: 'LB', preferred: ['LB'], accepted: ['LB'] },
    { label: 'RB', preferred: ['RB'], accepted: ['RB'] },
    { label: 'LCM', preferred: ['CM'], accepted: ['CM', 'CDM'] },
    { label: 'RCM', preferred: ['CM'], accepted: ['CM', 'CDM'] },
    { label: 'LM', preferred: ['LM'], accepted: ['LM', 'LW'] },
    { label: 'RM', preferred: ['RM'], accepted: ['RM', 'RW'] },
    { label: 'LST', preferred: ['ST'], accepted: ['ST'] },
    { label: 'RST', preferred: ['ST'], accepted: ['ST'] },
  ],
  '3-4-3': [
    { label: 'GK', preferred: ['GK'], accepted: ['GK'] },
    { label: 'CB', preferred: ['CB'], accepted: ['CB'] },
    { label: 'LCB', preferred: ['CB'], accepted: ['CB'] },
    { label: 'RCB', preferred: ['CB'], accepted: ['CB'] },
    { label: 'LCM', preferred: ['CM'], accepted: ['CM', 'CDM'] },
    { label: 'RCM', preferred: ['CM'], accepted: ['CM', 'CDM'] },
    { label: 'LM', preferred: ['LB'], accepted: ['LB'] },
    { label: 'RM', preferred: ['RB'], accepted: ['RB'] },
    { label: 'LW', preferred: ['LW'], accepted: ['LW', 'LM', 'CAM'], primaryOnly: ['CAM'] },
    { label: 'RW', preferred: ['RW'], accepted: ['RW', 'RM', 'CAM'], primaryOnly: ['CAM'] },
    { label: 'ST', preferred: ['ST'], accepted: ['ST'] },
  ],
  '3-5-2': [
    { label: 'GK', preferred: ['GK'], accepted: ['GK'] },
    { label: 'CB', preferred: ['CB'], accepted: ['CB'] },
    { label: 'LCB', preferred: ['CB'], accepted: ['CB'] },
    { label: 'RCB', preferred: ['CB'], accepted: ['CB'] },
    { label: 'CDM', preferred: ['CDM'], accepted: ['CDM'] },
    { label: 'LCM', preferred: ['CM'], accepted: ['CM'] },
    { label: 'RCM', preferred: ['CM'], accepted: ['CM'] },
    { label: 'LM', preferred: ['LB'], accepted: ['LB', 'LM', "LW"] },
    { label: 'RM', preferred: ['RB'], accepted: ['RB', 'RM', "RW"] },
    { label: 'LST', preferred: ['ST'], accepted: ['ST'] },
    { label: 'RST', preferred: ['ST'], accepted: ['ST'] },
  ],
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      inQuotes = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((value) => value !== '')) rows.push(row);
  }

  return rows;
}

function normalizePosition(position) {
  const code = position.trim().toUpperCase();
  if (code === 'LW' || code === 'LM') return 'LEFT_WIDE';
  if (code === 'RW' || code === 'RM') return 'RIGHT_WIDE';
  return code;
}

function positionFit(player, slot) {
  const preferred = slot.preferred.map(normalizePosition);
  const accepted = slot.accepted.map(normalizePosition);
  const primaryOnly = (slot.primaryOnly || []).map(normalizePosition);
  const primary = normalizePosition(player.position);
  const alternates = player.alternatePositions.map(normalizePosition);

  if ((slot.label === 'LW' || slot.label === 'RW') && (primary === 'LB' || primary === 'RB')) return null;

  if (preferred.includes(primary)) return 2;
  if (accepted.includes(primary)) return 1;
  if (alternates.some((position) => preferred.includes(position))) return 0.5;
  if (alternates.some((position) => accepted.includes(position) && !primaryOnly.includes(position))) return 0;

  return null;
}

function attackingPriority(slot) {
  const role = normalizePosition(slot.preferred[0]);
  const priorities = {
    ST: 7,
    RIGHT_WIDE: 6,
    LEFT_WIDE: 5,
    CAM: 4,
    CM: 3,
    CDM: 2,
    RB: 1,
    LB: 1,
    CB: 0,
    GK: 0,
  };

  return priorities[role] ?? 0;
}

function parsePlayers(csvText) {
  const rows = parseCsv(csvText);
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, ''));
  const indexByHeader = new Map(headers.map((header, index) => [header, index]));
  const required = ['first_name', 'last_name', 'common_name', 'overall_rating', 'position', 'alternate_positions'];
  const missing = required.filter((header) => !indexByHeader.has(header));
  if (missing.length) throw new Error(`Player CSV is missing columns: ${missing.join(', ')}`);

  return rows.slice(1).map((row, index) => {
    const get = (header) => row[indexByHeader.get(header)] || '';
    const firstName = get('first_name').trim();
    const lastName = get('last_name').trim();
    const playerId = get('player_id').trim();

    return {
      id: playerId || String(index),
      name: get('common_name').trim() || `${firstName} ${lastName}`.trim() || 'Unnamed player',
      firstName,
      lastName,
      rating: Number.parseInt(get('overall_rating'), 10) || 0,
      potential: Number.parseInt(get('potential'), 10) || null,
      shooting: Number.parseInt(get('shooting'), 10) || 0,
      passing: Number.parseInt(get('passing'), 10) || 0,
      dribbling: Number.parseInt(get('dribbling'), 10) || 0,
      defending: Number.parseInt(get('defending'), 10) || 0,
      physicality: Number.parseInt(get('physicality'), 10) || 0,
      scoringBias: Number.parseFloat(get('scoring_bias')) || 0,
      position: get('position').trim().toUpperCase(),
      alternatePositions: get('alternate_positions').trim().split(/\s+/).filter(Boolean),
    };
  }).filter((player) => player.rating > 0 && player.position);
}

function findTeamConfig(teamName = teamToTest) {
  const teamsRoot = path.join(projectRoot, 'teams');
  const matches = [];

  for (const directory of fs.readdirSync(teamsRoot, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    const configPath = path.join(teamsRoot, directory.name, 'teams.json');
    if (!fs.existsSync(configPath)) continue;

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    for (const team of config.teams || []) {
      if (team.name.trim().toLowerCase() === teamName.trim().toLowerCase()) {
        matches.push({ team, configPath });
      }
    }
  }

  if (matches.length === 0) throw new Error(`Team not found: ${teamName}`);
  if (matches.length > 1) throw new Error(`Team name is ambiguous: ${teamName}`);
  return matches[0].team;
}

function selectBestXI(players, slots) {
  const centralCbSlotIndex = slots.findIndex((slot) => slot.label === 'CB');
  const highestRatedCb = centralCbSlotIndex === -1
    ? null
    : players
      .filter((player) => positionFit(player, slots[centralCbSlotIndex]) !== null)
      .reduce((highest, player) => !highest || player.rating > highest.rating ? player : highest, null);
  let states = new Map([[
    0,
    { filled: 0, ratingTotal: 0, fitTotal: 0, attackingTotal: 0, picks: Array(slots.length).fill(null) },
  ]]);

  function isBetter(candidate, current) {
    if (candidate.filled !== current.filled) return candidate.filled > current.filled;
    if (candidate.ratingTotal !== current.ratingTotal) return candidate.ratingTotal > current.ratingTotal;
    if (candidate.attackingTotal !== current.attackingTotal) {
      return candidate.attackingTotal > current.attackingTotal;
    }
    return candidate.fitTotal > current.fitTotal;
  }

  for (const player of players) {
    const nextStates = new Map(states);

    for (const [mask, state] of states) {
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const slotBit = 1 << slotIndex;
        if (mask & slotBit) continue;
        if (highestRatedCb && (
          (slotIndex === centralCbSlotIndex && player !== highestRatedCb)
          || (player === highestRatedCb && slotIndex !== centralCbSlotIndex)
        )) continue;

        const fit = positionFit(player, slots[slotIndex]);
        if (fit === null) continue;

        const nextMask = mask | slotBit;
        const candidate = {
          filled: state.filled + 1,
          ratingTotal: state.ratingTotal + player.rating,
          fitTotal: state.fitTotal + fit,
          attackingTotal: state.attackingTotal + player.rating * attackingPriority(slots[slotIndex]),
          picks: state.picks.slice(),
        };
        candidate.picks[slotIndex] = player;
        const existing = nextStates.get(nextMask);
        if (!existing || isBetter(candidate, existing)) nextStates.set(nextMask, candidate);
      }
    }

    states = nextStates;
  }

  let best = null;
  for (const candidate of states.values()) {
    if (highestRatedCb && candidate.picks[centralCbSlotIndex] !== highestRatedCb) continue;
    if (!best || isBetter(candidate, best)) best = candidate;
  }

  return best.picks.map((player, slotIndex) => ({ player, slot: slots[slotIndex] }));
}

function assignSelectedPlayers(selectedPlayers, slots, initialLineup) {
  const centralCbSlotIndex = slots.findIndex((slot) => slot.label === 'CB');
  const centralCbPlayer = centralCbSlotIndex === -1
    ? null
    : initialLineup[centralCbSlotIndex]?.player || null;
  let states = new Map([[
    0,
    { primaryMatchTotal: 0, primaryFitTotal: 0, fitTotal: 0, attackingTotal: 0, picks: Array(slots.length).fill(null) },
  ]]);

  function isBetter(candidate, current) {
    if (candidate.primaryMatchTotal !== current.primaryMatchTotal) {
      return candidate.primaryMatchTotal > current.primaryMatchTotal;
    }
    if (candidate.primaryFitTotal !== current.primaryFitTotal) {
      return candidate.primaryFitTotal > current.primaryFitTotal;
    }
    if (candidate.fitTotal !== current.fitTotal) return candidate.fitTotal > current.fitTotal;
    return candidate.attackingTotal > current.attackingTotal;
  }

  for (const player of selectedPlayers) {
    const nextStates = new Map();

    for (const [mask, state] of states) {
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const slotBit = 1 << slotIndex;
        if (mask & slotBit) continue;
        if (centralCbPlayer && (
          (slotIndex === centralCbSlotIndex && player !== centralCbPlayer)
          || (player === centralCbPlayer && slotIndex !== centralCbSlotIndex)
        )) continue;

        const fit = positionFit(player, slots[slotIndex]);
        if (fit === null) continue;

        const nextMask = mask | slotBit;
        const candidate = {
          primaryMatchTotal: state.primaryMatchTotal + (fit >= 1 ? 1 : 0),
          primaryFitTotal: state.primaryFitTotal + (fit >= 1 ? fit : 0),
          fitTotal: state.fitTotal + fit,
          attackingTotal: state.attackingTotal + player.rating * attackingPriority(slots[slotIndex]),
          picks: state.picks.slice(),
        };
        candidate.picks[slotIndex] = player;
        const existing = nextStates.get(nextMask);
        if (!existing || isBetter(candidate, existing)) nextStates.set(nextMask, candidate);
      }
    }

    states = nextStates;
    if (!states.size) return initialLineup;
  }

  let best = null;
  for (const candidate of states.values()) {
    if (!best || isBetter(candidate, best)) best = candidate;
  }

  return best
    ? best.picks.map((player, slotIndex) => ({ player, slot: slots[slotIndex] }))
    : initialLineup;
}

function chooseBestXI(players, slots) {
  const initialLineup = selectBestXI(players, slots);
  const selectedPlayers = initialLineup.map(({ player }) => player).filter(Boolean);
  return assignSelectedPlayers(selectedPlayers, slots, initialLineup);
}

function chooseBestBench(players, slots, lineup) {
  const startingPlayers = new Set(lineup.map(({ player }) => player).filter(Boolean));
  const reserveLineup = chooseBestXI(players.filter((player) => !startingPlayers.has(player)), slots);
  const bench = reserveLineup
    .filter(({ player, slot }) => player && slot.label !== 'GK')
    .map(({ player, slot }) => ({ player, slot }));
  const benchPlayers = new Set(bench.map(({ player }) => player));
  const eligibleFieldSlots = slots.filter((slot) => slot.label !== 'GK');
  const additionalReserves = players
    .filter((player) => !startingPlayers.has(player) && !benchPlayers.has(player)
      && player.position !== 'GK'
      && eligibleFieldSlots.some((slot) => positionFit(player, slot) !== null))
    .map((player) => ({ player, slot: eligibleFieldSlots.find((slot) => positionFit(player, slot) !== null) }))
    .sort((first, second) => second.player.rating - first.player.rating);

  return [...bench, ...additionalReserves]
    .sort((first, second) => second.player.rating - first.player.rating)
    .slice(0, 9);
}

function loadBestXIForTeam(team, rosterOverride) {
  if (!team || typeof team !== 'object') throw new Error('A valid team configuration is required.');
  const slots = formations[team.formation];
  if (!slots) {
    throw new Error(`Unsupported formation "${team.formation}". Supported formations: ${Object.keys(formations).join(', ')}`);
  }
  if (!team.players_path) throw new Error(`No players_path configured for ${team.name}`);

  const playerPath = path.resolve(projectRoot, team.players_path);
  if (!fs.existsSync(playerPath)) throw new Error(`Player CSV not found: ${team.players_path}`);

  const players = Array.isArray(rosterOverride)
    ? rosterOverride
    : parsePlayers(fs.readFileSync(playerPath, 'utf8'));
  if (players.length < 11) throw new Error(`${team.name} has only ${players.length} rated players; eleven are required.`);

  const lineup = chooseBestXI(players, slots);
  const bench = chooseBestBench(players, slots, lineup);
  return { team, slots, players, lineup, bench };
}

function loadBestXI(teamName) {
  return loadBestXIForTeam(findTeamConfig(teamName));
}

function printBestXI({ team, slots, lineup, bench = [] }) {
  const selectedPlayers = lineup.filter(({ player }) => player);
  const totalRating = selectedPlayers.reduce((sum, { player }) => sum + player.rating, 0);

  console.log(`\nBest XI — ${team.name} (${team.formation})`);
  console.log('='.repeat(48));
  for (const { player, slot } of lineup) {
    if (player) {
      console.log(`${slot.label.padEnd(5)} ${player.name} — ${player.rating} OVR`);
    } else {
      console.log(`${slot.label.padEnd(5)} VACANT — no listed-position candidate`);
    }
  }
  console.log('='.repeat(48));
  console.log(`Players selected: ${selectedPlayers.length}/${slots.length}`);
  if (selectedPlayers.length < slots.length) {
    console.log('Some positions are left vacant rather than assigning players out of position.');
  }
  console.log(`Total OVR: ${totalRating} | Average OVR: ${(totalRating / selectedPlayers.length).toFixed(1)}\n`);
  console.log('Bench');
  console.log('='.repeat(48));
  bench.forEach(({ player, slot }) => console.log(`${slot.label.padEnd(5)} ${player.name} — ${player.rating} OVR`));
  console.log('='.repeat(48));
}

if (require.main === module) {
  printBestXI(loadBestXI(teamToTest));
}

module.exports = { formations, loadBestXI, loadBestXIForTeam, parsePlayers, positionFit, chooseBestXI };