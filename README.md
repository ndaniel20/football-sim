# Football Simulator

A browser-based football match and tournament simulator powered by a small Node.js HTTP server and vanilla JavaScript, HTML, and CSS.

## Features

- Simulate friendly matches and tournament fixtures.
- Generate tournament draws, league-phase schedules, and knockout brackets.
- Build lineups from league rosters and review player statistics.
- Customize player positions and ratings.

## Requirements

- Node.js 18 or newer
- npm

## Run locally

```sh
npm install
npm run dev
```

Open <http://localhost:3000>.

## Useful commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local development server. |
| `npm start` | Start the application server. |
| `npm run check` | Check JavaScript syntax and local HTML asset references. |
| `npm run rank:xis` | Rank configured teams by generated XI strength. |
| `npm run simulate:match` | Run the sample match simulation. |
| `npm run simulate:tournaments -- 1000` | Simulate 1,000 tournaments. |
| `npm run rosters:rebuild` | Run the roster rebuild utility. |

## Project structure

```text
src/
  lineups/       Best XI generation and position eligibility
  players/       Player customization and roster access
  server/        HTTP server and API routes
  simulation/    Match engine
  tournament/    Draw and league-schedule algorithms
public/
  assets/
    css/         Shared and page-specific stylesheets
    js/
      pages/     Page-specific controllers and features
      shared/    Browser code reused across pages
  images/        Interface and club image assets
scripts/
  admin/         Administrative reports
  data/          Roster maintenance tools
  simulations/   Batch tournament simulations
players/         League roster CSV files
teams/           Team metadata and formation configuration
```

## Licensing and data

The original application source code is licensed under Apache-2.0; see [LICENSE](LICENSE). The license does not grant rights to third-party names, trademarks, badges, roster data, or other assets. Those materials may have separate terms and are included only where redistribution is authorized. See [public/images/README.md](public/images/README.md) for the existing image notes.

## Contributing

Please run `npm run check` before submitting a change. Keep roster CSV columns and team configuration paths consistent with the server and lineup tools.
