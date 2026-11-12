# Authu Bird

A retro pixel-art, Flappy-style browser game. Swap the bird for any face, bring your own music and crash sound, change the sky. 100% static: Phaser 3 + TypeScript + Vite. No backend, database, login, API keys or env vars.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build -> dist/
npm run preview    # serve dist/ locally
```

Node 20+ recommended.

## Controls

| Action | Input |
| --- | --- |
| Flap | Space / Up / W, mouse click, touch tap |
| Pause / resume | Esc or the II button |
| Restart after Game Over | Restart button, Space or Enter |

## Customize (menu > CUSTOMIZE, or Pause > Customize)

- **Character**: upload JPG/PNG/WebP, preview, then APPLY. Default is image only: original mode with transparent PNG cut-outs shown as-is (transparent margins are auto-trimmed). Optional circle / rounded crop, zoom, X/Y position, pixelate (+6-level color quantization), pixel outline and soft shadow. The hitbox is a fixed circle, so every picture is equally fair.
- **Audio**: custom music and crash sound (MP3, WAV, OGG where the browser supports it). Preview buttons, separate music/effects volume, mutes, loop. Built-in defaults are synthesized in the browser (two chiptune tracksand a "thud" crash; no speech is generated.
- **Background**: turquoise, day, sunset, night or your own image; brightness; parallax on/off.
- **Gameplay**: Easy / Normal / Hard (gap, speed, gravity, flap strength), music/effects on/off, animation toggles (shake, particles, tilt), resets.

On a crash the run ends immediately, music fades out, the crash sound plays exactly once, then the Game Over panel shows. Restart stops any unfinished crash sound and restarts music.

## Storage (all in your browser)

- LocalStorage: settings, best score, stats, achievements.
- Cache Storage (`authu-bird-assets-v1`): uploaded images and audio (never stored as LocalStorage strings).
- If Cache Storage is unavailable (e.g. plain http on a LAN IP, private mode) or full, uploads still work for the current session and the game says so.
- Clearing site data can delete everything. Nothing syncs between devices.

## Deploy to Vercel (static)

Settings Vercel auto-detects for Vite: Install `npm install`, Build `npm run build`, Output `dist`. `vercel.json` repeats these and adds long-cache headers for `/assets/*`.

**A. GitHub-connected (auto-deploy on push)**
1. Push this folder to a GitHub repo.
2. vercel.com > Add New > Project > import the repo.
3. Framework Preset: Vite. Leave defaults. Deploy.

**B. Vercel CLI**
```bash
npm i -g vercel
vercel          # preview deploy (log in when asked)
vercel --prod   # production deploy
```

Uploads use Cache Storage, which needs HTTPS (Vercel provides it) or localhost.

## Project layout

```
src/
  main.ts               boot: restore saved assets, init UI, start Phaser
  bus.ts                event bus (UI <-> scenes <-> systems)
  game/                 BootScene, MainMenuScene, GameScene, Player, Backdrop, TextureFactory (all art is generated), GameConfig
  systems/              StorageManager, SettingsManager, Stats, AssetManager (image pipeline), AudioManager
  ui/                   MainMenu, GameHUD, PauseMenu, GameOverPanel, CustomizationPanel, dom helpers
  styles/main.css       pixel-art UI kit
```

Differences from the suggested structure: Game Over is a DOM panel (not a scene) so it shares the pixel UI kit; there is no `public/assets` folder because every sprite, logo and sound is generated in code.

## Notes

- Fonts: Press Start 2P (SIL OFL) via `@fontsource`, bundled locally. The title lettering is original bitmap art drawn in `TextureFactory.ts`.
- Not included: automatic background removal for photos (needs a local ML model; crop masks + outline are used instead).
