/**
 * Publisher.ts
 *
 * Orchestrates a full publish flow:
 *   1. Parse the active note's frontmatter + body
 *   2. Upload any local images to the media endpoint
 *   3. Build the Micropub properties object
 *   4. POST to the Micropub endpoint
 *   5. Optionally write the returned URL back to frontmatter
 *
 * Garden tag mapping:
 *   Obsidian tags #garden/plant → gardenStage: "plant" in properties
 *   The blog reads this as `gardenStage` frontmatter, so the Indiekit
 *   Micropub server must be configured to pass through unknown properties.
 */

import { App, TFile, parseFrontMatterAliases, parseYaml, stringifyYaml } from "obsidian";
import type { MicropubSettings, GardenStage, PublishResult } from "./types";
import { MicropubClient } from "./MicropubClient";

const GARDEN_TAG_PREFIX = "garden/";

export class Publisher {
  private client: MicropubClient;

  constructor(
    private readonly app: App,
    private readonly settings: MicropubSettings,
  ) {
    this.client = new MicropubClient(
      () => settings.micropubEndpoint,
      () => settings.mediaEndpoint,
      () => settings.accessToken,
    );
  }

  /** Publish the given file. Returns PublishResult. */
  async publish(file: TFile, syndicateToOverride?: string[]): Promise<PublishResult> {
    const raw = await this.app.vault.read(file);
    const { frontmatter, body } = this.parseFrontmatter(raw);

    // Determine if this is an update (post already has a URL) or new post
    const existingUrl: string | undefined =
      frontmatter["mp-url"] != null ? String(frontmatter["mp-url"])
      : frontmatter["url"] != null  ? String(frontmatter["url"])
      : undefined;

    // Upload local images and rewrite markdown references
    const { content: processedBody, uploadedUrls } =
      await this.processImages(body);

    // Resolve [[WikiLinks]] in body to blog URLs
    const linkedBody = this.resolveWikilinks(processedBody, file.path);

    // Build Micropub properties
    const properties = this.buildProperties(frontmatter, linkedBody, uploadedUrls, file.basename, file.path, syndicateToOverride);

    let result: PublishResult;

    if (existingUrl) {
      // Update existing post
      const replace: Record<string, unknown[]> = {};
      for (const [k, v] of Object.entries(properties)) {
        replace[k] = Array.isArray(v) ? v : [v];
      }
      result = await this.client.updatePost(existingUrl, replace);
    } else {
      // Create new post
      result = await this.client.createPost(properties);
    }

    // Write URL (and syndication targets) back to frontmatter
    if (result.success && this.settings.writeUrlToFrontmatter) {
      if (result.url) {
        await this.writeUrlToNote(file, raw, result.url, syndicateToOverride);
      } else if (syndicateToOverride !== undefined) {
        // No URL returned but we still want to record the syndication targets
        await this.writeSyndicateToNote(file, raw, syndicateToOverride);
      }
    }

    return result;
  }

  // ── Property builder ─────────────────────────────────────────────────────

