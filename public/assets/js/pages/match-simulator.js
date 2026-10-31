const elements = {
  homeLeagueTrigger: document.querySelector('#home-league-trigger'),
  homeLeaguePicker: document.querySelector('#home-league-picker'),
  homeLeagueMenu: document.querySelector('#home-league-menu'),
  homeLeagueOptions: document.querySelector('#home-league-options'),
  homeLeagueLabel: document.querySelector('#home-league-label'),
  homeLeagueFlag: document.querySelector('#home-league-flag'),
  homeTeamTrigger: document.querySelector('#home-team-trigger'),
  homeTeamPicker: document.querySelector('#home-team-picker'),
  homeTeamMenu: document.querySelector('#home-team-menu'),
  homeTeamOptions: document.querySelector('#home-team-options'),
  homeTeamSearch: document.querySelector('#home-team-search'),
  homeTeamLabel: document.querySelector('#home-team-label'),
  homeTeamCrest: document.querySelector('#home-team-crest'),
  awayLeagueTrigger: document.querySelector('#away-league-trigger'),
  awayLeaguePicker: document.querySelector('#away-league-picker'),
  awayLeagueMenu: document.querySelector('#away-league-menu'),
  awayLeagueOptions: document.querySelector('#away-league-options'),
  awayLeagueLabel: document.querySelector('#away-league-label'),
  awayLeagueFlag: document.querySelector('#away-league-flag'),
  awayTeamTrigger: document.querySelector('#away-team-trigger'),
  awayTeamPicker: document.querySelector('#away-team-picker'),
  awayTeamMenu: document.querySelector('#away-team-menu'),
  awayTeamOptions: document.querySelector('#away-team-options'),
  awayTeamSearch: document.querySelector('#away-team-search'),
  awayTeamLabel: document.querySelector('#away-team-label'),
  awayTeamCrest: document.querySelector('#away-team-crest'),
  homeCrest: document.querySelector('#home-crest'),
  homeName: document.querySelector('#home-name'),
  homeLeagueName: document.querySelector('#home-league-name'),
  awayCrest: document.querySelector('#away-crest'),
  awayName: document.querySelector('#away-name'),
  awayLeagueName: document.querySelector('#away-league-name'),
  xiBadge: document.querySelector('#friendly-xi-badge'),
  xiBadgeLabel: document.querySelector('#friendly-xi-badge-label'),
  swap: document.querySelector('#friendly-swap'),
  simulate: document.querySelector('#simulate-friendly'),
  results: document.querySelector('#friendly-results'),
  dialog: document.querySelector('#friendly-match-dialog'),
  dialogTitle: document.querySelector('#friendly-match-title'),
  dialogKicker: document.querySelector('#friendly-match-kicker'),
  close: document.querySelector('#friendly-match-close'),
  scoreboard: document.querySelector('#friendly-scoreboard'),
  stats: document.querySelector('#friendly-match-stats'),
  timeline: document.querySelector('#friendly-match-timeline'),
  skip: document.querySelector('#friendly-skip'),
};

let leagues = [];
let teamsByLeague = new Map();
let teamsByName = new Map();
const selections = { home: { leagueKey: '', teamName: '' }, away: { leagueKey: '', teamName: '' } };
let currentMatch = null;
let renderedScoreboardMatch = null;
let playback = null;
let modalScrollY = 0;
let activePicker = null;
const matchRecords = [];
let playerCustomizations = { version: 1, players: {} };

function selectedTeam(side) {
  const { leagueKey, teamName } = selections[side];
  return teamsByLeague.get(leagueKey)?.find((team) => team.name === teamName) || null;
}

function setCrest(image, team) {
  image.src = team?.team_id === null || team?.team_id === undefined
    ? '/images/clubs/placeholder.svg'
    : `/images/clubs/${encodeURIComponent(team.team_id)}.png`;
  image.alt = team ? `${team.name} badge` : '';
  image.onerror = () => {
    image.onerror = null;
    image.src = '/images/clubs/placeholder.svg';
  };
}

function updatePreview(side) {
  const team = selectedTeam(side);
  const league = leagues.find((entry) => entry.key === selections[side].leagueKey);
  setCrest(elements[`${side}Crest`], team);
  elements[`${side}Name`].textContent = team?.name || 'Choose a club';
  elements[`${side}LeagueName`].textContent = team ? league?.name || 'Club' : 'Select a club to continue';
  elements[`${side}LeagueLabel`].textContent = league?.name || 'Choose a league';
  elements[`${side}LeagueFlag`].src = league ? `/images/flags/${league.flag}.svg` : '/images/flags/others.svg';
  elements[`${side}TeamLabel`].textContent = team?.name || 'Choose a club';
  setCrest(elements[`${side}TeamCrest`], team);
}

function teamHasCustomXI(team) {
  if (!team?.customizationKey) return false;
  const customizationKey = team.customizationKey;
  return Object.entries(playerCustomizations.players || {}).some(([playerKey, edit]) =>
    playerKey.startsWith(`${customizationKey}::`) || edit?.clubKey === customizationKey);
}

