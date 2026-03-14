/**
 * main.ts — obsidian-micropub plugin entry point
 *
 * Publishes the active note to any Micropub-compatible endpoint.
 * Designed to work with Indiekit (https://getindiekit.com) but compatible
 * with any server that implements the Micropub spec (W3C).
 *
 * Key features vs. the original obsidian-microblog:
 *   - Configurable endpoint URL (not hardcoded to Micro.blog)
 *   - Auto-discovery of micropub/media endpoints from <link rel> headers
 *   - #garden/* tag → gardenStage property mapping for Digital Garden
 *   - Writes returned post URL back to note frontmatter for future updates
 *   - Supports create + update flows
 *
 * Based on: https://github.com/svemagie/obsidian-microblog (MIT)
 */

import { Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, type MicropubSettings } from "./types";
import { MicropubSettingsTab } from "./SettingsTab";
import { Publisher } from "./Publisher";
import { handleProtocolCallback } from "./IndieAuth";

export default class MicropubPlugin extends Plugin {
  settings!: MicropubSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    // ── Commands ─────────────────────────────────────────────────────────

    this.addCommand({
      id: "publish-to-micropub",
      name: "Publish to Micropub",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (checking) return true;

        this.publishActiveNote(file);
        return true;
      },
    });

    this.addCommand({
      id: "publish-to-micropub-update",
      name: "Update existing Micropub post",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (checking) return true;

        // Update uses the same publish flow — Publisher detects mp-url and routes to update
        this.publishActiveNote(file);
        return true;
      },
    });

    // ── IndieAuth protocol handler ────────────────────────────────────────
    // Receives obsidian://micropub-auth?code=...&state=... after the user
    // approves on their IndieAuth login page. The GitHub Pages callback page
    // at svemagie.github.io/obsidian-micropub/callback redirects here.
    this.registerObsidianProtocolHandler("micropub-auth", (params) => {
      handleProtocolCallback(params as Record<string, string>);
    });

    // ── Settings tab ─────────────────────────────────────────────────────

    this.addSettingTab(new MicropubSettingsTab(this.app, this));

    // ── Ribbon icon ──────────────────────────────────────────────────────

    this.addRibbonIcon("send", "Publish to Micropub", () => {
      const file = this.app.workspace.getActiveFile();
      if (!file || file.extension !== "md") {
        new Notice("Open a Markdown note to publish.");
        return;
      }
      this.publishActiveNote(file);
    });
  }

  onunload(): void {
    // Nothing to clean up
  }

  // ── Publish flow ──────────────────────────────────────────────────────────

  private async publishActiveNote(file: TFile): Promise<void> {
    if (!this.settings.micropubEndpoint) {
      new Notice(
        "⚠️ Micropub endpoint not configured. Open plugin settings to add it.",
      );
      return;
    }

    if (!this.settings.accessToken) {
      new Notice(
        "⚠️ Access token not configured. Open plugin settings to add it.",
      );
      return;
    }

    const notice = new Notice("Publishing…", 0 /* persist until dismissed */);

    try {
      const publisher = new Publisher(this.app, this.settings);
      const result = await publisher.publish(file);

      notice.hide();

      if (result.success) {
        const urlDisplay = result.url
          ? `\n${result.url}`
          : "";
        new Notice(`✅ Published!${urlDisplay}`, 8000);
      } else {
        new Notice(`❌ Publish failed: ${result.error}`, 10000);
        console.error("[micropub] Publish failed:", result.error);
      }
    } catch (err: unknown) {
      notice.hide();
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`❌ Error: ${msg}`, 10000);
      console.error("[micropub] Unexpected error:", err);
    }
  }

  // ── Settings persistence ──────────────────────────────────────────────────

  async loadSettings(): Promise<void> {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData(),
    ) as MicropubSettings;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
