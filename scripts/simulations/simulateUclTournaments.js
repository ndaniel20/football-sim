const fs = require('node:fs');
const path = require('node:path');
const { solveDraw } = require('../../src/tournament/drawSolver');
const { generateLeagueSchedule } = require('../../src/tournament/leagueSchedule');
const { loadBestXI } = require('../../src/lineups/generateBestXI');
const { simulateMatch } = require('../../src/simulation/engine');

const DEFAULT_TOURNAMENTS = 100;
const LEAGUE_SOURCES = [
	{ key: 'england', file: 'premier-league' },
	{ key: 'spain', file: 'la-liga' },
	{ key: 'germany', file: 'bundesliga' },
	{ key: 'italy', file: 'serie-a' },
	{ key: 'france', file: 'ligue-1' },
	{ key: 'potugal', file: 'portuguese-league' },
	{ key: 'turkey', file: 'turkish-league' },
	{ key: 'others', file: 'others' },
];
const teamsDirectory = path.resolve(__dirname, '..', '..', 'teams');

function getDefaultTeams() {
	return LEAGUE_SOURCES.flatMap(({ key, file }) => {
		const configPath = path.join(teamsDirectory, file, 'teams.json');
		const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
		return (config.teams || [])
			.filter((team) => team.ucl_default === true)
			.map((team) => ({ ...team, league_key: key }));
	});
}

function createLineupCache(teams) {
	return new Map(teams.map((team) => [team.name, loadBestXI(team.name)]));
}

function shuffle(items) {
	const result = [...items];
	for (let index = result.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(Math.random() * (index + 1));
		[result[index], result[swapIndex]] = [result[swapIndex], result[index]];
	}
	return result;
}

