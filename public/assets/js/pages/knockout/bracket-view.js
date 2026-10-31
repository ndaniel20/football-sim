function createTeamLine(team, goals) {
  const row = document.createElement('div');
  row.className = `leg-team${team ? '' : ' is-tbd'}`;
  row.append(makeBadge(team));
  const name = document.createElement('span');
  name.textContent = team?.name || 'TBD';
  row.append(name);
  const score = document.createElement('strong');
  score.className = `leg-team-score${Number.isFinite(goals) ? '' : ' is-pending'}`;
  score.textContent = Number.isFinite(goals) ? String(goals) : '—';
  row.append(score);
  return row;
}

function createLegSection(tie, roundKey, legIndex) {
  const section = document.createElement('div');
  section.className = 'leg-section';
  const label = document.createElement('span');
  label.className = 'leg-label';
  label.textContent = roundKey === 'final' ? 'NEUTRAL VENUE' : `${legIndex === 0 ? 'FIRST LEG' : 'SECOND LEG'}`;
  section.append(label);
  const leg = legResultFor(tie, legIndex);
  const run = animationRun?.tie.id === tie.id && animationRun.legIndex === legIndex ? animationRun : null;
  const teams = leg ? [leg.homeTeam, leg.awayTeam] : getLegTeams(tie, roundKey, legIndex);
  const displayedGoals = run ? [run.homeGoals, run.awayGoals]
    : leg ? [leg.result.homeGoals, leg.result.awayGoals] : [undefined, undefined];
  const teamList = document.createElement('div');
  teamList.className = 'leg-teams';
  teamList.append(
    createTeamLine(teams[0], displayedGoals[0]),
    createTeamLine(teams[1], displayedGoals[1]),
  );
  section.append(teamList);
  const action = document.createElement('button');
  action.className = 'tie-leg-action';
  action.type = 'button';
  action.dataset.action = leg ? 'review' : 'select';
  action.dataset.legIndex = String(legIndex);
  action.textContent = leg ? 'View match' : 'Select';
  const legIsNext = getTieCurrentLeg(tie, roundKey) === legIndex;
  const teamsAreReady = getLegTeams(tie, roundKey, legIndex).every(Boolean);
  action.disabled = !leg && (simulationRunning || !isRoundUnlocked(roundKey) || !legIsNext || !teamsAreReady || Boolean(tie.winnerTeam));
  section.append(action);
  return section;
}

function createAggregateLine(tie, roundKey) {
  const aggregate = document.createElement('div');
  aggregate.className = 'tie-aggregate';
  if (roundKey === 'final') {
    aggregate.textContent = 'Single-match final · extra time and penalties if required';
    return aggregate;
  }
  const totals = getDisplayedTieAggregate(tie);
  const participants = getParticipants(tie);
  const label = document.createElement('span');
  label.className = 'tie-aggregate-label';
  label.textContent = 'AGGREGATE';
  const rows = document.createElement('div');
  rows.className = 'tie-aggregate-rows';
  const goalsRecorded = tie.legs.some(Boolean);
  participants.forEach((participant) => {
    const team = participant?.team || null;
    const row = document.createElement('div');
    row.className = `tie-aggregate-team${team ? '' : ' is-tbd'}`;
    row.append(makeBadge(team));
    const name = document.createElement('span');
    name.textContent = team?.name || 'TBD';
    const score = document.createElement('strong');
    score.className = 'tie-aggregate-score';
    score.textContent = team && goalsRecorded ? String(totals.get(teamKey(team)) || 0) : '—';
    row.append(name, score);
    rows.append(row);
  });
  aggregate.append(label, rows);
  return aggregate;
}

