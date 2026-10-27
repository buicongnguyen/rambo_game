# Performance review — Rambo 2D

Reviewed locally on 2026-10-25, after Rambo 3D, using `C:/Users/n/.claude/skills/smooth-dense-scenes/SKILL.md`. This project uses **Phaser 3.90.0**, so the techniques were adapted to its batched 2D renderer. No publishing or dependency changes were made. Existing README, package, Android and Capacitor work was preserved.

## Findings and changes

The game already batches hundreds of objects into relatively few WebGL draws. Its main avoidable rendering cost was preparing and uploading geometry for **off-screen scenery**. In Phaser 3.90, `CameraManager.getVisibleChildren` checks `willRender` but does not perform viewport intersection tests. The separate `Camera.cull` method is used for input; merely enabling its flag would not fix rendering.

Added a scene-local viewport filter in `src/game/render/visibleScene.ts`. It caches object bounds until position, size, scale, rotation or origin changes. Objects outside the camera are excluded only from drawing; physics, AI, animations, collision and updates continue normally. Stroke and pixel margins protect edges. Unbounded Graphics, containers, fixed HUD elements, masks, custom post effects, rotated cameras and active camera shake retain the original rendering path. The original camera method is restored on scene shutdown. No global engine prototypes are changed in the shipping game.

Repeated hit effects also created a fresh image and canvas-backed text object for every impact. `src/game/render/HitEffects.ts` reuses these objects and their textures. Matching labels retain their canvas pixels. Position, tint, scale, opacity, visibility and display order are reset on reuse. Durations, easing, additive blending, text style and visible effect counts are unchanged. Each pool retains at most 64 **spare** objects; larger active bursts remain allowed and excess spares are destroyed. Phaser's display list still owns destruction on scene shutdown.

The original bullet physics, controls, damage, spawn rules and scene progression are unchanged. A DEV-only profiling hook in `src/main.ts` exposes the game locally and is eliminated from production builds.

## Method and limits

- Windows Chromium, ANGLE/D3D11 on NVIDIA RTX 4080 SUPER. Desktop viewport 1280×800, actual canvas 1192×670. Phone emulation 390×844, touch, DPR 2, actual game canvas 390×844, **4× CPU throttling**.
- Entry fixture: Emerald Killbox. Dense fixture: Factory Underground with its first encounter. Combat advances movement, firing, physics and AI at fixed 1/60-second steps. Effect stress emits eight labelled impacts every four frames: 120 impacts per simulated second.
- Seed 98765, fixed tween deltas, 60 warm-up frames, **60 frames of raw WebGL/matrix work counters**, followed by a separate 90-frame CPU profile. Counters are disabled and matrix wrappers removed for timings. Browser sessions run sequentially.
- Draws, triangles, bufferData/bufferSubData payload bytes, texture-upload calls, matrix operations, Graphics triangulation and text updates are measured. No shadow maps are used by this game: simulated shadows are ordinary shapes and are already included in these draws.
- Post-GC JS heap, backing storage, display objects, text canvases, texture keys and pipeline array capacity are recorded. These are **not exact VRAM measurements**. Texture upload byte sizes and GPU execution time were not measured.
- Raw data and all control results: [docs/performance-review-data.json](docs/performance-review-data.json). CPU profiles and canvas captures remain in ignored `performance-before.local/` and `performance-after.local/`. The ignored `performance-reference.local/` copy preserves the pre-optimization source, with the same profiling hook and fixture.

## Measured work reductions

Values below are averages per measured frame. Buffer bytes are actual typed-array payloads supplied to Phaser's bufferData/full-batch and bufferSubData/partial-batch calls, not a measurement of physical bus traffic.

| Fixture | Raw draws before → after | Triangles before → after | Buffer bytes before → after |
|---|---:|---:|---:|
| Desktop entry | 7 → 3 | 35,474 → 18,601 | 2,979,816 → 1,562,484 |
| Desktop dense | 7 → 2 | 27,842 → 11,886 | 2,338,728 → 998,424 |
| Phone dense | 7 → 1 | 27,842 → 7,294 | 2,338,728 → 612,696 |
| Desktop combat | 9 → 4.72 | 35,604 → 16,656 | 2,990,767 → 1,399,084 |
| Phone combat | 9 → 4.13 | 35,604 → 11,192 | 2,990,767 → 940,153 |
| Desktop effects | 11.5 → 7.5 | 35,606 → 18,733 | 2,990,904 → 1,573,572 |
| Phone effects | 11.5 → 5.5 | 35,606 → 5,142 | 2,990,904 → 431,928 |

The dense phone scene sends **73.8% fewer triangles and buffer bytes**. Its matrix `applyITRS` calls fall from 1,048 to 129 per frame, and multiplications from 1,086 to 167. Desktop dense falls from 1,048 to 312 and 1,086 to 350 respectively. This is work avoided by culling, with transform-dependent bounds caching preventing fresh corner calculations for stationary objects.

