# Khu Chơi Game — game library

This folder is the **source of truth** for the games. On every boot the API
server syncs it into the `games` table and serves the files from there.

- `games.json` — id (lowercase, digits, dashes), title, controls hint,
  credit, order, and the paths of the two files below.
- `banners/` — banner images (PNG/JPEG/WebP).
- `roms/` — `.nes` files (iNES / NES 2.0, ≤ 4 MB).

To add, change or remove a game: edit this folder, commit, deploy. Only games
whose files changed are rewritten; games no longer listed are deleted.

Only add games you are allowed to redistribute (homebrew with a licence or
the author's permission). Credit the author in `credit`.