function createTieCard(tie, roundKey, legIndex) {
  const card = document.createElement('article');
  card.className = 'tie-card';
  if (tie.winnerTeam) card.classList.add('is-complete');
  if (tie.id === selectedTieId) card.classList.add('is-selected');
  const tieIsRunning = animationRun?.tie.id === tie.id;
  card.dataset.tieId = tie.id;
  const top = document.createElement('div');
  top.className = 'tie-topline';
  const fixtureNumber = document.createElement('span');
  fixtureNumber.textContent = roundKey === 'final' ? 'FINAL'
    : roundKey === 'playoff' ? `ROUND OF 32 · ${tie.slots[0].team.rank} / ${tie.slots[1].team.rank}`
      : `${ROUND_LABELS[roundKey].toLocaleUpperCase()} · ${tie.id.split('-').at(-1)}`;
  const state = document.createElement('span');
  state.className = `tie-state${tieIsRunning ? ' is-in-progress' : ''}`;
  state.textContent = tie.winnerTeam ? 'TIE COMPLETE' : tieIsRunning ? 'MATCH IN PROGRESS' : 'AWAITING MATCH';
  top.append(fixtureNumber, state);
  card.append(top);
  if (roundKey !== 'final') card.append(createAggregateLine(tie, roundKey));
  if (roundKey === 'final') {
    card.append(createLegSection(tie, roundKey, 0));
  } else {
    card.append(createLegSection(tie, roundKey, 0), createLegSection(tie, roundKey, 1));
  }
  if (tie.winnerTeam) {
    const winner = document.createElement('div');
    winner.className = 'tie-winner';
    winner.append(makeBadge(tie.winnerTeam));
    const winnerName = document.createElement('span');
    winnerName.textContent = `${roundKey === 'final' ? 'CHAMPIONS' : 'ADVANCES'} · ${tie.winnerTeam.name}`;
    winner.append(winnerName);
    const penaltyLeg = tie.legs.find((leg) => leg?.result.penalties);
    const penalties = penaltyLeg?.result.penalties;
    if (penalties) {
      const penaltyLabel = document.createElement('span');
      penaltyLabel.className = 'tie-winner-penalties';
      const winnerScore = penalties.winnerIndex === 0 ? penalties.home : penalties.away;
      const runnerUpScore = penalties.winnerIndex === 0 ? penalties.away : penalties.home;
      penaltyLabel.textContent = `(Penalties ${winnerScore} – ${runnerUpScore})`;
      winner.append(penaltyLabel);
    }
    card.append(winner);
  }
  return card;
}

function getRoundStatus(roundKey, legIndex) {
  const roundIndex = ROUND_KEYS.indexOf(roundKey);
  if (!isRoundUnlocked(roundKey)) {
    return `Complete ${ROUND_LABELS[ROUND_KEYS[roundIndex - 1]]} to unlock these matches.`;
  }
  const ties = knockout.rounds[roundKey];
  const completed = ties.filter((tie) => tie.legs[legIndex]
    && !(animationRun?.tie.id === tie.id && animationRun.legIndex === legIndex)).length;
  const available = ties.filter((tie) => !tie.winnerTeam && !tie.legs[legIndex] && getLegTeams(tie, roundKey, legIndex).every(Boolean)).length;
  const unresolved = ties.filter((tie) => !getParticipants(tie).every(Boolean)).length;
  if (roundKey !== 'final' && isRoundComplete(roundKey)) return 'Round complete · view the next round to see its confirmed or TBD match-ups.';
  if (available === 0 && unresolved > 0) return 'Teams are still TBD. Complete the preceding round to confirm these fixtures.';
  if (available === 0 && completed === ties.length) return 'This leg is complete. Move to the next leg to decide the ties.';
  return `${available} match${available === 1 ? '' : 'es'} ready to simulate${roundKey === 'final' ? '' : ` · ${completed} of ${ties.length} ${legIndex === 0 ? 'first legs' : 'second legs'} complete`}.`;
}

function getRemainingTeamCount() {
  const initialTeams = new Set([
    ...knockout.rounds.playoff.flatMap((tie) => tie.slots.map((slot) => slot.team).filter(Boolean)),
    ...knockout.rounds.r16.flatMap((tie) => tie.slots
      .filter((slot) => slot.type === 'team').map((slot) => slot.team).filter(Boolean)),
  ].map(teamKey));
  const completedTies = ROUND_KEYS.reduce((count, roundKey) =>
    count + knockout.rounds[roundKey].filter((tie) => tie.winnerTeam).length, 0);
  return Math.max(0, initialTeams.size - completedTies);
}

