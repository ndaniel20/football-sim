function finishKnockoutAnimationImmediately() {
  if (!animationRun) return;
  window.clearInterval(animationRun.timer);
  while (animationRun) animationRun.advance();
}

function createLeaderRow(entry, index, statistic, highlightWinner = false) {
  const row = document.createElement('div');
  row.className = `leader-row${highlightWinner ? ' is-tournament-leader' : ''}`;
  const rank = document.createElement('span');
  rank.className = 'leader-rank';
  rank.textContent = String(index + 1).padStart(2, '0');
  const face = createPlayerFace(entry.playerId, entry.playerName || 'Unknown player', 'leader-face');
  const player = document.createElement('span');
  player.className = 'leader-player';
  player.append(document.createTextNode(entry.playerName || 'Unknown player'));
  if (entry.teamName) {
    const club = document.createElement('small');
    club.className = 'leader-club';
    club.append(makeBadge(getTournamentTeamByName(entry.teamName), 'leader-club-badge'));
    const clubLabel = document.createElement('span');
    clubLabel.className = 'leader-club-name';
    clubLabel.textContent = entry.teamName;
    club.append(clubLabel);
    player.append(club);
  }
  const value = document.createElement('span');
  value.className = 'leader-value';
  value.textContent = String(entry[statistic] || 0);
  row.append(rank, face, player, value);
  return row;
}

function openLeaderModal(key, title, statistic) {
  const leaders = getTournamentDerivedData().leaders[key] || [];
  elements.leaderModalTitle.textContent = title;
  elements.leaderModalKicker.textContent = `ALL ${statistic.replace(/([A-Z])/g, ' $1').toLocaleUpperCase()}`;
  elements.leaderModalList.replaceChildren(...leaders.map((entry, index) =>
    createLeaderRow(entry, index, statistic, Boolean(knockout.champion) && index === 0)));
  if (!leaders.length) {
    const empty = document.createElement('p');
    empty.className = 'leader-empty';
    empty.textContent = 'No player stats yet';
    elements.leaderModalList.append(empty);
  }
  openKnockoutDialog(elements.leaderModal);
  const resetScroll = () => {
    elements.leaderModal.scrollTop = 0;
    elements.leaderModalList.scrollTop = 0;
  };
  resetScroll();
  window.requestAnimationFrame(resetScroll);
}

function renderLeaderCard({ key, title, statistic, unit, leaders }) {
  const entries = leaders;
  const card = document.createElement('article');
  card.className = 'leader-card';
  const header = document.createElement('div');
  header.className = 'leader-card-heading';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const scope = document.createElement('span');
  scope.textContent = unit.toLocaleUpperCase();
  header.append(heading, scope);
  const list = document.createElement('div');
  list.className = 'leader-list';
  if (!leaders.length) {
    const empty = document.createElement('div');
    empty.className = 'leader-empty';
    empty.textContent = 'No player stats yet';
    list.append(empty);
  } else {
    entries.slice(0, 5).forEach((leader, index) => list.append(
      createLeaderRow(leader, index, statistic, Boolean(knockout.champion) && index === 0)));
  }
  card.append(header, list);
  if (entries.length > 5) {
    const toggle = document.createElement('button');
    toggle.className = 'leader-toggle';
    toggle.type = 'button';
    toggle.textContent = `Show all ${entries.length}`;
    toggle.addEventListener('click', () => openLeaderModal(key, title, statistic));
    card.append(toggle);
  }
  return card;
}

function renderLeaders(derivedData) {
  const { leaders } = derivedData;
  elements.leaders.replaceChildren(
    renderLeaderCard({ key: 'scorers', title: 'Top scorers', statistic: 'goals', unit: 'Goals', leaders: leaders.scorers }),
    renderLeaderCard({ key: 'assists', title: 'Top assisters', statistic: 'assists', unit: 'Assists', leaders: leaders.assists }),
    renderLeaderCard({ key: 'cleanSheets', title: 'Most clean sheets', statistic: 'cleanSheets', unit: 'Clean sheets', leaders: leaders.cleanSheets }),
  );
}

