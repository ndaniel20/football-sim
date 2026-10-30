const teamAName = 'Man Utd';
const teamBName = 'Atlético de Madrid';
const matchPossessions = 90;

const { loadBestXI, positionFit } = require('../lineups/generateBestXI');

const attackingRoutes = {
	'4-4-2': {
		left: [['LB'], ['LCM'], ['LM'], ['LST']],
		center: [['LCM', 'RCM'], ['LM', 'RM'], ['LST', 'RST'], ['LST', 'RST']],
		right: [['RB'], ['RCM'], ['RM'], ['RST']],
	},
	'4-3-3': {
		left: [['LB'], ['LCM'], ['LW'], ['ST']],
		center: [['CDM'], ['LCM', 'RCM'], ['LW', 'RW'], ['LW', 'ST', 'RW']],
		right: [['RB'], ['RCM'], ['RW'], ['ST']],
	},
	'4-2-3-1': {
		left: [['LB'], ['LDM', 'CAM'], ['LM'], ['ST']],
		center: [['LDM', 'RDM'], ['LM', 'RM'], ['CAM', 'LM', 'RM'], ['ST']],
		right: [['RB'], ['RDM', 'CAM'], ['RM'], ['ST']],
	},
	'3-4-3': {
		left: [['LCM'], ['LM'], ['LW'], ['ST']],
		center: [['LCM', 'RCM'], ['LM', 'RM'], ['LW', 'RW'], ['ST', 'LW', 'RW']],
		right: [['RCM'], ['RM'], ['RW'], ['ST']],
	},
	'3-5-2': {
		left: [['CDM'], ['LCM', 'LM'], ['LM', 'LCM'], ['LST']],
		center: [['LCM', 'RCM'], ['LM', 'RM'], ['LST', 'RST'], ['LST', 'RST']],
		right: [['CDM'], ['RCM', 'RM'], ['RM', 'RCM'], ['RST']],
	},
};

const defensiveRoutes = {
	'4-4-2': {
		left: [['LM'], ['LCM'], ['LB'], ['LCB'], ['RCB'], ['GK']],
		center: [['LCM', 'RCM'], ['LCM', 'RCM'], ['LB', 'RB'], ['LCB', 'RCB'], ['LCB', 'RCB'], ['GK']],
		right: [['RM'], ['RCM'], ['RB'], ['RCB'], ['LCB'], ['GK']],
	},
	'4-3-3': {
		left: [['LCM'], ['CDM'], ['LB'], ['LCB'], ['RCB'], ['GK']],
		center: [['LCM', 'RCM'], ['CDM'], ['LB', 'RB'], ['LCB', 'RCB'], ['LCB', 'RCB'], ['GK']],
		right: [['RCM'], ['CDM'], ['RB'], ['RCB'], ['LCB'], ['GK']],
	},
	'4-2-3-1': {
		left: [['LM', 'CAM'], ['LDM'], ['LB'], ['LCB'], ['RCB'], ['GK']],
		center: [['CAM'], ['LDM', 'RDM'], ['LB', 'RB'], ['LCB', 'RCB'], ['LCB', 'RCB'], ['GK']],
		right: [['RM', 'CAM'], ['RDM'], ['RB'], ['RCB'], ['LCB'], ['GK']],
	},
	'3-4-3': {
		left: [['LCM'], ['LM'], ['LCB'], ['CCB'], ['RCB'], ['GK']],
		center: [['LCM', 'RCM'], ['LM', 'RM'], ['LCB', 'RCB'], ['LCB', 'RCB'], ['CCB'], ['GK']],
		right: [['RCM'], ['RM'], ['RCB'], ['CCB'], ['LCB'], ['GK']],
	},
	'3-5-2': {
		left: [['LCM'], ['LM'], ['LCB'], ['CCB'], ['RCB'], ['GK']],
		center: [['LCM', 'RCM'], ['CDM'], ['LCB', 'RCB'], ['LCB', 'RCB'], ['CCB'], ['GK']],
		right: [['RCM'], ['RM'], ['RCB'], ['CCB'], ['LCB'], ['GK']],
	},
};

const laneNames = ['left', 'center', 'right'];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const homeAdvantageBoosts = { 1: 0.5, 2: 2, 3: 3.5 };
const awayAdvantageAdjustments = { 1: -1.5, 2: -0.6, 3: 0 };
const goalCooldownMinutes = 2;
const hatTrickPassThreshold = 3;
const hatTrickPassChance = 0.75;

function formationRoutes(formation) {
	if (formation === '3-4-2-1') {
		return {
			attack: {
				left: [['LCM'], ['LM'], ['LAM'], ['ST']],
				center: [['LCM', 'RCM'], ['LAM', 'RAM'], ['LAM', 'RAM'], ['ST']],
				right: [['RCM'], ['RM'], ['RAM'], ['ST']],
			},
			defend: defensiveRoutes['3-4-3'],
		};
	}
	const attack = attackingRoutes[formation];
	const defend = defensiveRoutes[formation];
	if (!attack || !defend) throw new Error(`No simulation routes are defined for ${formation}.`);
	return { attack, defend };
}

function lineupPlayers(team) {
	return team.lineup
		.filter(({ player }) => player)
		.map(({ player, slot }) => ({ player, role: slot.label }));
}

function roleCandidates(team, roles) {
	const available = lineupPlayers(team);
	return roles.flatMap((role) => {
		const resolvedRole = role === 'CCB' ? 'CB' : role;
		return available.filter(({ role: lineupRole }) => lineupRole === resolvedRole);
	});
}

