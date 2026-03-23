# obsidian-micropub

An Obsidian plugin to publish notes to **any Micropub-compatible endpoint** — Indiekit, Micro.blog, or any server implementing the [W3C Micropub spec](https://www.w3.org/TR/micropub/).

Forked and generalised from [svemagie/obsidian-microblog](https://github.com/svemagie/obsidian-microblog) (MIT).

---

## Features

- **Any Micropub endpoint** — not locked to Micro.blog; works with Indiekit and other servers
- **IndieAuth sign-in** — browser-based PKCE login, no token copy-paste required
- **Auto-discovery** — reads `<link rel="micropub">` from your site to find the endpoint automatically
- **Article vs. note** — auto-detected from frontmatter; override with `postType`
- **Digital Garden stage mapping** — Obsidian tags `#garden/plant`, `#garden/cultivate`, etc. become a `gardenStage` property on the published post
- **Create + Update** — if the note has an `mp-url` frontmatter key, Publish updates the existing post instead of creating a new one
- **Image upload** — local images (`![[file.png]]` and `![alt](path)`) are uploaded to the media endpoint and rewritten to remote URLs in the post content
- **WikiLink resolution** — `[[Note Name]]` links in the body are resolved to their published blog URLs via `mp-url` frontmatter
- **Interaction posts** — bookmark, like, reply, repost using standard Micropub properties
- **AI disclosure** — `ai-text-level`, `ai-tools`, etc. pass through as Micropub properties
- **URL write-back** — the returned post URL is saved to `mp-url` in the note's frontmatter after publishing

---

## Installation

### Manual

1. Download the latest release (`main.js` + `manifest.json`)
2. Create a folder `.obsidian/plugins/obsidian-micropub/` in your vault
3. Copy both files there
4. Enable in Obsidian → Settings → Community plugins

### From source

```bash
cd /path/to/your/obsidian/vault/.obsidian/plugins
git clone https://github.com/svemagie/obsidian-micropub
cd obsidian-micropub
npm install
npm run build
```

---

## Configuration

Open **Settings → Micropub Publisher**.

### Sign in with IndieAuth (recommended)

1. Enter your **Site URL** (e.g. `https://blog.example.com`).
2. Click **Sign in** — your browser opens your site's IndieAuth login page.
3. Log in. The browser redirects back to Obsidian automatically.
4. The plugin stores your access token and fills in the endpoint URLs.

The flow uses [PKCE](https://oauth.net/2/pkce/) and a GitHub Pages relay page as the redirect URI, so it works without a local HTTP server.

### Manual token (advanced)

Expand **Or paste a token manually** and enter a bearer token from your Indiekit admin panel (`create update media` scope). Click **Verify** to confirm it works.

### Settings reference

| Setting | Default | Description |
|---|---|---|
| Site URL | — | Your site's homepage; used for IndieAuth endpoint discovery |
| Micropub endpoint | — | e.g. `https://example.com/micropub` |
| Media endpoint | — | For image uploads; auto-discovered from Micropub config if blank |
| Default visibility | `public` | Applied when the note has no `visibility` field |
| Write URL back to note | on | Saves the published post URL as `mp-url` in frontmatter |
| Map #garden/* tags | on | Converts `#garden/plant` → `gardenStage: plant` Micropub property |

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

### Post identity

| Property | Effect |
|---|---|
| `mp-url` / `url` | Existing post URL — triggers an **update** rather than create |
| `postType` | Force post type: `article` (sets `name`), `note` (skips `name`) |
| `title` / `name` | Sets the post `name`; presence auto-detects post type as article |

If no `postType` is set: a note with a `title` or `name` field publishes as an article; a note without one publishes as a note.

### Content

| Property | Effect |
|---|---|
| `created` / `date` | Sets `published` date; `created` takes priority (matches Obsidian's default) |
| `tags` + `category` | Both merged into Micropub `category`; `garden/*` and bare `garden` tags are filtered out |
| `summary` / `excerpt` | Sets the `summary` property |
| `visibility` | `public` / `unlisted` / `private` |
| `photo` | Featured photo: a URL string, array of URLs, or `[{url, alt}]` objects |
| `related` | List of `[[WikiLinks]]` or URLs to related posts; WikiLinks are resolved to `mp-url` |

### Syndication

| Property | Effect |
|---|---|
| `mp-syndicate-to` / `mpSyndicateTo` | Per-note syndication targets, merged with the default targets in settings |
| `mp-*` | Any other `mp-*` key (except `mp-url`) is passed through verbatim |

### Interaction posts

Set one of these to publish a bookmark, like, reply, or repost. Adding body text to an interaction note includes it as a comment or quote; bare likes and reposts omit `content` entirely.

| Property | Effect |
|---|---|
| `bookmarkOf` / `bookmark-of` | URL being bookmarked |
| `likeOf` / `like-of` | URL being liked |
| `inReplyTo` / `in-reply-to` | URL being replied to |
| `repostOf` / `repost-of` | URL being reposted |

### AI disclosure

Flat kebab-case keys are recommended; camelCase and a nested `ai:` object are also supported.

| Property | Values | Meaning |
|---|---|---|
| `ai-text-level` | `"0"` `"1"` `"2"` `"3"` | None / Editorial / Co-drafted / AI-generated |
| `ai-code-level` | `"0"` `"1"` `"2"` | None / AI-assisted / AI-generated |
| `ai-tools` | string | Tools used, e.g. `"Claude"` |
| `ai-description` | string | Free-text disclosure note |

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

When a note is first published with `gardenStage: evergreen`, an `evergreen-since` date is stamped automatically.

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
ai-tools: "Claude"
---
```

---

## Development

```bash
npm run dev    # watch mode with inline sourcemaps
npm run build  # production bundle (minified)
```

### Architecture

```
src/
  main.ts             Plugin entry point, commands, ribbon, protocol handler
  types.ts            Shared interfaces and constants
  MicropubClient.ts   Low-level HTTP (create, update, upload, discover)
  Publisher.ts        Orchestrates publish flow (parse → upload → send → write-back)
  IndieAuth.ts        PKCE IndieAuth sign-in via GitHub Pages relay
  SettingsTab.ts      Obsidian settings UI
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