function updateXiBadge() {
  const customizedSides = ['home', 'away'].filter((side) => teamHasCustomXI(selectedTeam(side)));
  const label = customizedSides.length === 2 ? 'CUSTOM XIs'
    : customizedSides.length === 1 ? 'CUSTOM XI' : 'STANDARD XIs';
  elements.xiBadgeLabel.textContent = label;
  elements.xiBadge.classList.toggle('is-customized', customizedSides.length > 0);
  const teamNames = customizedSides.map((side) => selectedTeam(side)?.name).filter(Boolean);
  elements.xiBadge.title = teamNames.length
    ? `Customized squad selected: ${teamNames.join(' and ')}`
    : 'Using the standard club line-ups';
}

function pickerNodes(side, kind) {
  return {
    wrapper: elements[`${side}${kind}Picker`],
    trigger: elements[`${side}${kind}Trigger`],
    menu: elements[`${side}${kind}Menu`],
    options: elements[`${side}${kind}Options`],
  };
}

function closePicker(restoreFocus = false) {
  if (!activePicker) return;
  const { side, kind } = activePicker;
  const nodes = pickerNodes(side, kind);
  nodes.menu.hidden = true;
  nodes.wrapper.classList.remove('is-open');
  nodes.trigger.setAttribute('aria-expanded', 'false');
  activePicker = null;
  if (restoreFocus) nodes.trigger.focus();
}

function fitPickerMenu(side, kind) {
  const { trigger, menu, options } = pickerNodes(side, kind);
  const rect = trigger.getBoundingClientRect();
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 20);
  const spaceAbove = Math.max(0, rect.top - 20);
  const contentHeight = Math.min(330, options.children.length * 46)
    + (kind === 'Team' ? 56 : 14);
  const opensUp = spaceBelow < contentHeight && spaceAbove > spaceBelow;
  const availableHeight = Math.max(90, opensUp ? spaceAbove : spaceBelow);
  const fixedContentHeight = kind === 'Team' ? 56 : 14;
  menu.classList.toggle('opens-up', opensUp);
  menu.style.maxHeight = `${availableHeight}px`;
  options.style.maxHeight = `${Math.max(60, Math.min(330, availableHeight - fixedContentHeight))}px`;
}

function openPicker(side, kind) {
  if (activePicker?.side === side && activePicker?.kind === kind) {
    closePicker();
    return;
  }
  closePicker();
  const nodes = pickerNodes(side, kind);
  nodes.wrapper.classList.add('is-open');
  nodes.menu.hidden = false;
  nodes.trigger.setAttribute('aria-expanded', 'true');
  activePicker = { side, kind };
  if (kind === 'Team') {
    const search = elements[`${side}TeamSearch`];
    search.value = '';
    renderTeamOptions(side);
    nodes.options.scrollTop = 0;
    fitPickerMenu(side, kind);
    search.focus();
  } else {
    nodes.options.scrollTop = 0;
    fitPickerMenu(side, kind);
    nodes.options.querySelector('.friendly-option:not(:disabled)')?.focus();
  }
}

function renderLeagueOptions(side) {
  const { options } = pickerNodes(side, 'League');
  options.replaceChildren();
  leagues.forEach((league) => {
    const option = document.createElement('button');
    option.className = `friendly-option${selections[side].leagueKey === league.key ? ' is-selected' : ''}`;
    option.type = 'button';
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(selections[side].leagueKey === league.key));
    option.dataset.value = league.key;
    const flag = document.createElement('img');
    flag.src = `/images/flags/${league.flag}.svg`;
    flag.alt = '';
    const name = document.createElement('span');
    name.textContent = league.name;
    const mark = document.createElement('span');
    mark.className = 'friendly-option-mark';
    mark.textContent = '✓';
    option.append(flag, name, mark);
    option.addEventListener('click', () => selectLeague(side, league.key));
    option.addEventListener('keydown', (event) => moveOptionFocus(event, side, 'League'));
    options.append(option);
  });
}

function renderTeamOptions(side) {
  const { options } = pickerNodes(side, 'Team');
  const oppositeSide = side === 'home' ? 'away' : 'home';
  const oppositeTeam = selectedTeam(oppositeSide);
  const filter = elements[`${side}TeamSearch`].value.trim().toLocaleLowerCase();
  const teams = (teamsByLeague.get(selections[side].leagueKey) || [])
    .filter((team) => team.name.toLocaleLowerCase().includes(filter));
  options.replaceChildren();
  teams.forEach((team) => {
    const unavailable = team.name === oppositeTeam?.name;
    const option = document.createElement('button');
    option.className = `friendly-option${selections[side].teamName === team.name ? ' is-selected' : ''}${unavailable ? ' is-unavailable' : ''}`;
    option.type = 'button';
    option.setAttribute('role', 'option');
    option.disabled = unavailable;
    option.setAttribute('aria-selected', String(selections[side].teamName === team.name));
    option.dataset.value = team.name;
    const crest = document.createElement('img');
    setCrest(crest, team);
    const name = document.createElement('span');
    name.textContent = team.name;
    const mark = document.createElement('span');
    mark.className = 'friendly-option-mark';
    mark.textContent = '✓';
    option.append(crest, name, mark);
    option.addEventListener('click', () => selectTeam(side, team.name));
    option.addEventListener('keydown', (event) => moveOptionFocus(event, side, 'Team'));
    options.append(option);
  });
  if (!teams.length) {
    const empty = document.createElement('div');
    empty.className = 'friendly-empty-option';
    empty.textContent = 'No clubs match that search.';
    options.append(empty);
  }
  options.scrollTop = 0;
}