const midfieldRoles = new Set(['CDM', 'LDM', 'RDM', 'CM', 'LCM', 'RCM', 'CAM', 'LAM', 'RAM', 'LM', 'RM']);
const creativeRoles = new Set(['CAM', 'LAM', 'RAM', 'LM', 'RM', 'LW', 'RW']);

function hasRole(roles, roleSet) {
	return roles.some((role) => roleSet.has(role));
}

function attackSkill(player, layerIndex = 1, roles = [], homeBoost = 0) {
	const phase = Math.min(layerIndex, 3);
	const midfieldWeights = [
		{ passing: 0.50, dribbling: 0.05 },
		{ passing: 0.45, dribbling: 0.05 },
		{ passing: 0.40, dribbling: 0.10 },
		{ passing: 0.35, dribbling: 0.15 },
	];
	const otherWeights = [
		{ passing: 0.40, dribbling: 0.10 },
		{ passing: 0.35, dribbling: 0.15 },
		{ passing: 0.30, dribbling: 0.20 },
		{ passing: 0.25, dribbling: 0.25 },
	];
	const attributeWeights = (hasRole(roles, midfieldRoles) ? midfieldWeights : otherWeights)[phase];
	return player.passing * attributeWeights.passing
		+ player.dribbling * attributeWeights.dribbling
		+ player.rating * (1 - attributeWeights.passing - attributeWeights.dribbling)
		+ (player.scoringBias || 0) * (phase / 3)
		+ homeBoost;
}


function defensiveSkill(player, roles = [], homeBoost = 0) {
	if (hasRole(roles, midfieldRoles)) {
		return player.defending * 0.20 + player.physicality * 0.10
			+ player.passing * 0.40 + player.rating * 0.30 + homeBoost;
	}
	return player.defending * 0.45 + player.physicality * 0.45 + player.rating * 0.10 + homeBoost;
}

function midfieldControlRating(team) {
	const midfielders = team.lineup.filter(({ player, slot }) => player
		&& ['CDM', 'LDM', 'RDM', 'CM', 'LCM', 'RCM', 'CAM', 'LAM', 'RAM', 'LM', 'RM'].includes(slot.label));
	if (!midfielders.length) return 60;
	return midfielders.reduce((total, { player }) => total + player.passing * 0.55 + player.rating * 0.45, 0)
		/ midfielders.length + (team.venueAdjustment || 0);
}

function getHomeAdvantageBoost(team) {
	const tier = team.team.home_advantage;
	if (!Object.hasOwn(homeAdvantageBoosts, tier)) {
		throw new Error(`${team.team.name} must have a home_advantage tier of 1, 2, or 3.`);
	}
	return homeAdvantageBoosts[tier];
}

function getAwayAdvantageAdjustment(team) {
	const tier = team.team.away_advantage;
	if (!Object.hasOwn(awayAdvantageAdjustments, tier)) {
		throw new Error(`${team.team.name} must have an away_advantage tier of 1, 2, or 3.`);
	}
	return awayAdvantageAdjustments[tier];
}

function selectAssister(attackerLine, involvedAttackers, scorer, random) {
	const candidates = attackerLine.filter(({ player }) => player !== scorer && involvedAttackers.has(player));
	if (!candidates.length) return null;
	const creativityScores = candidates.map(({ player, roles }) => player.passing * 0.65
		+ player.rating * 0.35 + (hasRole(roles, creativeRoles) ? 5 : 0));
	return softmaxChoice(candidates, creativityScores, random, 9).player;
}

function teamTendencyAdjustment(team, tendency = team.team.offensive_tendency) {
	if (!Number.isFinite(tendency) || tendency < 0 || tendency > 100) {
		throw new Error(`${team.team.name} must have an offensive_tendency value from 0 to 100.`);
	}
	return (tendency - 50) * 0.10;
}

function effectiveOffensiveTendency(team, teamIndex, aggregateScore, matchScore) {
	const baseTendency = team.team.offensive_tendency;
	teamTendencyAdjustment(team, baseTendency);
	const margin = aggregateScore[teamIndex] - aggregateScore[1 - teamIndex];
	const totalMatchGoals = matchScore[0] + matchScore[1];
	let change = 0;

	if (totalMatchGoals >= 7 || matchScore[teamIndex] >= 5) {
		change = -50;
	} else if (margin >= 4 || totalMatchGoals >= 6) {
		change = -38;
	} else if (margin >= 3 || matchScore[teamIndex] >= 4) {
		change = -24;
	} else if (margin >= 2 || matchScore[teamIndex] >= 3) {
		change = -12;
	} else if (margin === 1) {
		change = -6;
	} else if (margin <= -2) {
		change = 16;
	} else if (margin === -1) {
		change = 8;
	}
	return clamp(baseTendency + change, 1, 100);
}

function selectPlayer(team, roles, alreadyUsed, skillSelector, random = Math.random) {
	const rolePlayers = roleCandidates(team, roles);
	const unusedRolePlayers = rolePlayers.filter(({ player }) => !alreadyUsed.has(player));
	const candidates = unusedRolePlayers.length ? unusedRolePlayers : rolePlayers;
	if (candidates.length) {
		return softmaxChoice(candidates, candidates.map(({ player }) => skillSelector(player)), random, 9);
	}

	const fallbackPlayers = lineupPlayers(team).filter(({ role }) => role !== 'GK');
	const unusedFallbacks = fallbackPlayers.filter(({ player }) => !alreadyUsed.has(player));
	const fallback = unusedFallbacks.length ? unusedFallbacks : fallbackPlayers;
	const selectedFallback = fallback.length
		? softmaxChoice(fallback, fallback.map(({ player }) => skillSelector(player)), random, 9)
		: null;
	return selectedFallback ? { ...selectedFallback, fallback: true } : null;
}

