(() => {
  const PLAYER_MATCH_STAT_FIELDS = [
    'playerId', 'playerName', 'teamName', 'teamId', 'position', 'alternatePositions',
    'lineupRole', 'starts', 'appearances', 'goals', 'assists', 'shots', 'shotsOnTarget',
    'xG', 'saves', 'chancesCreated', 'offensiveDuelsWon', 'defensiveDuelsStopped',
    'goalsConceded', 'cleanSheets',
  ];
  const COMPACT_PLAYER_STATS_KEY = '__uclPlayerStatsV1';
  const DERIVED_CACHE_KEYS = [
    'ucl-simulator-knockout-view-cache-v1',
    'ucl-simulator-knockout-view-cache-v2',
  ];

  function serialize(state) {
    return JSON.stringify(state, (key, value) => {
      if (key === 'minuteStats') return undefined;
      if (key !== 'playerStats' || !Array.isArray(value)) return value;
      return {
        [COMPACT_PLAYER_STATS_KEY]: true,
        rows: value.map((player) => PLAYER_MATCH_STAT_FIELDS.map((field) => player[field] ?? null)),
      };
    });
  }

  function parse(serialized) {
    return JSON.parse(serialized, (key, value) => {
      if (key !== 'playerStats' || value?.[COMPACT_PLAYER_STATS_KEY] !== true || !Array.isArray(value.rows)) {
        return value;
      }
      return value.rows.map((row) => Object.fromEntries(PLAYER_MATCH_STAT_FIELDS.flatMap((field, index) => (
        row[index] === null || row[index] === undefined ? [] : [[field, row[index]]]
      ))));
    });
  }

  function save(key, state) {
    let serialized;
    try {
      serialized = serialize(state);
      window.localStorage.setItem(key, serialized);
      return true;
    } catch (error) {
      try {
        DERIVED_CACHE_KEYS.forEach((cacheKey) => window.localStorage.removeItem(cacheKey));
        window.localStorage.setItem(key, serialized || serialize(state));
        return true;
      } catch (retryError) {
        console.error('Tournament progress could not be saved in browser storage.', retryError || error);
        return false;
      }
    }
  }

  window.tournamentStorage = { serialize, parse, save };
})();