function moveOptionFocus(event, side, kind) {
  const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'Escape') {
    closePicker(true);
    return;
  }
  const options = [...pickerNodes(side, kind).options.querySelectorAll('.friendly-option:not(:disabled)')];
  if (!options.length) return;
  const current = options.indexOf(document.activeElement);
  const index = event.key === 'Home' ? 0
    : event.key === 'End' ? options.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
  options[index]?.focus();
}

function selectLeague(side, leagueKey) {
  const previous = selectedTeam(side);
  selections[side].leagueKey = leagueKey;
  const otherSide = side === 'home' ? 'away' : 'home';
  const teams = teamsByLeague.get(leagueKey) || [];
  const oppositeName = selectedTeam(otherSide)?.name;
  const preserved = previous && previous.league_key === leagueKey && previous.name !== oppositeName;
  const available = teams.find((team) => team.name !== oppositeName);
  selections[side].teamName = preserved ? previous.name : available?.name || '';
  closePicker();
  renderLeagueOptions(side);
  refreshTeamOptions();
}

function selectTeam(side, teamName) {
  if (teamName === selectedTeam(side === 'home' ? 'away' : 'home')?.name) return;
  selections[side].teamName = teamName;
  closePicker();
  refreshTeamOptions();
}

function refreshTeamOptions() {
  for (const side of ['home', 'away']) {
    renderLeagueOptions(side);
    renderTeamOptions(side);
  }
  updatePreview('home');
  updatePreview('away');
  updateXiBadge();
  updateControls();
}

function updateControls() {
  const home = selectedTeam('home');
  const away = selectedTeam('away');
  elements.simulate.disabled = !home || !away || home.name === away.name || Boolean(playback && !playback.complete);
}

async function loadTeamCatalog() {
  try {
    const response = await fetch('/api/teams', { headers: { Accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload.leagues)) throw new Error(payload.error || 'Could not load clubs.');
    playerCustomizations = await window.playerCustomizations.load()
      .catch(() => window.playerCustomizations.read());
    const occurrences = new Map();
    payload.leagues.forEach((league) => (league.teams || []).forEach((team) => {
      occurrences.set(team.name, (occurrences.get(team.name) || 0) + 1);
    }));
    leagues = payload.leagues.map((league) => ({
      ...league,
      teams: (league.teams || []).filter((team) => occurrences.get(team.name) === 1),
    })).filter((league) => league.teams.length);
    teamsByLeague = new Map(leagues.map((league) => [league.key, league.teams]));
    teamsByName = new Map(leagues.flatMap((league) => league.teams.map((team) => [team.name, team])));
    const firstLeague = leagues[0];
    const opponentLeague = leagues.find((league) => league.key !== firstLeague?.key) || firstLeague;
    selections.home.leagueKey = firstLeague?.key || '';
    selections.away.leagueKey = opponentLeague?.key || '';
    selections.home.teamName = firstLeague?.teams[0]?.name || '';
    selections.away.teamName = opponentLeague?.teams.find((team) => team.name !== selections.home.teamName)?.name || '';
    elements.homeLeagueTrigger.disabled = !firstLeague;
    elements.homeTeamTrigger.disabled = !firstLeague;
    elements.awayLeagueTrigger.disabled = !opponentLeague;
    elements.awayTeamTrigger.disabled = !opponentLeague;
    refreshTeamOptions();
    if (teamsByName.size < 2) throw new Error('At least two uniquely named clubs are required.');
  } catch (error) {
    console.error('Friendly club catalog failed to load:', error);
    elements.simulate.disabled = true;
  }
}

function makePlayerFace(playerId, playerName, className) {
  const initials = String(playerName || '?').split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]).join('').toLocaleUpperCase();
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

function openMatchDialog() {
  if (!elements.dialog.open) {
    if (!document.querySelector('dialog[open]')) {
      modalScrollY = window.scrollY;
      document.documentElement.classList.add('league-modal-open');
      document.body.classList.add('league-modal-open');
      document.body.style.top = `-${modalScrollY}px`;
    }
    elements.dialog.showModal();
  }
  elements.timeline.scrollTop = 0;
}

function releaseDialogScroll() {
  if (document.querySelector('dialog[open]')) return;
  document.documentElement.classList.remove('league-modal-open');
  document.body.classList.remove('league-modal-open');
  document.body.style.top = '';
  window.scrollTo(0, modalScrollY);
}