function softmaxChoice(items, scores, random, temperature = 7) {
	const maxScore = Math.max(...scores);
	const weights = scores.map((score) => Math.exp((score - maxScore) / temperature));
	const total = weights.reduce((sum, weight) => sum + weight, 0);
	let roll = random() * total;
	for (let index = 0; index < items.length; index += 1) {
		roll -= weights[index];
		if (roll <= 0) return items[index];
	}
	return items[items.length - 1];
}

function cloneTeamXI(teamXI) {
	return {
		...teamXI,
		lineup: teamXI.lineup.map((entry) => ({ ...entry })),
		bench: (teamXI.bench || []).map((entry) => ({ ...entry })),
	};
}

function createSubstitutionSchedules(teams, possessions, random) {
	if (possessions < 60) return [[], []];
	const counts = [3 + Math.floor(random() * 3), 3 + Math.floor(random() * 3)];
	if (counts[1] === counts[0]) {
		const alternatives = [3, 4, 5].filter((count) => count !== counts[0]);
		counts[1] = alternatives[Math.floor(random() * alternatives.length)];
	}
	const latestMinute = Math.min(possessions, 90);
	return teams.map((team, teamIndex) => {
		const availableMinutes = Array.from({ length: Math.max(0, latestMinute - 59) }, (_, index) => index + 60);
		const schedule = [];
		const count = Math.min(counts[teamIndex], team.bench.length, availableMinutes.length);
		for (let index = 0; index < count; index += 1) {
			const minuteIndex = Math.floor(random() * availableMinutes.length);
			schedule.push(availableMinutes.splice(minuteIndex, 1)[0]);
		}
		return schedule.sort((first, second) => first - second);
	});
}

function makeSubstitution(team, teamIndex, minute, teamStats, playedLineup, random) {
	const candidates = team.bench.map((entry, benchIndex) => ({
		...entry,
		benchIndex,
		replaceable: team.lineup.filter(({ player, slot }) => player && slot.label !== 'GK'
			&& positionFit(entry.player, slot) !== null),
	})).filter(({ player, replaceable }) => player && replaceable.length);
	if (!candidates.length) return null;

	const incoming = softmaxChoice(candidates, candidates.map(({ player }) => player.rating), random, 7);
	const outgoingSlot = incoming.replaceable[Math.floor(random() * incoming.replaceable.length)];
	const lineupIndex = team.lineup.indexOf(outgoingSlot);
	if (lineupIndex < 0) return null;
	team.lineup[lineupIndex] = { player: incoming.player, slot: outgoingSlot.slot };
	team.bench.splice(incoming.benchIndex, 1);
	playedLineup.set(incoming.player, outgoingSlot.slot);
	getPlayerMatchStats(teamStats, team, incoming.player, outgoingSlot.slot);
	return {
		type: 'substitution',
		minute,
		teamIndex,
		playerOff: outgoingSlot.player.name,
		playerOffId: outgoingSlot.player.id,
		playerOn: incoming.player.name,
		playerOnId: incoming.player.id,
		position: outgoingSlot.slot.label,
	};
}

function addCenterBackBonusGoal(teams, stats, activeLineupsByMinute, minuteStats, random) {
	const occupiedGoalMinutes = new Set(stats.flatMap((teamStats) => teamStats.goalEvents.map((event) => event.minute)));
	const availableScoringOptions = [0, 1].map((teamIndex) => {
		const minutes = [];
		for (let minute = 1; minute <= Math.min(90, activeLineupsByMinute.length); minute += 1) {
			if (occupiedGoalMinutes.has(minute)) continue;
			const lineup = activeLineupsByMinute[minute - 1]?.[teamIndex];
			const centerBacks = lineup
				? [...lineup].filter(([, slot]) => ['CB', 'LCB', 'RCB'].includes(slot.label))
				: [];
			if (centerBacks.length) minutes.push({ minute, centerBacks });
		}
		return { teamIndex, minutes };
	}).filter(({ minutes }) => minutes.length);
	if (!availableScoringOptions.length) return null;

	const selectedTeam = availableScoringOptions[Math.floor(random() * availableScoringOptions.length)];
	const selectedMinute = selectedTeam.minutes[Math.floor(random() * selectedTeam.minutes.length)];
	const [scorer, slot] = selectedMinute.centerBacks[Math.floor(random() * selectedMinute.centerBacks.length)];
	const teamStats = stats[selectedTeam.teamIndex];
	const expectedGoals = 0.05;
	teamStats.goals += 1;
	teamStats.shots += 1;
	teamStats.shotsOnTarget += 1;
	teamStats.xG += expectedGoals;
	teamStats.goalEvents.push({
		type: 'goal',
		source: 'center-back-bonus',
		minute: selectedMinute.minute,
		scorer: scorer.name,
		scorerId: scorer.id,
		assister: null,
		assisterId: null,
	});
	const scorerStats = getPlayerMatchStats(teamStats, teams[selectedTeam.teamIndex], scorer, slot);
	scorerStats.goals += 1;
	scorerStats.shots += 1;
	scorerStats.shotsOnTarget += 1;
	scorerStats.xG += expectedGoals;
	const opposingGoalkeeper = [...activeLineupsByMinute[selectedMinute.minute - 1][1 - selectedTeam.teamIndex]]
		.find(([, activeSlot]) => activeSlot.label === 'GK')?.[0];
	if (opposingGoalkeeper) {
		getPlayerMatchStats(stats[1 - selectedTeam.teamIndex], teams[1 - selectedTeam.teamIndex], opposingGoalkeeper)
			.xGOnTarget += expectedGoals;
	}
	for (const snapshot of minuteStats) {
		if (snapshot.minute < selectedMinute.minute) continue;
		const key = selectedTeam.teamIndex === 0 ? 'homeXG' : 'awayXG';
		snapshot[key] = Number((snapshot[key] + expectedGoals).toFixed(2));
	}
	return teamStats.goalEvents.at(-1);
}

