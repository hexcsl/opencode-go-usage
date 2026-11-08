import { Plugin } from "@opencode/plugin/tui"
import { Show, createSignal } from "solid-js"

type Style = "minimal" | "bar"
type Layout = "bar" | "compact" | "tiny" | "micro"

type UsageLimitsMeter = {
  percent: number
  limited: boolean
  resetsAt: number
}

type UsageLimitsGo = {
  rolling: UsageLimitsMeter
  weekly: UsageLimitsMeter
  monthly: UsageLimitsMeter
}

type UsageBudget = {
  id: string
  limit: number
  spent: number
  resetsAt: number
}

type UsageLimitsInfo = {
  workspace: {
    id: string
    name?: string
    usageURL: string
  }
  go?: UsageLimitsGo
  budgets: UsageBudget[]
}

type Settings = {
  style: Style
  reset: boolean
  responsive: boolean
  barWidth: number
}

type Options = Settings & {
  refresh: number
}

type State = {
  info: UsageLimitsInfo | null
}

type StoreShape = {
  settings: Settings | null
}

const BLOCKS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"]

const number = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const readOptions = (raw: Readonly<Record<string, any>>): Options => ({
  style: raw.style === "bar" ? "bar" : "minimal",
  reset: raw.reset !== false,
  responsive: raw.responsive !== false,
  refresh: clamp(number(raw.refresh, 60), 15, 3600),
  barWidth: Math.round(clamp(number(raw.barWidth, 6), 3, 24)),
})

const bar = (percent: number, width: number) => {
  const cells = (clamp(percent, 0, 100) / 100) * width
  const full = Math.floor(cells)
  const partial = cells - full
  const index = Math.round(partial * 8)
  if (index === 8) return "█".repeat(full + 1) + "░".repeat(Math.max(0, width - full - 1))
  return "█".repeat(full) + BLOCKS[index] + "░".repeat(Math.max(0, width - full - (index > 0 ? 1 : 0)))
}