function getStandings(assignments, schedule) {
	const table = new Map(assignments.map((assignment) => [assignment.key, {
		team: assignment.team,
		played: 0,
		wins: 0,
		goalsFor: 0,
		goalsAgainst: 0,
		goalDifference: 0,
		points: 0,
	}]));

	for (const matchday of schedule.matchdays) {
		for (const fixture of matchday.fixtures) {
			const home = table.get(fixture.home.key);
			const away = table.get(fixture.away.key);
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

	return [...table.values()].map((row) => ({
		...row,
		goalDifference: row.goalsFor - row.goalsAgainst,
	})).sort((first, second) => second.points - first.points
		|| second.goalDifference - first.goalDifference
		|| second.goalsFor - first.goalsFor
		|| second.wins - first.wins
		|| first.team.name.localeCompare(second.team.name, undefined, { sensitivity: 'base' }));
}

function recordPlayerStats(playerStats, teams, stats) {
	if (!playerStats) return;
	for (const [teamIndex, teamStats] of stats.entries()) {
		const teamName = teams[teamIndex].team.name;
		for (const event of teamStats.goalEvents) {
			const scorerKey = `${teamName}:${event.scorerId || event.scorer}`;
			const scorer = playerStats.get(scorerKey) || {
				name: event.scorer,
				team: teamName,
				goals: 0,
				assists: 0,
			};
			scorer.goals += 1;
			playerStats.set(scorerKey, scorer);

			if (event.assister) {
				const assisterKey = `${teamName}:${event.assisterId || event.assister}`;
				const assister = playerStats.get(assisterKey) || {
					name: event.assister,
					team: teamName,
					goals: 0,
					assists: 0,
				};
				assister.assists += 1;
				playerStats.set(assisterKey, assister);
			}
		}
	}
}

function simulateGame(homeTeam, awayTeam, lineups, {
	aggregateBefore = [0, 0],
	resolveTie = false,
	neutral = false,
	playerStats = null,
} = {}) {
	const options = {
		possessions: 90,
		quiet: true,
		homeTeamIndex: 0,
		neutral,
		aggregateGoals: aggregateBefore,
		teamXIs: [lineups.get(homeTeam.name), lineups.get(awayTeam.name)],
	};
	const regulation = simulateMatch(homeTeam.name, awayTeam.name, options);
	recordPlayerStats(playerStats, regulation.teams, regulation.stats);
	let homeGoals = regulation.stats[0].goals;
	let awayGoals = regulation.stats[1].goals;
	let aggregateAfter = [aggregateBefore[0] + homeGoals, aggregateBefore[1] + awayGoals];
	let penalties = null;

	if (resolveTie && aggregateAfter[0] === aggregateAfter[1]) {
		const lastGoalMinute = regulation.stats.flatMap((teamStats) => teamStats.goalEvents)
			.reduce((latest, goal) => Math.max(latest, goal.minute), Number.NEGATIVE_INFINITY);
		const extraTime = simulateMatch(homeTeam.name, awayTeam.name, {
			...options,
			possessions: 30,
			teamXIs: regulation.teams,
			allowSubstitutions: false,
			aggregateGoals: aggregateAfter,
			matchGoals: [homeGoals, awayGoals],
			lastGoalMinute: Number.isFinite(lastGoalMinute) ? lastGoalMinute - 90 : undefined,
			startingPlayerGoals: Object.fromEntries(regulation.playerStats.map((player) => [
				String(player.playerId || player.playerName), player.goals || 0,
			])),
		});
		recordPlayerStats(playerStats, extraTime.teams, extraTime.stats);
		homeGoals += extraTime.stats[0].goals;
		awayGoals += extraTime.stats[1].goals;
		aggregateAfter = [aggregateBefore[0] + homeGoals, aggregateBefore[1] + awayGoals];

		if (aggregateAfter[0] === aggregateAfter[1]) {
			const averageOutfieldShooting = (team) => {
				const players = team.lineup.filter(({ player, slot }) => player && slot.label !== 'GK');
				return players.reduce((total, { player }) => total + player.shooting, 0) / Math.max(players.length, 1);
			};
			const goalkeepers = regulation.teams.map((team) => team.lineup.find(({ slot }) => slot.label === 'GK')?.player);
			const shootProbability = (teamIndex) => Math.max(0.45, Math.min(0.9,
				0.72 + (averageOutfieldShooting(regulation.teams[teamIndex]) - (goalkeepers[1 - teamIndex]?.rating || 70)) * 0.004));
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
			penalties = { winnerIndex: homeKicks > awayKicks ? 0 : 1 };
		}
	}

	return { homeGoals, awayGoals, aggregateAfter, penalties };
}

function simulateTwoLegTie(firstSlot, secondSlot, lineups, playerStats) {
	const higherPriority = firstSlot.seed <= secondSlot.seed ? firstSlot : secondSlot;
	const lowerPriority = higherPriority === firstSlot ? secondSlot : firstSlot;
	const firstLeg = simulateGame(lowerPriority.team, higherPriority.team, lineups, { playerStats });
	const secondLeg = simulateGame(higherPriority.team, lowerPriority.team, lineups, {
		aggregateBefore: [firstLeg.awayGoals, firstLeg.homeGoals],
		resolveTie: true,
		playerStats,
	});
	let winner;
	if (secondLeg.aggregateAfter[0] !== secondLeg.aggregateAfter[1]) {
		winner = secondLeg.aggregateAfter[0] > secondLeg.aggregateAfter[1] ? higherPriority : lowerPriority;
	} else {
		const winnerIndex = secondLeg.penalties?.winnerIndex;
		if (winnerIndex !== 0 && winnerIndex !== 1) throw new Error('A tied knockout match was not resolved.');
		winner = winnerIndex === 0 ? higherPriority : lowerPriority;
	}
	return { team: winner.team, seed: Math.min(firstSlot.seed, secondSlot.seed) };
}

function simulateTournament(teams, lineups, playerStats) {
	const draw = solveDraw(teams);
	const schedule = generateLeagueSchedule(draw.assignments);
	for (const matchday of schedule.matchdays) {
		for (const fixture of matchday.fixtures) {
			const result = simulateGame(fixture.home.team, fixture.away.team, lineups, { playerStats });
			fixture.homeGoals = result.homeGoals;
			fixture.awayGoals = result.awayGoals;
			fixture.played = true;
		}
	}

	const standings = getStandings(draw.assignments, schedule);
	const ranked = standings.map((row, index) => ({ team: row.team, seed: index + 1 }));
	const rankedByPosition = new Map(ranked.map((entry) => [entry.seed, entry]));
	const playoffPairs = [[9, 10, 23, 24], [11, 12, 21, 22], [13, 14, 19, 20], [15, 16, 17, 18]];
	const playoffWinners = new Map();
	for (const [upperA, upperB, lowerA, lowerB] of playoffPairs) {
		const upperTeams = shuffle([rankedByPosition.get(upperA), rankedByPosition.get(upperB)]);
		const lowerTeams = shuffle([rankedByPosition.get(lowerA), rankedByPosition.get(lowerB)]);
		for (let index = 0; index < upperTeams.length; index += 1) {
			const higherTeam = upperTeams[index];
			const lowerTeam = lowerTeams[index];
			playoffWinners.set(higherTeam.seed, simulateTwoLegTie(higherTeam, lowerTeam, lineups, playerStats));
		}
	}

	const r16Seeds = [1, 8, 4, 5, 2, 7, 3, 6];
	const playoffOpponentSeeds = [15, 10, 14, 11, 16, 9, 13, 12];
	const r16Winners = r16Seeds.map((seed, index) => simulateTwoLegTie(
		rankedByPosition.get(seed),
		playoffWinners.get(playoffOpponentSeeds[index]),
		lineups,
		playerStats,
	));
	const qfWinners = [];
	for (let index = 0; index < r16Winners.length; index += 2) {
		qfWinners.push(simulateTwoLegTie(r16Winners[index], r16Winners[index + 1], lineups, playerStats));
	}
	const sfWinners = [];
	for (let index = 0; index < qfWinners.length; index += 2) {
		sfWinners.push(simulateTwoLegTie(qfWinners[index], qfWinners[index + 1], lineups, playerStats));
	}

	const final = simulateGame(sfWinners[0].team, sfWinners[1].team, lineups, {
		resolveTie: true,
		neutral: true,
		playerStats,
	});
	const winnerIndex = final.penalties?.winnerIndex ?? (final.homeGoals > final.awayGoals ? 0 : 1);
	return {
		champion: sfWinners[winnerIndex].team.name,
		runnerUp: sfWinners[1 - winnerIndex].team.name,
	};
}

function printRanking(title, counts, tournamentCount) {
	console.log(`\n${title}`);
	console.log('Rank  Club'.padEnd(34) + 'Wins'.padStart(6) + '  Share');
	console.log('-'.repeat(47));
	[...counts.entries()]
		.sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
		.forEach(([team, count], index) => {
			console.log(`${String(index + 1).padStart(2, '0')}.  ${team.padEnd(27)}${String(count).padStart(6)}  ${(count / tournamentCount * 100).toFixed(1)}%`);
		});
}

function printPlayerRanking(title, playerStats, statistic, tournamentCount) {
	console.log(`\n${title} — Top 15 across ${tournamentCount} tournament${tournamentCount === 1 ? '' : 's'}`);
	console.log('Rank  Player'.padEnd(37) + 'Club'.padEnd(28) + statistic[0].toLocaleUpperCase() + statistic.slice(1));
	console.log('-'.repeat(75));
	[...playerStats.values()]
		.filter((player) => player[statistic] > 0)
		.sort((first, second) => second[statistic] - first[statistic]
			|| first.name.localeCompare(second.name)
			|| first.team.localeCompare(second.team))
		.slice(0, 15)
		.forEach((player, index) => {
			console.log(`${String(index + 1).padStart(2, '0')}.  ${player.name.padEnd(27)}${player.team.padEnd(28)}${String(player[statistic]).padStart(3)}`);
		});
}

function main() {
	const requestedCount = Number.parseInt(process.argv[2] || String(DEFAULT_TOURNAMENTS), 10);
	if (!Number.isInteger(requestedCount) || requestedCount < 1) {
		throw new Error('Tournament count must be a positive integer.');
	}
	const teams = getDefaultTeams();
	if (teams.length !== 36) throw new Error(`Expected 36 UCL-default teams; found ${teams.length}.`);
	console.log(`Loading ${teams.length} default clubs and precomputing lineups...`);
	const lineups = createLineupCache(teams);
	const champions = new Map();
	const runnersUp = new Map();
	const playerStats = new Map();

	for (let index = 0; index < requestedCount; index += 1) {
		const result = simulateTournament(teams, lineups, playerStats);
		champions.set(result.champion, (champions.get(result.champion) || 0) + 1);
		runnersUp.set(result.runnerUp, (runnersUp.get(result.runnerUp) || 0) + 1);
		if ((index + 1) % 10 === 0 || index + 1 === requestedCount) {
			console.log(`Completed ${index + 1}/${requestedCount} tournaments`);
		}
	}
	const totalGoals = [...playerStats.values()].reduce((total, player) => total + player.goals, 0);
	const matchesPerTournament = (teams.length * 8) / 2 + 8 * 2 + 8 * 2 + 4 * 2 + 2 * 2 + 1;
	const totalMatches = requestedCount * matchesPerTournament;
	console.log(`\nGoals scored across ${requestedCount} tournaments: ${totalGoals}`);
	console.log(`Matches played: ${totalMatches}`);
	console.log(`Average goals per match: ${(totalGoals / totalMatches).toFixed(2)}`);

	printRanking('Champions', champions, requestedCount);
	printRanking('Runners-up', runnersUp, requestedCount);
	printPlayerRanking('Top Scorers', playerStats, 'goals', requestedCount);
	printPlayerRanking('Top Assisters', playerStats, 'assists', requestedCount);
}

try {
	main();
} catch (error) {
	console.error(`UCL tournament simulation failed: ${error.message}`);
	process.exitCode = 1;
}