function laneAdvantage(attackingTeam, defendingTeam, lane, attackRoutes, defendRoutes, attackingTendency, defendingTendency) {
	const attackers = attackRoutes[lane]
		.flatMap((roles, layerIndex) => roleCandidates(attackingTeam, roles)
			.map(({ player }) => attackSkill(player, layerIndex, roles, attackingTeam.venueAdjustment)));
	const defenders = defendRoutes[lane]
		.filter((roles) => roles[0] !== 'GK')
		.flatMap((roles) => roleCandidates(defendingTeam, roles)
			.map(({ player }) => defensiveSkill(player, roles, defendingTeam.venueAdjustment)));
	const averageAttack = attackers.length ? attackers.reduce((sum, value) => sum + value, 0) / attackers.length : 60;
	const averageDefense = defenders.length ? defenders.reduce((sum, value) => sum + value, 0) / defenders.length : 60;
	return averageAttack + teamTendencyAdjustment(attackingTeam, attackingTendency)
		- averageDefense + teamTendencyAdjustment(defendingTeam, defendingTendency);
}

function makeStats() {
	return {
		possessions: 0,
		duelsWon: 0,
		duelsLost: 0,
		midfieldDuelsWon: 0,
		midfieldDuelsLost: 0,
		shots: 0,
		shotsOnTarget: 0,
		saves: 0,
		goals: 0,
		goalEvents: [],
		xG: 0,
		playerStats: new Map(),
	};
}

function getPlayerMatchStats(teamStats, team, player, slot = null) {
	const key = String(player.id || player.name);
	if (!teamStats.playerStats.has(key)) {
		teamStats.playerStats.set(key, {
			playerId: player.id,
			playerName: player.name,
			teamName: team.team.name,
			teamId: team.team.team_id,
			position: player.position,
			alternatePositions: [...(player.alternatePositions || [])],
			lineupRole: slot?.label || null,
			appearances: 1,
			goals: 0,
			assists: 0,
			shots: 0,
			shotsOnTarget: 0,
			xG: 0,
			xGOnTarget: 0,
			saves: 0,
			chancesCreated: 0,
			offensiveDuelsWon: 0,
			defensiveDuelsStopped: 0,
			goalsConceded: 0,
			cleanSheets: 0,
		});
	}
	return teamStats.playerStats.get(key);
}

function shotProbabilities(shooter, goalkeeper, leadingUrgency = 0, shooterHomeBoost = 0, goalkeeperHomeBoost = 0, trailingUrgency = 0, goalChanceMultiplier = 1) {
	const shooterRating = shooter.rating + shooterHomeBoost;
	const shooterShooting = shooter.shooting + shooterHomeBoost;
	const goalkeeperRating = 80 + (goalkeeper.rating - 80) * 0.5 + goalkeeperHomeBoost;
	const baseExpectedGoals = 0.17 + 0.0045 * (shooterShooting - goalkeeperRating)
		+ 0.0008 * (shooterRating - goalkeeperRating);
	const expectedGoals = clamp(baseExpectedGoals * goalChanceMultiplier
		* (1 - 0.30 * clamp(leadingUrgency, 0, 1))
		* (1 + 0.08 * clamp(trailingUrgency, 0, 1)), 0.015, 0.55);
	const onTarget = clamp(
		0.62 + 0.005 * (shooterShooting - 70) - 0.0018 * (goalkeeperRating - 80),
		0.35,
		0.90,
	);
	return { expectedGoals, onTarget, goalIfOnTarget: clamp(expectedGoals / onTarget, 0, 0.88) };
}