  private buildProperties(
    fm: Record<string, unknown>,
    body: string,
    uploadedUrls: string[],
    basename: string,
    filePath: string,
    syndicateToOverride?: string[],
  ): Record<string, unknown> {
    const props: Record<string, unknown> = {};

    // ── Post type detection ───────────────────────────────────────────────
    // Interaction posts (bookmark, like, reply, repost) have no body content.
    // For those, only include content if the note body is non-empty (i.e. a comment/quote).
    const trimmedBody = body.trim();

    // ── Interaction URL properties ────────────────────────────────────────
    // Support both camelCase (Obsidian-friendly) and hyphenated (Micropub-spec).
    const bookmarkOf = fm["bookmarkOf"] ?? fm["bookmark-of"];
    const likeOf     = fm["likeOf"]     ?? fm["like-of"];
    const inReplyTo  = fm["inReplyTo"]  ?? fm["in-reply-to"];
    const repostOf   = fm["repostOf"]   ?? fm["repost-of"];

    if (bookmarkOf) props["bookmark-of"] = [String(bookmarkOf)];
    if (likeOf)     props["like-of"]     = [String(likeOf)];
    if (inReplyTo)  props["in-reply-to"] = [String(inReplyTo)];
    if (repostOf)   props["repost-of"]   = [String(repostOf)];

    // Content — omit for bare likes/reposts with no body text
    const isInteractionWithoutBody =
      (likeOf || repostOf) && !trimmedBody;
    if (!isInteractionWithoutBody) {
      props["content"] = trimmedBody ? [{ text: trimmedBody }] : [{ text: "" }];
    }

    // ── Standard properties ───────────────────────────────────────────────

    // Post type — explicit `postType` field takes priority over auto-detection.
    // Set this in your Obsidian template so the post type is declared up front:
    //   postType: article  → always publishes as article (sets `name`)
    //   postType: note     → always publishes as note (skips `name`)
    //   (absent)           → auto-detect: has title → article, otherwise → note
    const postType = fm["postType"] ?? fm["posttype"] ?? fm["post-type"] ?? fm["type"];
    const isArticle =
      postType === "article" ||
      (!postType && Boolean(fm["title"] ?? fm["name"]));

    if (isArticle) {
      // Use explicit title/name, or fall back to the note filename (without extension)
      const titleValue = fm["title"] ?? fm["name"] ?? basename;
      props["name"] = [String(titleValue)];
    }

    // Summary / excerpt
    if (fm["summary"] ?? fm["excerpt"]) {
      props["summary"] = [String(fm["summary"] ?? fm["excerpt"])];
    }

    // Published date — prefer `created` (Obsidian default), fall back to `date`.
    // Date-only strings (YYYY-MM-DD) are parsed as UTC midnight by the Date
    // constructor; append the current local time so the published timestamp
    // reflects when the post was actually sent.
    const rawDate = fm["created"] ?? fm["date"];
    if (rawDate) {
      const dateStr = String(rawDate);
      let published: Date;
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        // Date-only: combine with current local time
        const now = new Date();
        published = new Date(
          `${dateStr}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`,
        );
      } else {
        published = new Date(dateStr);
      }
      props["published"] = [published.toISOString()];
    }

    // Categories from frontmatter `category` AND `tags` (excluding garden/* tags).
    // Merge both fields — `tags` may contain garden/* stages while `category`
    // holds the actual topic categories sent to Micropub.
    const rawTags = [
      ...this.resolveArray(fm["tags"]),
      ...this.resolveArray(fm["category"]),
    ];
    const gardenStageFromTags = this.extractGardenStage(rawTags);
    const normalTags = rawTags.filter(
      (t) => !t.startsWith(GARDEN_TAG_PREFIX) && t !== "garden",
    );
    if (normalTags.length > 0) {
      props["category"] = [...new Set(normalTags)];
    }

    // Garden stage — prefer explicit `gardenStage` frontmatter property,
    // fall back to extracting from #garden/* tags.
    // Send as camelCase `gardenStage` so Indiekit writes it directly to
    // frontmatter without needing a preset property mapping for `garden-stage`.
    if (this.settings.mapGardenTags) {
      const gardenStage =
        (fm["gardenStage"] as string | undefined) ?? gardenStageFromTags;
      if (gardenStage) {
        props["gardenStage"] = [gardenStage];
        // Pass through the evergreen date so Indiekit writes it to the blog post.
        if (gardenStage === "evergreen") {
          const evergreenSince = fm["evergreen-since"] as string | undefined;
          if (evergreenSince) {
            props["evergreenSince"] = [String(evergreenSince)];
          }
        }
      }
    }

    // Syndication targets
    // When the dialog was shown, syndicateToOverride contains the user's selection
    // and takes precedence over frontmatter + settings defaults.
    // Support both camelCase (mpSyndicateTo) used in existing blog posts and mp-syndicate-to.
    const allSyndicateTo = syndicateToOverride !== undefined
      ? syndicateToOverride
      : [
          ...new Set([
            ...this.settings.defaultSyndicateTo,
            ...this.resolveArray(fm["mp-syndicate-to"] ?? fm["mpSyndicateTo"]),
          ]),
        ];
    if (allSyndicateTo.length > 0) {
      props["mp-syndicate-to"] = allSyndicateTo;
    }

    // Visibility
    const visibility =
      (fm["visibility"] as string) ?? this.settings.defaultVisibility;
    if (visibility && visibility !== "public") {
      props["visibility"] = [visibility];
    }

