# NeoCraft

A single-player, browser-based Minecraft clone built with **Three.js + TypeScript + Vite**. All assets are generated programmatically at runtime -- zero external images, models, or sounds.

## Play

**Live demo:** Deployed automatically to GitHub Pages on push to `main`.

**Local dev:**
```bash
npm install
npm run dev
```
Open `http://localhost:5173/` in your browser. Click the canvas to lock the pointer and start playing.

## Controls

| Key | Action |
|-----|--------|
| WASD / Arrows | Move |
| Mouse | Look around |
| Space | Jump |
| Shift | Sneak |
| Ctrl / Double-tap W | Sprint |
| Left click | Break block |
| Right click | Place block |
| 1-9 / Scroll wheel | Select hotbar slot |
| E | Open inventory |
| Escape | Pause menu |
| F3 | Debug overlay |

## Features

- **Procedural terrain** with biomes (plains, forest, desert, taiga, mountains, ocean, beach, tundra, jungle, swamp), caves, ore veins, trees, and structures (desert wells, cabins, dungeons)
- **Per-block lighting** -- sunlight column propagation, BFS flood-fill for sunlight spread and torch light, Minecraft-style face shading
- **Greedy meshing** with ambient occlusion for efficient chunk rendering
- **Web Worker** off-thread chunk meshing via a worker pool
- **First-person physics** with AABB collision (Y-X-Z swept resolution), gravity, and fall damage
- **Block interaction** -- hold-to-break mining with crack overlay, tool speed bonuses, and DDA raycasting
- **Block drops** -- broken blocks spawn 3D item entities that bob, spin, and are picked up on proximity
- **Tool durability** -- tools wear down with use and break when depleted; durability bars in hotbar/inventory
- **Inventory system** -- 36-slot inventory with drag-and-drop
- **Food system** -- eat raw/cooked food to restore hunger; passive health regen when well-fed; starvation damage
- **Crafting** -- 2x2 (inventory) and 3x3 (crafting table) grids with 26 recipes
- **Furnace smelting** -- smelt ores into ingots and cook raw food; real-time fuel/progress system
- **Combat** -- melee attack mobs with swords (damage scales by tier); mobs drop items on death
- **Procedural sound** -- all audio generated at runtime via Web Audio API oscillators and noise buffers
- **HUD** -- health hearts, hunger drumsticks, armor shields, experience bar
- **Day/night cycle** -- 20-minute full cycle with dynamic sky dome, sun/moon, stars, and fog
- **Mobs** -- passive (cow, pig, chicken) and hostile (zombie, skeleton) entities via bitECS with state-machine AI
- **World persistence** -- IndexedDB save/load with RLE chunk compression and auto-save
- **GitHub Pages deployment** -- zero-cost static hosting via GitHub Actions

## Tech Stack