function simulateMatch(teamAName, teamBName, options = {}) {
	const { possessions = 90, quiet = false, homeTeamIndex = 0, neutral = false } = options;
	const startingPlayerGoals = options.startingPlayerGoals || {};
	const aggregateGoals = options.aggregateGoals || [0, 0];
	const matchGoals = options.matchGoals || [0, 0];
	let lastGoalMinute = Number.isFinite(options.lastGoalMinute) ? options.lastGoalMinute : Number.NEGATIVE_INFINITY;
	if (!Number.isInteger(possessions) || possessions < 2) {
		throw new Error('Possessions must be an integer of at least 2.');
	}
	if (!Array.isArray(aggregateGoals) || aggregateGoals.length !== 2
		|| aggregateGoals.some((goals) => !Number.isInteger(goals) || goals < 0)) {
		throw new Error('aggregateGoals must contain two non-negative integers.');
	}
	if (!Array.isArray(matchGoals) || matchGoals.length !== 2
		|| matchGoals.some((goals) => !Number.isInteger(goals) || goals < 0)) {
		throw new Error('matchGoals must contain two non-negative integers.');
	}
	if (homeTeamIndex !== 0 && homeTeamIndex !== 1) {
		throw new Error('homeTeamIndex must be 0 or 1.');
	}

	const teamXIs = options.teamXIs;
	if (teamXIs !== undefined && (!Array.isArray(teamXIs) || teamXIs.length !== 2
		|| teamXIs.some((xi) => !xi?.team || !Array.isArray(xi.lineup)))) {
		throw new Error('teamXIs must contain two loaded team lineups.');
	}
	const firstXI = cloneTeamXI(teamXIs ? teamXIs[0] : loadBestXI(teamAName));
	const secondXI = cloneTeamXI(teamXIs ? teamXIs[1] : loadBestXI(teamBName));
	if (firstXI.team.name !== teamAName || secondXI.team.name !== teamBName) {
		throw new Error('teamXIs must match the requested home and away teams in order.');
	}
	const firstXIHome = !neutral && homeTeamIndex === 0;
	const secondXIHome = !neutral && homeTeamIndex === 1;
	firstXI.venueAdjustment = neutral ? 0 : firstXIHome
		? getHomeAdvantageBoost(firstXI)
		: getAwayAdvantageAdjustment(firstXI);
	secondXI.venueAdjustment = neutral ? 0 : secondXIHome
		? getHomeAdvantageBoost(secondXI)
		: getAwayAdvantageAdjustment(secondXI);
	const teams = [firstXI, secondXI];
	const goalChanceMultiplier = Number.isFinite(options.goalChanceMultiplier)
		? clamp(options.goalChanceMultiplier, 0.25, 2)
		: 1;
	const routes = teams.map(({ team }) => formationRoutes(team.formation));
	const random = Math.random;
	const centerBackBonusGoalTriggered = possessions >= 90
		&& options.allowCenterBackBonusGoal !== false
		&& random() < clamp(0.08 * goalChanceMultiplier, 0, 0.3);
	const stats = [makeStats(), makeStats()];
	const substitutionEvents = [];
	for (let teamIndex = 0; teamIndex < teams.length; teamIndex += 1) {
		for (const { player, slot } of teams[teamIndex].lineup) {
			if (player) getPlayerMatchStats(stats[teamIndex], teams[teamIndex], player, slot);
		}
	}
	const playedLineups = teams.map((team) => new Map(team.lineup
		.filter(({ player }) => player)
		.map(({ player, slot }) => [player, slot])));
	const activeLineupsByMinute = Array.from({ length: possessions }, () => [null, null]);
	const substitutionSchedules = options.allowSubstitutions === false
		? [[], []]
		: createSubstitutionSchedules(teams, possessions, random);
	const minuteStats = [];
	const controlDifference = midfieldControlRating(firstXI) - midfieldControlRating(secondXI);
	const possessionShare = clamp(0.5 + controlDifference * 0.01, 0.45, 0.55);
	const firstPossession = random() < possessionShare ? 0 : 1;

	if (!quiet) {
		console.log(`\n${firstXI.team.name} (${firstXI.team.formation}) vs ${secondXI.team.name} (${secondXI.team.formation})`);
		console.log('='.repeat(76));
		for (const xi of teams) {
			console.log(`\n${xi.team.name} — generated XI`);
			console.log(xi.lineup.map(({ player, slot }) => `${slot.label}: ${player ? `${player.name} (${player.rating})` : 'vacant'}`).join(' | '));
			console.log(`Bench — ${xi.bench.length} players`);
			console.log(xi.bench.map(({ player, slot }) => `${slot.label}: ${player.name} (${player.rating})`).join(' | '));
		}
		const homeIndex = neutral ? null : homeTeamIndex;
		console.log(`\n90-minute match: ${possessions} attacking turns (midfield control affects possession share)`);
		console.log(neutral
			? 'Neutral venue: no home boost'
			: `Home team: ${teams[homeIndex].team.name} (tier ${teams[homeIndex].team.home_advantage})`);
		console.log(`Kick-off possession: ${teams[firstPossession].team.name}\n`);
	}

	for (let turn = 0; turn < possessions; turn += 1) {
		const attackIndex = turn === 0 ? firstPossession : (random() < possessionShare ? 0 : 1);
		const defendIndex = 1 - attackIndex;
		const minute = turn + 1;
		for (let teamIndex = 0; teamIndex < teams.length; teamIndex += 1) {
			if (!substitutionSchedules[teamIndex].includes(minute)) continue;
			const event = makeSubstitution(teams[teamIndex], teamIndex, minute, stats[teamIndex], playedLineups[teamIndex], random);
			if (event) {
				substitutionEvents.push(event);
				if (!quiet) console.log(`  ${minute}′ substitution: ${event.playerOn} on for ${event.playerOff} (${event.position}).`);
			}
		}
		activeLineupsByMinute[minute - 1] = teams.map((team) => new Map(team.lineup
			.filter(({ player }) => player)
			.map(({ player, slot }) => [player, slot])));
		const aggregateScore = aggregateGoals.map((goals, index) => goals + stats[index].goals);
		const matchScore = matchGoals.map((goals, index) => goals + stats[index].goals);
		const effectiveTendencies = teams.map((team, index) =>
			effectiveOffensiveTendency(team, index, aggregateScore, matchScore));
		const attackingTeam = teams[attackIndex];
		const defendingTeam = teams[defendIndex];
		const attackingTendency = teamTendencyAdjustment(attackingTeam, effectiveTendencies[attackIndex]);
		const defendingTendency = teamTendencyAdjustment(defendingTeam, effectiveTendencies[defendIndex]);
		const attackRoutes = routes[attackIndex].attack;
		const defendRoutes = routes[defendIndex].defend;
		const lane = softmaxChoice(
			laneNames,
			laneNames.map((candidateLane) => laneAdvantage(
				attackingTeam,
				defendingTeam,
				candidateLane,
				attackRoutes,
				defendRoutes,
				effectiveTendencies[attackIndex],
				effectiveTendencies[defendIndex],
			)),
			random,
		);
		const attackPath = attackRoutes[lane];
		const defencePath = defendRoutes[lane];
		const attackerLine = [];
		const involvedAttackers = new Set();
		const usedAttackers = new Set();
		const usedDefenders = new Set();
		for (const [layerIndex, attackRoles] of attackPath.entries()) {
			const layerSkill = (player) => attackSkill(player, layerIndex, attackRoles, attackingTeam.venueAdjustment);
			const attackerPick = selectPlayer(attackingTeam, attackRoles, usedAttackers, layerSkill, random);
			if (!attackerPick || usedAttackers.has(attackerPick.player)) continue;
			usedAttackers.add(attackerPick.player);
			attackerLine.push({ ...attackerPick, roles: attackRoles, layerIndex });
		}
		if (!attackerLine.length) {
			throw new Error(`No attacking players available for ${attackingTeam.team.name} attacking ${lane}.`);
		}
		let attackerLineIndex = 0;
		let carrierDuelStreak = 0;
		let carrier = null;
		let lastPasser = null;
		let possessionLost = false;
		stats[attackIndex].possessions += 1;
		if (!quiet) console.log(`\n${String(minute).padStart(2, '0')}’ ${attackingTeam.team.name} attack ${lane}`);

		for (let layer = 0; layer < defencePath.length - 1; layer += 1) {
			const defenderRoles = defencePath[layer];
			const layerDefenseSkill = (player) => defensiveSkill(player, defenderRoles, defendingTeam.venueAdjustment);
			const defenderPick = selectPlayer(defendingTeam, defenderRoles, usedDefenders, layerDefenseSkill, random);
			if (!defenderPick) {
				throw new Error(`Could not fill a duel for ${attackingTeam.team.name} attacking ${lane} at minute ${minute}.`);
			}
			const defender = defenderPick.player;
			usedDefenders.add(defender);
			let defenceLayerCleared = false;

			while (attackerLineIndex < attackerLine.length) {
				const attackerEntry = attackerLine[attackerLineIndex];
				const attacker = attackerEntry.player;
				const attackRoles = attackerEntry.roles;
				involvedAttackers.add(attacker);

				const attackValue = attackSkill(attacker, attackerEntry.layerIndex, attackRoles, attackingTeam.venueAdjustment)
					+ attackingTendency;
				const defenceValue = defensiveSkill(defender, defenderRoles, defendingTeam.venueAdjustment)
					- defendingTendency;
				const skillEdge = attackValue - defenceValue;
				const progressionTax = layer * 0.025 + carrierDuelStreak * 0.020;
				const progressChance = clamp(
					0.56 + 0.15 * Math.tanh(skillEdge / 32) - progressionTax
						+ (attackingTendency + defendingTendency) / 100,
					0.18,
					0.86,
				);
				const succeeds = random() < progressChance;
				if (succeeds) {
					stats[attackIndex].duelsWon += 1;
					getPlayerMatchStats(stats[attackIndex], attackingTeam, attacker).offensiveDuelsWon += 1;
					const midfieldControlDuel = hasRole(attackRoles, midfieldRoles)
						&& hasRole(defenderRoles, midfieldRoles);
					if (midfieldControlDuel) {
						stats[attackIndex].midfieldDuelsWon += 1;
						stats[defendIndex].midfieldDuelsLost += 1;
					}
					carrier = attacker;
					carrierDuelStreak += 1;
					defenceLayerCleared = true;
					const nextAttacker = attackerLine[attackerLineIndex + 1];
					const isFinalAttacker = attackerLineIndex + 1 === attackerLine.length - 1;
					const isFinalDefensiveDuel = layer === defencePath.length - 2;
					if (nextAttacker && (!isFinalAttacker || isFinalDefensiveDuel)) {
						const midfieldPassingBonus = midfieldControlDuel ? 0.16 : 0;
						const passChance = clamp(
							0.28 + (attacker.passing - 75) * 0.006
								+ (attacker.rating - 80) * 0.003 + midfieldPassingBonus,
							0.10,
							0.72,
						);
						if (random() < passChance) {
							lastPasser = attacker;
						attackerLineIndex += 1;
						carrier = nextAttacker.player;
						involvedAttackers.add(carrier);
						carrierDuelStreak = 0;
						if (!quiet) console.log(`  ${attacker.name} passes forward to ${carrier.name}.`);
						}
					}
					if (!quiet) {
						console.log(`  ${attacker.name} (${attackRoles.join('/')}) vs ${defender.name} (${defenderRoles.join('/')}): `
							+ `${Math.round(progressChance * 100)}% — wins and carries the ball to the next duel.`);
					}
					if (attackerLineIndex === attackerLine.length - 1 && layer < defencePath.length - 2) {
						possessionLost = true;
						if (!quiet) console.log(`  ${attacker.name} has beaten one player, their limit; the attack ends.`);
					}
					break;
				}

				stats[attackIndex].duelsLost += 1;
				stats[defendIndex].duelsWon += 1;
				getPlayerMatchStats(stats[defendIndex], defendingTeam, defender).defensiveDuelsStopped += 1;
				const midfieldControlDuel = hasRole(attackRoles, midfieldRoles)
					&& hasRole(defenderRoles, midfieldRoles);
				if (midfieldControlDuel) {
					stats[defendIndex].midfieldDuelsWon += 1;
					stats[attackIndex].midfieldDuelsLost += 1;
				}
				lastPasser = null;
				carrierDuelStreak = 0;
				if (!quiet) {
					console.log(`  ${attacker.name} (${attackRoles.join('/')}) vs ${defender.name} (${defenderRoles.join('/')}): `
						+ `${Math.round(progressChance * 100)}% — loses the duel; next attacker challenges the same defender.`);
				}
				attackerLineIndex += 1;
			}

			if (possessionLost) break;
			if (!defenceLayerCleared) {
				possessionLost = true;
				if (!quiet) console.log('  Every remaining attacker has lost a duel; possession ends.');
				break;
			}
		}

		if (possessionLost) {
			minuteStats.push(makeMinuteStats(stats, turn + 1));
			continue;
		}

		const goalkeeper = defendingTeam.lineup.find(({ slot }) => slot.label === 'GK')?.player;
		if (!goalkeeper) throw new Error(`${defendingTeam.team.name} has no goalkeeper in its generated XI.`);
		if (!carrier) {
			const finalAttacker = attackerLine[attackerLine.length - 1];
			carrier = finalAttacker?.player;
			attackerLineIndex = attackerLine.length - 1;
		}
		if (!carrier) throw new Error(`${attackingTeam.team.name} has no available shooter.`);
		let specialPassOccurred = false;
		let specialPassAssister = null;
		let chanceCreator = null;
		const shootingLayer = attackerLine[attackerLineIndex]?.layerIndex ?? attackPath.length - 1;
		const nearbyTargetsByPlayer = new Map();
		for (let layerIndex = Math.max(0, shootingLayer - 1); layerIndex <= shootingLayer; layerIndex += 1) {
			for (const role of attackPath[layerIndex]) {
				for (const candidate of roleCandidates(attackingTeam, [role])) {
					if (candidate.player !== carrier) nearbyTargetsByPlayer.set(candidate.player, candidate.player);
				}
			}
		}
		const nearbyTargets = [...nearbyTargetsByPlayer.values()];
		const focalTargets = attackerLine
			.filter(({ player }) => player !== carrier && (player.scoringBias || 0) > 10)
			.map(({ player }) => player);
		const strongestFocalBias = focalTargets.reduce((highest, player) => Math.max(highest, player.scoringBias || 0), 0);
		const focalPassChance = clamp(0.25 + (strongestFocalBias - 10) * 0.017, 0.25, 0.65);
		const currentShooterStats = getPlayerMatchStats(stats[attackIndex], attackingTeam, carrier);
		const accumulatedShooterGoals = currentShooterStats.goals
			+ (startingPlayerGoals[String(carrier.id || carrier.name)] || 0);
		if (accumulatedShooterGoals >= hatTrickPassThreshold) {
			if (nearbyTargets.length && random() < hatTrickPassChance) {
				const originalShooter = carrier;
				carrier = softmaxChoice(
					nearbyTargets,
					nearbyTargets.map((player) => player.shooting * 0.05 + player.rating * 0.02 + (player.scoringBias || 0)),
					random,
					9,
				);
				specialPassAssister = originalShooter;
				chanceCreator = originalShooter;
				specialPassOccurred = true;
				involvedAttackers.add(carrier);
				if (!quiet) console.log(`  ${originalShooter.name} already has ${accumulatedShooterGoals} goals and lays it off for ${carrier.name}.`);
			}
		} else if (focalTargets.length && random() < focalPassChance) {
			const originalShooter = carrier;
			carrier = softmaxChoice(
				focalTargets,
				focalTargets.map((player) => player.shooting * 0.05 + player.rating * 0.02 + (player.scoringBias || 0)),
				random,
				9,
			);
			specialPassAssister = random() < 0.5 ? originalShooter : null;
			chanceCreator = originalShooter;
			specialPassOccurred = true;
			involvedAttackers.add(carrier);
			if (!quiet) console.log(`  ${originalShooter.name} finds focal scorer ${carrier.name} for the shot.`);
		} else if (random() < 0.25) {
			if (nearbyTargets.length) {
				const originalShooter = carrier;
				carrier = softmaxChoice(
					nearbyTargets,
					nearbyTargets.map((player) => player.shooting * 0.05 + player.rating * 0.02 + (player.scoringBias || 0)),
					random,
					9,
				);
				specialPassAssister = random() < 0.5 ? originalShooter : null;
				chanceCreator = originalShooter;
				specialPassOccurred = true;
				involvedAttackers.add(carrier);
				if (!quiet) console.log(`  ${originalShooter.name} lays it off for ${carrier.name} to shoot.`);
			}
		}

		const shot = shotProbabilities(
			carrier,
			goalkeeper,
			0,
			attackingTeam.venueAdjustment,
			defendingTeam.venueAdjustment,
			0,
			goalChanceMultiplier,
		);
		stats[attackIndex].shots += 1;
		stats[attackIndex].xG += shot.expectedGoals;
		const shooterStats = getPlayerMatchStats(stats[attackIndex], attackingTeam, carrier);
		shooterStats.shots += 1;
		shooterStats.xG += shot.expectedGoals;
		chanceCreator ||= lastPasser && lastPasser !== carrier ? lastPasser : null;
		if (chanceCreator) getPlayerMatchStats(stats[attackIndex], attackingTeam, chanceCreator).chancesCreated += 1;
		if (random() >= shot.onTarget) {
			if (!quiet) console.log(`  ${carrier.name} shoots (xG ${shot.expectedGoals.toFixed(2)}): off target.`);
		} else {
			stats[attackIndex].shotsOnTarget += 1;
			shooterStats.shotsOnTarget += 1;
			const goalkeeperStats = getPlayerMatchStats(stats[defendIndex], defendingTeam, goalkeeper);
			goalkeeperStats.xGOnTarget += shot.goalIfOnTarget;
			if (random() < shot.goalIfOnTarget && minute - lastGoalMinute > goalCooldownMinutes) {
				stats[attackIndex].goals += 1;
				shooterStats.goals += 1;
				lastGoalMinute = minute;
				const assister = specialPassOccurred
					? specialPassAssister
					: random() < 0.75
						? (lastPasser && lastPasser !== carrier
							? lastPasser
							: selectAssister(attackerLine, involvedAttackers, carrier, random))
						: null;
				if (assister) getPlayerMatchStats(stats[attackIndex], attackingTeam, assister).assists += 1;
				stats[attackIndex].goalEvents.push({
					minute,
					scorer: carrier.name,
					scorerId: carrier.id,
					assister: assister?.name || null,
					assisterId: assister?.id || null,
				});
				if (!quiet) console.log(`  ${carrier.name} shoots (xG ${shot.expectedGoals.toFixed(2)}): GOAL!`);
			} else {
				stats[defendIndex].saves += 1;
				goalkeeperStats.saves += 1;
				if (!quiet) console.log(`  ${carrier.name} shoots (xG ${shot.expectedGoals.toFixed(2)}): saved by ${goalkeeper.name}.`);
			}
		}
		minuteStats.push(makeMinuteStats(stats, minute));
	}
	if (centerBackBonusGoalTriggered) {
		const event = addCenterBackBonusGoal(teams, stats, activeLineupsByMinute, minuteStats, random);
		if (event && !quiet) console.log(`  ${event.minute}′ ${event.scorer} scores a bonus centre-back goal.`);
	}

	const defensiveRoles = new Set([
		'CB', 'LCB', 'RCB', 'LB', 'RB',
		'CDM', 'LDM', 'RDM', 'CM', 'LCM', 'RCM', 'CAM', 'LAM', 'RAM', 'LM', 'RM',
	]);
	for (let teamIndex = 0; teamIndex < teams.length; teamIndex += 1) {
		const goalsConceded = stats[1 - teamIndex].goals;
		for (const [player, slot] of playedLineups[teamIndex]) {
			if (slot.label === 'GK' || defensiveRoles.has(slot.label)) {
				getPlayerMatchStats(stats[teamIndex], teams[teamIndex], player, slot).goalsConceded = goalsConceded;
			}
		}
	}
	const playerStats = stats.flatMap((teamStats) => [...teamStats.playerStats.values()]);
	const result = { teams, stats, possessions, minuteStats, playerStats, substitutionEvents };
	if (!quiet) printMatchSummary(result);
	return result;
}

