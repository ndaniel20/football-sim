function canSimulateTie(tie, roundKey, legIndex) {
  return Number.isInteger(legIndex) && legIndex >= 0 && legIndex < tie.legs.length
    && isRoundUnlocked(roundKey) && !tie.winnerTeam && !tie.legs[legIndex]
    && getLegTeams(tie, roundKey, legIndex).every(Boolean);
}

async function simulateTies(ties, animated = false, forcedLegIndex = null) {
  if (simulationRunning || !ties.length) return;
  const roundKey = knockout.selectedRound;
  const legIndexByTie = new Map(ties.map((tie) => [tie.id, forcedLegIndex ?? getTieCurrentLeg(tie, roundKey)]));
  const ready = ties.filter((tie) => canSimulateTie(tie, roundKey, legIndexByTie.get(tie.id)));
  if (!ready.length) return;
  simulationRunning = true;
  renderRound();
  let simulationError = null;
  try {
    const aggregateBeforeByTie = new Map();
    const matches = ready.map((tie) => {
      const legIndex = legIndexByTie.get(tie.id);
      const [homeTeam, awayTeam] = getLegTeams(tie, roundKey, legIndex);
      const aggregateBefore = getAggregateBefore(tie, homeTeam, awayTeam, legIndex);
      const awayGoalsBefore = getAwayGoalsBefore(tie, homeTeam, awayTeam, legIndex);
      aggregateBeforeByTie.set(tie.id, aggregateBefore);
      const [aggregateHomeGoals, aggregateAwayGoals] = aggregateBefore;
      return {
        id: tie.id,
        knockout: true,
        homeTeamName: homeTeam.name,
        awayTeamName: awayTeam.name,
        aggregateHomeGoals,
        aggregateAwayGoals,
        awayGoalsBefore,
        awayGoalsEligible: roundKey !== 'final',
        resolveTie: roundKey === 'final' || legIndex === 1,
        neutral: roundKey === 'final',
      };
    });
    const customizations = await window.playerCustomizations.load();
    const response = await fetch('/api/simulate-matches', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ matches, customizations, settings: window.appSettings.get() }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Could not simulate these matches.');
    if (!Array.isArray(payload.results) || payload.results.length !== ready.length
      || payload.results.some((result) => !result || !matches.some((match) => match.id === result.id))
      || new Set(payload.results.map((result) => result.id)).size !== ready.length) {
      throw new Error('The server returned incomplete match results. No fixtures were applied; please try again.');
    }
    const resultById = new Map(payload.results.map((result) => [result.id, result]));
    for (const tie of ready) {
      const result = resultById.get(tie.id);
      if (!result) continue;
      const legIndex = legIndexByTie.get(tie.id);
      const [homeTeam, awayTeam] = getLegTeams(tie, roundKey, legIndex);
      const aggregateBefore = aggregateBeforeByTie.get(tie.id) || [0, 0];
      tie.legs[legIndex] = { homeTeam, awayTeam, aggregateBefore, result };
      if (animated) {
        saveKnockout();
        renderRound();
        startKnockoutAnimation(tie, roundKey, legIndex, homeTeam, awayTeam, result, aggregateBefore);
        return;
      }
      if (roundKey === 'final' || legIndex === 1) finalizeTie(tie, roundKey);
    }
    advanceCompletedRound(roundKey);
    saveKnockout();
    renderAll();
    if (knockout.champion && !knockout.celebrationShown) showChampionCelebration();
  } catch (error) {
    simulationError = error.message;
  } finally {
    if (!animationRun && simulationRunning) {
      simulationRunning = false;
      renderAll();
    }
    if (simulationError) elements.status.textContent = simulationError;
  }
}

function showChampionCelebration() {
  if (!knockout.champion) return;
  knockout.celebrationShown = true;
  saveKnockout();
  elements.championTitle.textContent = 'Champions of Europe';
  elements.championTeam.replaceChildren(makeBadge(knockout.champion));
  const name = document.createElement('span');
  name.textContent = knockout.champion.name;
  elements.championTeam.append(name);
  const animationTargets = elements.championDialog.querySelectorAll('.champion-content, .champion-cup, .champion-confetti');
  animationTargets.forEach((element) => {
    element.style.animation = 'none';
    void element.offsetWidth;
    element.style.animation = '';
  });
  if (!elements.championDialog.open) elements.championDialog.showModal();
}

function renderRoundNavigation(delta) {
  const current = ROUND_KEYS.indexOf(knockout.selectedRound);
  const next = Math.max(0, Math.min(ROUND_KEYS.length - 1, current + delta));
  knockout.selectedRound = ROUND_KEYS[next];
  selectedTieId = null;
  selectedTieLegIndex = null;
  saveKnockout();
  renderRound();
}

