# Khu Chơi Game — game files

Games are stored in the database (`games` table) and served by the API
server. This folder is only the source the seed script uploads from.

    GAMES_ADMIN_TOKEN=... SERVER_URL=http://localhost:4000 npm run seed:games

- `games.json` — id, title, controls hint, order, and paths to the files.
- `banners/` — banner images (PNG/JPEG/WebP, under 1 MB).
- `roms/` — `.nes` files (under 2 MB). **Git-ignored**: commercial ROMs may not
  be redistributed. Use homebrew or licensed titles for a public deploy.
