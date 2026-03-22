# obsidian-micropub

An Obsidian plugin to publish notes to **any Micropub-compatible endpoint** — Indiekit, Micro.blog, or any server implementing the [W3C Micropub spec](https://www.w3.org/TR/micropub/).

Forked and generalised from [svemagie/obsidian-microblog](https://github.com/svemagie/obsidian-microblog) (MIT).

---

## Features

- **Any Micropub endpoint** — not locked to Micro.blog; works with Indiekit and other servers
- **Auto-discovery** — reads `<link rel="micropub">` from your site to find the endpoint automatically
- **Digital Garden stage mapping** — Obsidian tags `#garden/plant`, `#garden/cultivate`, etc. become a `gardenStage` property on the published post, matching the Eleventy blog's garden system
- **Create + Update** — if the note has a `mp-url` frontmatter key, Publish will update the existing post instead of creating a new one
- **Image upload** — local images (wiki-embeds and markdown) are uploaded to the media endpoint and URLs rewritten
- **URL write-back** — the returned post URL is saved to `mp-url` in the note's frontmatter after publishing

---

## Installation

### From source (development)

```bash
cd /path/to/your/obsidian/vault/.obsidian/plugins
git clone https://github.com/yourname/obsidian-micropub
cd obsidian-micropub
npm install
npm run dev
```

Then enable the plugin in Obsidian → Settings → Community plugins.

### Manual

1. Download the latest release (main.js + manifest.json)
2. Create a folder `.obsidian/plugins/obsidian-micropub/` in your vault
3. Copy both files there
4. Enable in Obsidian → Settings → Community plugins

---

## Configuration

Open **Settings → Micropub Publisher**.

| Setting | Description |
|---|---|
| **Site URL** | Your site's home page — used for endpoint auto-discovery |
| **Micropub endpoint** | e.g. `https://example.com/micropub` |
| **Media endpoint** | For image uploads; auto-discovered if blank |
| **Access token** | Bearer token from your IndieAuth token endpoint |
| **Default visibility** | `public` / `unlisted` / `private` |
| **Write URL to note** | Save the published post URL as `mp-url` in frontmatter |
| **Map #garden/* tags** | Convert `#garden/plant` → `garden-stage: plant` property |

### Getting a token from Indiekit

1. Log into your Indiekit admin panel
2. Go to **Tokens** → Create new token with `create update` scope
3. Paste the token into the plugin settings

---

## Digital Garden workflow

Tag any note in Obsidian with a `#garden/*` tag, or set `gardenStage` directly in frontmatter:

| Obsidian tag | Published property | Blog display |
|---|---|---|
| `#garden/evergreen` | `gardenStage: evergreen` | 🌳 Evergreen |
| `#garden/cultivate` | `gardenStage: cultivate` | 🌿 Growing |
| `#garden/plant` | `gardenStage: plant` | 🌱 Seedling |
| `#garden/question` | `gardenStage: question` | ❓ Open Question |
| `#garden/repot` | `gardenStage: repot` | 🪴 Repotting |
| `#garden/revitalize` | `gardenStage: revitalize` | ✨ Revitalizing |
| `#garden/revisit` | `gardenStage: revisit` | 🔄 Revisit |

The Eleventy blog renders a coloured badge on each post and groups all garden posts at `/garden/`.

### Example note

```markdown
---
title: "On building in public"
tags:
  - garden/plant
category:
  - indieweb
---

Some early thoughts on the merits of building in public...
```

After publishing, the frontmatter/property in Obsidian gains:

```yaml
mp-url: "https://example.com/articles/2026/on-building-in-public"
```

---

## Frontmatter properties recognised

### Standard properties

| Property | Effect |
|---|---|
| `title` | Sets the post `name` (article mode) |
| `created` / `date` | Sets `published` date (`created` takes priority — matches Obsidian's default date field) |
| `postType` | Force post type: `article` sends a title (uses filename if none set), `note` skips title |
| `tags` + `category` | Both merged into Micropub `category` (excluding `garden/*` and bare `garden` tags, deduplicated) |
| `summary` / `excerpt` | Sets `summary` property |
| `visibility` | `public` / `unlisted` / `private` |
| `gardenStage` | Explicit garden stage — see table below |
| `mp-url` | Triggers an **update** rather than create |
| `mp-syndicate-to` / `mpSyndicateTo` | Pre-fills syndication target list |
| `mp-*` | Any other `mp-*` keys passed through verbatim |

### AI disclosure properties

Use flat kebab-case properties (camelCase fallback supported for backward compatibility):

| Property | Values | Meaning |
|---|---|---|
| `ai-text-level` | `"0"` `"1"` `"2"` `"3"` | None / Editorial / Co-drafted / AI-generated |
| `ai-code-level` | `"0"` `"1"` `"2"` | None / AI-assisted / AI-generated |
| `ai-tools` | string | Tools used, e.g. `"Claude"` |
| `ai-description` | string | Free-text disclosure note |

Nested `ai:` objects (e.g. `ai: {textLevel: "1"}`) also work but flat keys are recommended.

**Example article template:**

```yaml
---
title: "My Post"
created: 2026-03-15T10:00:00
postType: article
tags:
  - garden/evergreen
category:
  - indieweb
  - lang/en
ai-text-level: "1"
ai-code-level: "0"
ai-tools: "Claude"
ai-description: "AI helped refine the structure"
---
```

### Digital Garden stages

Set via `gardenStage` frontmatter or a `#garden/<stage>` tag:

| Stage | Badge | Meaning |
|---|---|---|
| `plant` | 🌱 Seedling | New, rough idea |
| `cultivate` | 🌿 Growing | Being actively developed |
| `evergreen` | 🌳 Evergreen | Mature, lasting content |
| `question` | ❓ Open Question | An unresolved inquiry |
| `repot` | 🪴 Repotting | Restructuring needed |
| `revitalize` | ✨ Revitalizing | Being refreshed |
| `revisit` | 🔄 Revisit | Flagged to come back to |

---

## Development

```bash
npm run dev    # watch mode with inline sourcemaps
npm run build  # production bundle (minified)
```

### Architecture

```
src/
  main.ts          Plugin entry point, command/ribbon registration
  types.ts         Shared interfaces and constants
  MicropubClient.ts  Low-level HTTP (create, update, upload, discover)
  Publisher.ts     Orchestrates publish flow (parse → upload → send → write-back)
  SettingsTab.ts   Obsidian settings UI
```

---

## Roadmap

- [ ] Publish dialog with syndication target checkboxes
- [ ] Scheduled publishing (`mp-published-at`)
- [ ] Pull categories from Micropub `?q=category` for autocomplete
- [ ] Multi-endpoint support (publish to multiple blogs)
- [ ] Post type selector (note / article / bookmark / reply)

---

## License

MIT — see [LICENSE](LICENSE)
