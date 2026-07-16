# Revenge Plugins

Custom plugins for the [Revenge](https://github.com/revenge-mod) Discord Android mod client.

## Stack

- **Language:** TypeScript
- **Build:** Rollup + esbuild + SWC
- **Package manager:** pnpm
- **Runtime:** Loaded by Revenge at runtime (no APK compilation needed)

## Setup

```bash
pnpm install
```

## Building

```bash
pnpm run build
```

Outputs to `dist/<plugin-name>/index.js` + `manifest.json`.

## Installing on Device

1. Push the `dist/` folder to a GitHub Pages repo (or any static host)
2. In Revenge, go to **Settings → Plugins**
3. Paste the URL to `manifest.json`
4. Enable the plugin

## Plugin Structure

Each plugin lives in `plugins/<name>/` with:
- `manifest.json` — plugin metadata (name, description, authors, entry point)
- `src/index.ts` — main entry (exports `onLoad`, `onUnload`, `settings`)
- Additional `.ts`/`.tsx` files as needed

## Creating a New Plugin

```
plugins/my-plugin/
├── manifest.json
└── src/
    └── index.ts
```

### manifest.json
```json
{
    "name": "My Plugin",
    "description": "What it does",
    "authors": [{ "name": "Your Name", "id": "YOUR_DISCORD_ID" }],
    "main": "src/index.ts",
    "vendetta": { "icon": "ic_badge_staff" }
}
```

### index.ts
```ts
import { logger } from "@vendetta";

export default {
    onLoad: () => {
        logger.log("Plugin loaded!");
    },
    onUnload: () => {
        logger.log("Plugin unloaded.");
    },
};
```

## Links

- [Vendetta API Docs](https://vendetta.rocks/)
- [Revenge GitHub](https://github.com/revenge-mod)
- [Revenge Plugins List](https://plugins-list.pages.dev/)
