# perihelion-qa — MCP server for the game

Lets any MCP-capable LLM agent boot ICV PERIHELION in a phantom (headless)
browser, play it with real inputs, read the full live simulation state, and
**see screenshots** of the actual rendered frames.

Phantom guarantee: pointer lock is stubbed inside the browser — the player's
real mouse/keyboard are never touched.

## Tools

| tool | what it does |
|---|---|
| `game_start` | launch + start (mode: `new` or `continue`) |
| `game_state` | full live state: position, gravity field, power/O2/CO2/pressure/water/food, tasks, hover target, hold progress, garden plots, drone position, fps, error stacks |
| `game_cmd` | in-game commands: `tp`, `face`, `aim`, `give`, `break`, `fixall`, `god`, `suit`, `time`, `sleep`, `spawn`, `door`, `save`, `ripen`, `resetup`, `mira`, `cam <x y z tx ty tz>` (photo mode), `proplist`, `doorsinfo`, `plots` |
| `game_key` | press/hold a real key (`KeyW`, `Tab`, `Space`…) |
| `game_hold_e` | press-and-HOLD E with verified start + finish (for treadmill/suit/repairs/sleep) |
| `game_mouse` | down / up / click / move (grab objects with down→up) |
| `game_screenshot` | returns the current frame as an image the agent sees |
| `game_logs` | collected console errors / uncaught exceptions |
| `game_stop` | close the session |

## Wiring it up

The game must be served somewhere first (`PLAY.bat`, `npm run preview`, or the
desktop exe). Default URL assumed: `http://localhost:4173/`.

opencode (`~/.config/opencode/opencode.jsonc`):

```jsonc
{
  "mcp": {
    "perihelion-qa": {
      "type": "local",
      "command": ["node", "C:\\Users\\drlor\\OneDrive\\Desktop\\SpaceLifeGame\\mcp\\server.mjs"],
      "enabled": true
    }
  }
}
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "perihelion-qa": {
      "command": "node",
      "args": ["C:\\Users\\drlor\\OneDrive\\Desktop\\SpaceLifeGame\\mcp\\server.mjs"]
    }
  }
}
```

## Example QA loop an agent can run

1. `game_start` → `game_state` (spawn sanity)
2. `game_cmd "break filter"` → `game_cmd "give filter"` → `game_cmd "face scrubber"`
3. `game_hold_e {needSec: 4}` → `game_state` (assert wear < 0.1, task done)
4. `game_screenshot` → visually inspect
5. `game_logs` → assert zero console errors
