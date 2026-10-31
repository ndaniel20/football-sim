function createPlayerFace(playerId, playerName, className = 'player-face') {
  const initials = String(playerName || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase();
  if (!playerId) {
    const fallback = document.createElement('span');
    fallback.className = `${className} is-fallback`;
    fallback.textContent = initials || '?';
    return fallback;
  }
  const image = document.createElement('img');
  image.className = className;
  image.src = `https://cdn.futwiz.com/assets/img/fc27/faces/${encodeURIComponent(playerId)}.png?25`;
  image.alt = `${playerName || 'Player'} face`;
  image.loading = 'lazy';
  image.addEventListener('error', () => {
    const fallback = document.createElement('span');
    fallback.className = `${className} is-fallback`;
    fallback.textContent = initials || '?';
    image.replaceWith(fallback);
  }, { once: true });
  return image;
}

function makeMatchFixture(homeTeam, awayTeam) {
  return { home: { team: homeTeam }, away: { team: awayTeam } };
}

function countGoals(events) {
  return events.filter((event) => event.type !== 'substitution').reduce((score, event) => {
    score[event.teamIndex] += 1;
    return score;
  }, [0, 0]);
}

let modalScrollY = 0;
let renderedScoreboardFixture = null;
function openKnockoutDialog(dialog) {
  let lockedScroll = false;
  if (!dialog.open) {
    if (!document.querySelector('dialog[open]')) {
      modalScrollY = window.scrollY;
      document.documentElement.classList.add('league-modal-open');
      document.body.classList.add('league-modal-open');
      document.body.style.top = `-${modalScrollY}px`;
      lockedScroll = true;
    }
    try {
      dialog.showModal();
    } catch (error) {
      if (lockedScroll) {
        document.documentElement.classList.remove('league-modal-open');
        document.body.classList.remove('league-modal-open');
        document.body.style.top = '';
        window.scrollTo(0, modalScrollY);
      }
      throw error;
    }
  }
  if (dialog === elements.matchModal) {
    const resetScroll = () => {
      dialog.scrollTop = 0;
      dialog.querySelector('.match-modal-shell').scrollTop = 0;
      elements.matchTimeline.scrollTop = 0;
    };
    resetScroll();
    window.requestAnimationFrame(resetScroll);
  }
}

function releaseKnockoutDialogScroll() {
  if (document.querySelector('dialog[open]')) return;
  document.documentElement.classList.remove('league-modal-open');
  document.body.classList.remove('league-modal-open');
  document.body.style.top = '';
  window.scrollTo(0, modalScrollY);
}

function renderKnockoutScoreboard(fixture, homeGoals, awayGoals, minute, totalMinutes, penaltyScore = null) {
  if (renderedScoreboardFixture !== fixture) {
    elements.liveScoreboard.replaceChildren();
    const createSide = (team) => {
      const side = document.createElement('div');
      side.className = 'scoreboard-team';
      side.append(makeBadge(team));
      const name = document.createElement('span');
      name.textContent = team.name;
      side.append(name);
      return side;
    };
    const center = document.createElement('div');
    center.className = 'scoreboard-center';
    const score = document.createElement('strong');
    score.className = 'scoreboard-score';
    const clock = document.createElement('span');
    clock.className = 'scoreboard-clock';
    center.append(score, clock);
    elements.liveScoreboard.append(createSide(fixture.home.team), center, createSide(fixture.away.team));
    renderedScoreboardFixture = fixture;
  }

  const score = elements.liveScoreboard.querySelector('.scoreboard-score');
  const clock = elements.liveScoreboard.querySelector('.scoreboard-clock');
  score.textContent = `${homeGoals}–${awayGoals}`;
  if (penaltyScore) clock.textContent = `PENALTIES (${penaltyScore.home}–${penaltyScore.away})`;
  else if (minute >= totalMinutes) clock.textContent = 'FULL TIME';
  else if (minute === 90 && totalMinutes > 90) clock.textContent = 'FULL TIME · 90′';
  else if (minute === 105) clock.textContent = 'EXTRA-TIME HALF-TIME';
  else if (minute > 90) clock.textContent = `${minute}′ · EXTRA TIME`;
  else if (minute === 45) clock.textContent = 'HALF-TIME';
  else if (minute > 45) clock.textContent = `${minute}′ · SECOND HALF`;
  else clock.textContent = minute ? `${minute}′ · FIRST HALF` : 'KICK-OFF';
}

function renderKnockoutLiveStats(result, minute) {
  const snapshot = minute > 0 && result.minuteStats?.length
    ? result.minuteStats[Math.max(0, Math.min(minute - 1, result.minuteStats.length - 1))]
    : { homeXG: 0, awayXG: 0, homePossession: 50, awayPossession: 50 };
  if (elements.liveMatchStats.children.length !== 2) {
    elements.liveMatchStats.replaceChildren();
    for (const label of ['EXPECTED GOALS', 'POSSESSION']) {
      const block = document.createElement('div');
      block.className = 'match-stat-block';
      const heading = document.createElement('span');
      heading.className = 'match-stat-label';
      heading.textContent = label;
      const values = document.createElement('div');
      values.className = 'match-stat-values';
      for (let index = 0; index < 2; index += 1) {
        const value = document.createElement('div');
        value.className = 'stat-value-chip';
        const number = document.createElement('strong');
        value.append(number);
        values.append(value);
        if (index === 0) {
          const separator = document.createElement('span');
          separator.textContent = label === 'POSSESSION' ? 'BALL' : 'xG';
          values.append(separator);
        }
      }
      block.append(heading, values);
      if (label === 'POSSESSION') {
        const bar = document.createElement('div');
        bar.className = 'possession-bar';
        bar.append(document.createElement('span'), document.createElement('span'));
        block.append(bar);
      }
      elements.liveMatchStats.append(block);
    }
  }

  const [xgBlock, possessionBlock] = elements.liveMatchStats.children;
  const xgValues = xgBlock.querySelectorAll('.stat-value-chip strong');
  const possessionValues = possessionBlock.querySelectorAll('.stat-value-chip strong');
  xgValues[0].textContent = Number(snapshot.homeXG || 0).toFixed(2);
  xgValues[1].textContent = Number(snapshot.awayXG || 0).toFixed(2);
  possessionValues[0].textContent = `${Math.round(snapshot.homePossession ?? 50)}%`;
  possessionValues[1].textContent = `${Math.round(snapshot.awayPossession ?? 50)}%`;
  const possessionBars = possessionBlock.querySelectorAll('.possession-bar span');
  possessionBars[0].style.width = `${Number(snapshot.homePossession ?? 50)}%`;
  possessionBars[1].style.width = `${Number(snapshot.awayPossession ?? 50)}%`;
}

function addKnockoutGoal(fixture, event) {
  const row = document.createElement('article');
  row.className = 'timeline-goal';
  const minute = document.createElement('span');
  minute.className = `timeline-minute ${event.teamIndex === 0 ? 'is-home' : 'is-away'}`;
  minute.textContent = `${event.minute}′`;
  const details = document.createElement('div');
  details.className = 'goal-details';
  const type = document.createElement('span');
  type.className = 'goal-tag';
  type.textContent = 'GOAL';
  const scorer = document.createElement('strong');
  scorer.className = 'goal-scorer';
  scorer.textContent = event.scorer;
  const team = document.createElement('small');
  team.textContent = event.teamIndex === 0 ? fixture.home.team.name : fixture.away.team.name;
  details.append(type, scorer, team);
  row.append(minute, createPlayerFace(event.scorerId, event.scorer, 'event-face'), details);
  if (event.assister) {
    const assist = document.createElement('div');
    assist.className = 'goal-assist';
    assist.append(createPlayerFace(event.assisterId, event.assister, 'assist-face'));
    const copy = document.createElement('span');
    const tag = document.createElement('small');
    tag.textContent = 'ASSIST';
    const name = document.createElement('strong');
    name.textContent = event.assister;
    copy.append(tag, name);
    assist.append(copy);
    row.append(assist);
  }
  elements.matchTimeline.prepend(row);
}

function knockoutMatchScoreline(fixture, homeGoals, awayGoals) {
  return `${fixture.home.team.name} ${homeGoals}–${awayGoals} ${fixture.away.team.name}`;
}

function addKnockoutPeriod(label, fixture, homeGoals, awayGoals, extra = '') {
  const row = document.createElement('div');
  const isPenalty = label === 'PENALTY SHOOT-OUT';
  row.className = `timeline-period${label === 'HALF-TIME' ? ' is-halftime' : ' is-fulltime'}${isPenalty ? ' is-penalty' : ''}`;
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  if (isPenalty) {
    const ball = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ball.setAttribute('cx', '12');
    ball.setAttribute('cy', '12');
    ball.setAttribute('r', '9');
    ball.setAttribute('stroke', 'currentColor');
    ball.setAttribute('stroke-width', '1.6');
    icon.append(ball);
    path.setAttribute('d', 'm12 7 3.2 2.3-1.2 3.8h-4l-1.2-3.8L12 7Zm0 0V3m3.2 6.3 4-1.2m-5.2 5 2.5 3.4m-6.5-3.4-2.5 3.4M8.8 9.3l-4-1.2');
  } else {
    path.setAttribute('d', 'M4 9h10.5a5.5 5.5 0 1 1-5.3 7H8a4 4 0 0 1-4-4V9Zm10.5 0V6h3m-1-2h5m-2-2 2 2-2 2');
  }
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  icon.append(path);
  const title = document.createElement('strong');
  title.textContent = label;
  const score = document.createElement('span');
  score.className = 'period-score';
  score.textContent = extra || knockoutMatchScoreline(fixture, homeGoals, awayGoals);
  row.append(icon, title, score);
  elements.matchTimeline.prepend(row);
}

function addKnockoutKickoffEntry() {
  const row = document.createElement('div');
  row.className = 'timeline-note';
  row.innerHTML = '<span class="timeline-note-dot" aria-hidden="true"></span><span>Kick-off</span>';
  elements.matchTimeline.append(row);
}

function renderKnockoutTimeline(run, finished) {
  elements.matchTimeline.replaceChildren();
  addKnockoutKickoffEntry();
  let homeGoals = 0;
  let awayGoals = 0;
  let halftimeAdded = false;
  let regulationAdded = false;
  let extraTimeBreakAdded = false;
  const visibleEvents = run.events.filter((event) => event.minute <= run.minute);
  for (const event of visibleEvents) {
    if (!halftimeAdded && event.minute > 45) {
      addKnockoutPeriod('HALF-TIME', run.fixture, homeGoals, awayGoals);
      halftimeAdded = true;
    }
    if (run.totalMinutes > 90 && !regulationAdded && event.minute > 90) {
      const regulationGoals = run.events.filter((goal) => goal.type !== 'substitution' && goal.minute <= 90);
      const regulationHomeGoals = regulationGoals.filter((goal) => goal.teamIndex === 0).length;
      const regulationAwayGoals = regulationGoals.filter((goal) => goal.teamIndex === 1).length;
      addKnockoutPeriod('FULL TIME · 90′', run.fixture, regulationHomeGoals, regulationAwayGoals);
      regulationAdded = true;
    }
    if (run.totalMinutes > 90 && !extraTimeBreakAdded && event.minute > 105) {
      addKnockoutPeriod('EXTRA-TIME BREAK · 105′', run.fixture, homeGoals, awayGoals);
      extraTimeBreakAdded = true;
    }
    if (event.type !== 'substitution') {
      addKnockoutGoal(run.fixture, event);
      if (event.teamIndex === 0) homeGoals += 1;
      else awayGoals += 1;
    }
  }
  if (!halftimeAdded && run.minute >= 45) {
    const halftimeEvents = run.events.filter((event) => event.type !== 'substitution' && event.minute <= 45);
    addKnockoutPeriod('HALF-TIME', run.fixture,
      halftimeEvents.filter((event) => event.teamIndex === 0).length,
      halftimeEvents.filter((event) => event.teamIndex === 1).length);
    halftimeAdded = true;
  }
  if (run.totalMinutes > 90 && run.minute >= 90 && !regulationAdded) {
    const regulationGoals = run.events.filter((event) => event.type !== 'substitution' && event.minute <= 90);
    const regulationHomeGoals = regulationGoals.filter((goal) => goal.teamIndex === 0).length;
    const regulationAwayGoals = regulationGoals.filter((goal) => goal.teamIndex === 1).length;
    addKnockoutPeriod('FULL TIME · 90′', run.fixture, regulationHomeGoals, regulationAwayGoals);
    regulationAdded = true;
  }
  if (run.totalMinutes > 90 && run.minute >= 105 && !extraTimeBreakAdded) {
    const [extraTimeHomeGoals, extraTimeAwayGoals] = countGoals(run.events.filter((event) => event.minute <= 105));
    addKnockoutPeriod('EXTRA-TIME BREAK · 105′', run.fixture, extraTimeHomeGoals, extraTimeAwayGoals);
  }
  if (finished && run.result.extraTime) {
    addKnockoutPeriod('AFTER EXTRA TIME', run.fixture, run.result.homeGoals, run.result.awayGoals);
  }
  if (finished && run.result.penalties) {
    const penaltyScore = `${run.fixture.home.team.name} ${run.result.penalties.home} – ${run.result.penalties.away} ${run.fixture.away.team.name}`;
    addKnockoutPeriod('PENALTY SHOOT-OUT', run.fixture, null, null,
      penaltyScore);
  }
  if (finished && !run.result.extraTime) {
    addKnockoutPeriod('FULL-TIME', run.fixture,
      run.result.homeGoals, run.result.awayGoals);
  }
  if (finished && (run.result.awayGoalsWinnerIndex === 0 || run.result.awayGoalsWinnerIndex === 1)) {
    addKnockoutPeriod('AWAY GOALS', run.fixture, run.result.homeGoals, run.result.awayGoals,
      `${run.result.awayGoalsWinnerIndex === 0 ? run.fixture.home.team.name : run.fixture.away.team.name} advances`);
  }
  elements.matchTimeline.scrollTop = 0;
}

function renderMatchAggregate(tie, roundKey, legIndex, fixture, aggregateBefore, homeGoals, awayGoals) {
  if (roundKey === 'final') {
    elements.matchModalAggregate.hidden = true;
    elements.matchModalAggregate.replaceChildren();
    return;
  }
  const before = aggregateBefore || getAggregateBefore(tie, fixture.home.team, fixture.away.team, legIndex);
  const label = document.createElement('span');
  label.textContent = 'AGGREGATE';
  const score = document.createElement('strong');
  score.textContent = `${before[0] + homeGoals} – ${before[1] + awayGoals}`;
  elements.matchModalAggregate.replaceChildren(label, score);
  elements.matchModalAggregate.hidden = false;
}

function updateKnockoutMatchView(run) {
  renderKnockoutScoreboard(run.fixture, run.homeGoals, run.awayGoals, run.minute, run.totalMinutes);
  renderKnockoutLiveStats(run.result, run.minute);
  renderMatchAggregate(run.tie, run.roundKey, run.legIndex, run.fixture, run.aggregateBefore, run.homeGoals, run.awayGoals);
}

function recoverKnockoutAnimation(run, error) {
  if (animationRun && animationRun !== run) return;
  if (run.timer) window.clearInterval(run.timer);
  run.timer = null;
  animationRun = null;
  simulationRunning = false;
  console.error('Knockout match animation was interrupted.', error);

  try {
    if (run.tie.legs[run.legIndex]) {
      if (run.roundKey === 'final' || run.legIndex === 1) finalizeTie(run.tie, run.roundKey);
      advanceCompletedRound(run.roundKey);
      saveKnockout();
    }
  } catch (recoveryError) {
    console.error('Could not finalize the interrupted knockout match.', recoveryError);
  }

  if (elements.matchModal.open) elements.matchModal.close();
  try {
    renderAll();
  } catch (renderError) {
    console.error('Could not refresh the knockout page after an interrupted match.', renderError);
    renderRound();
  }
  elements.status.textContent = 'The match result was saved, but its live view was interrupted. Use View match to review it.';
}

function configureMatchLegToggle(tie, roundKey, activeLegIndex) {
  matchReviewContext = { tie, roundKey, legIndex: activeLegIndex };
  elements.matchLegFirst.textContent = roundKey === 'final' ? 'Final' : 'First leg';
  elements.matchLegFirst.disabled = !tie.legs[0]?.result;
  elements.matchLegSecond.disabled = roundKey === 'final' || !tie.legs[1]?.result;
  for (const [button, legIndex] of [[elements.matchLegFirst, 0], [elements.matchLegSecond, 1]]) {
    const active = legIndex === activeLegIndex;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function reviewKnockoutLeg(tie, roundKey, legIndex) {
  const leg = tie.legs[legIndex];
  if (!leg) return;
  configureMatchLegToggle(tie, roundKey, legIndex);
  const running = animationRun?.tie.id === tie.id && animationRun.legIndex === legIndex ? animationRun : null;
  if (running) {
    elements.matchModalRound.textContent = `${ROUND_LABELS[roundKey].toLocaleUpperCase()} · ${roundKey === 'final' ? 'FINAL' : legIndex === 0 ? 'FIRST LEG' : 'SECOND LEG'}`;
    elements.matchModalTitle.textContent = `${leg.homeTeam.name} vs ${leg.awayTeam.name}`;
    renderKnockoutTimeline(running, false);
    updateKnockoutMatchView(running);
    elements.skipToFullTime.disabled = false;
    elements.matchModal.querySelector('.match-modal-footer').hidden = false;
    openKnockoutDialog(elements.matchModal);
    return;
  }
  const fixture = makeMatchFixture(leg.homeTeam, leg.awayTeam);
  const result = leg.result;
  const totalMinutes = result.minuteStats?.length || 90;
  elements.matchModalRound.textContent = `${ROUND_LABELS[roundKey].toLocaleUpperCase()} · ${legIndex === 0 ? 'FIRST LEG' : roundKey === 'final' ? 'FINAL' : 'SECOND LEG'}`;
  elements.matchModalTitle.textContent = `${leg.homeTeam.name} vs ${leg.awayTeam.name}`;
  const completedRun = {
    tie, roundKey, legIndex, fixture, result,
    events: [...(result.events || [])].sort((a, b) => a.minute - b.minute),
    minute: totalMinutes, totalMinutes, homeGoals: result.homeGoals, awayGoals: result.awayGoals,
    aggregateBefore: leg.aggregateBefore || getAggregateBefore(tie, leg.homeTeam, leg.awayTeam, legIndex),
  };
  renderKnockoutTimeline(completedRun, true);
  renderKnockoutScoreboard(fixture, result.homeGoals, result.awayGoals, totalMinutes, totalMinutes);
  if (result.penalties) renderKnockoutScoreboard(fixture, result.homeGoals, result.awayGoals, totalMinutes, totalMinutes, result.penalties);
  renderKnockoutLiveStats(result, totalMinutes);
  renderMatchAggregate(tie, roundKey, legIndex, fixture, completedRun.aggregateBefore, result.homeGoals, result.awayGoals);
  elements.skipToFullTime.disabled = true;
  elements.matchModal.querySelector('.match-modal-footer').hidden = true;
  openKnockoutDialog(elements.matchModal);
}

function startKnockoutAnimation(tie, roundKey, legIndex, homeTeam, awayTeam, result, aggregateBefore) {
  const fixture = makeMatchFixture(homeTeam, awayTeam);
  const events = [...(result.events || [])].sort((first, second) => first.minute - second.minute);
  const run = { tie, roundKey, legIndex, fixture, result, events, aggregateBefore, minute: 0, homeGoals: 0, awayGoals: 0, eventIndex: 0, totalMinutes: result.minuteStats?.length || 90, timer: null };
  animationRun = run;
  try {
    renderBracket();
    renderRound();
    configureMatchLegToggle(tie, roundKey, legIndex);
    elements.matchModalRound.textContent = `${ROUND_LABELS[roundKey].toLocaleUpperCase()} · ${roundKey === 'final' ? 'FINAL' : legIndex === 0 ? 'FIRST LEG' : 'SECOND LEG'}`;
    elements.matchModalTitle.textContent = `${homeTeam.name} vs ${awayTeam.name}`;
    elements.matchTimeline.replaceChildren();
    addKnockoutKickoffEntry();
    updateKnockoutMatchView(run);
    elements.matchModal.querySelector('.match-modal-footer').hidden = false;
    elements.skipToFullTime.disabled = false;
    openKnockoutDialog(elements.matchModal);
  } catch (error) {
    recoverKnockoutAnimation(run, error);
    return;
  }

  run.advance = () => {
    run.minute += 1;
    const isCurrentMatchView = matchReviewContext?.tie.id === tie.id
      && matchReviewContext.roundKey === roundKey && matchReviewContext.legIndex === legIndex;
    let scoreChanged = false;
    while (run.eventIndex < events.length && events[run.eventIndex].minute <= run.minute) {
      const event = events[run.eventIndex];
      if (event.type !== 'substitution') {
        if (event.teamIndex === 0) run.homeGoals += 1;
        else run.awayGoals += 1;
        if (isCurrentMatchView) addKnockoutGoal(fixture, event);
        scoreChanged = true;
      }
      run.eventIndex += 1;
    }
    if (scoreChanged) {
      renderBracket();
      renderRound();
    }
    if (isCurrentMatchView && run.minute === 45) addKnockoutPeriod('HALF-TIME', fixture, run.homeGoals, run.awayGoals);
    if (isCurrentMatchView && run.minute === 90 && run.totalMinutes > 90) {
      addKnockoutPeriod('FULL TIME · 90′', fixture, run.homeGoals, run.awayGoals);
    }
    if (isCurrentMatchView && run.minute === 105 && run.totalMinutes > 90) {
      addKnockoutPeriod('EXTRA-TIME BREAK · 105′', fixture, run.homeGoals, run.awayGoals);
    }
    if (isCurrentMatchView) updateKnockoutMatchView(run);
    if (run.minute < run.totalMinutes) return;

    if (isCurrentMatchView && result.extraTime) addKnockoutPeriod('AFTER EXTRA TIME', fixture, result.homeGoals, result.awayGoals);
    if (isCurrentMatchView && result.penalties) {
      const penaltyScore = `${fixture.home.team.name} ${result.penalties.home} – ${result.penalties.away} ${fixture.away.team.name}`;
      addKnockoutPeriod('PENALTY SHOOT-OUT', fixture, null, null, penaltyScore);
    }
    if (isCurrentMatchView) {
      if (!result.extraTime) {
        addKnockoutPeriod('FULL-TIME', fixture, run.homeGoals, run.awayGoals);
      }
      if (result.awayGoalsWinnerIndex === 0 || result.awayGoalsWinnerIndex === 1) {
        addKnockoutPeriod('AWAY GOALS', fixture, run.homeGoals, run.awayGoals,
          `${result.awayGoalsWinnerIndex === 0 ? fixture.home.team.name : fixture.away.team.name} advances`);
      }
      renderKnockoutScoreboard(fixture, run.homeGoals, run.awayGoals, run.minute, run.totalMinutes, result.penalties || null);
      elements.skipToFullTime.disabled = true;
      elements.matchModal.querySelector('.match-modal-footer').hidden = true;
    }
    window.clearInterval(run.timer);
    animationRun = null;
    if (roundKey === 'final' || legIndex === 1) finalizeTie(tie, roundKey);
    advanceCompletedRound(roundKey);
    saveKnockout();
    simulationRunning = false;
    renderAll();
    if (knockout.champion && !knockout.celebrationShown) {
      elements.matchModal.close();
      window.setTimeout(showChampionCelebration, 180);
    }
  };
  run.tick = () => {
    try {
      run.advance();
    } catch (error) {
      recoverKnockoutAnimation(run, error);
    }
  };
  run.timer = window.setInterval(run.tick, window.appSettings.interval(160));
}

window.addEventListener('app-settings-change', () => {
  if (!animationRun?.timer) return;
  window.clearInterval(animationRun.timer);
  animationRun.timer = window.setInterval(animationRun.tick, window.appSettings.interval(160));
});

