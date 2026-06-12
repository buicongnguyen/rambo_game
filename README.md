# Operation Iron Vengeance

A browser-based retro run-and-gun prototype inspired by jungle-era military shooters on Nintendo and arcades.

> **Version 2 is out — [play it here](https://buicongnguyen.github.io/rambo_game_v2/).**
> V2 rebuilds the projectile physics (frame-rate independent, no wall tunneling), the background
> rendering (no more void on resize), and the stage logic, with unit tests and a working Android
> APK pipeline. Source and changelog: [buicongnguyen/rambo_game_v2](https://github.com/buicongnguyen/rambo_game_v2).

Research checked on April 28, 2026.

## Design Direction

The original NES `Rambo` is a single-player action-adventure with bosses, not a stage-based co-op shooter. For the game you described, the stronger gameplay DNA is:

- `Contra`: simultaneous one or two-player run-and-gun action, stage progression, and boss battles.
- `Ikari Warriors`: military commando fantasy, overhead assault flow, tanks, helicopters, and co-op pressure.
- `Mercs`: checkpoint-style battlefield pushes with escalating military hardware.
- `Metal Slug`: clean controls, dramatic boss silhouettes, and readable enemy waves.

Reference links:

- [Rambo (1987 NES) on Wikipedia](https://en.wikipedia.org/wiki/Rambo_%281987_video_game%29)
- [Contra (1987) on Wikipedia](https://en.wikipedia.org/wiki/Contra_%28video_game%29)
- [Ikari Warriors on Wikipedia](https://en.wikipedia.org/wiki/Ikari_Warriors)
- [Mercs on Wikipedia](https://en.wikipedia.org/wiki/Mercs)
- [Metal Slug on SNK](https://www.snk-corp.co.jp/us/games/acaneogeo/metalslug/)

## Plan

1. Lock the fantasy around elite commandos cutting through enemy strongholds in short, high-pressure stages.
2. Use a 2D Phaser + TypeScript stack for fast iteration on combat, cameras, and enemy waves.
3. Build three prototype stages with unique palettes, enemy encounter gates, and a boss at the end of each stage.
4. Support local solo and local two-player play with clear keyboard bindings and shared screen camera logic.
5. Keep the playfield in canvas and the HUD, menus, and mission prompts in the DOM for readability.
6. Ship the prototype with placeholder art, then expand with sprite sheets, audio, pickups, and richer boss patterns.

## What Is Implemented

- Three staged missions with distinct briefings and bosses
- Solo or local two-player mission start
- Top-down commando movement and auto-targeted shooting
- Generated commando sprite animations for idle, walk, run, crawl, kneel, jump, and firing
- Per-stage enemy sprite sets for riflemen, rocketeers, and turrets
- Stage-specific boss firing sheets for the gunship, barge, and command tank
- Barrage special attacks with limited charges
- Enemy waves, turrets, rocketeers, and boss reinforcements
- Stage clear, game over, and campaign complete overlays
- Responsive HUD and a short in-game design brief

## Sprite Assets

Generated sprite sheets live in [public/assets/sprites](/C:/Users/n/source/repos/rambo_game/public/assets/sprites).

- Player strips: [public/assets/sprites/player](/C:/Users/n/source/repos/rambo_game/public/assets/sprites/player)
- Enemy stage variants: [public/assets/sprites/enemies](/C:/Users/n/source/repos/rambo_game/public/assets/sprites/enemies)
- Boss strips: [public/assets/sprites/bosses](/C:/Users/n/source/repos/rambo_game/public/assets/sprites/bosses)
- Preview contact sheets: [public/assets/sprites/previews](/C:/Users/n/source/repos/rambo_game/public/assets/sprites/previews)

To regenerate the asset pack:

```bash
python scripts/generate_sprite_assets.py
```

## Run It

```bash
npm install
npm run dev
```

## Next Production Steps

- Replace generated shapes with authored pixel art and sprite animation
- Add pickups, weapon upgrades, and destructible scenery
- Layer in music, hit SFX, and pause/settings screens
- Add gamepad support and a continue system