function renderRound() {
  const roundKey = knockout.selectedRound;
  const roundIndex = ROUND_KEYS.indexOf(roundKey);
  const ties = currentRoundTies();
  const legIndex = getCurrentLeg(roundKey);
  elements.roundKicker.textContent = roundKey === 'playoff' ? 'ROUND OF 32 · POSITIONS 9–24 · TWO LEGS' : 'ELIMINATION ROUND';
  elements.roundTitle.textContent = ROUND_LABELS[roundKey];
  elements.teamsCount.textContent = getRemainingTeamCount();
  const roundLabel = ROUND_LABELS[roundKey].toLocaleUpperCase();
  elements.roundLabel.textContent = roundLabel;
  elements.dockRoundLabel.textContent = roundLabel;
  elements.ties.classList.toggle('is-final-round', roundKey === 'final');
  [elements.roundPrevious, elements.dockRoundPrevious].forEach((button) => {
    button.disabled = roundIndex <= 0 || simulationRunning;
  });
  [elements.roundNext, elements.dockRoundNext].forEach((button) => {
    button.disabled = roundIndex >= ROUND_KEYS.length - 1 || simulationRunning;
  });
  elements.roundStatus.textContent = getRoundStatus(roundKey, legIndex);
  elements.ties.replaceChildren(...ties.map((tie) => createTieCard(tie, roundKey, legIndex)));
  const eligible = ties.filter((tie) => getTieCurrentLeg(tie, roundKey) === legIndex
    && canSimulateTie(tie, roundKey, legIndex));
  elements.simulateRound.textContent = 'Simulate round';
  elements.simulateRound.disabled = simulationRunning || eligible.length === 0;
  const selectedTie = ties.find((tie) => tie.id === selectedTieId);
  const selectedLegIndex = selectedTie ? selectedTieLegIndex : null;
  elements.simulateSelected.textContent = 'Simulate selected';
  elements.simulateSelected.disabled = simulationRunning || !selectedTie || selectedLegIndex === null
    || !canSimulateTie(selectedTie, roundKey, selectedLegIndex);
  elements.status.textContent = simulationRunning ? 'Simulating knockout fixtures…'
    : !isRoundUnlocked(roundKey) ? `Complete ${ROUND_LABELS[ROUND_KEYS[roundIndex - 1]]} before simulating this round.`
    : eligible.length ? `${eligible.length} ${eligible.length === 1 ? 'match' : 'matches'} ready · ${ROUND_LABELS[roundKey]}`
      : 'No confirmed fixtures are ready to simulate in this round.';
}

function createBracketCell(roundKey, tie, side) {
  const cell = document.createElement('div');
  cell.className = `bracket-cell${roundKey === 'final' ? ' is-final' : ''}${roundKey === 'playoff' ? ' is-playoff' : ''}`;
  cell.dataset.side = side;
  cell.dataset.roundKey = roundKey;
  cell.dataset.tieId = tie.id;
  const participants = getParticipants(tie);
  const first = participants[0]?.team || null;
  const second = participants[1]?.team || null;
  const totals = getDisplayedTieAggregate(tie);
  const hasScore = tie.legs.some(Boolean);
  const firstPlayedLeg = tie.legs.findIndex((leg) => Boolean(leg?.result));
  if (firstPlayedLeg >= 0) {
    const teamNames = participants.map((participant) => participant?.team?.name).filter(Boolean);
    cell.classList.add('is-reviewable');
    cell.setAttribute('role', 'button');
    cell.setAttribute('tabindex', '0');
    cell.setAttribute('aria-label', `Review ${ROUND_LABELS[roundKey]} match events for ${teamNames.join(' vs ')}`);
    cell.title = 'Open match events';
    cell.addEventListener('click', () => reviewKnockoutLeg(tie, roundKey, firstPlayedLeg));
    cell.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      reviewKnockoutLeg(tie, roundKey, firstPlayedLeg);
    });
  }
  const winner = tieWinner(tie);
  [first, second].forEach((team) => {
    const line = document.createElement('div');
    line.className = `bracket-team${team ? '' : ' is-tbd'}${winner && teamKey(winner) === teamKey(team) ? ' is-winner' : ''}`;
    line.append(makeBadge(team));
    const name = document.createElement('span');
    name.textContent = team?.name || 'TBD';
    name.title = team?.name || 'TBD';
    line.append(name);
    const score = document.createElement('strong');
    score.className = `bracket-score${hasScore ? ' is-recorded' : ' is-pending'}`;
    score.textContent = team && hasScore ? String(totals.get(teamKey(team)) || 0) : '—';
    line.append(score);
    cell.append(line);
  });
  return cell;
}

