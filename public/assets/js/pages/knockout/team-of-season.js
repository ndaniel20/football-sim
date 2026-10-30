function percentileScore(value, values) {
  if (values.length < 2) return values.length ? 100 : 0;
  const lower = values.filter((other) => other < value).length;
  const tied = values.filter((other) => other === value).length;
  return (lower + (tied - 1) / 2) / (values.length - 1) * 100;
}

function lowerIsBetterPercentileScore(value, values) {
  return values.length < 2 ? (values.length ? 100 : 0) : 100 - percentileScore(value, values);
}

function magnitudePercentScore(value, values) {
  const maximum = Math.max(...values);
  return maximum > 0 ? Math.max(0, Math.min(100, value / maximum * 100)) : percentileScore(value, values);
}

function isBetterTeamOfSeasonAssignment(candidate, existing) {
  const candidateTotalScore = candidate.roleScores.reduce((total, score) => total + score, 0);
  const existingTotalScore = existing.roleScores.reduce((total, score) => total + score, 0);
  if (Math.abs(candidateTotalScore - existingTotalScore) > 1e-9) {
    return candidateTotalScore > existingTotalScore;
  }
  return candidate.primaryRoleCount > existing.primaryRoleCount;
}

function calculateTeamOfSeason(players) {
  const playerEntries = [...players.values()]
    .filter((player) => player.starts >= TEAM_OF_SEASON_MIN_STARTS)
    .map((player) => {
    const positions = getTournamentPositionFamilies(player);
    const primaryFamily = getPositionFamily(player.lineupRole || player.position);
    const defensiveAppearances = Math.max(Number(player.appearances) || 0, 1);
    const teamFormation = getTournamentTeamByName(player.teamName)?.formation || player.formation || '';
    const usesThreeAtBack = /^3-/.test(teamFormation);
    const {
      fullback, winger, striker, defense, centerBack, goalkeeper, attackingMidfielder, midfielder, balancedMidfielder,
    } = TEAM_OF_SEASON_POINTS;
    const centerBackDuelWeight = centerBack.duelStoppedPerAppearance
      * (usesThreeAtBack ? THREE_AT_BACK_CB_DUEL_MULTIPLIER : 1);
    return {
      ...player,
      positions,
      primaryFamily,
      teamFormation,
      usesThreeAtBack,
      defensiveAppearances,
      fullbackPoints: player.goals * fullback.goal + player.assists * fullback.assist
        + player.chancesCreated * fullback.chanceCreated + player.xG * fullback.xG
        + player.offensiveDuelsWon * fullback.duelWon + player.progressionBonus,
      wingerPoints: player.goals * winger.goal + player.assists * winger.assist
        + player.chancesCreated * winger.chanceCreated + player.xG * winger.xG
        + player.offensiveDuelsWon * winger.duelWon + player.progressionBonus,
      strikerPoints: player.goals * striker.goal + player.assists * striker.assist
        + player.chancesCreated * striker.chanceCreated + player.xG * striker.xG
        + player.offensiveDuelsWon * striker.duelWon + player.progressionBonus,
      camOffensePoints: player.assists * attackingMidfielder.assist
        + player.chancesCreated * attackingMidfielder.chanceCreated + player.goals * attackingMidfielder.goal
        + player.offensiveDuelsWon * attackingMidfielder.duelWon + player.progressionBonus,
      midfieldOffensePoints: player.assists * midfielder.assist
        + player.chancesCreated * midfielder.chanceCreated + player.goals * midfielder.goal
        + player.offensiveDuelsWon * midfielder.duelWon + player.progressionBonus,
      midfieldBalancedOffensePoints: player.assists * balancedMidfielder.assist
        + player.chancesCreated * balancedMidfielder.chanceCreated + player.goals * balancedMidfielder.goal
        + player.progressionBonus,
      midfieldDuelPoints: player.defensiveDuelsStopped * balancedMidfielder.defensiveDuelStopped
        + player.offensiveDuelsWon * balancedMidfielder.offensiveDuelInDuelScore + player.progressionBonus,
      defensePoints: player.defensiveDuelsStopped / defensiveAppearances * defense.duelStoppedPerAppearance
        - player.goalsConceded / defensiveAppearances * defense.goalsConcededPerAppearance + player.progressionBonus,
      centerBackDuelsPerAppearance: player.defensiveDuelsStopped / defensiveAppearances,
      centerBackGoalsConcededPerAppearance: player.goalsConceded / defensiveAppearances,
      centerBackDuelWeight,
      centerBackFormationTaxPercent: usesThreeAtBack ? (1 - THREE_AT_BACK_CB_DUEL_MULTIPLIER) * 100 : 0,
      centerBackPoints: player.defensiveDuelsStopped / defensiveAppearances * centerBackDuelWeight
        - player.goalsConceded / defensiveAppearances * centerBack.goalsConcededPerAppearance
        + player.progressionBonus * CENTER_BACK_STAGE_BONUS_MULTIPLIER,
    };
  });
  const semiFinalistNames = new Map();
  const tournamentMatches = allTournamentResults();
  for (const match of tournamentMatches) {
    if (match.roundKey !== 'sf') continue;
    for (const teamName of [match.homeName, match.awayName]) {
      const teamKey = normalizeName(teamName);
      if (teamKey) semiFinalistNames.set(teamKey, teamName);
    }
  }
  const semiFinalistTeams = [...semiFinalistNames.keys()];
  if (semiFinalistTeams.length !== 4) return [];
  const semiFinalistBitByTeam = new Map(semiFinalistTeams.map((teamKey, index) => [teamKey, 1 << index]));
  const championName = typeof knockout.champion === 'string'
    ? knockout.champion
    : knockout.champion?.name;
  const championTeamKey = normalizeName(championName);
  const finalistTeamKeys = new Set(tournamentMatches
    .filter((match) => match.roundKey === 'final')
    .flatMap((match) => [match.homeName, match.awayName])
    .map(normalizeName)
    .filter(Boolean));
  if (finalistTeamKeys.size < 2) {
    for (const tie of knockout.rounds?.sf || []) {
      const finalistKey = normalizeName(tie.winnerTeam?.name);
      if (finalistKey) finalistTeamKeys.add(finalistKey);
    }
  }
  if (championTeamKey) finalistTeamKeys.add(championTeamKey);
  const minimumChampionPlayers = championTeamKey ? 3 : 0;
  const championCountStateCount = 4;
  const teamMaskCount = 1 << semiFinalistTeams.length;
  const completeSemiFinalistMask = teamMaskCount - 1;
  const candidatesByRole = TEAM_OF_SEASON_ROLES.map((role) => playerEntries
    .filter((player) => canPlayerFillTeamOfSeasonRole(player, role)));
  const goalkeeperWeights = TEAM_OF_SEASON_POINTS.goalkeeper;
  const scoreByRole = candidatesByRole.map((candidates, roleIndex) => {
    const category = TEAM_OF_SEASON_ROLES[roleIndex].category;
    const isMidfield = category.startsWith('midfield-');
    const offenseMetric = category === 'midfield-offense' ? 'camOffensePoints'
      : category === 'midfield-balanced' ? 'midfieldBalancedOffensePoints'
      : isMidfield ? 'midfieldOffensePoints'
      : category === 'striker' ? 'strikerPoints'
      : category === 'winger' ? 'wingerPoints' : 'fullbackPoints';
    const offenseValues = candidates.map((player) => player[offenseMetric]);
    const defenseMetric = category === 'center-back' ? 'centerBackPoints'
      : isMidfield ? 'midfieldDuelPoints' : 'defensePoints';
    const defenseValues = candidates.map((player) => player[defenseMetric]);
    const goalkeeperGoalsConcededValues = candidates.map((player) => player.goalsConceded);
    const goalkeeperCleanSheetValues = candidates.map((player) => player.cleanSheets);
    const goalkeeperSaveValues = candidates.map((player) => player.saves);
    return new Map(candidates.map((player) => {
      let score;
      if (category === 'goalkeeper') {
        player.goalkeeperGoalsConcededScore = lowerIsBetterPercentileScore(
          player.goalsConceded, goalkeeperGoalsConcededValues,
        );
        player.goalkeeperCleanSheetScore = percentileScore(player.cleanSheets, goalkeeperCleanSheetValues);
        player.goalkeeperSaveScore = percentileScore(player.saves, goalkeeperSaveValues);
        score = player.goalkeeperGoalsConcededScore * goalkeeperWeights.goalsConceded
          + player.goalkeeperCleanSheetScore * goalkeeperWeights.cleanSheet
          + player.goalkeeperSaveScore * goalkeeperWeights.save + player.progressionBonus;
      } else if (category === 'center-back') score = percentileScore(player.centerBackPoints, defenseValues);
      else if (category === 'midfield-balanced') {
        score = 0.5 * percentileScore(player.midfieldDuelPoints, defenseValues)
          + 0.5 * percentileScore(player.midfieldBalancedOffensePoints, offenseValues);
      } else if (category === 'midfield-offense') {
        score = percentileScore(player.camOffensePoints, offenseValues);
      } else if (category === 'midfield-runner-up') {
        player.midfieldRunnerUpOffenseContribution = percentileScore(player.midfieldOffensePoints, offenseValues)
          * MIDFIELD_RUNNER_UP_OFFENSE_WEIGHT;
        player.midfieldRunnerUpDuelContribution = percentileScore(player.midfieldDuelPoints, defenseValues)
          * MIDFIELD_RUNNER_UP_DUEL_WEIGHT;
        score = player.midfieldRunnerUpOffenseContribution + player.midfieldRunnerUpDuelContribution;
      } else if (category === 'balanced') {
        score = 0.5 * percentileScore(player.defensePoints, defenseValues)
          + 0.5 * percentileScore(player[offenseMetric], offenseValues);
      } else if (category === 'striker') {
        score = magnitudePercentScore(player.strikerPoints, offenseValues);
      } else score = percentileScore(player[offenseMetric], offenseValues);
      const isCamPlayingOutOfPosition = ['CAM', 'LAM', 'RAM']
        .includes(getPositionCode(player.lineupRole || player.position));
      if (isCamPlayingOutOfPosition && ['midfield-balanced', 'midfield-runner-up'].includes(category)) {
        score -= CAM_CENTRAL_MIDFIELD_ROLE_TAX;
      }
      return [player.key, score];
    }));
  });
  const candidateRankings = TEAM_OF_SEASON_ROLES.map((role, roleIndex) => {
    const category = role.category;
    const candidates = candidatesByRole[roleIndex].map((player) => {
      let pointBreakdown;
      if (category === 'goalkeeper') {
        pointBreakdown = {
          'Goals conceded score (40%)': player.goalkeeperGoalsConcededScore,
          'Clean sheets score (25%)': player.goalkeeperCleanSheetScore,
          'Saves score (35%)': player.goalkeeperSaveScore,
          'Goals conceded': player.goalsConceded,
          'Clean sheets': player.cleanSheets,
          Saves: player.saves,
        };
      } else if (category === 'center-back') {
        pointBreakdown = {
          'Points earned': player.centerBackPoints,
          Appearances: player.appearances,
          'Duels stopped': player.defensiveDuelsStopped,
          'Duels per appearance': player.centerBackDuelsPerAppearance,
          'Duel weight': player.centerBackDuelWeight,
          'Three-at-back duel tax (%)': player.centerBackFormationTaxPercent,
          'Goals conceded': player.goalsConceded,
          'Goals conceded per appearance': player.centerBackGoalsConcededPerAppearance,
        };
      } else if (category.startsWith('midfield-')) {
        const roleOffensePoints = category === 'midfield-balanced'
          ? player.midfieldBalancedOffensePoints
          : category === 'midfield-offense' ? player.camOffensePoints : player.midfieldOffensePoints;
        pointBreakdown = {
          'Role offense pts': roleOffensePoints,
          'Pure offense pts': roleOffensePoints,
          'Duel pts': player.midfieldDuelPoints,
          Assists: player.assists,
          'Chances created': player.chancesCreated,
          Goals: player.goals,
          'Offensive duels': player.offensiveDuelsWon,
          'Defensive duels': player.defensiveDuelsStopped,
        };
        if (category === 'midfield-runner-up') {
          pointBreakdown['Runner-up offense contribution (75%)'] = player.midfieldRunnerUpOffenseContribution;
          pointBreakdown['Runner-up duel contribution (25%)'] = player.midfieldRunnerUpDuelContribution;
        }
      } else if (category === 'balanced') {
        pointBreakdown = {
          'Offense pts': player.fullbackPoints,
          'Defense pts': player.defensePoints,
          Goals: player.goals,
          Assists: player.assists,
        };
      } else {
        const pointsField = category === 'striker' ? 'strikerPoints'
          : category === 'winger' ? 'wingerPoints' : 'fullbackPoints';
        pointBreakdown = {
          'Points earned': player[pointsField],
          Goals: player.goals,
          Assists: player.assists,
          'Chances created': player.chancesCreated,
          'Offensive duels': player.offensiveDuelsWon,
        };
      }
      pointBreakdown['Stage bonus'] = player.stageBonus;
      pointBreakdown['UCL champion bonus'] = player.championBonus;
      if (['CAM', 'LAM', 'RAM'].includes(getPositionCode(player.lineupRole || player.position))
        && ['midfield-balanced', 'midfield-runner-up'].includes(category)) {
        pointBreakdown['CAM central-midfield role tax'] = -CAM_CENTRAL_MIDFIELD_ROLE_TAX;
      }
      return {
        playerName: player.playerName,
        teamName: player.teamName,
        primaryPosition: player.lineupRole || player.position,
        eligiblePositions: [...new Set(TEAM_OF_SEASON_ROLES
          .filter((candidateRole) => canPlayerFillTeamOfSeasonRole(player, candidateRole))
          .map((candidateRole) => candidateRole.label || candidateRole.key))],
        selectionScore: scoreByRole[roleIndex].get(player.key),
        pointBreakdown,
      };
    }).sort((first, second) => second.selectionScore - first.selectionScore
      || first.playerName.localeCompare(second.playerName));
    const roleLabel = role.label
      ? `${role.label} (${category === 'midfield-balanced' ? 'balanced' : 'runner-up'})`
      : role.key;
    return { role: roleLabel, category, candidates: candidates.slice(0, 5) };
  });

  const playersByClub = new Map();
  for (const player of playerEntries) {
    const teamKey = normalizeName(player.teamName) || `unassigned:${player.key}`;
    const clubPlayers = playersByClub.get(teamKey) || [];
    clubPlayers.push(player);
    playersByClub.set(teamKey, clubPlayers);
  }
  const clubOptions = [...playersByClub.entries()].sort(([first], [second]) => first.localeCompare(second))
    .map(([teamKey, clubPlayers]) => {
      const clubLimit = finalistTeamKeys.has(teamKey)
        ? TEAM_OF_SEASON_ROLES.length : TEAM_OF_SEASON_NON_FINALIST_CLUB_CAP;
      let clubStates = new Map([[0, {
        playerCount: 0,
        primaryRoleCount: 0,
        roleScores: Array(TEAM_OF_SEASON_ROLES.length).fill(0),
        picks: Array(TEAM_OF_SEASON_ROLES.length).fill(null),
      }]]);
      for (const player of clubPlayers) {
        const nextClubStates = new Map(clubStates);
        for (const [roleMask, state] of clubStates) {
          if (state.playerCount >= clubLimit) continue;
          for (let roleIndex = 0; roleIndex < TEAM_OF_SEASON_ROLES.length; roleIndex += 1) {
            const roleScore = scoreByRole[roleIndex].get(player.key);
            const roleBit = 1 << roleIndex;
            if (roleScore === undefined || roleMask & roleBit) continue;
            const nextRoleMask = roleMask | roleBit;
            const picks = state.picks.slice();
            const roleScores = state.roleScores.slice();
            picks[roleIndex] = player.key;
            roleScores[roleIndex] = roleScore;
            const assignment = {
              playerCount: state.playerCount + 1,
              primaryRoleCount: state.primaryRoleCount
                + Number(player.primaryFamily === TEAM_OF_SEASON_ROLES[roleIndex].family),
              roleScores,
              picks,
            };
            const existing = nextClubStates.get(nextRoleMask);
            if (!existing || isBetterTeamOfSeasonAssignment(assignment, existing)) {
              nextClubStates.set(nextRoleMask, assignment);
            }
          }
        }
        clubStates = nextClubStates;
      }
      return {
        teamKey,
        semiFinalistBit: semiFinalistBitByTeam.get(teamKey) || 0,
        isChampion: teamKey === championTeamKey,
        options: [...clubStates.entries()]
          .filter(([roleMask]) => roleMask !== 0)
          .map(([roleMask, assignment]) => ({ roleMask, assignment })),
      };
    });

  let states = new Map([[0, {
    primaryRoleCount: 0,
    roleScores: Array(TEAM_OF_SEASON_ROLES.length).fill(0),
    picks: Array(TEAM_OF_SEASON_ROLES.length).fill(null),
  }]]);
  for (const club of clubOptions) {
    const nextStates = new Map(states);
    for (const [stateKey, state] of states) {
      const stateWithoutChampionCount = Math.floor(stateKey / championCountStateCount);
      const championCount = stateKey % championCountStateCount;
      const roleMask = Math.floor(stateWithoutChampionCount / teamMaskCount);
      const representedSemiFinalists = stateWithoutChampionCount % teamMaskCount;
      for (const option of club.options) {
        if (roleMask & option.roleMask) continue;
        const nextRoleMask = roleMask | option.roleMask;
        const nextSemiFinalists = representedSemiFinalists | club.semiFinalistBit;
        const nextChampionCount = Math.min(minimumChampionPlayers,
          championCount + (club.isChampion ? option.assignment.playerCount : 0));
        const nextStateKey = (nextRoleMask * teamMaskCount + nextSemiFinalists)
          * championCountStateCount + nextChampionCount;
        const picks = state.picks.slice();
        const roleScores = state.roleScores.slice();
        for (let roleIndex = 0; roleIndex < TEAM_OF_SEASON_ROLES.length; roleIndex += 1) {
          if (!(option.roleMask & (1 << roleIndex))) continue;
          picks[roleIndex] = option.assignment.picks[roleIndex];
          roleScores[roleIndex] = option.assignment.roleScores[roleIndex];
        }
        const assignment = {
          primaryRoleCount: state.primaryRoleCount + option.assignment.primaryRoleCount,
          roleScores,
          picks,
        };
        const existing = nextStates.get(nextStateKey);
        if (!existing || isBetterTeamOfSeasonAssignment(assignment, existing)) nextStates.set(nextStateKey, assignment);
      }
    }
    states = nextStates;
  }

  const completeRoleMask = (1 << TEAM_OF_SEASON_ROLES.length) - 1;
  const completeStateKey = (completeRoleMask * teamMaskCount + completeSemiFinalistMask)
    * championCountStateCount + minimumChampionPlayers;
  const complete = states.get(completeStateKey);
  if (!complete) return [];
  const playersByKey = new Map(playerEntries.map((player) => [player.key, player]));
  const lineup = TEAM_OF_SEASON_ROLES.map((role, index) => ({
    ...role,
    player: playersByKey.get(complete.picks[index]),
  }));
  lineup.candidateRankings = candidateRankings;
  return lineup;
}

