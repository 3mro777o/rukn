# Rukn

An always-on home dashboard for a landscape iPad, in Arabic (RTL) and English. One home screen; the other screens open by swiping or by tapping their widget.

- Clock, Hijri date, prayer times (Mawaqit, El-Iman Hamburg) with adhan on the iPad, a full-screen announcement at prayer time and daily prayer tracking.
- Tasks read from and written back to Obsidian Markdown files, with the Obsidian Tasks plugin syntax (priorities, dates).
- Reminders written as plain lines in an Obsidian note, with a sound.
- Weather (Open-Meteo DWD ICON + Bright Sky), Immich "on this day" memories.
- 17 themes, accent colours, optional follow-the-Omarchy-theme.
- All screens stay in sync over Server-Sent Events.

There is no login: keep it on your home network or Tailscale.

## Docker

```sh
docker run -d --name rukn --restart unless-stopped \
  -p 127.0.0.1:3000:3000 -v ./data:/data ghcr.io/3mro777o/rukn:latest
```

See `compose.yaml`. Every push to `main` builds `ghcr.io/3mro777o/rukn:latest`; to update automatically, pull it on a timer, e.g. cron:

```cron
*/10 * * * * cd ~/rukn && docker compose pull -q && docker compose up -d
```

The iPad needs HTTPS for the screen wake lock: put it behind a reverse proxy or `tailscale serve`. Then Safari → Share → Add to Home Screen.

## Configuration

`data/config.json`, every key optional. Paths are as the server (container) sees them.

```json
{
  "obsidianSources": ["/vault"],
  "obsidianTasks": "/vault/tasks.md",
  "obsidianReminders": "/vault/reminders.md",
  "weather": {"lat": 53.46, "lon": 9.98},
  "immich": {"url": "https://immich.example", "apiKey": "…"}
}
```

- `obsidianSources`: files or folders (with subfolders) whose `- [ ]` lines are shown as tasks. Without `obsidianTasks`, tasks are kept in SQLite.
- `obsidianTasks`: where new tasks are added.
- `obsidianReminders`: one reminder per line, created with examples if missing:
  `- 09:00 text` daily, `- fri 12:30 text` weekly, `- 2026-12-31 23:00 text` once.
- `immich`: an API key with memory and asset read access. Photos are cached in `data/memories`.

To run on a different machine than Obsidian, sync the folder (e.g. Syncthing). Files named `*.sync-conflict-*` are ignored.

Environment: `PORT` (3000), `HOST`, `DATA_DIR` (`data`), `OMARCHY_DIR` (`~/.local/state/omarchy/current`, needs `theme/colors.toml`).

Adhan audio is `data/adhan.mp3`, downloaded once from Mawaqit; replace it to change the voice. Safari needs one tap after each page load before it can play sound. For a black screen at night see [NIGHT-MODE.md](NIGHT-MODE.md).

## Development

Node.js 24+.

```sh
npm install
npm run dev     # UI on :5173, API on :3000
npm test
npm run build && npm start
```

- `src/main.tsx`: app state, navigation, settings. `src/faces.tsx`: screens and widgets. `src/themes.ts`, `src/style.css`.
- `server/app.mjs`: HTTP API and SSE. `server/store.mjs`: SQLite. `server/obsidian.mjs`: tasks and reminders. `server/integrations.mjs`: weather, Omarchy, Immich. `server/prayer.mjs`: Mawaqit.
