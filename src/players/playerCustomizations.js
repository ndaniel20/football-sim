const fs = require('node:fs');
const path = require('node:path');
const { loadBestXIForTeam, parsePlayers } = require('../lineups/generateBestXI');

const POSITION_CODES = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];

function teamKeyFor(leagueKey, team) {
  const identity = team.team_id === null || team.team_id === undefined
    ? team.name.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')
    : String(team.team_id);
  return `${leagueKey}:${identity}`;
}

function starsForRating(rating) {
  return rating >= 88 ? 5 : rating >= 56 ? 1 + Math.floor((rating - 56) / 4) * 0.5 : 0.5;
}

function ratingRangeForStars(stars) {
  if (stars === 0.5) return [51, 55];
  if (stars === 5) return [88, 91];
  const minimum = 56 + (stars - 1) * 8;
  return [minimum, minimum + 3];
}

function randomRatingForStars(stars, random = Math.random) {
  const [minimum, maximum] = ratingRangeForStars(stars);
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function baseRatingFor(player, settings = {}) {
  return settings.usePotential && Number.isInteger(player.potential) && player.potential > 0
    ? player.potential
    : player.rating;
}

class PlayerCustomizationStore {
  constructor({ projectRoot, teamsDirectory, leagueSources, dataPath }) {
    this.projectRoot = projectRoot;
    this.teamsDirectory = teamsDirectory;
    this.leagueSources = leagueSources;
    this.dataPath = dataPath || path.join(projectRoot, 'data', 'player-customizations.json');
    this.catalogPromise = null;
    this.rosterPromise = null;
  }

  async getCatalog() {
    if (!this.catalogPromise) {
      this.catalogPromise = Promise.all(this.leagueSources.map(async (league) => {
        const configPath = path.join(this.teamsDirectory, league.file, 'teams.json');
        const data = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
        return (Array.isArray(data.teams) ? data.teams : []).map((team) => ({
          ...team,
          customizationKey: teamKeyFor(league.key, team),
          leagueKey: league.key,
          leagueName: league.name,
        }));
      })).then((groups) => {
        const teams = groups.flat();
        const byKey = new Map(teams.map((team) => [team.customizationKey, team]));
        const byName = new Map();
        teams.forEach((team) => {
          const matches = byName.get(team.name) || [];
          matches.push(team);
          byName.set(team.name, matches);
        });
        return { teams, byKey, byName };
      });
    }
    return this.catalogPromise;
  }

  async getBaseRoster() {
    if (!this.rosterPromise) {
      this.rosterPromise = this.getCatalog().then(({ teams }) => {
        const byPlayerKey = new Map();
        const playersByTeam = new Map();
        teams.forEach((team) => {
          const csvPath = path.resolve(this.projectRoot, team.players_path);
          if (!csvPath.startsWith(`${this.projectRoot}${path.sep}`) || !fs.existsSync(csvPath)) {
            throw new Error(`Invalid roster configuration for ${team.name}.`);
          }
          const players = parsePlayers(fs.readFileSync(csvPath, 'utf8')).map((player) => {
            const playerKey = `${team.customizationKey}::${player.id}`;
            const record = {
              ...player,
              playerKey,
              originClubKey: team.customizationKey,
              clubKey: team.customizationKey,
              club: team.name,
            };
            byPlayerKey.set(playerKey, record);
            return record;
          });
          playersByTeam.set(team.customizationKey, players);
        });
        return { byPlayerKey, playersByTeam };
      });
    }
    return this.rosterPromise;
  }

  async readLegacyChanges() {
    try {
      const data = JSON.parse(await fs.promises.readFile(this.dataPath, 'utf8'));
      return data && data.version === 1 && data.players && typeof data.players === 'object'
        ? data
        : { version: 1, players: {} };
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, players: {} };
      throw new Error('The previous player customizations could not be migrated.');
    }
  }

  async completeLegacyMigration() {
    try {
      await fs.promises.unlink(this.dataPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('The previous customization file could not be removed.');
    }
  }

  async normalizeChanges(changes) {
    const [{ byKey }, { byPlayerKey }] = await Promise.all([this.getCatalog(), this.getBaseRoster()]);
    if (changes === undefined || changes === null) return { version: 1, order: [], players: {} };
    if (!changes || changes.version !== 1 || !changes.players || typeof changes.players !== 'object'
      || Array.isArray(changes.players)) {
      throw new Error('The saved player changes are invalid.');
    }
    const players = {};
    for (const [playerKey, edit] of Object.entries(changes.players)) {
      if (!byPlayerKey.has(playerKey) || !edit || typeof edit !== 'object'
        || !byKey.has(edit.clubKey) || !POSITION_CODES.includes(edit.position)
        || !Number.isInteger(edit.rating) || edit.rating < 1 || edit.rating > 99
        || !Array.isArray(edit.alternatePositions)
        || edit.alternatePositions.some((position) => !POSITION_CODES.includes(position))) {
        throw new Error('A saved player change contains invalid data.');
      }
      players[playerKey] = {
        clubKey: edit.clubKey,
        position: edit.position,
        alternatePositions: [...new Set(edit.alternatePositions)]
          .filter((position) => position !== edit.position),
        rating: Math.min(edit.rating, 91),
      };
    }
    const requestedOrder = Array.isArray(changes.order) ? changes.order : [];
    const seenOrder = new Set();
    const order = [
      ...Object.keys(players).filter((playerKey) => !requestedOrder.includes(playerKey)),
      ...requestedOrder.filter((playerKey) => Object.hasOwn(players, playerKey)
        && !seenOrder.has(playerKey) && seenOrder.add(playerKey)),
    ];
    return { version: 1, updatedAt: changes.updatedAt || null, order, players };
  }

  async buildEffectiveRosters(changes, settings = {}) {
    const [{ teams, byKey }, { playersByTeam }] = await Promise.all([this.getCatalog(), this.getBaseRoster()]);
    const rosters = new Map(teams.map((team) => [team.customizationKey, []]));
    for (const [originClubKey, sourcePlayers] of playersByTeam) {
      sourcePlayers.forEach((sourcePlayer) => {
        const edit = changes.players[sourcePlayer.playerKey] || {};
        const clubKey = byKey.has(edit.clubKey) ? edit.clubKey : originClubKey;
        const club = byKey.get(clubKey);
        rosters.get(clubKey).push({
          ...sourcePlayer,
          clubKey,
          club: club.name,
          rating: Number.isInteger(edit.rating) ? edit.rating : baseRatingFor(sourcePlayer, settings),
          position: POSITION_CODES.includes(edit.position) ? edit.position : sourcePlayer.position,
          alternatePositions: Array.isArray(edit.alternatePositions)
            ? edit.alternatePositions.filter((position) => POSITION_CODES.includes(position))
            : sourcePlayer.alternatePositions,
        });
      });
    }
    return rosters;
  }

  async getTeamXI(leagueKey, teamName, changes, settings = {}) {
    const { teams } = await this.getCatalog();
    const team = teams.find((item) => item.leagueKey === leagueKey && item.name === teamName);
    if (!team) throw new Error('Club not found in this league.');
    const saved = await this.normalizeChanges(changes);
    const rosters = await this.buildEffectiveRosters(saved, settings);
    return loadBestXIForTeam(team, rosters.get(team.customizationKey));
  }

  async getXIsByTeamNames(teamNames, changes, settings = {}) {
    const { byName } = await this.getCatalog();
    const normalizedChanges = await this.normalizeChanges(changes);
    const rosters = await this.buildEffectiveRosters(normalizedChanges, settings);
    const lineups = new Map();
    for (const name of new Set(teamNames)) {
      const matches = byName.get(name) || [];
      if (matches.length !== 1) throw new Error(`Unable to uniquely identify club: ${name}`);
      const team = matches[0];
      lineups.set(name, loadBestXIForTeam(team, rosters.get(team.customizationKey)));
    }
    return lineups;
  }

  async savePlayerCustomization(input, changes, settings = {}) {
    if (!input || typeof input.playerKey !== 'string' || typeof input.clubKey !== 'string'
      || typeof input.position !== 'string' || !Array.isArray(input.alternatePositions)
      || typeof input.ratingStars !== 'number') {
      throw new Error('The player changes are incomplete.');
    }
    const [{ byKey }, { byPlayerKey }] = await Promise.all([this.getCatalog(), this.getBaseRoster()]);
    const sourcePlayer = byPlayerKey.get(input.playerKey);
    const targetClub = byKey.get(input.clubKey);
    if (!sourcePlayer || !targetClub) throw new Error('The player or selected club could not be found.');
    if (!POSITION_CODES.includes(input.position)) throw new Error('Choose a valid primary position.');
    const alternatePositions = [...new Set(input.alternatePositions)];
    if (alternatePositions.length > POSITION_CODES.length
      || alternatePositions.some((position) => !POSITION_CODES.includes(position))) {
      throw new Error('Choose valid secondary positions.');
    }
    const ratingStars = Math.round(input.ratingStars * 2) / 2;
    if (ratingStars < 0.5 || ratingStars > 5 || ratingStars !== input.ratingStars) {
      throw new Error('Choose a star rating between half a star and five stars.');
    }

    const saved = await this.normalizeChanges(changes);
    const currentEdit = saved.players[sourcePlayer.playerKey] || {};
    const previousClubKey = byKey.has(currentEdit.clubKey) ? currentEdit.clubKey : sourcePlayer.originClubKey;
    const baseRating = baseRatingFor(sourcePlayer, settings);
    const currentRating = Number.isInteger(currentEdit.rating) ? currentEdit.rating : baseRating;
    const currentStars = starsForRating(currentRating);
    const baseStars = starsForRating(baseRating);
    const [ratingMinimum, ratingMaximum] = ratingRangeForStars(ratingStars);
    const baseRatingFits = baseRating >= ratingMinimum && baseRating <= ratingMaximum;
    const currentRatingFits = currentRating >= ratingMinimum && currentRating <= ratingMaximum;
    const rating = ratingStars === baseStars && baseRatingFits
      ? baseRating
      : ratingStars === currentStars && currentRatingFits ? currentRating : randomRatingForStars(ratingStars);
    const effectiveAlternatePositions = alternatePositions
      .filter((position) => position !== input.position)
      .sort();
    const baseAlternatePositions = sourcePlayer.alternatePositions
      .filter((position) => position !== sourcePlayer.position)
      .sort();
    const isBackToDefault = targetClub.customizationKey === sourcePlayer.originClubKey
      && input.position === sourcePlayer.position
      && effectiveAlternatePositions.length === baseAlternatePositions.length
      && effectiveAlternatePositions.every((position, index) => position === baseAlternatePositions[index])
      && rating === baseRating;
    const nextPlayers = { ...saved.players };
    const nextOrder = saved.order.filter((playerKey) => playerKey !== sourcePlayer.playerKey);
    if (isBackToDefault) {
      delete nextPlayers[sourcePlayer.playerKey];
    } else {
      delete nextPlayers[sourcePlayer.playerKey];
      nextPlayers[sourcePlayer.playerKey] = {
        clubKey: targetClub.customizationKey,
        position: input.position,
        alternatePositions: effectiveAlternatePositions,
        rating,
      };
      nextOrder.push(sourcePlayer.playerKey);
    }
    const nextChanges = {
      version: 1,
      updatedAt: Object.keys(nextPlayers).length ? new Date().toISOString() : null,
      order: nextOrder,
      players: nextPlayers,
    };

    if (!byKey.has(previousClubKey)) throw new Error('The player’s current club could not be identified.');
    const affectedClubs = new Set([previousClubKey, targetClub.customizationKey]);
    const rosters = await this.buildEffectiveRosters(nextChanges, settings);
    for (const clubKey of affectedClubs) {
      const club = byKey.get(clubKey);
      let candidate;
      try {
        candidate = loadBestXIForTeam(club, rosters.get(clubKey));
      } catch (error) {
        throw new Error(`${club.name} cannot field a full starting XI after this change. ${error.message} No changes were saved.`);
      }
      if (candidate.lineup.some(({ player }) => !player)) {
        throw new Error(`${club.name} would not have an eligible replacement for every starting position. No changes were saved.`);
      }
    }

    const currentClub = byKey.get(targetClub.customizationKey);
    return {
      playerKey: sourcePlayer.playerKey,
      rating,
      ratingStars: starsForRating(rating),
      clubKey: currentClub.customizationKey,
      club: currentClub.name,
      changes: nextChanges,
    };
  }
}

module.exports = {
  POSITION_CODES,
  PlayerCustomizationStore,
  randomRatingForStars,
  starsForRating,
  teamKeyFor,
};