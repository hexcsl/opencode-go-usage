# opencode-go-usage

[![GitHub](https://img.shields.io/badge/GitHub-hexcsl%2Fopencode--go--usage-181717?logo=github)](https://github.com/hexcsl/opencode-go-usage)

Show your **OpenCode Go** usage limits (5-hour, weekly, monthly) right in the OpenCode TUI status bar.

Repository: <https://github.com/hexcsl/opencode-go-usage>

- Live percentages for the **5-hour**, **weekly** and **monthly** windows
- Time until each limit resets (`↺4h12m`)
- Optional gauge view: `5h ██░░░░ 12%`
- Responsive: gauges in wide session windows, compact numbers on the home screen and narrow terminals
- Settings dialog inside the TUI: `/go-usage`
- Color feedback: warning at 80%, error when a limit is reached
- Works with **Go**, **Go Plus** and **Go Teams**

```
Go  5h 12% ↺4h10m   wk 34% ↺1d8h   mo 56% ↺27d16h
Go  5h ██░░░░ 12% ↺4h10m   wk ███░░░ 34% ↺1d8h   mo ███░░░ 56% ↺27d16h
```

## Requirements

- OpenCode v2
- Signed in to the OpenCode Console with an active Go plan (`/connect` → **OpenCode Go**)

The plugin reads the local OpenCode API (`/api/experimental/usage/limits`), so no extra
credentials or configuration are required.

## Install

### Option 1 — clone into the global plugins directory (recommended)

```sh
git clone https://github.com/hexcsl/opencode-go-usage.git \
  ~/.config/opencode/plugins/opencode-go-usage
```

If `$XDG_CONFIG_HOME` is set, use `$XDG_CONFIG_HOME/opencode/plugins/opencode-go-usage`.

Restart OpenCode (or run `/reload`). The plugin is discovered automatically — no
`cli.json` changes and no `npm install` are needed.

Verify with the `/go-usage` command.

### Option 2 — reference a cloned folder in `cli.json`

Clone the repository anywhere, then add it to `~/.config/opencode/cli.json`:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [
    {
      "package": "/absolute/path/to/opencode-go-usage",
      "options": {
        "style": "bar",
        "reset": true,
        "responsive": true,
        "barWidth": 6,
        "refresh": 60
      }
    }
  ]
}
```

Use an absolute path. OpenCode reloads `cli.json` automatically.

### Option 3 — Git plugin spec

If your OpenCode version supports Git plugin specs, install straight from GitHub:

```sh
opencode plugin add github:hexcsl/opencode-go-usage
```

### Option 4 — npm (after publishing)

The package is not published to npm yet. After you publish it (see
[Publishing](#publishing)), add it by name:

```json
{
  "plugins": ["opencode-go-usage"]
}
```

The package also ships a no-op server part, so it can be added to `opencode.json` as well.

## Usage

The status appears in two places:

- the session prompt footer (gauges on wide windows, `↺` reset time on medium ones)
- the home screen footer (compact percentages only, so it never wraps)

Open the settings and usage dialog with:

- `/go-usage` in the prompt
- `Ctrl+P` → **Go usage settings**

The dialog shows the current workspace, the 5-hour / weekly / monthly usage with exact
reset dates, Console budgets (if configured), and the settings below:

| Setting | Description |
| --- | --- |
| **Style** | `minimal` (numbers only) or `bar` (gauge + numbers) |
| **Reset time** | Show/hide the `↺` countdown (session view only) |
| **Adapt to width** | Simplify the status on narrow windows and the home screen |
| **Bar width** | Gauge width in cells (4–12 in the dialog) |
| **Reset to defaults** | Use the values from `cli.json` |

Settings are global and stored in OpenCode's plugin storage. Values from `cli.json`
are used as defaults until you change something in the dialog.

### Options

| Option | Values | Default | Description |
| --- | --- | --- | --- |
| `style` | `minimal`, `bar` | `minimal` | Status bar style |
| `reset` | `true`, `false` | `true` | Show time until the limit resets |
| `responsive` | `true`, `false` | `true` | Auto-simplify on narrow terminals |
| `barWidth` | `3`–`24` | `6` | Gauge width in cells |
| `refresh` | `15`–`3600` | `60` | Refresh interval in seconds |

## Responsive behavior

| Width | Session | Home |
| --- | --- | --- |
| ≥ 120 | chosen style, with gauge | compact numbers |
| ≥ 100 | — | compact numbers |
| ≥ 85 | numbers + reset time | compact numbers |
| ≥ 60 | numbers only | numbers only |
| < 60 | most-used limit only | most-used limit only |

## How it works

The plugin calls the OpenCode server endpoint
`GET /api/experimental/usage/limits`, which returns the Go allowance meters
(`rolling` = 5-hour window, `weekly`, `monthly`) and Console budgets. Data is refreshed
on startup, after each completed agent turn, and every `refresh` seconds.

## Limitations

- The usage endpoint reports **whole percentages**. For very small usage the API can
  return `0%` while the Console dashboard rounds it up to `1%`.
- The endpoint is marked experimental and may change in future OpenCode releases.
- Usage is only shown while an OpenCode Console workspace with a Go plan is available.

## Development

```sh
git clone https://github.com/hexcsl/opencode-go-usage.git
cd opencode-go-usage
npm install
npm run typecheck
```

To test locally, clone the folder into `~/.config/opencode/plugins/` or point
`plugins[].package` in `cli.json` at the repository root.

## Publishing

The source lives at <https://github.com/hexcsl/opencode-go-usage>. To publish the
package to npm:

1. Update `version` in `package.json`.
2. Optionally test the package with `npm pack`.
3. Run `npm publish`.

Then users can install it by name (see [Option 4](#option-4--npm-after-publishing)).

## License

MIT — see [LICENSE](./LICENSE).