function renderScore(homeGoals, awayGoals, minute, totalMinutes) {
  if (renderedScoreboardMatch !== currentMatch) {
    elements.scoreboard.replaceChildren();
    const createSide = (team) => {
      const side = document.createElement('div');
      side.className = 'scoreboard-team';
      const badge = document.createElement('img');
      setCrest(badge, team);
      side.append(badge);
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
    elements.scoreboard.append(createSide(currentMatch.homeTeam), center, createSide(currentMatch.awayTeam));
    renderedScoreboardMatch = currentMatch;
  }

  const score = elements.scoreboard.querySelector('.scoreboard-score');
  const clock = elements.scoreboard.querySelector('.scoreboard-clock');
  score.textContent = `${homeGoals}–${awayGoals}`;
  clock.textContent = minute >= totalMinutes ? 'FULL TIME'
    : minute === 45 ? 'HALF-TIME'
      : totalMinutes === 120 && minute === 90 ? 'EXTRA TIME'
        : totalMinutes === 120 && minute === 105 ? 'ET HALF-TIME'
      : minute > 45 ? `${minute}′ · SECOND HALF`
        : minute ? `${minute}′ · FIRST HALF` : 'KICK-OFF';
}

function renderStats(result, minute) {
  const snapshot = minute > 0 && result.minuteStats?.length
    ? result.minuteStats[Math.max(0, Math.min(minute - 1, result.minuteStats.length - 1))]
    : { homeXG: 0, awayXG: 0, homePossession: 50, awayPossession: 50 };
  elements.stats.replaceChildren();
  for (const [label, left, right, suffix] of [
    ['EXPECTED GOALS', Number(snapshot.homeXG || 0).toFixed(2), Number(snapshot.awayXG || 0).toFixed(2), 'xG'],
    ['POSSESSION', `${Math.round(snapshot.homePossession ?? 50)}%`, `${Math.round(snapshot.awayPossession ?? 50)}%`, 'BALL'],
  ]) {
    const block = document.createElement('div');
    block.className = 'match-stat-block';
    const heading = document.createElement('span');
    heading.className = 'match-stat-label';
    heading.textContent = label;
    const values = document.createElement('div');
    values.className = 'match-stat-values';
    [left, suffix, right].forEach((value, index) => {
      const item = index === 1 ? document.createElement('span') : document.createElement('div');
      if (index !== 1) {
        item.className = 'stat-value-chip';
        const number = document.createElement('strong');
        number.textContent = value;
        item.append(number);
      } else item.textContent = value;
      values.append(item);
    });
    block.append(heading, values);
    if (label === 'POSSESSION') {
      const bar = document.createElement('div');
      bar.className = 'possession-bar';
      const leftBar = document.createElement('span');
      leftBar.style.width = `${Number(snapshot.homePossession ?? 50)}%`;
      const rightBar = document.createElement('span');
      rightBar.style.width = `${Number(snapshot.awayPossession ?? 50)}%`;
      bar.append(leftBar, rightBar);
      block.append(bar);
    }
    elements.stats.append(block);
  }
}

function makeFixture(homeTeam = currentMatch.homeTeam, awayTeam = currentMatch.awayTeam) {
  return { home: { team: homeTeam }, away: { team: awayTeam } };
}

function addGoal(event) {
  const fixture = makeFixture();
  const row = document.createElement('article');
  row.className = 'timeline-goal';
  const minute = document.createElement('span');
  minute.className = `timeline-minute ${event.teamIndex === 0 ? 'is-home' : 'is-away'}`;
  minute.textContent = `${event.minute}′`;
  const details = document.createElement('div');
  details.className = 'goal-details';
  const tag = document.createElement('span');
  tag.className = 'goal-tag';
  tag.textContent = 'GOAL';
  const scorer = document.createElement('strong');
  scorer.className = 'goal-scorer';
  scorer.textContent = event.scorer || 'Unknown scorer';
  const team = document.createElement('small');
  team.textContent = event.teamIndex === 0 ? fixture.home.team.name : fixture.away.team.name;
  details.append(tag, scorer, team);
  row.append(minute, makePlayerFace(event.scorerId, event.scorer, 'event-face'), details);
  if (event.assister) {
    const assist = document.createElement('div');
    assist.className = 'goal-assist';
    assist.append(makePlayerFace(event.assisterId, event.assister, 'assist-face'));
    const copy = document.createElement('span');
    const assistTag = document.createElement('small');
    assistTag.textContent = 'ASSIST';
    const name = document.createElement('strong');
    name.textContent = event.assister;
    copy.append(assistTag, name);
    assist.append(copy);
    row.append(assist);
  }
  elements.timeline.prepend(row);
}

function scoreline(homeGoals, awayGoals) {
  return `${currentMatch.homeTeam.name} ${homeGoals}–${awayGoals} ${currentMatch.awayTeam.name}`;
}

function addPeriod(label, homeGoals, awayGoals, note = '') {
  const row = document.createElement('div');
  row.className = `timeline-period${label === 'HALF-TIME' || label === 'EXTRA-TIME BREAK' ? ' is-halftime' : ' is-fulltime'}`;
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M4 9h10.5a5.5 5.5 0 1 1-5.3 7H8a4 4 0 0 1-4-4V9Zm10.5 0V6h3m-1-2h5m-2-2 2 2-2 2');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  icon.append(path);
  const title = document.createElement('strong');
  title.textContent = label;
  const score = document.createElement('span');
  score.className = 'period-score';
  score.textContent = `${scoreline(homeGoals, awayGoals)}${note ? ` · ${note}` : ''}`;
  row.append(icon, title, score);
  elements.timeline.prepend(row);
}

function addKickoff() {
  const row = document.createElement('div');
  row.className = 'timeline-note';
  row.innerHTML = '<span class="timeline-note-dot" aria-hidden="true"></span><span>Kick-off</span>';
  elements.timeline.append(row);
}

function goalsThrough(record, minute) {
  const score = [0, 0];
  (record.result.events || []).forEach((event) => {
    if (event.type !== 'substitution' && event.minute <= minute) score[event.teamIndex] += 1;
  });
  return score;
}

function renderTimelineThrough(record, minute, includeFullTime = false) {
  currentMatch = record;
  elements.timeline.replaceChildren();
  addKickoff();
  const events = [...(record.result.events || [])].sort((first, second) => first.minute - second.minute);
  let score = [0, 0];
  let halftimeAdded = false;
  let regulationAdded = false;
  let extraBreakAdded = false;
  events.forEach((event) => {
    if (event.type === 'substitution' || event.minute > minute) return;
    if (!halftimeAdded && event.minute > 45) {
      addPeriod('HALF-TIME', ...score);
      halftimeAdded = true;
    }
    if (!regulationAdded && event.minute > 90) {
      addPeriod('END OF REGULATION', ...goalsThrough(record, 90));
      regulationAdded = true;
    }
    if (!extraBreakAdded && event.minute > 105) {
      addPeriod('EXTRA-TIME BREAK', ...goalsThrough(record, 105));
      extraBreakAdded = true;
    }
    addGoal(event);
    score[event.teamIndex] += 1;
  });
  if (!halftimeAdded) addPeriod('HALF-TIME', ...goalsThrough(record, 45));
  if (record.result.extraTime && !regulationAdded && minute >= 90) {
    addPeriod('END OF REGULATION', ...goalsThrough(record, 90));
    regulationAdded = true;
  }
  if (record.extraTimePlayed && !extraBreakAdded && minute >= 105) {
    addPeriod('EXTRA-TIME BREAK', ...goalsThrough(record, 105));
  }
  if (includeFullTime) {
    addPeriod('FULL-TIME', record.result.homeGoals, record.result.awayGoals);
    if (record.result.penalties) {
      addPeriod('PENALTIES', record.result.homeGoals, record.result.awayGoals,
        `${record.result.penalties.home}–${record.result.penalties.away} pens`);
    }
  }
}

function openMatchView(record) {
  currentMatch = record;
  playback = {
    minute: 0,
    homeGoals: 0,
    awayGoals: 0,
    eventIndex: 0,
    complete: false,
    timer: null,
    events: [...(record.result.events || [])].sort((first, second) => first.minute - second.minute),
    extraTime: false,
  };
  elements.dialogTitle.textContent = `${record.homeTeam.name} vs ${record.awayTeam.name}`;
  elements.dialogKicker.textContent = 'FRIENDLY · LIVE SIMULATION';
  elements.close.hidden = true;
  elements.skip.disabled = false;
  elements.skip.textContent = 'Skip to full time';
  elements.dialog.querySelector('.friendly-match-footer').classList.remove('is-complete');
  elements.timeline.replaceChildren();
  addKickoff();
  renderScore(0, 0, 0, 90);
  renderStats(record.result, 0);
  openMatchDialog();
  playback.timer = window.setInterval(advanceMatch, window.appSettings.interval(145));
}

function advanceMatch() {
  if (!playback || playback.complete) return;
  playback.minute += 1;
  while (playback.eventIndex < playback.events.length
    && playback.events[playback.eventIndex].minute <= playback.minute) {
    const event = playback.events[playback.eventIndex];
    if (event.type !== 'substitution') {
      addGoal(event);
      if (event.teamIndex === 0) playback.homeGoals += 1;
      else playback.awayGoals += 1;
    }
    playback.eventIndex += 1;
  }
  if (playback.minute === 45) addPeriod('HALF-TIME', playback.homeGoals, playback.awayGoals);
  if (playback.minute === 90 && playback.extraTime) addPeriod('END OF REGULATION', playback.homeGoals, playback.awayGoals);
  if (playback.minute === 105) addPeriod('EXTRA-TIME BREAK', playback.homeGoals, playback.awayGoals);
  const totalMinutes = playback.extraTime ? 120 : 90;
  renderScore(playback.homeGoals, playback.awayGoals, playback.minute, totalMinutes);
  renderStats(currentMatch.result, playback.minute);
  if (playback.minute < totalMinutes) return;
  if (playback.extraTime) finishExtraTime();
  else finishRegulation();
}

function finishRegulation() {
  if (!playback || playback.complete) return;
  window.clearInterval(playback.timer);
  playback.complete = true;
  currentMatch.regulationHomeGoals = playback.homeGoals;
  currentMatch.regulationAwayGoals = playback.awayGoals;
  currentMatch.regulationFinished = true;
  const level = playback.homeGoals === playback.awayGoals;
  if (currentMatch.result.extraTime && level) {
    if (!playback.regulationEntryAdded) addPeriod('END OF REGULATION', playback.homeGoals, playback.awayGoals);
    elements.dialogKicker.textContent = 'LEVEL AFTER 90 · EXTRA TIME AVAILABLE';
    elements.skip.textContent = 'Full time';
    elements.skip.disabled = true;
  } else {
    addPeriod('FULL-TIME', playback.homeGoals, playback.awayGoals);
    currentMatch.finished = true;
    elements.dialogKicker.textContent = 'FRIENDLY · FULL TIME';
    elements.skip.textContent = 'Full time';
    elements.skip.disabled = true;
  }
  renderScore(playback.homeGoals, playback.awayGoals, 90, 90);
  renderStats(currentMatch.result, 90);
  elements.dialog.querySelector('.friendly-match-footer').classList.add('is-complete');
  elements.close.hidden = !playback.complete;
  renderFinishedResult(currentMatch);
  updateControls();
}

function startExtraTime(record = currentMatch) {
  if (!record?.result.extraTime || record.extraTimeStarted || record.extraTimePlayed) return;
  currentMatch = record;
  record.extraTimeStarted = true;
  const [homeGoals, awayGoals] = goalsThrough(record, 90);
  playback = {
    minute: 90,
    homeGoals,
    awayGoals,
    eventIndex: 0,
    complete: false,
    timer: null,
    events: [...(record.result.events || [])].sort((first, second) => first.minute - second.minute),
    extraTime: true,
  };
  while (playback.eventIndex < playback.events.length && playback.events[playback.eventIndex].minute <= 90) playback.eventIndex += 1;
  renderTimelineThrough(record, 90);
  renderScore(homeGoals, awayGoals, 90, 120);
  renderStats(record.result, 90);
  elements.dialogTitle.textContent = `${record.homeTeam.name} vs ${record.awayTeam.name}`;
  elements.dialogKicker.textContent = 'EXTRA TIME · 30 MINUTES';
  elements.close.hidden = true;
  elements.skip.disabled = false;
  elements.skip.textContent = 'Skip to full time';
  elements.dialog.querySelector('.friendly-match-footer').classList.remove('is-complete');
  openMatchDialog();
  renderFinishedResult(record);
  updateControls();
  playback.timer = window.setInterval(advanceMatch, window.appSettings.interval(145));
}

function finishExtraTime() {
  if (!playback || playback.complete) return;
  window.clearInterval(playback.timer);
  playback.complete = true;
  currentMatch.extraTimePlayed = true;
  currentMatch.finished = true;
  playback.homeGoals = currentMatch.result.homeGoals;
  playback.awayGoals = currentMatch.result.awayGoals;
  addPeriod('FULL-TIME', playback.homeGoals, playback.awayGoals);
  if (currentMatch.result.penalties) {
    addPeriod('PENALTIES', playback.homeGoals, playback.awayGoals,
      `${currentMatch.result.penalties.home}–${currentMatch.result.penalties.away} pens`);
  }
  renderScore(playback.homeGoals, playback.awayGoals, 120, 120);
  renderStats(currentMatch.result, 120);
  elements.dialogKicker.textContent = currentMatch.result.penalties ? 'EXTRA TIME · DECIDED ON PENALTIES' : 'FRIENDLY · EXTRA-TIME FULL TIME';
  elements.dialog.querySelector('.friendly-match-footer').classList.add('is-complete');
  elements.close.hidden = false;
  elements.skip.disabled = true;
  elements.skip.textContent = 'Full time';
  renderFinishedResult(currentMatch);
  updateControls();
}

function handleSkipAction() {
  if (!playback) return;
  if (playback.extraTime) {
    renderTimelineThrough(currentMatch, 120);
    finishExtraTime();
  } else if (!playback.complete) {
    window.clearInterval(playback.timer);
    playback.minute = 90;
    playback.eventIndex = playback.events.findIndex((event) => event.minute > 90);
    if (playback.eventIndex < 0) playback.eventIndex = playback.events.length;
    renderTimelineThrough(currentMatch, 90);
    playback.homeGoals = currentMatch.regulationHomeGoals ?? goalsThrough(currentMatch, 90)[0];
    playback.awayGoals = currentMatch.regulationAwayGoals ?? goalsThrough(currentMatch, 90)[1];
    playback.regulationEntryAdded = true;
    renderScore(playback.homeGoals, playback.awayGoals, 90, 90);
    renderStats(currentMatch.result, 90);
    finishRegulation();
  }
}

function appendResultSide(container, team, isWinner, isAway = false) {
  const side = document.createElement('div');
  side.className = `friendly-result-side${isWinner ? ' is-winner' : ''}${isAway ? ' is-away' : ''}`;
  const crest = document.createElement('img');
  setCrest(crest, team);
  const name = document.createElement('strong');
  name.textContent = team.name;
  side.append(crest, name);
  container.append(side);
}

function createScorerList(goalEvents, teamIndex) {
  const list = document.createElement('div');
  list.className = `friendly-result-scorers${teamIndex === 1 ? ' is-away' : ' is-home'}`;
  const scorers = new Map();
  goalEvents.filter((event) => event.teamIndex === teamIndex).forEach((event) => {
    const scorer = event.scorer || 'Unknown scorer';
    if (!scorers.has(scorer)) scorers.set(scorer, []);
    scorers.get(scorer).push(event.minute);
  });
  scorers.forEach((minutes, scorer) => {
    const line = document.createElement('span');
    line.className = 'friendly-result-scorer-line';
    const time = document.createElement('strong');
    time.textContent = minutes.map((minute) => `${minute}'`).join(' ');
    const name = document.createElement('span');
    name.className = 'friendly-result-scorer-name';
    name.textContent = scorer;
    line.append(time, name);
    list.append(line);
  });
  return list;
}

function renderFinishedResult(record) {
  const { result, homeTeam, awayTeam } = record;
  const homeGoals = record.extraTimePlayed ? result.homeGoals : record.regulationHomeGoals ?? result.homeGoals;
  const awayGoals = record.extraTimePlayed ? result.awayGoals : record.regulationAwayGoals ?? result.awayGoals;
  const homeWon = record.extraTimePlayed && result.penalties
    ? result.penalties.winnerIndex === 0 : homeGoals > awayGoals;
  const awayWon = record.extraTimePlayed && result.penalties
    ? result.penalties.winnerIndex === 1 : awayGoals > homeGoals;
  const goalEvents = [...(result.events || [])]
    .filter((event) => event.type !== 'substitution' && event.scorer && event.minute <= (record.extraTimePlayed ? 120 : 90))
    .sort((first, second) => first.minute - second.minute);
  if (!record.card) {
    record.card = document.createElement('article');
    record.card.className = 'friendly-result';
    elements.results.prepend(record.card);
  }
  const card = record.card;
  card.replaceChildren();
  const heading = document.createElement('div');
  heading.className = 'friendly-result-heading';
  const label = document.createElement('span');
  label.textContent = record.extraTimePlayed ? 'FULL TIME · AFTER EXTRA TIME'
    : result.extraTime ? 'FULL TIME · AFTER 90 MINUTES' : 'FULL TIME · FRIENDLY';
  const date = document.createElement('span');
  date.className = 'friendly-result-date';
  date.textContent = record.extraTimePlayed ? '120 minutes' : '90 minutes';
  heading.append(label, date);
  const score = document.createElement('div');
  score.className = 'friendly-result-score';
  const scoreText = document.createElement('strong');
  scoreText.textContent = `${homeGoals}–${awayGoals}`;
  const status = document.createElement('span');
  status.textContent = homeGoals === awayGoals && !record.extraTimePlayed
    ? 'DRAW' : homeWon ? 'HOME WIN' : awayWon ? 'AWAY WIN' : 'DRAW';
  score.append(scoreText, status);

  const stats = document.createElement('div');
  stats.className = 'friendly-result-stats';
  const statValues = document.createElement('div');
  statValues.className = 'friendly-result-stat-values';
  const finalSnapshot = result.minuteStats?.[record.extraTimePlayed ? 119 : 89] || result.minuteStats?.at(-1);
  const valuesToShow = [
    ['xG', record.extraTimePlayed ? Number(result.homeStats?.xG || 0).toFixed(2) : Number(finalSnapshot?.homeXG || 0).toFixed(2),
      record.extraTimePlayed ? Number(result.awayStats?.xG || 0).toFixed(2) : Number(finalSnapshot?.awayXG || 0).toFixed(2)],
    ['Possession', `${Math.round(finalSnapshot?.homePossession ?? 50)}%`, `${Math.round(finalSnapshot?.awayPossession ?? 50)}%`],
  ];
  if (record.finished) valuesToShow.push(['Shots', result.homeStats?.shots || 0, result.awayStats?.shots || 0]);
  valuesToShow.forEach(([labelText, homeValue, awayValue]) => {
    const item = document.createElement('span');
    item.append(document.createTextNode(`${labelText} `));
    const values = document.createElement('strong');
    values.textContent = `${homeValue} – ${awayValue}`;
    item.append(values);
    statValues.append(item);
  });
  stats.append(createScorerList(goalEvents, 0), statValues, createScorerList(goalEvents, 1));
  const actions = document.createElement('div');
  actions.className = 'friendly-result-actions';
  const actionRow = document.createElement('div');
  actionRow.className = 'friendly-result-action-row';
  const review = document.createElement('button');
  review.className = 'friendly-review-button';
  review.type = 'button';
  review.textContent = 'Review match log';
  review.addEventListener('click', () => openMatchReview(record));
  actionRow.append(review);
  if (result.extraTime && !record.extraTimePlayed) {
    const extra = document.createElement('button');
    extra.className = 'friendly-result-extra';
    extra.type = 'button';
    extra.disabled = Boolean(record.extraTimeStarted);
    extra.textContent = record.extraTimeStarted ? 'Extra time underway' : 'Play extra time & penalties';
    extra.addEventListener('click', () => startExtraTime(record));
    actionRow.append(extra);
  }
  actions.append(actionRow);
  card.append(heading);
  appendResultSide(card, homeTeam, homeWon, false, 0, goalEvents);
  card.append(score);
  appendResultSide(card, awayTeam, awayWon, true, 1, goalEvents);
  if (record.extraTimePlayed && result.penalties) {
    const penalties = document.createElement('div');
    penalties.className = 'friendly-result-penalties';
    penalties.textContent = `PENALTIES  ${result.penalties.home}–${result.penalties.away}`;
    card.append(penalties);
  }
  card.append(stats, actions);
  elements.results.hidden = false;
}

function openMatchReview(record) {
  currentMatch = record;
  const minute = record.extraTimePlayed ? 120 : 90;
  playback = { minute, homeGoals: record.extraTimePlayed ? record.result.homeGoals : record.regulationHomeGoals,
    awayGoals: record.extraTimePlayed ? record.result.awayGoals : record.regulationAwayGoals, complete: true, extraTime: record.extraTimePlayed, timer: null };
  renderTimelineThrough(record, minute, record.finished);
  renderScore(playback.homeGoals, playback.awayGoals, minute, record.extraTimePlayed ? 120 : 90);
  renderStats(record.result, minute);
  elements.dialogTitle.textContent = `${record.homeTeam.name} vs ${record.awayTeam.name}`;
  elements.dialogKicker.textContent = record.extraTimePlayed ? 'FRIENDLY · FULL-TIME REVIEW'
    : record.result.extraTime ? 'LEVEL AFTER 90 · EXTRA TIME AVAILABLE' : 'FRIENDLY · FULL-TIME REVIEW';
  elements.close.hidden = !playback.complete;
  elements.skip.textContent = 'Full time';
  elements.skip.disabled = true;
  elements.dialog.querySelector('.friendly-match-footer').classList.add('is-complete');
  openMatchDialog();
}

async function simulateMatch() {
  const homeTeam = selectedTeam('home');
  const awayTeam = selectedTeam('away');
  if (!homeTeam || !awayTeam || homeTeam.name === awayTeam.name) {
    return;
  }
  elements.simulate.disabled = true;
  elements.simulate.classList.add('is-loading');
  elements.simulate.querySelector('span').textContent = 'Preparing match';
  try {
    const customizations = await window.playerCustomizations.load();
    playerCustomizations = customizations;
    updateXiBadge();
    const response = await fetch('/api/simulate-matches', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matches: [{
          id: `friendly-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          homeTeamName: homeTeam.name,
          awayTeamName: awayTeam.name,
          knockout: true,
          resolveTie: true,
        }],
        customizations,
        settings: window.appSettings.get(),
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Could not simulate this match.');
    const result = payload.results?.[0];
    if (!result) throw new Error('The simulator returned no match result.');
    const record = { result, homeTeam, awayTeam };
    [record.regulationHomeGoals, record.regulationAwayGoals] = goalsThrough(record, 90);
    matchRecords.unshift(record);
    currentMatch = record;
    openMatchView(record);
  } catch (error) {
    console.error('Friendly match simulation failed:', error);
  } finally {
    elements.simulate.classList.remove('is-loading');
    elements.simulate.querySelector('span').textContent = 'Simulate match';
    updateControls();
  }
}

window.addEventListener('app-settings-change', () => {
  if (!playback?.timer || playback.complete) return;
  window.clearInterval(playback.timer);
  playback.timer = window.setInterval(advanceMatch, window.appSettings.interval(145));
});

for (const side of ['home', 'away']) {
  for (const kind of ['League', 'Team']) {
    const { trigger, menu } = pickerNodes(side, kind);
    trigger.addEventListener('click', () => openPicker(side, kind));
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        openPicker(side, kind);
      }
    });
    menu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePicker(true);
      }
    });
  }
  elements[`${side}TeamSearch`].addEventListener('input', () => renderTeamOptions(side));
  elements[`${side}TeamSearch`].addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      pickerNodes(side, 'Team').options.querySelector('.friendly-option:not(:disabled)')?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closePicker(true);
    }
  });
}
window.addEventListener('resize', () => {
  if (activePicker) fitPickerMenu(activePicker.side, activePicker.kind);
});
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.friendly-picker')) closePicker();
});
elements.swap.addEventListener('click', () => {
  const home = { ...selections.home };
  selections.home = { ...selections.away };
  selections.away = home;
  closePicker();
  refreshTeamOptions();
});
elements.simulate.addEventListener('click', simulateMatch);
elements.close.addEventListener('click', () => {
  if (playback?.complete) elements.dialog.close();
});
elements.skip.addEventListener('click', handleSkipAction);
elements.dialog.addEventListener('cancel', (event) => {
  if (!playback?.complete) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
});
elements.dialog.addEventListener('click', (event) => {
  if (event.target === elements.dialog && playback?.complete) elements.dialog.close();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && elements.dialog.open && !playback?.complete) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);
elements.dialog.addEventListener('close', releaseDialogScroll);

loadTeamCatalog();