const formatReset = (resetsAt: number) => {
  const remaining = resetsAt - Date.now()
  if (!Number.isFinite(remaining) || remaining <= 0) return "0m"
  const minutes = Math.ceil(remaining / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  if (hours < 24) return restMinutes === 0 ? `${hours}h` : `${hours}h${restMinutes}m`
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours === 0 ? `${days}d` : `${days}d${restHours}h`
}

const formatDate = (resetsAt: number) => {
  const date = new Date(resetsAt)
  if (Number.isNaN(date.getTime())) return "unknown"
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const money = (value: number) => `$${value.toFixed(2)}`

const mostUsed = (go: UsageLimitsGo) => {
  const meters = [
    { label: "5h", meter: go.rolling },
    { label: "wk", meter: go.weekly },
    { label: "mo", meter: go.monthly },
  ]
  return meters.reduce((best, item) => (item.meter.percent > best.meter.percent ? item : best))
}

export default Plugin.define({
  id: "opencode-go-usage",
  setup(context) {
    const options = readOptions(context.options)

    const globalSettings: Settings = {
      style: options.style,
      reset: options.reset,
      responsive: options.responsive,
      barWidth: options.barWidth,
    }

    const [store, saveStore] = context.storage.store<StoreShape>("go-usage-settings", {
      initial: { settings: null },
    })

    const currentSettings = (): Settings => store.settings ?? globalSettings

    const updateSettings = async (patch: Partial<Settings>) => {
      await saveStore((draft) => {
        draft.settings = { ...currentSettings(), ...patch }
      })
    }

    const resetSettings = async () => {
      await saveStore((draft) => {
        draft.settings = null
      })
    }

    const [state, update] = context.storage.memory<State>("go-usage", {
      initial: { info: null },
    })

    const [width, setWidth] = createSignal(context.renderer.width)
    const onResize = (nextWidth: number) => setWidth(nextWidth)
    context.renderer.on("resize", onResize)

    let stopped = false
    let pending: Promise<void> | null = null

    const refresh = (): Promise<void> => {
      if (stopped) return Promise.resolve()
      if (pending) return pending
      pending = (async () => {
        try {
          const result = await context.client.experimental.usage.limits(
            context.location ? { location: { directory: context.location.directory } } : undefined,
          )
          if (stopped) return
          update((draft) => {
            draft.info = result.data ?? null
          })
        } catch {
          // Keep the last known values; the status is hidden while unavailable.
        }
      })().finally(() => {
        pending = null
      })
      return pending
    }

    void refresh()
    const timer = setInterval(() => void refresh(), options.refresh * 1000)
    const stopEvents = context.data.on("session.execution.succeeded", () => void refresh())

    const tone = (meter: UsageLimitsMeter) => {
      if (meter.limited) return context.theme.text.feedback.error.base
      if (meter.percent >= 80) return context.theme.text.feedback.warning.base
      return context.theme.text.base
    }

    const layoutFor = (home: boolean): Layout => {
      const settings = currentSettings()
      const available = settings.responsive ? width() : 200
      if (home) {
        if (available >= 60) return "tiny"
        return "micro"
      }
      if (settings.style === "bar" && available >= 120) return "bar"
      if (available >= 85) return "compact"
      if (available >= 60) return "tiny"
      return "micro"
    }

    const Segment = (props: { label: string; meter: UsageLimitsMeter; layout: Layout }) => (
      <>
        <span style={{ fg: context.theme.text.muted }}>{props.label} </span>
        <Show when={props.layout === "bar"}>
          <span style={{ fg: tone(props.meter) }}>{bar(props.meter.percent, currentSettings().barWidth)} </span>
        </Show>
        <span style={{ fg: tone(props.meter) }}>{Math.ceil(props.meter.percent)}%</span>
        <Show
          when={
            (props.layout === "bar" || props.layout === "compact") && currentSettings().reset
          }
        >
          <span style={{ fg: context.theme.text.muted }}> ↺{formatReset(props.meter.resetsAt)}</span>
        </Show>
      </>
    )

    const content = (home: boolean) => {
      const go = state.info?.go
      if (!go) return <box />
      const layout = layoutFor(home)
      if (layout === "micro") {
        const used = mostUsed(go)
        return (
          <text>
            <span style={{ fg: context.theme.text.muted }}>Go </span>
            <span style={{ fg: tone(used.meter) }}>
              {used.label} {Math.ceil(used.meter.percent)}%
            </span>
          </text>
        )
      }
      return (
        <text>
          <span style={{ fg: context.theme.text.muted }}>Go </span>
          <Segment label="5h" meter={go.rolling} layout={layout} />
          <span>  </span>
          <Segment label="wk" meter={go.weekly} layout={layout} />
          <span>  </span>
          <Segment label="mo" meter={go.monthly} layout={layout} />
        </text>
      )
    }

    const choose = async <Value,>(
      title: string,
      items: readonly { title: string; value: Value; description?: string }[],
      current?: Value,
    ) => {
      const result = await context.ui.dialog.select<Value>({ title, options: items, current })
      return result
    }

    const detailRow = (label: string, meter: UsageLimitsMeter) => ({
      title: `${label}: ${Math.ceil(meter.percent)}% used${meter.limited ? " · limit reached" : ""}`,
      value: `detail.${label}`,
      description: `Resets ${formatDate(meter.resetsAt)} · in ${formatReset(meter.resetsAt)}`,
      category: "Usage",
    })

    const openSettings = async () => {
      while (!stopped) {
        await refresh()
        const info = state.info
        const settings = currentSettings()

        const usage = info
          ? [
              {
                title: `Workspace: ${info.workspace.name ?? info.workspace.id}`,
                value: "detail.workspace",
                description: info.workspace.usageURL,
                category: "Usage",
              },
              ...(info.go
                ? [
                    detailRow("5-hour window", info.go.rolling),
                    detailRow("Weekly", info.go.weekly),
                    detailRow("Monthly", info.go.monthly),
                  ]
                : []),
              ...info.budgets.map((budget) => ({
                title: `Budget: ${money(budget.spent)} of ${money(budget.limit)}`,
                value: `detail.budget.${budget.id}`,
                description: `Resets ${formatDate(budget.resetsAt)}`,
                category: "Usage",
              })),
              ...(!info.go && info.budgets.length === 0
                ? [
                    {
                      title: "No Go limits or budgets reported",
                      value: "detail.empty",
                      description: "The Console workspace did not return usage limits.",
                      category: "Usage",
                    },
                  ]
                : []),
            ]
          : [
              {
                title: "No usage data",
                value: "detail.none",
                description: "Sign in to OpenCode Console with /connect to see Go limits.",
                category: "Usage",
              },
            ]

        const choice = await context.ui.dialog.select<string>({
          title: info?.workspace.name ? `Go usage · ${info.workspace.name}` : "Go usage",
          placeholder: "Select a setting",
          current: "style",
          options: [
            ...usage,
            {
              title: `Style: ${settings.style}`,
              value: "style",
              description: "Minimal — numbers only. Bar — gauge plus numbers.",
              category: "Settings",
            },
            {
              title: `Reset time: ${settings.reset ? "shown" : "hidden"}`,
              value: "reset",
              description: "Time remaining until each limit resets (session view only).",
              category: "Settings",
            },
            {
              title: `Adapt to width: ${settings.responsive ? "on" : "off"}`,
              value: "responsive",
              description: "Simplify the status in narrow windows and on the home screen.",
              category: "Settings",
            },
            {
              title: `Bar width: ${settings.barWidth}`,
              value: "barWidth",
              description:
                settings.style === "bar" ? "Gauge width in cells." : "Only used by the bar style.",
              category: "Settings",
            },
            {
              title: "Reset to defaults",
              value: "defaults",
              description: "Use the global settings from cli.json.",
              category: "Settings",
            },
          ],
        })
        if (choice === undefined) return
        if (choice.startsWith("detail.")) continue

        if (choice === "style") {
          const style = await choose<Style>(
            "Status style",
            [
              { title: "Minimal", value: "minimal", description: "Go 5h 12% ↺4h  wk 3% ↺2d" },
              { title: "Bar", value: "bar", description: "Go 5h ██░░░░ 12% ↺4h  wk ░░░░░░ 3% ↺2d" },
            ],
            settings.style,
          )
          if (style) await updateSettings({ style })
        }

        if (choice === "reset") {
          await updateSettings({ reset: !settings.reset })
        }

        if (choice === "responsive") {
          await updateSettings({ responsive: !settings.responsive })
        }

        if (choice === "barWidth") {
          const barWidth = await choose<number>(
            "Bar width",
            [4, 6, 8, 10, 12].map((value) => ({
              title: `${value} cells`,
              value,
              description: `${"█".repeat(value)}  ${"░".repeat(value)}`,
            })),
            settings.barWidth,
          )
          if (barWidth) await updateSettings({ barWidth })
        }

        if (choice === "defaults") {
          const confirmed = await context.ui.dialog.confirm({
            title: "Reset settings?",
            message: "Use the global Go usage settings from cli.json?",
            label: { confirm: "Reset", cancel: "Cancel" },
          })
          if (confirmed) {
            await resetSettings()
            context.ui.toast.show({ message: "Go usage settings reset", variant: "success" })
          }
        }
      }
    }

    context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [
        {
          id: "opencode-go-usage.settings",
          title: "Go usage settings",
          description: "Configure the Go limit status",
          group: "Go usage",
          palette: true,
          slash: { name: "go-usage" },
          suggested: true,
          run: () => openSettings(),
        },
      ],
      bindings: ["opencode-go-usage.settings"],
    }))

    const disposePrompt = context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => content(!input.sessionID),
    })
    const disposeHome = context.ui.slot({ append: "home.footer.status", render: () => content(true) })

    return () => {
      stopped = true
      clearInterval(timer)
      stopEvents()
      context.renderer.off("resize", onResize)
      disposePrompt()
      disposeHome()
    }
  },
})
