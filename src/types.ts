/**
 * types.ts — shared interfaces for obsidian-micropub
 */

/** Plugin settings stored in data.json */
export interface MicropubSettings {
  /** Full URL of the Micropub endpoint, e.g. https://example.com/micropub */
  micropubEndpoint: string;

  /**
   * Full URL of the media endpoint for image uploads.
   * If empty, discovered automatically from the Micropub config query,
   * or derived from the micropubEndpoint (some servers use /micropub/media).
   */
  mediaEndpoint: string;

  /**
   * Bearer token for Authorization: Bearer <token>.
   * Obtain from your IndieAuth token endpoint or server admin panel.
   */
  accessToken: string;

  /**
   * The syndication targets to pre-tick in the publish dialog.
   * Values are uid strings returned by the Micropub config ?q=config.
   */
  defaultSyndicateTo: string[];

  /**
   * When true, perform a discovery fetch against the site URL to auto-detect
   * the micropub and token endpoints from <link rel="micropub"> headers.
   */
  autoDiscover: boolean;

  /** Your site's homepage URL — used for endpoint discovery. */
  siteUrl: string;

  /**
   * When true, after a successful publish the post URL returned by the server
   * is written back to the note's frontmatter as `mp-url`.
   */
  writeUrlToFrontmatter: boolean;

  /**
   * Map Obsidian #garden/* tags to a `gardenStage` Micropub property.
   * When enabled, a tag like #garden/plant becomes { "garden-stage": "plant" }
   * in the Micropub request (and gardenStage: plant in the server's front matter).
   */
  mapGardenTags: boolean;

  /** Visibility default for new posts: "public" | "unlisted" | "private" */
  defaultVisibility: "public" | "unlisted" | "private";
}

export const DEFAULT_SETTINGS: MicropubSettings = {
  micropubEndpoint: "",
  mediaEndpoint: "",
  accessToken: "",
  defaultSyndicateTo: [],
  autoDiscover: false,
  siteUrl: "",
  writeUrlToFrontmatter: true,
  mapGardenTags: true,
  defaultVisibility: "public",
};

/** A syndication target as returned by Micropub config query */
export interface SyndicationTarget {
  uid: string;
  name: string;
}

/** Micropub config response (?q=config) */
export interface MicropubConfig {
  "media-endpoint"?: string;
  "syndicate-to"?: SyndicationTarget[];
  "post-types"?: Array<{ type: string; name: string }>;
}

/**
 * Garden stages — matches Obsidian #garden/* tags and blog gardenStage values.
 * The Micropub property name is "garden-stage" (hyphenated, Micropub convention).
 */
export type GardenStage =
  | "plant"
  | "cultivate"
  | "question"
  | "repot"
  | "revitalize"
  | "revisit";

export const GARDEN_STAGE_LABELS: Record<GardenStage, string> = {
  plant:      "🌱 Seedling",
  cultivate:  "🌿 Growing",
  question:   "❓ Open Question",
  repot:      "🪴 Repotting",
  revitalize: "✨ Revitalizing",
  revisit:    "🔄 Revisit",
};

/** Result returned by Publisher.publish() */
export interface PublishResult {
  success: boolean;
  /** URL of the published post (from Location response header) */
  url?: string;
  error?: string;
}
