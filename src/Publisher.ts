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
  async publish(file: TFile): Promise<PublishResult> {
    const raw = await this.app.vault.read(file);
    const { frontmatter, body } = this.parseFrontmatter(raw);

    // Determine if this is an update (post already has a URL) or new post
    const existingUrl: string | undefined =
      frontmatter["mp-url"] ?? frontmatter["url"] ?? undefined;

    // Upload local images and rewrite markdown references
    const { content: processedBody, uploadedUrls } =
      await this.processImages(body);

    // Build Micropub properties
    const properties = this.buildProperties(frontmatter, processedBody, uploadedUrls);

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

    // Write URL back to frontmatter
    if (result.success && result.url && this.settings.writeUrlToFrontmatter) {
      await this.writeUrlToNote(file, raw, result.url);
    }

    return result;
  }

  // ── Property builder ─────────────────────────────────────────────────────

  private buildProperties(
    fm: Record<string, unknown>,
    body: string,
    uploadedUrls: string[],
  ): Record<string, unknown> {
    const props: Record<string, unknown> = {};

    // Required: content
    props["content"] = [{ html: body }];

    // Title (articles have titles; notes/micro-posts don't)
    if (fm["title"]) {
      props["name"] = [String(fm["title"])];
    }

    // Published date
    if (fm["date"]) {
      props["published"] = [new Date(String(fm["date"])).toISOString()];
    }

    // Categories from frontmatter `category` or `tags` (excluding garden/* tags)
    const rawTags = this.resolveArray(fm["tags"] ?? fm["category"]);
    const gardenStage = this.extractGardenStage(rawTags);
    const normalTags = rawTags.filter(
      (t) => !t.startsWith(GARDEN_TAG_PREFIX) && t !== "garden",
    );
    if (normalTags.length > 0) {
      props["category"] = normalTags;
    }

    // Garden stage → dedicated property
    if (this.settings.mapGardenTags && gardenStage) {
      // Indiekit stores this as gardenStage in front matter;
      // Micropub JSON uses hyphenated keys
      props["garden-stage"] = [gardenStage];
    }

    // Syndication targets
    const syndicateTo = this.resolveArray(fm["mp-syndicate-to"]);
    const allSyndicateTo = [
      ...new Set([...this.settings.defaultSyndicateTo, ...syndicateTo]),
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

    // Uploaded images (from local → remote URL conversion)
    if (uploadedUrls.length > 0) {
      props["photo"] = uploadedUrls.map((url) => ({ value: url }));
    }

    // Pass through any `mp-*` properties from frontmatter verbatim
    for (const [k, v] of Object.entries(fm)) {
      if (k.startsWith("mp-") && k !== "mp-url" && k !== "mp-syndicate-to") {
        props[k] = this.resolveArray(v);
      }
    }

    return props;
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
          "plant", "cultivate", "question", "repot", "revitalize", "revisit",
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
  ): Promise<void> {
    const fmMatch = originalContent.match(
      /^(---\r?\n[\s\S]*?\r?\n---\r?\n)([\s\S]*)$/,
    );

    if (!fmMatch) {
      // No existing frontmatter — prepend it
      const newFm = `---\nmp-url: "${url}"\n---\n`;
      await this.app.vault.modify(file, newFm + originalContent);
      return;
    }

    // Inject mp-url into existing frontmatter block
    const fmBlock = fmMatch[1];
    const body = fmMatch[2];

    if (fmBlock.includes("mp-url:")) {
      // Replace existing mp-url line
      const updated = fmBlock.replace(
        /mp-url:.*(\r?\n)/,
        `mp-url: "${url}"$1`,
      );
      await this.app.vault.modify(file, updated + body);
    } else {
      // Insert mp-url before closing ---
      const updated = fmBlock.replace(
        /(\r?\n---\r?\n)$/,
        `\nmp-url: "${url}"$1`,
      );
      await this.app.vault.modify(file, updated + body);
    }
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