function makeMinuteStats(stats, minute) {
	const totalPossessions = stats[0].possessions + stats[1].possessions;
	return {
		minute,
		homeXG: Number(stats[0].xG.toFixed(2)),
		awayXG: Number(stats[1].xG.toFixed(2)),
		homePossession: totalPossessions ? stats[0].possessions / totalPossessions * 100 : 50,
		awayPossession: totalPossessions ? stats[1].possessions / totalPossessions * 100 : 50,
	};
}

function printMatchSummary({ teams, stats, possessions }) {
	const homeColor = chalk.cyan.bold;
	const awayColor = chalk.magenta.bold;
	const homeName = homeColor(teams[0].team.name);
	const awayName = awayColor(teams[1].team.name);
	const homeGoals = chalk.cyan.bold(String(stats[0].goals));
	const awayGoals = chalk.magenta.bold(String(stats[1].goals));
	const divider = chalk.gray('────────────────────────────────────────────');
	const homePossessions = stats[0].possessions;
	const awayPossessions = stats[1].possessions;
	const totalPossessions = homePossessions + awayPossessions;
	const homePossession = totalPossessions
		? (homePossessions / totalPossessions * 100).toFixed(1)
		: '0.0';
	const awayPossession = totalPossessions
		? (awayPossessions / totalPossessions * 100).toFixed(1)
		: '0.0';
	console.log(`\n${divider}`);
	console.log(chalk.bold('                           FULL TIME'));
	console.log(`             ${homeName}  ${homeGoals} – ${awayGoals}  ${awayName}`);
	console.log(chalk.gray(`             Shots  ${stats[0].shots} – ${stats[1].shots}`));
	console.log(chalk.gray(`             xG  ${stats[0].xG.toFixed(2)} – ${stats[1].xG.toFixed(2)}   `
		+ `Possession  ${homePossession}% – ${awayPossession}%`));
	console.log(divider);

	const goalEvents = stats.flatMap((teamStats, index) => teamStats.goalEvents.map((goal) => ({
		...goal,
		teamIndex: index,
	}))).sort((first, second) => first.minute - second.minute);
	if (!goalEvents.length) {
		console.log(chalk.gray('No goals'));
		return;
	}

	for (const goal of goalEvents) {
		const scorer = goal.teamIndex === 0 ? homeColor(goal.scorer) : awayColor(goal.scorer);
		const assist = goal.assister ? chalk.gray(` (${goal.assister})`) : '';
		console.log(`  ${chalk.yellow(`${goal.minute}’`)}  ${scorer}${assist}`);
	}
}

if (require.main === module) {
	try {
		simulateMatch(teamAName, teamBName, { possessions: matchPossessions });
	} catch (error) {
		console.error(`Simulation failed: ${error.message}`);
		process.exitCode = 1;
	}
}

module.exports = { simulateMatch, formationRoutes, shotProbabilities };