function onTieListClick(event) {
  const action = event.target.closest('[data-action]');
  const card = event.target.closest('[data-tie-id]');
  if (!card) return;
  const tie = currentRoundTies().find((entry) => entry.id === card.dataset.tieId);
  if (!tie) return;
  if (action?.dataset.action === 'review') {
    reviewKnockoutLeg(tie, knockout.selectedRound, Number(action.dataset.legIndex));
    return;
  }
  if (action?.dataset.action !== 'select') return;
  selectedTieId = tie.id;
  selectedTieLegIndex = Number(action.dataset.legIndex) || 0;
  renderRound();
}

function onMatchLegToggleClick(event) {
  const button = event.target.closest('button[data-leg-index]');
  if (!button || button.disabled || !matchReviewContext) return;
  reviewKnockoutLeg(matchReviewContext.tie, matchReviewContext.roundKey, Number(button.dataset.legIndex));
}

function recoverInterruptedMatches() {
  for (const roundKey of ROUND_KEYS) {
    for (const tie of knockout.rounds[roundKey]) {
      if (!Array.isArray(tie.legs)) tie.legs = roundKey === 'final' ? [null] : [null, null];
      if (roundKey !== 'final' && tie.legs.length !== 2) tie.legs = [tie.legs[0] || null, tie.legs[1] || null];
      if (roundKey === 'final' && tie.legs.length !== 1) tie.legs = [tie.legs[0] || null];
      tie.winnerTeam ||= null;
    }
  }
}

function initialize() {
  try {
    leaguePhase = window.tournamentStorage.parse(window.localStorage.getItem(LEAGUE_PHASE_KEY) || 'null');
    if (!leaguePhase || !Array.isArray(leaguePhase.matchdays) || leaguePhase.matchdays.length !== 8
      || leaguePhase.matchdays.some((day) => !day.fixtures?.every((fixture) => fixture.played))) {
      window.location.replace('/league-phase');
      return;
    }
    window.tournamentStorage.save(LEAGUE_PHASE_KEY, leaguePhase);
    knockout = window.tournamentStorage.parse(window.localStorage.getItem(KNOCKOUT_KEY) || 'null');
    if (!knockout || knockout.signature !== leaguePhase.signature || !knockout.rounds?.playoff?.length) {
      knockout = createBracket(leaguePhase);
      saveKnockout();
    } else {
      knockout.selectedRound = ROUND_KEYS.includes(knockout.selectedRound) ? knockout.selectedRound : 'playoff';
      recoverInterruptedMatches();
      for (const roundKey of ROUND_KEYS) {
        if (knockout.rounds[roundKey].some((tie) => tie.legs?.some(Boolean)) && roundKey !== 'final') {
          knockout.rounds[roundKey].forEach((tie) => {
            if (tie.legs[0] && tie.legs[1] && !tie.winnerTeam) finalizeTie(tie, roundKey);
          });
        }
      }
      const finalTie = knockout.rounds.final[0];
      if (finalTie?.legs[0] && !knockout.champion) finalizeTie(finalTie, 'final');
      saveKnockout();
    }
    knockout.selectedRound = getCurrentTournamentRound();
    selectedTieId = null;
    selectedTieLegIndex = null;
    saveKnockout();
    elements.loading.hidden = true;
    renderAll();
    window.requestAnimationFrame(centerBracketScroll);
    if (knockout.champion && !knockout.celebrationShown) showChampionCelebration();
  } catch (error) {
    elements.loading.hidden = true;
    elements.errorMessage.textContent = error.message || 'Saved tournament data could not be loaded.';
    elements.error.hidden = false;
  }
}

[elements.roundPrevious, elements.dockRoundPrevious].forEach((button) => {
  button.addEventListener('click', () => renderRoundNavigation(-1));
});
[elements.roundNext, elements.dockRoundNext].forEach((button) => {
  button.addEventListener('click', () => renderRoundNavigation(1));
});
elements.bracketScroll.addEventListener('scroll', updateBracketScrollCue, { passive: true });
window.addEventListener('resize', updateBracketScrollCue);
window.addEventListener('resize', renderBracketConnectors);
elements.ties.addEventListener('click', onTieListClick);
elements.matchLegToggle.addEventListener('click', onMatchLegToggleClick);
elements.simulateSelected.addEventListener('click', () => {
  const tie = currentRoundTies().find((entry) => entry.id === selectedTieId);
  if (tie) simulateTies([tie], true, selectedTieLegIndex);
});
elements.simulateRound.addEventListener('click', () => {
  const legIndex = getCurrentLeg(knockout.selectedRound);
  simulateTies(currentRoundTies().filter((tie) => canSimulateTie(tie, knockout.selectedRound, legIndex)));
});
elements.championDialog.addEventListener('click', (event) => {
  if (event.target === elements.championDialog) elements.championDialog.close();
});
elements.matchModalClose.addEventListener('click', () => elements.matchModal.close());
elements.skipToFullTime.addEventListener('click', finishKnockoutAnimationImmediately);
elements.leaderModalClose.addEventListener('click', () => elements.leaderModal.close());
[elements.matchModal, elements.leaderModal].forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', releaseKnockoutDialogScroll);
});

initialize();
