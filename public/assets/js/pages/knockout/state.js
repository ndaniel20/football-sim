const LEAGUE_PHASE_KEY = 'ucl-simulator-league-phase';
const KNOCKOUT_KEY = 'ucl-simulator-knockout';
const TOURNAMENT_VIEW_CACHE_KEY = 'ucl-simulator-knockout-view-cache-v2';
const ROUND_KEYS = ['playoff', 'r16', 'qf', 'sf', 'final'];
const ROUND_LABELS = {
  playoff: 'Round of 32 play-offs',
  r16: 'Round of 16',
  qf: 'Quarter-finals',
  sf: 'Semi-finals',
  final: 'Final',
};
const TEAM_OF_SEASON_ROLES = [
  { key: 'GK', family: 'GK', category: 'goalkeeper' },
  { key: 'LB', family: 'LB', category: 'balanced' },
  { key: 'LCB', family: 'CB', category: 'center-back' },
  { key: 'RCB', family: 'CB', category: 'center-back' },
  { key: 'RB', family: 'RB', category: 'balanced' },
  { key: 'CM-balanced', label: 'CM', family: 'CM', category: 'midfield-balanced' },
  { key: 'CAM', family: 'CAM', category: 'midfield-offense' },
  { key: 'CM-runner-up', label: 'CM', family: 'CM', category: 'midfield-runner-up' },
  { key: 'LM', family: 'LW', category: 'winger' },
  { key: 'ST', family: 'ST', category: 'striker' },
  { key: 'RM', family: 'RW', category: 'winger' },
];
const ROUND_OF_32_TOTS_WEIGHT = 0.6;
const MIDFIELD_RUNNER_UP_OFFENSE_WEIGHT = 0.75;
const MIDFIELD_RUNNER_UP_DUEL_WEIGHT = 0.25;
const CENTER_BACK_STAGE_BONUS_MULTIPLIER = 0.25;
const THREE_AT_BACK_CB_DUEL_MULTIPLIER = 0.65;
const TEAM_OF_SEASON_STAGE_BONUSES = { qf: 8, sf: 11, final: 14 };
const TEAM_OF_SEASON_CHAMPION_BONUS = 8;
const CAM_CENTRAL_MIDFIELD_ROLE_TAX = 20;
const TEAM_OF_SEASON_NON_FINALIST_CLUB_CAP = 3;
const TEAM_OF_SEASON_MIN_STARTS = 3;
const TEAM_OF_SEASON_POINTS = {
  goalkeeper: { goalsConceded: 0.4, cleanSheet: 0.25, save: 0.35 },
  defense: { duelStoppedPerAppearance: 0.5, goalsConcededPerAppearance: 5 },
  centerBack: { duelStoppedPerAppearance: 0.6, goalsConcededPerAppearance: 9.5 },
  fullback: { goal: 8, assist: 15, chanceCreated: 2, xG: 1.5, duelWon: 0.25 },
  winger: { goal: 20, assist: 12, chanceCreated: 1.5, xG: 1.5, duelWon: 0.1 },
  striker: { goal: 26, assist: 14, chanceCreated: 1, xG: 1.25, duelWon: 0.1 },
  attackingMidfielder: { assist: 35, chanceCreated: 5, goal: 35, duelWon: 0.1 },
  midfielder: {
    assist: 35,
    chanceCreated: 5,
    goal: 4,
    duelWon: 0.1,
    defensiveDuelStopped: 0.25,
    offensiveDuelInDuelScore: 0.4,
  },
  balancedMidfielder: {
    assist: 20,
    chanceCreated: 8,
    goal: 4,
    defensiveDuelStopped: 0.25,
    offensiveDuelInDuelScore: 0.4,
  },
};
const placeholderBadge = '/images/clubs/placeholder.svg';
const elements = {
  loading: document.querySelector('#knockout-loading'),
  error: document.querySelector('#knockout-error'),
  errorMessage: document.querySelector('#knockout-error-message'),
  bracket: document.querySelector('#bracket-grid'),
  bracketFrame: document.querySelector('#bracket-frame'),
  bracketScroll: document.querySelector('#bracket-scroll'),
  leaders: document.querySelector('#leaders-grid'),
  leaderModal: document.querySelector('#leader-modal'),
  leaderModalTitle: document.querySelector('#leader-modal-title'),
  leaderModalKicker: document.querySelector('#leader-modal-kicker'),
  leaderModalClose: document.querySelector('#leader-modal-close'),
  leaderModalList: document.querySelector('#leader-modal-list'),
  matchModal: document.querySelector('#match-modal'),
  matchModalRound: document.querySelector('#match-modal-round'),
  matchModalTitle: document.querySelector('#match-modal-title'),
  matchModalAggregate: document.querySelector('#match-modal-aggregate'),
  matchLegToggle: document.querySelector('#match-leg-toggle'),
  matchLegFirst: document.querySelector('#match-leg-first'),
  matchLegSecond: document.querySelector('#match-leg-second'),
  matchModalClose: document.querySelector('#match-modal-close'),
  liveScoreboard: document.querySelector('#live-scoreboard'),
  liveMatchStats: document.querySelector('#live-match-stats'),
  matchTimeline: document.querySelector('#match-timeline'),
  skipToFullTime: document.querySelector('#skip-to-full-time'),
  roundKicker: document.querySelector('#round-kicker'),
  roundTitle: document.querySelector('#round-title'),
  teamsCount: document.querySelector('#knockout-teams-count'),
  roundLabel: document.querySelector('#round-label'),
  roundPrevious: document.querySelector('#round-previous'),
  roundNext: document.querySelector('#round-next'),
  dockRoundLabel: document.querySelector('#dock-round-label'),
  dockRoundPrevious: document.querySelector('#dock-round-previous'),
  dockRoundNext: document.querySelector('#dock-round-next'),
  roundStatus: document.querySelector('#round-status'),
  ties: document.querySelector('#tie-list'),
  status: document.querySelector('#simulation-status'),
  simulateSelected: document.querySelector('#simulate-selected'),
  simulateRound: document.querySelector('#simulate-round'),
  championDialog: document.querySelector('#champion-dialog'),
  championTitle: document.querySelector('#champion-title'),
  championTeam: document.querySelector('#champion-team'),
  teamOfSeason: document.querySelector('#team-of-season'),
  teamOfSeasonFormation: document.querySelector('#team-of-season-formation'),
};
let leaguePhase = null;
let knockout = null;
let selectedTieId = null;
let selectedTieLegIndex = null;
let simulationRunning = false;
let animationRun = null;
let lastLoggedTeamOfSeasonSignature = null;
let matchReviewContext = null;
let tournamentViewCache = null;

