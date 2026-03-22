# D3F4ULT's CtOS Portfolio
> A literal terminal interface. No hero sections. No nav links. Just a command line.

**[d3f4ult-dev.github.io](https://D3F4ULT-D3V.github.io)** · Built with pure HTML, CSS, and vanilla JS · Hosted on GitHub Pages · Zero build tools

---

## What It Is
This portfolio is a fully interactive terminal shell running in the browser. Every page is a command response. The aesthetic is ported directly from a QML-based ctOS desktop environment inspired by Watch\_Dogs.

```
$ help
──────────────────────────── AVAILABLE COMMANDS ─────────────────────────────

  about            operator dossier
  projects         active operation manifest
  blog             transmission archive
  read <n>         open transmission by index
  open <n>         open project on GitHub
  open <n> log     read project dev log
  status           system resource report
  scan             network diagnostics
  github           external node: github.com/D3F4ULT-D3V
  clear            flush output buffer
```

---

## Getting In
When the site loads you'll hit a **lockscreen**. Two paths:

| Option | How | What you get |
|--------|-----|-------------|
| Guest | Click *Continue as Guest* | Full public terminal: `about`, `projects`, `blog`, `read`, `open`, `status`, `scan`, `github`, `clear` |
| Admin | Type any username -> *Login* | Everything above plus: `sysinfo`, `whoami`, `idle`, `tamagotchi`, `shooter` |

---

## Admin Commands
Once logged in as an operator, these become available:

### `sysinfo`
Extended system report — kernel, uptime, disk usage, network info.

### `whoami`
Shows your username, access level, and session duration.

### `idle [art]`
Opens a fullscreen ASCII art viewer with a live idle stopwatch. Four art pieces:

```
idle defalt    — the Watch_Dogs character this persona is based on
idle dedsec    — DedSec logo from Watch_Dogs
idle arch      — Arch Linux logo
idle mask      — Guy Fawkes mask
```

The stopwatch resets every time you open a new piece and clears when you exit.

### `tamagotchi`
An ASCII virtual pet, ported from [asciigotchi](https://github.com/timsch003/asciigotchi) to vanilla JS. Hatch your egg, keep it fed, petted, and clean. State persists across page reloads via `localStorage`.

```
(^-^) happy    (-.-) sleeping   (X_X) dead
```

### `shooter`
[ASCIItron](https://github.com/lklynet/asciitron) is a retro ASCII terminal shooter, ported to vanilla JS. WASD to move, arrow keys to shoot. Seven boss types. Survive as many waves as you can.

---

## Project Structure

```
.
├── index.html                  # Single-page app: Everything lives here
├── css/
│   ├── ctos.css                # Main stylesheet (palette, terminal, lockscreen, overlays)
│   ├── tamagotchi.css          # Tamagotchi game styles
│   └── shooter.css             # ASCIItron shooter styles
├── js/
│   ├── terminal.js             # Terminal engine, commands, all overlays
│   ├── sfx.js                  # Sound effect manager
│   ├── tamagotchi.js           # Tamagotchi game (self-contained)
│   └── shooter.js              # ASCIItron shooter (self-contained)
├── data/
│   └── projects.json           # Project list: Edit this to update projects
├── posts/
│   ├── index.json              # Blog manifest: Edit this to add posts
│   └── *.md                    # Individual blog posts with YAML frontmatter
└── assets/
    └── sound_effects/          # ctos_chime.mp3, ctos_ui_click.mp3, ctos_ui_hover.mp3
```

---

## Adding Content
### Add a project
Edit `data/projects.json`:

```json
{
  "n": "05",
  "name": "My New Project",
  "type": "short description",
  "stack": ["tool1", "tool2"],
  "status": "ACTIVE",
  "url": "https://github.com/D3F4ULT-D3V/my-repo",
  "desc": "One sentence about what it does.",
  "relatedPost": null
}
```

Set `"relatedPost"` to a post slug (e.g. `"my-dev-log"`) if you want `open 5 log` to open the matching blog post.

### Add a blog post
1. Create `posts/my-post-slug.md` with frontmatter:

```markdown
---
title: Post Title
date: 2025-06-01
tags: [tag1, tag2]
excerpt: One sentence shown in the listing.
---

# Your content here
```

2. Add an entry to `posts/index.json`:

```json
{
  "slug": "my-post-slug",
  "title": "Post Title",
  "date": "2025-06-01",
  "excerpt": "One sentence shown in the listing.",
  "tags": ["tag1", "tag2"],
  "readTime": "5 min"
}
```

Push. Done.

---

## Running Locally
`fetch()` requires HTTP — opening `index.html` as a `file://` URL will break the blog and project data loading. Serve it over HTTP instead:

```bash
npx serve .
# or
python -m http.server
```

Then open `http://localhost:3000` (or whatever port).

---

## Deploying
This repo uses a GitHub Actions workflow at `.github/workflows/static.yml` to deploy to GitHub Pages. The Actions-based deployment is required (rather than the default branch deploy) because it serves files with correct MIME types, which `fetch()` needs to load `.md` and `.json` files without errors.

To set it up on a fork:

1. Push the repo to GitHub
2. Go to **Settings → Pages**
3. Under *Source*, select **GitHub Actions**
4. Push to `main` — the workflow runs automatically

---

## Stack

| Concern | Solution |
|---------|----------|
| Hosting | GitHub Pages |
| HTML | Handwritten, single file |
| CSS | Three plain `.css` files |
| JS | Four plain `.js` files, no framework |
| Fonts | JetBrains Mono via Google Fonts |
| Markdown | marked.js from CDN |
| Deployment | GitHub Actions |

No npm. No bundler. No build step. Edit files and push.

---

## Credits

- The CtOS palette and component design came from [TSM-061/ctOS](https://github.com/TSM-061/ctOS)
- Tamagotchi game ported from [timsch003/asciigotchi](https://github.com/timsch003/asciigotchi)
- Shooter game ported from [lklynet/asciitron](https://github.com/lklynet/asciitron)
- Watch\_Dogs / CtOS is from Ubisoft

---

*"You're always connected to ctOS."*