| Tool | Purpose |
|------|---------|
| [Three.js](https://threejs.org) | 3D rendering |
| [simplex-noise](https://github.com/jwagner/simplex-noise.js) | Terrain generation |
| [bitECS](https://github.com/NateTheGreatt/bitECS) | Entity Component System for mobs |
| [Vite](https://vitejs.dev) | Dev server & bundler |
| [TypeScript](https://www.typescriptlang.org) | Type safety |

## Project Structure

```
src/
  main.ts                  Entry point
  Game.ts                  Main game orchestrator
  engine/                  Engine, Clock, InputManager
  types/                   BlockType enum
  world/                   Chunk, ChunkManager, World, meshing, workers
  terrain/                 TerrainGenerator, biomes, caves, ores, trees
  rendering/               TextureAtlas, materials, sky, fog, effects
  physics/                 AABB, CollisionResolver, Raycast
  player/                  Player, controller, physics, interaction, hunger
  items/                   Item, ItemStack, ItemRegistry, tools
  crafting/                Recipe, CraftingGrid, RecipeRegistry
  ui/                      UIManager, HUD, hotbar, inventory, crafting, pause, debug
  entities/                ECS world, MobManager, mesh factory, AI/physics/spawn systems
  save/                    WorldStorage (IndexedDB), ChunkSerializer (RLE), SaveManager
  utils/                   Constants, CoordUtils, MathUtils, Direction, EventBus
```

## Key Algorithms

- **Terrain:** Multi-octave 2D simplex noise heightmap + 3D noise cheese/spaghetti caves
- **Lighting:** Column sunlight scan + BFS flood-fill (sunlight + block light), packed nibble storage
- **Meshing:** Greedy meshing (Mikola Lysenko / 0fps algorithm) with per-vertex AO + light
- **Collision:** Swept AABB resolved per-axis (Y, X, Z)
- **Raycast:** DDA voxel traversal (Amanatides & Woo)
- **Mob AI:** State machine (IDLE / WANDER / CHASE / ATTACK / FLEE)
- **Chunk compression:** Run-length encoding (~4:1 ratio on typical terrain)

## Zero-Cost Asset Strategy

All visual assets are generated at runtime:
- **Block textures** -- Canvas2D pixel art drawn programmatically (16x16 tiles)
- **Sun/Moon** -- Radial gradient on canvas
- **Mob meshes** -- Colored box geometries (no model files)
- **UI** -- Pure HTML/CSS generated from TypeScript
- **Sky** -- Custom GLSL gradient shader
- **Sound** -- Web Audio API oscillators and noise buffers (no audio files)

## Testing

### Run locally

```bash
npm install        # Install dependencies (first time only)
npm run dev        # Start Vite dev server with HMR
```

Open `http://localhost:5173/` in your browser. Click the canvas to lock the pointer and begin playing.

### Troubleshooting

**Items missing from hotbar / can't place blocks:**
The game saves to IndexedDB. If you have a stale save from an older version, clear it:
1. Open browser DevTools (F12)
2. Go to **Application** > **Storage** > **IndexedDB**
3. Delete the `neocraft` database
4. Refresh the page -- you'll get a fresh world with starter items

**Right-click doesn't place blocks:**
- Click the canvas first to lock the pointer (you'll see the cursor disappear)
- Your selected hotbar slot must contain a placeable block (not a tool or empty)
- The block count decreases by 1 each time you place

**Screen appears frozen:**
- Check the browser console (F12 > Console) for errors
- Try a hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)

### Type check & build

```bash
npm run build      # TypeScript check + Vite production build -> dist/
npm run dev        # Vite dev server with HMR
```

Deployment to GitHub Pages is automatic via `.github/workflows/deploy.yml` on push to `main`.

## Roadmap

### Completed

- [x] Procedural terrain with 10 biomes, caves, ores, trees
- [x] Greedy meshing with ambient occlusion
- [x] First-person controller with AABB physics, gravity, fall damage
- [x] Block break / place via DDA raycast
- [x] 36-slot inventory with drag-and-drop, shift-click quick-transfer
- [x] 2x2 and 3x3 crafting grids (26 recipes)
- [x] HUD (hearts, hunger, armor, XP bar)
- [x] Day/night cycle with sky dome, sun/moon, stars, fog
- [x] Passive and hostile mobs (bitECS + state-machine AI)
- [x] IndexedDB world persistence with RLE chunk compression + auto-save
- [x] GitHub Pages CI/CD deployment
- [x] Inventory-driven block placement (blocks consumed from hotbar)
- [x] Minecraft-style beveled inventory UI with pixel-art item icons
- [x] Tool durability bars (green-to-red gradient)
- [x] Context menu prevention for reliable right-click
- [x] Mining progress -- hold-to-break with crack overlay animation; tool tier affects speed
- [x] Tool durability consumption -- tools lose durability on use and break when depleted
- [x] Block drops -- blocks drop items as 3D entities that can be picked up
- [x] Food / healing -- eating bread/apple restores hunger; hunger regen restores health
- [x] Sound effects -- procedural audio (Web Audio API) for dig, place, walk, hurt, eat, pickup, land
- [x] Mob drops & combat -- mobs drop items on death; melee attack with sword knockback
- [x] Furnace smelting -- smelt ores into ingots via furnace UI with fuel, progress bar, and cooked food
- [x] Right-click functional blocks -- crafting table and furnace open their UIs on right-click
- [x] Per-block lighting engine -- sunlight propagation, torch BFS flood-fill, Minecraft-style face shading
- [x] Structure generation -- desert wells, wooden cabins with furnishing, underground cobblestone dungeons
- [x] Jungle & swamp biomes -- tall jungle trees, jungle wood/leaves blocks, swamp vegetation, Whittaker-diagram classification

### Mid-term

- [ ] **Infinite world** -- stream chunks in/out based on player position (currently pre-generated radius)
- [ ] **Water physics** -- flowing water that spreads from source blocks
- [ ] **Redstone basics** -- levers, buttons, pressure plates, doors
- [ ] **More biomes** -- mushroom island, mesa, savanna
- [ ] **Structure generation** -- villages, mineshafts (basic desert wells, cabins, and dungeons done)
- [ ] **Multiplayer** -- WebSocket or WebRTC peer-to-peer for LAN-style co-op

### Long-term

- [ ] **Enchanting & anvil** -- enchantment table UI, XP cost system
- [ ] **Nether / End dimensions** -- portal mechanics, new terrain generators
- [ ] **Modding API** -- plugin system for custom blocks, items, recipes, and world generators
- [ ] **Mobile support** -- touch controls with virtual joystick and buttons
- [ ] **Procedural audio engine** -- full soundtrack and ambient sounds from oscillators

## License

MIT