    // AI disclosure — kebab-case keys (ai-text-level, ai-tools, etc.)
    // with camelCase fallback for backward compatibility.
    // Also support nested `ai` object flattening.
    const aiObj = (fm["ai"] && typeof fm["ai"] === "object")
      ? fm["ai"] as Record<string, unknown>
      : {};
    const aiTextLevel    = fm["ai-text-level"]  ?? fm["aiTextLevel"]    ?? aiObj["textLevel"];
    const aiCodeLevel    = fm["ai-code-level"]  ?? fm["aiCodeLevel"]    ?? aiObj["codeLevel"];
    const aiTools        = fm["ai-tools"]       ?? fm["aiTools"]        ?? aiObj["aiTools"]   ?? aiObj["tools"];
    const aiDescription  = fm["ai-description"] ?? fm["aiDescription"]  ?? aiObj["aiDescription"] ?? aiObj["description"];
    if (aiTextLevel    != null) props["ai-text-level"]  = [String(aiTextLevel)];
    if (aiCodeLevel    != null) props["ai-code-level"]  = [String(aiCodeLevel)];
    if (aiTools        != null) props["ai-tools"]       = [String(aiTools)];
    if (aiDescription  != null) props["ai-description"] = [String(aiDescription)];

    // Photos: only use explicitly declared photo frontmatter (with alt text).
    // Inline images uploaded from the body are already embedded in `content`
    // and must NOT be added as `photo` — doing so would make Micropub treat
    // the post as a photo post instead of an article/note.
    const fmPhotos = this.resolvePhotoArray(fm["photo"]);
    if (fmPhotos.length > 0) {
      props["photo"] = fmPhotos;
    }

    // Related posts — resolve [[WikiLink]] wikilinks to published blog URLs
    const relatedRaw = this.resolveArray(fm["related"]);
    if (relatedRaw.length > 0) {
      const relatedUrls = relatedRaw
        .map((ref) => this.resolveWikilinkToUrl(ref, filePath))
        .filter((url): url is string => url !== null);
      if (relatedUrls.length > 0) {
        props["related"] = relatedUrls;
      }
    }

    // Pass through any `mp-*` properties from frontmatter verbatim
    for (const [k, v] of Object.entries(fm)) {
      if (k.startsWith("mp-") && k !== "mp-url" && k !== "mp-syndicate-to") {
        props[k] = this.resolveArray(v);
      }
    }

