---
title: Building a ctOS-Themed Portfolio with Pure HTML/CSS/JS
date: 2025-03-01
tags: [web, design, javascript]
excerpt: How I built this site - a literal terminal interface inspired by Watch_Dogs, with a lockscreen, two ASCII mini-games, sound effects, a client-side Markdown blog, and zero build tools.
---

# Building a ctOS-Themed Portfolio with Pure HTML/CSS/JS

When I started thinking about a portfolio site, the usual options felt wrong. A generic theme, a React boilerplate, a Notion page... none of it fit. I wanted something that felt like *me*: someone who plays Watch\_Dogs, writes Assembly, and appreciates a good terminal window.

So I built a ctOS terminal interface. A literal, interactive command-line shell that runs in the browser. Static HTML, CSS, and vanilla JS. Hosted on GitHub Pages. No bundler, no framework, no build step.

Here's how it works, what was difficult, and the decisions behind it.

---

## The Concept: A Literal Terminal

Most "terminal aesthetic" portfolios are just websites with a dark background and a monospaced font. I wanted to go further — the entire interface *is* a terminal. You type commands to navigate. The bar at the top mimics a desktop status bar. The whole thing boots up with an authentication sequence.

The inspiration is Watch\_Dogs' ctOS — a surveillance OS that displays everything through hacker-style terminal overlays. That means:

- No nav links that look like nav links
- No hero sections, no cards, no grids (in the main interface)
- Every piece of information is a terminal response to a command
- The aesthetic comes from the QML source of an actual ctOS-inspired desktop environment

The QML codebase I referenced defined the color palette directly:

```
gray50  #ffffff  → textPrimary
gray200 #D9D9D9  → ctosGray (corner frame accents)
gray800 #0e0e0e  → background
accentGreen #1bfd9c → success
accentRed   #fc3e38 → error
```

Everything on this site uses those exact values.

---

## The Lockscreen

When you first load the site, you hit a lockscreen before reaching the terminal. This was directly ported from the QML greeter component structure — a clock in the top-left, a status panel in the top-right, a scrolling boot log in the bottom-left, and a device ID in the bottom-right.

The login form has two options:

**Continue as Guest** — drops you into the standard terminal with the public command set: `about`, `projects`, `blog`, `read`, `open`, `status`, `scan`, `github`, `clear`.

**Login** — requires a username (any string). This unlocks the admin terminal, which has a different prompt (`#` instead of `$`) and additional commands not available to guests.

The lockscreen boot log uses staggered `setTimeout` with a CSS `opacity` transition to simulate a system booting up — the same pattern used in the QML `Terminal` component where log lines appear sequentially.

---

## The CornerFrame Component

One of the most visually distinctive elements — the corner bracket decoration on panels — comes directly from the QML `CornerFrame` component. In QML it's four `Rectangle` elements positioned at each corner. In CSS, I replicated it using eight `background` gradient layers on a single element:

```css
.cf {
  --cfc: var(--gray);
  background:
    /* TL horizontal */ linear-gradient(var(--cfc),var(--cfc)) 0    0    / var(--cf-arm) var(--cf-thick) no-repeat,
    /* TL vertical   */ linear-gradient(var(--cfc),var(--cfc)) 0    0    / var(--cf-thick) var(--cf-arm) no-repeat,
    /* TR horizontal */ linear-gradient(var(--cfc),var(--cfc)) 100% 0    / var(--cf-arm) var(--cf-thick) no-repeat,
    /* TR vertical   */ linear-gradient(var(--cfc),var(--cfc)) 100% 0    / var(--cf-thick) var(--cf-arm) no-repeat,
    /* ... and so on for BL and BR */
}
```

`--cf-arm: 7px` and `--cf-thick: 1px` match the original QML component's `armLength` and `thickness` properties. The `.cf.dim` and `.cf.ok` variants change `--cfc` to dim gray or success green — matching the inactive/active workspace states in the QML bar.

---

## The Top Bar

The bar is a direct CSS port of the QML bar layout: `[CT]OS` logo | workspaces | system info.

The workspace squares each hold an icon glyph that's visible when inactive (`$`, `~`, `</>`, `#`, `↗`) and replaced by a crosshair when active — matching the QML `Workspace` component which shows a crosshair in the center when `active: true`. Clicking a workspace runs the corresponding terminal command automatically.

The system info block shows `ddMMyy-hhmm` format — directly matching the date-time format in the QML `Clocks` component.

---

## The Terminal Engine

The entire interaction model is a command dispatcher:

1. User types a command and hits Enter
2. `dispatch()` splits the input, finds the handler in `GUEST_CMDS` or `ADMIN_CMDS`
3. The handler prints output using `tl()` (terminal line), `blank()`, `tlLink()` (clickable inline span), or `printLines()` for batched staggered output
4. History is tracked for ↑/↓ navigation
5. Tab completion matches against the active command set

Async commands (like `blog`, `read`, `scan`) use `await` so the loop animation and loading delays feel real without blocking the UI thread.

One thing that required care: the `locked` flag. While an async command is running (e.g., fetching a markdown file), `locked = true` blocks new input — except for `Ctrl+C` which always works to cancel.

---

## The Data Layer: JSON Files

Project and blog data live in plain JSON files rather than being hardcoded:

- `data/projects.json` — project list with name, stack, status, URL, and `relatedPost` (slug linking to a blog post)
- `posts/index.json` — blog manifest with title, date, tags, excerpt, readTime

This means updating a project or adding a post is just editing JSON. No recompiling, no build step, push and it's live on GitHub Pages.

The `relatedPost` field is the cleanest part of the data model — it links a project to its dev log post. When you type `open 1 log`, the terminal looks up project 1's `relatedPost` slug, finds its index in `posts/index.json`, and calls `read()` on it. Project names are clickable links to GitHub; the `open <n> log` command handles the blog redirect.

---

## The Blog: Client-Side Markdown

The blog is entirely client-side. No SSG, no server. Two pieces:

**`posts/index.json`** is the manifest. It's what `blog` renders to the terminal — titles become clickable `<span>` elements that call `read()`.

**Individual `.md` files** have YAML frontmatter:

```markdown
---
title: My Post Title
date: 2025-01-15
tags: [assembly, linux]
excerpt: Short description shown in the listing.
---

# Post content here
```

When `read <n>` is called, it fetches the `.md` file, strips the frontmatter with a regex, and passes the body to `marked.parse()`. The rendered HTML goes into a fullscreen overlay that slides over the terminal. Links in the rendered content open in new tabs.

One important gotcha: `fetch()` only works over HTTP. If you open `index.html` directly as a `file://` URL, the blog will show "no transmissions found." The fix is to serve it properly — GitHub Pages handles this, or locally run `npx serve .`.

---

## The Admin Terminal

Typing a username on the lockscreen grants `ADMINISTRATOR` access. The admin terminal shares all guest commands but adds:

| Command | What it does |
|---------|-------------|
| `sysinfo` | Extended system report — disk, network, packages |
| `whoami` | Session identity — your username, access level, session duration |
| `idle [art]` | Fullscreen ASCII art viewer with live idle stopwatch |
| `tamagotchi` | ASCII virtual pet mini-game |
| `shooter` | ASCIItron retro terminal shooter |

The command sets are plain JS objects. `ADMIN_CMDS = Object.assign({}, GUEST_CMDS, { ...adminOnlyMethods })`. Adding a new admin command is just adding a method to `ADMIN_CMDS`. The `help` command lists guest commands in one section and admin-only commands in a clearly separated `ADMIN ONLY` block.

---

## The `idle` Command and ASCII Art Gallery

`idle` opens a fullscreen overlay that shows ASCII braille art. Four pieces are available:

- `idle defalt` — the character Defalt from Watch\_Dogs (the game's hacker antagonist and the inspiration for this whole persona)
- `idle dedsec` — the DedSec logo from Watch\_Dogs
- `idle arch` — the Arch Linux logo
- `idle mask` — a Guy Fawkes-style mask in braille art

The overlay has a live stopwatch that counts up from `00:00:00` the moment idle mode opens, displayed below the art in green with the ctOS success color. This uses a `setInterval` stored on the overlay element itself (`ov._stopwatchInterval`) so `closeIdleViewer()` can clear it cleanly when you exit.

One challenge here: the stopwatch needed to reset every time you open a new art piece, not accumulate across open/close cycles. The fix was resetting the interval and counter at the top of the `idle()` function before setting the new one.

---

## ASCIIgotchi (The Tamagotchi)

`tamagotchi` opens a virtual pet mini-game ported from the [asciigotchi](https://github.com/) project (originally React/TypeScript) to vanilla JS. It's self-contained in `js/tamagotchi.js` and `css/tamagotchi.css` — completely separate from the terminal code so neither file affects the other.

The pet starts as an egg `O`. You hatch it, then keep it alive by feeding, petting, and cleaning it. It expresses its state through ASCII face strings:

```
(^-^)  happy       (._.)-  lonely
(X_X)  dead        (/_\)   sick
(-.-) sleeping     (>_<)   everything wrong at once
```

Pet size grows with age — the font-size scales up from 2rem at birth to 7rem at 30 days. The game state persists in `localStorage` under the `asciigotchi-` namespace so your pet survives page reloads.

The biggest porting challenge was removing the React state model and replacing it with a simple `setInterval` game loop that reads/writes a mutable state object. The original used `useElapsedTime` from a library; the port just ticks every second.

---

## ASCIItron (The Shooter)

`shooter` opens a retro ASCII terminal shooter, ported from [asciitron](https://github.com/lklynet/asciitron) to vanilla JS. Self-contained in `js/shooter.js` and `css/shooter.css`.

You are `@`. Enemies are `&`, `%`, `#` (regular) and two-character symbols for bosses (`$$`, `@@`, `%%`, `><`, `[]`, `==`, `OO`). Controls: WASD to move, arrow keys to shoot.

The game has seven boss types with distinct behaviours:

- **Tank** (`$$`) — drops mines
- **Shooter** (`@@`) — orbiting shield bullets that explode outward
- **Ghost** (`%%`) — goes invisible, keeps spawning regular enemies
- **Charge** (`><`) — splits into two halves on death
- **Shield** (`[]`) — activates a damage-immune phase, drops mines while shielded
- **Rapid Fire** (`==`) — fires spread-shot bursts
- **AOE** (`OO`) — radial bullet explosions

Every 5 waves is a boss wave; after each boss wave there's a breather wave at reduced difficulty before elite enemies start spawning. Elite versions of regular enemies are uppercase and move faster.

The original used CSS variables from Catppuccin Mocha. These were mapped to ctOS palette equivalents: player stays green (`#1bfd9c`), enemy bullets are red (`#fc3e38`), regular enemies cycle through the gray-red-green token set.

The CRT scanline effect from the original was kept but recolored — the chromatic aberration lines now use red/green that matches the ctOS error/success colors instead of the original pink/green.

The biggest porting challenge was keyboard event isolation. The shooter's keydown handler (WASD, arrows, Space, R, Y, U) needed to not interfere with the terminal's own keyboard handler. The fix: an `isOpen` flag. Every keydown listener in `shooter.js` begins with `if (!isOpen) return` — the game only processes input when its overlay is visible.

---

## Sound Effects

Three audio files trigger at key moments:

- `ctos_chime.mp3` — plays when the lockscreen transition completes and the terminal appears
- `ctos_ui_click.mp3` — plays on clickable links (project names, blog post titles) and workspace button clicks
- `ctos_ui_hover.mp3` — plays on hover, rate-limited to once per 120ms to prevent machine-gunning

All managed by `js/sfx.js` which preloads audio with `new Audio()` and clones nodes for overlapping playback. Sounds fail silently — `play().catch(() => {})` — because browsers block autoplay until user interaction, and the first lockscreen click provides that interaction.

---

## What's Technically Interesting

**Eight-gradient CSS CornerFrame** — getting four L-shaped corner brackets with a single CSS `background` property (no pseudo-elements, no extra DOM nodes) was a satisfying trick.

**Async command dispatcher with locked flag** — treating terminal commands as async functions and blocking input during execution makes the "loading..." states feel authentic without any visible jank.

**`relatedPost` data linking** — a tiny bit of data modeling that creates a meaningful connection between the projects list and the blog, expressed as just a slug string in a JSON file.

**Keyboard isolation for mini-games** — multiple `keydown` handlers coexisting without interfering required the `isOpen` guard in every game file. A lesson in why global event listeners in SPAs need careful scoping.

---

## The Stack

| Concern | Solution |
|---------|----------|
| Hosting | GitHub Pages (static, free) |
| HTML | Single `index.html`, handwritten |
| CSS | `ctos.css` + `tamagotchi.css` + `shooter.css` |
| JS | `terminal.js`, `sfx.js`, `tamagotchi.js`, `shooter.js` |
| Fonts | Google Fonts (JetBrains Mono) |
| Markdown rendering | marked.js from CDN |
| Blog content | `.md` files + `index.json` |
| Project data | `data/projects.json` |
| Mini-game state | `localStorage` (namespaced) |

Total external runtime dependencies: one font family, one markdown parser. Everything else is hand-written.

---

The full source is at [D3F4ULT-D3V on GitHub](https://github.com/D3F4ULT-D3V). The site is built to be edited — add a project by updating `data/projects.json`, publish a post by adding a `.md` file and one entry to `posts/index.json`.