function createTeamOfSeasonPlayer(role, player) {
  const card = document.createElement('article');
  card.className = 'team-of-season-player';
  const position = document.createElement('span');
  position.className = 'team-of-season-position';
  position.textContent = role.label || role.key;
  const face = createPlayerFace(player.playerId, player.playerName, 'team-of-season-face');
  const name = document.createElement('strong');
  name.className = 'team-of-season-name';
  name.textContent = player.playerName;
  const club = document.createElement('span');
  club.className = 'team-of-season-club';
  club.append(makeBadge(getTournamentTeamByName(player.teamName), 'team-of-season-badge'));
  const clubName = document.createElement('span');
  clubName.textContent = player.teamName;
  club.append(clubName);
  card.append(position, face, name, club);
  return card;
}

function logTeamOfSeasonCandidates(candidateRankings) {
  const signature = JSON.stringify(candidateRankings);
  if (signature === lastLoggedTeamOfSeasonSignature) return;
  lastLoggedTeamOfSeasonSignature = signature;

  console.groupCollapsed('[UCL Team of the Season] Top 5 candidates by position');
  for (const ranking of candidateRankings) {
    console.groupCollapsed(`${ranking.role} — ${ranking.candidates.length} eligible candidates shown`);
    console.table(ranking.candidates.map((candidate, index) => ({
      Rank: index + 1,
      Player: candidate.playerName,
      Club: candidate.teamName,
      'XI primary': candidate.primaryPosition,
      'Eligible roles': candidate.eligiblePositions.join(', '),
      'Selection score': Number(candidate.selectionScore.toFixed(2)),
      ...candidate.pointBreakdown,
    })));
    console.groupEnd();
  }
  console.groupEnd();
}

function renderTeamOfSeason(derivedData) {
  elements.teamOfSeason.hidden = true;
  elements.teamOfSeasonFormation.replaceChildren();
  if (!knockout.champion) return;

  const cachedTeamOfSeason = derivedData.teamOfSeason;
  if (cachedTeamOfSeason.status === 'unavailable') {
    const notice = document.createElement('p');
    notice.className = 'team-of-season-empty';
    notice.textContent = 'Complete player match data is unavailable for this saved tournament. Start a new tournament to generate Team of the Season rankings.';
    elements.teamOfSeasonFormation.append(notice);
    elements.teamOfSeason.hidden = false;
    return;
  }

  if (cachedTeamOfSeason.status !== 'ready') {
    const notice = document.createElement('p');
    notice.className = 'team-of-season-empty';
    notice.textContent = 'Could not form a complete 4-2-3-1 with at least one player from every semi-final club and at least three from the champions. Check that the saved player data and positions are complete.';
    elements.teamOfSeasonFormation.append(notice);
    elements.teamOfSeason.hidden = false;
    return;
  }
  const lineup = [...cachedTeamOfSeason.lineup];
  lineup.candidateRankings = cachedTeamOfSeason.candidateRankings;
  logTeamOfSeasonCandidates(lineup.candidateRankings);

  const rows = [
    { className: 'is-striker', roles: ['ST'] },
    { className: 'is-attacking-midfield', roles: ['LM', 'CAM', 'RM'] },
    { className: 'is-defensive-midfield', roles: ['CM-balanced', 'CM-runner-up'] },
    { className: 'is-defense', roles: ['LB', 'LCB', 'RCB', 'RB'] },
    { className: 'is-goalkeeper', roles: ['GK'] },
  ];
  for (const rowConfig of rows) {
    const row = document.createElement('div');
    row.className = `team-of-season-row ${rowConfig.className}`;
    for (const roleKey of rowConfig.roles) {
      const selection = lineup.find((entry) => entry.key === roleKey);
      if (selection?.player) row.append(createTeamOfSeasonPlayer(selection, selection.player));
    }
    elements.teamOfSeasonFormation.append(row);
  }
  elements.teamOfSeason.hidden = false;
}

function renderAll() {
  const derivedData = getTournamentDerivedData();
  renderBracket();
  renderLeaders(derivedData);
  renderTeamOfSeason(derivedData);
  renderRound();
}