function renderBracketConnectors() {
  const svg = elements.bracket.querySelector('.bracket-connectors');
  if (!svg) return;
  const gridRect = elements.bracket.getBoundingClientRect();
  const width = elements.bracket.clientWidth;
  const height = elements.bracket.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.replaceChildren();

  const cells = new Map([...elements.bracket.querySelectorAll('.bracket-cell[data-round-key]')]
    .map((cell) => [`${cell.dataset.roundKey}:${cell.dataset.tieId}`, cell]));
  const sourcesByTarget = new Map();
  for (const roundKey of ROUND_KEYS) {
    for (const tie of knockout.rounds[roundKey]) {
      const target = cells.get(`${roundKey}:${tie.id}`);
      if (!target) continue;
      for (const slot of tie.slots) {
        if (slot.type !== 'winner') continue;
        const source = cells.get(`${slot.round}:${slot.tieId}`);
        if (!source) continue;
        const sources = sourcesByTarget.get(target) || new Set();
        sources.add(source);
        sourcesByTarget.set(target, sources);
      }
    }
  }

  const addPath = (pathData) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'rgba(156,174,194,.58)');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
  };

  for (const [target, sourceSet] of sourcesByTarget) {
    const targetRect = target.getBoundingClientRect();
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2 - gridRect.top;
    const sources = [...sourceSet].map((source) => {
      const rect = source.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const isLeftToRight = centerX < targetCenterX;
      return {
        x: (isLeftToRight ? rect.right : rect.left) - gridRect.left,
        y: rect.top + rect.height / 2 - gridRect.top,
        isLeftToRight,
      };
    });
    if (sources.length > 1 && sources.some((source) => source.isLeftToRight !== sources[0].isLeftToRight)) {
      for (const source of sources) {
        const sourceTargetX = (source.isLeftToRight ? targetRect.left : targetRect.right) - gridRect.left;
        const joinX = (source.x + sourceTargetX) / 2;
        addPath(`M ${source.x} ${source.y} H ${joinX} V ${targetY} H ${sourceTargetX}`);
      }
      continue;
    }
    const isLeftToRight = sources[0].isLeftToRight;
    const targetX = (isLeftToRight ? targetRect.left : targetRect.right) - gridRect.left;
    const joinX = (sources[0].x + targetX) / 2;
    if (sources.length === 1) {
      const source = sources[0];
      addPath(`M ${source.x} ${source.y} H ${joinX} V ${targetY} H ${targetX}`);
      continue;
    }
    for (const source of sources) addPath(`M ${source.x} ${source.y} H ${joinX}`);
    const sourceYs = sources.map((source) => source.y);
    addPath(`M ${joinX} ${Math.min(...sourceYs)} V ${Math.max(...sourceYs)}`);
    addPath(`M ${joinX} ${targetY} H ${targetX}`);
  }
}

function updateBracketScrollCue() {
  const maxScroll = Math.max(0, elements.bracketScroll.scrollWidth - elements.bracketScroll.clientWidth);
  elements.bracketFrame.classList.toggle('has-overflow', maxScroll > 2);
  elements.bracketFrame.classList.toggle('can-scroll-left', elements.bracketScroll.scrollLeft > 2);
  elements.bracketFrame.classList.toggle('can-scroll-right', elements.bracketScroll.scrollLeft < maxScroll - 2);
}

