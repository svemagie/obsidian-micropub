/**
 * MicropubClient.ts
 *
 * Low-level HTTP client for Micropub and Media endpoint requests.
 * Uses Obsidian's requestUrl() so requests are made from the desktop app
 * (no CORS issues) rather than a browser fetch.
 */

import { requestUrl, RequestUrlParam } from "obsidian";
import type { MicropubConfig, PublishResult } from "./types";

export class MicropubClient {
  constructor(
    private readonly getEndpoint: () => string,
    private readonly getMediaEndpoint: () => string,
    private readonly getToken: () => string,
  ) {}

  // ── Config discovery ─────────────────────────────────────────────────────

  /** Fetch Micropub server config (syndication targets, media endpoint, etc.) */
  async fetchConfig(): Promise<MicropubConfig> {
    const url = `${this.getEndpoint()}?q=config`;
    const resp = await requestUrl({
      url,
      method: "GET",
      headers: this.authHeaders(),
    });
    return resp.json as MicropubConfig;
  }

  /**
   * Discover micropub + token endpoint URLs from a site's home page
   * by reading <link rel="micropub"> and <link rel="token_endpoint"> tags.
   */
  async discoverEndpoints(siteUrl: string): Promise<{
    micropubEndpoint?: string;
    tokenEndpoint?: string;
    mediaEndpoint?: string;
  }> {
    const resp = await requestUrl({ url: siteUrl, method: "GET" });
    const html = resp.text;

    const micropub = this.extractLinkRel(html, "micropub");
    const tokenEndpoint = this.extractLinkRel(html, "token_endpoint");

    // After discovering the Micropub endpoint, fetch its config for the media URL
    let mediaEndpoint: string | undefined;
    if (micropub) {
      try {
        const cfg = await this.fetchConfigFrom(micropub);
        mediaEndpoint = cfg["media-endpoint"];
      } catch {
        // Non-fatal — media endpoint stays undefined
      }
    }

    return { micropubEndpoint: micropub, tokenEndpoint, mediaEndpoint };
  }

  // ── Post publishing ──────────────────────────────────────────────────────

  /**
   * Create a new post via Micropub.
   * Sends a JSON body with h-entry properties.
   * Returns the Location header URL on success.
   */
  async createPost(properties: Record<string, unknown>): Promise<PublishResult> {
    const body = {
      type: ["h-entry"],
      properties,
    };

    try {
      const resp = await requestUrl({
        url: this.getEndpoint(),
        method: "POST",
        headers: {
          ...this.authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        throw: false,
      });

      if (resp.status === 201 || resp.status === 202) {
        const location =
          resp.headers?.["location"] ||
          resp.headers?.["Location"] ||
          (resp.json as { url?: string })?.url;
        return { success: true, url: location };
      }

      const detail = this.extractError(resp.text);
      return { success: false, error: `HTTP ${resp.status}: ${detail}` };
    } catch (err: unknown) {
      return { success: false, error: String(err) };
    }
  }

  /**
   * Update an existing post.
   * @param postUrl  The canonical URL of the post to update
   * @param replace  Properties to replace (will overwrite existing values)
   */
  async updatePost(
    postUrl: string,
    replace: Record<string, unknown[]>,
  ): Promise<PublishResult> {
    const body = { action: "update", url: postUrl, replace };

    try {
      const resp = await requestUrl({
        url: this.getEndpoint(),
        method: "POST",
        headers: {
          ...this.authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        throw: false,
      });

      if (resp.status >= 200 && resp.status < 300) {
        return { success: true, url: postUrl };
      }

      return {
        success: false,
        error: `HTTP ${resp.status}: ${this.extractError(resp.text)}`,
      };
    } catch (err: unknown) {
      return { success: false, error: String(err) };
    }
  }

  // ── Media upload ─────────────────────────────────────────────────────────

  /**
   * Upload a binary file to the media endpoint.
   * @returns The URL of the uploaded media, or throws on failure.
   */
  async uploadMedia(
    fileBuffer: ArrayBuffer,
    fileName: string,
    mimeType: string,
  ): Promise<string> {
    const endpoint = this.getMediaEndpoint() || `${this.getEndpoint()}/media`;

    // Build multipart/form-data manually — Obsidian's requestUrl doesn't
    // support FormData directly, so we encode the boundary ourselves.
    const boundary = `----MicropubBoundary${Date.now()}`;
    const header =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    const headerBuf = new TextEncoder().encode(header);
    const footerBuf = new TextEncoder().encode(footer);
    const fileBuf = new Uint8Array(fileBuffer);

    const combined = new Uint8Array(
      headerBuf.length + fileBuf.length + footerBuf.length,
    );
    combined.set(headerBuf, 0);
    combined.set(fileBuf, headerBuf.length);
    combined.set(footerBuf, headerBuf.length + fileBuf.length);

    const resp = await requestUrl({
      url: endpoint,
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: combined.buffer,
      throw: false,
    });

    if (resp.status === 201 || resp.status === 202) {
      const location =
        resp.headers?.["location"] ||
        resp.headers?.["Location"] ||
        (resp.json as { url?: string })?.url;
      if (location) return location;
    }

    throw new Error(
      `Media upload failed (HTTP ${resp.status}): ${this.extractError(resp.text)}`,
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.getToken()}` };
  }

  private extractLinkRel(html: string, rel: string): string | undefined {
    // Match both <link> and HTTP Link headers embedded in HTML
    const re = new RegExp(
      `<link[^>]+rel=["']${rel}["'][^>]+href=["']([^"']+)["']|<link[^>]+href=["']([^"']+)["'][^>]+rel=["']${rel}["']`,
      "i",
    );
    const m = html.match(re);
    return m?.[1] ?? m?.[2];
  }

  private async fetchConfigFrom(endpoint: string): Promise<MicropubConfig> {
    const resp = await requestUrl({
      url: `${endpoint}?q=config`,
      method: "GET",
      headers: this.authHeaders(),
    });
    return resp.json as MicropubConfig;
  }

  private extractError(text: string): string {
    try {
      const obj = JSON.parse(text) as { error_description?: string; error?: string };
      return obj.error_description ?? obj.error ?? text.slice(0, 200);
    } catch {
      return text.slice(0, 200);
    }
  }
}
