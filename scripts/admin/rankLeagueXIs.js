const fs = require('node:fs');
const path = require('node:path');
const chalk = require('chalk');
const { loadBestXI } = require('../../src/lineups/generateBestXI');

const teamsRoot = path.resolve(__dirname, '..', '..', 'teams');
const MAX_RANKINGS = 30;
const COUNTRY_COLORS = {
	austria: '#ff6b6b',
	azerbaijan: '#00a6a6',
	belgium: '#d8a400',
	czech: '#f06595',
	england: '#3b82f6',
	france: '#8b5cf6',
	germany: '#f97316',
	greece: '#0891b2',
	italy: '#16a34a',
	netherlands: '#e11d48',
	norway: '#6366f1',
	portugal: '#65a30d',
	slovakia: '#c026d3',
	spain: '#ca8a04',
	turkey: '#dc2626',
	ukraine: '#0284c7',
};

function getLeagueDirectories() {
	return fs.readdirSync(teamsRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.filter((entry) => fs.existsSync(path.join(teamsRoot, entry.name, 'teams.json')))
		.map((entry) => entry.name)
		.sort((first, second) => first.localeCompare(second));
}

function normalizeLeagueName(value) {
	return value.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

function leagueLabel(directoryName) {
	return directoryName.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function collectRankings(leagueDirectories) {
	return leagueDirectories.flatMap((leagueDirectory) => {
		const configPath = path.join(teamsRoot, leagueDirectory, 'teams.json');
		const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
		return (config.teams || []).map((team) => {
			const { lineup, team: resolvedTeam } = loadBestXI(team.name);
			const players = lineup
				.filter(({ player, slot }) => player && slot.label !== 'GK')
				.map(({ player }) => player);
			const totalRating = players.reduce((total, player) => total + player.rating, 0);
			return {
				name: resolvedTeam.name,
				country: resolvedTeam.league || 'unknown',
				offensiveTendency: resolvedTeam.offensive_tendency,
				homeAdvantage: resolvedTeam.home_advantage,
				awayAdvantage: resolvedTeam.away_advantage,
				averageRating: players.length ? totalRating / players.length : 0,
			};
		});
	}).sort((first, second) => second.averageRating - first.averageRating
		|| first.name.localeCompare(second.name))
		.slice(0, MAX_RANKINGS);
}

function printRankings(rankings, scopeLabel) {
	if (!rankings.length) {
		console.log('No teams found.');
		return;
	}
	const teamWidth = Math.max(24, ...rankings.map(({ name }) => name.length));
	const countryWidth = Math.max(7, ...rankings.map(({ country }) => leagueLabel(country).length));
	console.log(`\nTop ${rankings.length} Strongest XIs — ${scopeLabel}`);
	console.log(`Rank  ${'Team'.padEnd(teamWidth)}  ${'Country'.padEnd(countryWidth)}  Avg OVR  Offense  Home  Away`);
	console.log('-'.repeat(teamWidth + countryWidth + 46));
	for (const [index, team] of rankings.entries()) {
		const rank = `${String(index + 1).padStart(2, '0')}.`;
		const color = chalk.hex(COUNTRY_COLORS[team.country] || '#ffffff');
		const country = leagueLabel(team.country);
		console.log(`${color(rank)}  ${color(team.name.padEnd(teamWidth))}  `
			+ `${color(country.padEnd(countryWidth))}  ${team.averageRating.toFixed(1).padStart(7)}  `
			+ `${String(team.offensiveTendency ?? '—').padStart(7)}  `
			+ `${String(team.homeAdvantage ?? '—').padStart(4)}  ${String(team.awayAdvantage ?? '—').padStart(4)}`);
	}
}

try {
	const leagues = getLeagueDirectories();
	const requestedLeague = process.argv.slice(2).join(' ');
	if (!requestedLeague) {
		printRankings(collectRankings(leagues), 'All Leagues');
	} else {
		const leagueDirectory = leagues.find((directory) => normalizeLeagueName(directory) === normalizeLeagueName(requestedLeague));
		if (!leagueDirectory) {
			throw new Error(`Unknown league "${requestedLeague}". Available folders: ${leagues.join(', ')}`);
		}
		printRankings(collectRankings([leagueDirectory]), leagueLabel(leagueDirectory));
	}
} catch (error) {
	console.error(`League XI ranking failed: ${error.message}`);
	process.exitCode = 1;
}