function centerBracketScroll() {
  const maxScroll = Math.max(0, elements.bracketScroll.scrollWidth - elements.bracketScroll.clientWidth);
  elements.bracketScroll.scrollLeft = maxScroll / 2;
  updateBracketScrollCue();
}

function renderBracket() {
  const entries = [];
  const connectors = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  connectors.classList.add('bracket-connectors');
  connectors.setAttribute('aria-hidden', 'true');
  entries.push(connectors);
  const columnLabels = [
    'ROUND OF 32', 'ROUND OF 16', 'QUARTER-FINALS', 'SEMI-FINALS', 'FINAL',
    'SEMI-FINALS', 'QUARTER-FINALS', 'ROUND OF 16', 'ROUND OF 32',
  ];
  columnLabels.forEach((text, index) => {
    const heading = document.createElement('div');
    heading.className = `bracket-column-label${index === 4 ? ' is-final' : ''}`;
    heading.textContent = text;
    heading.style.gridColumn = String(index + 1);
    heading.style.gridRow = '1';
    entries.push(heading);
  });
  const cup = document.createElement('img');
  cup.className = 'bracket-cup';
  cup.src = '/images/ucl-cup.png';
  cup.alt = '';
  cup.setAttribute('aria-hidden', 'true');
  cup.style.gridColumn = '5';
  cup.style.gridRow = '2 / span 2';
  entries.push(cup);
  const add = (roundKey, tieIndex, column, row, rowSpan, side) => {
    const tie = knockout.rounds[roundKey][tieIndex];
    const cell = createBracketCell(roundKey, tie, side);
    cell.style.gridColumn = String(column);
    cell.style.gridRow = `${row} / span ${rowSpan}`;
    entries.push(cell);
  };
  for (let index = 0; index < 4; index += 1) {
    const leftRow = index * 2 + 2;
    const leftPlayoffId = knockout.rounds.r16[index].slots[1].tieId;
    const leftPlayoffIndex = knockout.rounds.playoff.findIndex((tie) => tie.id === leftPlayoffId);
    add('playoff', leftPlayoffIndex, 1, leftRow, 2, 'left');
    add('r16', index, 2, leftRow, 2, 'left');

    const rightR16Index = index + 4;
    const rightRow = index * 2 + 2;
    const rightPlayoffId = knockout.rounds.r16[rightR16Index].slots[1].tieId;
    const rightPlayoffIndex = knockout.rounds.playoff.findIndex((tie) => tie.id === rightPlayoffId);
    add('r16', rightR16Index, 8, rightRow, 2, 'right');
    add('playoff', rightPlayoffIndex, 9, rightRow, 2, 'right');
  }
  add('qf', 0, 3, 3, 2, 'left');
  add('qf', 1, 3, 7, 2, 'left');
  add('sf', 0, 4, 5, 2, 'left');
  add('final', 0, 5, 5, 2, 'center');
  add('sf', 1, 6, 5, 2, 'right');
  add('qf', 3, 7, 7, 2, 'right');
  add('qf', 2, 7, 3, 2, 'right');
  if (knockout.champion) {
    const champion = document.createElement('button');
    champion.className = 'bracket-champion';
    champion.type = 'button';
    champion.setAttribute('aria-label', `Open champions celebration for ${knockout.champion.name}`);
    champion.addEventListener('click', showChampionCelebration);
    champion.append(makeBadge(knockout.champion));
    const name = document.createElement('span');
    name.textContent = `CHAMPIONS · ${knockout.champion.name}`;
    champion.append(name);
    champion.style.gridColumn = '5';
    champion.style.gridRow = '7 / span 2';
    entries.push(champion);
  }
  elements.bracket.replaceChildren(...entries);
  renderBracketConnectors();
  updateBracketScrollCue();
}