In the warmed effect fixture, **240 texture uploads and 120 text redraws per 60-frame sample become zero**. All effects still appear and expire. Pipeline buffer capacity stays at 3,778,872 bytes; the engine keeps managing its active vertex prefix. No Three.js-specific buffer override was transplanted into Phaser.

Static Graphics still triangulate 20 backdrop ellipses each frame. Profiles showed shape filling, line batching, buffer submission and text generation were more material costs. A large baked map texture could change antialiasing/zoom quality and increase memory substantially; that trade was not taken. Existing HUD change detection and the vision-cone update cadence were also preserved.

## CPU evidence versus FPS

The separate profile runs produced these work-duration medians/p95, in milliseconds. They include simulation in combat fixtures, but not idle browser time:

| Fixture | Before median / p95 | After median / p95 |
|---|---:|---:|
| Desktop entry | 1.3 / 1.4 | 1.6 / 1.9 |
| Desktop dense | 1.1 / 1.5 | 1.2 / 1.5 |
| Phone dense, 4× | 8.2 / 10.0 | 5.3 / 6.3 |
| Desktop combat | 1.7 / 2.2 | 1.8 / 2.6 |
| Phone combat, 4× | 12.9 / 17.7 | 6.8 / 11.1 |
| Desktop effects | 1.4 / 2.2 | 1.9 / 2.3 |
| Phone effects, 4× | 11.9 / 22.7 | 5.1 / 6.6 |

Desktop separate-run timings did not improve consistently, so they are not presented as proof of a speedup. Additional **uninstrumented, interleaved comparisons** used three independent pages: original, optimized, and another original as a null control. Each had 90 warm-up steps and 12 blocks of 20 measured steps, rotating which page ran first. An identical-build control distinguishes normal machine variation from the effect of the change.

| Paired workload | Optimized/original median ratio | Original/original control ratio |
|---|---:|---:|
| Desktop dense | 0.626 | 1.005 |
| Desktop repeated effects | 0.641 | 0.990 |
| Phone dense, 4× | 0.492 | 1.095 |
| Phone repeated effects, 4× | 0.336 | 0.973 |

These support **lower CPU work duration in these repeated workloads**. They do not prove a corresponding FPS increase: most recorded animation-frame gaps remained near the 16.7 ms display interval. The stress probes use a desktop GPU and cannot establish real-phone sustained FPS, GPU time, heat or battery life. Combat, camera shake (which conservatively disables culling) and large bursts still warrant testing on an actual low-end phone.

## Memory and lifecycle

- Desktop dense post-GC heap: 10.541 → 10.888 MB. Phone dense: 10.598 → 10.907 MB. The small retained cost comes primarily from cached bounds.
- Effect stress desktop heap: 10.436 → 10.611 MB. At the measured point, display objects are 907 → 923 and text canvases 99 → 107; the additional spares avoid repeated creation and texture uploading. This is a bounded reuse tradeoff, not a claim that memory decreased.
- Backing storage in dense desktop: 12.144 → 12.157 MB. Pipeline buffers remain unchanged. Texture-key counts include dynamically registered text canvases and do not directly express their GPU byte cost.
- Three successive restart/effect cycles each stabilized at **139 texture keys**. A burst exceeding the spare limit retained exactly 64 spare images and 64 spare labels after expiration. Restart destroyed old objects and cleared pool references.

## Correctness and visual validation

- **68 exact-state camera comparisons passed** across desktop and phone: three positions in each of nine stages, live combat, changing origin/rotation/negative scale, zoom and a rotated camera. Each renders the same state with culling disabled and enabled. No channel difference exceeded 4/255; the check allows 8/255 for minor triangle-batching edge differences.
- Separate before/after entry, dense and effect captures differ by at most 1/255. Two unchanged-build dense captures are pixel-identical on both viewports.
- Independent combat runs differ in one small projectile region: 130 desktop pixels (0.016%) and 114 phone pixels (0.035%) exceed 24/255. These moving captures are not claimed to be bit-identical. The exact-state combat comparison above passes, including the screen edge; the difference is between separately simulated runs, not an observed missing on-screen object from culling.
- Real browser keyboard movement/fire and CDP touch movement/fire passed; releasing the stick clears its axis. Portrait/landscape resizing completed without browser errors. No control layout or input algorithm was changed.
- Effect expiration, reuse resets, display ordering, bounded spares, scene cleanup and stable texture counts passed. Production TypeScript/Vite build passed; the existing large-bundle warning remains.

## Reproduce locally

Use an existing Playwright installation without changing this project's package or lockfile. For this review PowerShell used:

```powershell
$env:PLAYWRIGHT_MODULE='C:\Users\n\source\repos\rambo\_3D\node_modules\playwright\index.mjs'
node scripts/performance-review.mjs http://127.0.0.1:4201/ performance-after.local
node scripts/performance-pairs.mjs http://127.0.0.1:4202/ http://127.0.0.1:4201/
node scripts/performance-checks.mjs http://127.0.0.1:4201/
npm run build
```

Serve the original reference and optimized game separately with the same assets, fixture and viewport. Run profiling and tests sequentially. The review servers are temporary local tools and are stopped after the work.