    return props;
  }

  /**
   * Normalise the `photo` frontmatter field into Micropub photo objects.
   * Handles three formats:
   *   - string URL: "https://..."
   *   - array of strings: ["https://..."]
   *   - array of objects: [{url: "https://...", alt: "..."}]
   */
  private resolvePhotoArray(
    value: unknown,
  ): Array<{ value: string; alt?: string }> {
    if (!value) return [];
    const items = Array.isArray(value) ? value : [value];
    return items
      .map((item) => {
        if (typeof item === "string") return { value: item };
        if (typeof item === "object" && item !== null) {
          const obj = item as Record<string, unknown>;
          const url = String(obj["url"] ?? obj["value"] ?? "");
          if (!url) return null;
          return obj["alt"]
            ? { value: url, alt: String(obj["alt"]) }
            : { value: url };
        }
        return null;
      })
      .filter((x): x is { value: string; alt?: string } => x !== null);
  }

  // ── Garden tag extraction ────────────────────────────────────────────────

  /**
   * Find the first #garden/<stage> tag and return the stage name.
   * Supports both "garden/plant" (Obsidian array) and "#garden/plant" (inline).
   */
  private extractGardenStage(tags: string[]): GardenStage | undefined {
    for (const tag of tags) {
      const clean = tag.replace(/^#/, "");
      if (clean.startsWith(GARDEN_TAG_PREFIX)) {
        const stage = clean.slice(GARDEN_TAG_PREFIX.length) as GardenStage;
        const valid: GardenStage[] = [
          "plant", "cultivate", "evergreen", "question", "repot", "revitalize", "revisit",
        ];
        if (valid.includes(stage)) return stage;
      }
    }
    return undefined;
  }

  // ── Image processing ─────────────────────────────────────────────────────

  /**
   * Find all `![[local-image.png]]` or `![alt](relative/path.jpg)` in the body,
   * upload them to the media endpoint, and replace the references with remote URLs.
   */
  private async processImages(
    body: string,
  ): Promise<{ content: string; uploadedUrls: string[] }> {
    const uploadedUrls: string[] = [];

    // Match wiki-style embeds: ![[filename.ext]]
    const wikiPattern = /!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|svg))\]\]/gi;
    // Match markdown images: ![alt](path)
    const mdPattern = /!\[([^\]]*)\]\(([^)]+\.(png|jpg|jpeg|gif|webp|svg))\)/gi;

    let content = body;

    // Process wiki-style embeds
    const wikiMatches = [...body.matchAll(wikiPattern)];
    for (const match of wikiMatches) {
      const filename = match[1];
      try {
        const remoteUrl = await this.uploadLocalFile(filename);
        if (remoteUrl) {
          uploadedUrls.push(remoteUrl);
          content = content.replace(match[0], `![${filename}](${remoteUrl})`);
        }
      } catch (err) {
        console.warn(`[micropub] Failed to upload ${filename}:`, err);
      }
    }

    // Process markdown image references
    const mdMatches = [...content.matchAll(mdPattern)];
    for (const match of mdMatches) {
      const alt = match[1];
      const path = match[2];
      if (path.startsWith("http")) continue; // already remote
      try {
        const remoteUrl = await this.uploadLocalFile(path);
        if (remoteUrl) {
          uploadedUrls.push(remoteUrl);
          content = content.replace(match[0], `![${alt}](${remoteUrl})`);
        }
      } catch (err) {
        console.warn(`[micropub] Failed to upload ${path}:`, err);
      }
    }

    return { content, uploadedUrls };
  }

  private async uploadLocalFile(path: string): Promise<string | undefined> {
    const file = this.app.vault.getFiles().find(
      (f) => f.name === path || f.path === path,
    );
    if (!file) return undefined;

    const buffer = await this.app.vault.readBinary(file);
    const mimeType = this.guessMimeType(file.extension);

    return this.client.uploadMedia(buffer, file.name, mimeType);
  }

  // ── Frontmatter helpers ──────────────────────────────────────────────────

  private parseFrontmatter(raw: string): {
    frontmatter: Record<string, unknown>;
    body: string;
  } {
    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!fmMatch) return { frontmatter: {}, body: raw };

    let frontmatter: Record<string, unknown> = {};
    try {
      frontmatter = (parseYaml(fmMatch[1]) ?? {}) as Record<string, unknown>;
    } catch {
      // Malformed frontmatter — treat as empty
    }

    return { frontmatter, body: fmMatch[2] };
  }

  private async writeUrlToNote(
    file: TFile,
    originalContent: string,
    url: string,
    syndicateToOverride?: string[],
  ): Promise<void> {
    // Build all fields to write back after a successful publish
    const now = new Date();
    const publishedDate = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-") +
      "T" +
      String(now.getHours()).padStart(2, "0") +
      ":" +
      String(now.getMinutes()).padStart(2, "0") +
      ":" +
      String(now.getSeconds()).padStart(2, "0");

    const fields: Array<[string, string]> = [
      ["mp-url", `"${url}"`],
      ["post-status", "published"],
      ["published", publishedDate],
    ];

    // Record the syndication targets used so future publishes know what was sent
    if (syndicateToOverride !== undefined) {
      fields.push(["mp-syndicate-to", `[${syndicateToOverride.join(", ")}]`]);
    }

    if (this.settings.siteUrl) {
      try {
        const hostname = new URL(this.settings.siteUrl).hostname.replace(/^www\./, "");
        fields.push(["medium", `"[[${hostname}]]"`]);
      } catch {
        // ignore malformed siteUrl
      }
    }

    // Stamp evergreen-since on first promotion to the evergreen garden stage.
    {
      const { frontmatter: fm } = this.parseFrontmatter(originalContent);
      if (!fm["evergreen-since"]) {
        const rawTags = [
          ...this.resolveArray(fm["tags"]),
          ...this.resolveArray(fm["category"]),
        ];
        const stage =
          (fm["gardenStage"] as string | undefined) ??
          this.extractGardenStage(rawTags);
        if (stage === "evergreen") {
          fields.push(["evergreen-since", publishedDate]);
        }
      }
    }

    const fmMatch = originalContent.match(
      /^(---\r?\n[\s\S]*?\r?\n---\r?\n)([\s\S]*)$/,
    );

    if (!fmMatch) {
      // No existing frontmatter — prepend all fields
      const lines = fields.map(([k, v]) => `${k}: ${v}`).join("\n");
      await this.app.vault.modify(file, `---\n${lines}\n---\n` + originalContent);
      return;
    }

    let fmBlock = fmMatch[1];
    const body = fmMatch[2];

    for (const [key, value] of fields) {
      fmBlock = this.setFrontmatterField(fmBlock, key, value);
    }

    await this.app.vault.modify(file, fmBlock + body);
  }

  /**
   * Write mp-syndicate-to to frontmatter without touching other fields.
   * Used when publish succeeds but returns no URL (e.g. update responses).
   */
  private async writeSyndicateToNote(
    file: TFile,
    originalContent: string,
    syndicateTo: string[],
  ): Promise<void> {
    const fmMatch = originalContent.match(
      /^(---\r?\n[\s\S]*?\r?\n---\r?\n)([\s\S]*)$/,
    );
    const value = `[${syndicateTo.join(", ")}]`;

    if (!fmMatch) {
      await this.app.vault.modify(
        file,
        `---\nmp-syndicate-to: ${value}\n---\n` + originalContent,
      );
      return;
    }

    const fmBlock = this.setFrontmatterField(fmMatch[1], "mp-syndicate-to", value);
    await this.app.vault.modify(file, fmBlock + fmMatch[2]);
  }

  /**
   * Replace the value of an existing frontmatter field, or insert it before
   * the closing `---` if the field is not yet present.
   */
  private setFrontmatterField(fmBlock: string, key: string, value: string): string {
    const lineRegex = new RegExp(`^${key}:.*$`, "m");
    if (lineRegex.test(fmBlock)) {
      return fmBlock.replace(lineRegex, `${key}: ${value}`);
    }
    // Insert before closing ---
    return fmBlock.replace(/(\r?\n---\r?\n)$/, `\n${key}: ${value}$1`);
  }

  // ── Wikilink resolution ──────────────────────────────────────────────────

  /**
   * Replace Obsidian [[WikiLinks]] in body text with Markdown hyperlinks.
   * Uses mp-url from the linked note's frontmatter. Falls back to plain
   * display text if the note is not found or not yet published.
   * Image embeds (![[...]]) are left untouched via negative lookbehind.
   */
  private resolveWikilinks(body: string, sourcePath: string): string {
    return body.replace(
      /(?<!!)\[\[([^\]|#]+)(#[^\]|]*)?\|?([^\]]*)\]\]/g,
      (_match, noteName: string, anchor: string | undefined, alias: string) => {
        const cleanName = noteName.trim();
        const displayText =
          alias?.trim() || cleanName.split("/").pop() || cleanName;
        const url = this.resolveWikilinkToUrl(`[[${cleanName}]]`, sourcePath);
        if (!url) return displayText;
        const anchorSuffix = anchor
          ? anchor.toLowerCase().replace(/\s+/g, "-")
          : "";
        return `[${displayText}](${url}${anchorSuffix})`;
      },
    );
  }

  /**
   * Resolve a single [[WikiLink]] or plain URL string to a published mp-url.
   * Returns null if the note is not found or has no mp-url.
   */
  private resolveWikilinkToUrl(
    ref: string,
    sourcePath: string,
  ): string | null {
    if (ref.startsWith("http")) return ref;
    const m = ref.match(/^\[\[([^\]|#]+)(?:#[^\]|]*)?\|?[^\]]*\]\]$/);
    if (!m) return null;
    const file = this.app.metadataCache.getFirstLinkpathDest(
      m[1].trim(),
      sourcePath,
    );
    if (!file) return null;
    return (
      (this.app.metadataCache.getFileCache(file)?.frontmatter?.[
        "mp-url"
      ] as string | undefined) ?? null
    );
  }

  private resolveArray(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(String);
    return [String(value)];
  }

  private guessMimeType(ext: string): string {
    const map: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
    };
    return map[ext.toLowerCase()] ?? "application/octet-stream";
  }
}
