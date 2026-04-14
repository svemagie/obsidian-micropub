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

import { Notice, Plugin, TFile, parseYaml } from "obsidian";
import { DEFAULT_SETTINGS, type MicropubSettings } from "./types";
import { MicropubSettingsTab } from "./SettingsTab";
import { Publisher } from "./Publisher";
import { MicropubClient } from "./MicropubClient";
import { SyndicationDialog } from "./SyndicationDialog";
import { handleProtocolCallback } from "./IndieAuth";
import { t } from "./i18n";

export default class MicropubPlugin extends Plugin {
  settings!: MicropubSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    // ── Commands ─────────────────────────────────────────────────────────

    this.addCommand({
      id: "publish-to-micropub",
      name: t("cmdPublish"),
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
      name: t("cmdUpdate"),
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

    this.addRibbonIcon("send", t("cmdPublish"), () => {
      const file = this.app.workspace.getActiveFile();
      if (!file || file.extension !== "md") {
        new Notice(t("noticeOpenNote"));
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
        t("noticeNoEndpoint"),
      );
      return;
    }

    if (!this.settings.accessToken) {
      new Notice(
        t("noticeNoToken"),
      );
      return;
    }

    // ── Syndication dialog ────────────────────────────────────────────────
    // Determine which syndication targets to use, optionally showing a dialog.
    const syndicateToOverride = await this.resolveSyndicationTargets(file);
    if (syndicateToOverride === null) {
      // User cancelled the dialog — abort publish
      return;
    }

    const notice = new Notice(t("noticePublishing"), 0 /* persist until dismissed */);

    try {
      const publisher = new Publisher(this.app, this.settings);
      const result = await publisher.publish(file, syndicateToOverride);

      notice.hide();

      if (result.success) {
        const urlDisplay = result.url
          ? `\n${result.url}`
          : "";
        new Notice(`${t("noticePublished")}${urlDisplay}`, 8000);
      } else {
        new Notice(t("noticePublishFailed", { error: result.error ?? "" }), 10000);
        console.error("[micropub] Publish failed:", result.error);
      }
    } catch (err: unknown) {
      notice.hide();
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(t("noticeError", { error: msg }), 10000);
      console.error("[micropub] Unexpected error:", err);
    }
  }

  /**
   * Decide whether to show the syndication dialog and return the selected targets.
   *
   * Returns:
   *   string[] — targets to use as override (may be empty)
   *   undefined — no override; Publisher will use frontmatter + settings defaults
   *   null — user cancelled; abort publish
   */
  private async resolveSyndicationTargets(
    file: TFile,
  ): Promise<string[] | undefined | null> {
    const dialogSetting = this.settings.showSyndicationDialog;

    // "never" — skip dialog entirely, let Publisher handle targets from frontmatter + settings
    if (dialogSetting === "never") return undefined;

    // Fetch available targets from the server
    let availableTargets: import("./types").SyndicationTarget[] = [];
    try {
      const client = new MicropubClient(
        () => this.settings.micropubEndpoint,
        () => this.settings.mediaEndpoint,
        () => this.settings.accessToken,
      );
      const config = await client.fetchConfig();
      availableTargets = config["syndicate-to"] ?? [];
    } catch {
      // Config fetch failed — fall back to normal publish without dialog
      new Notice(
        t("noticeNoSyndTargets"),
        4000,
      );
      return undefined;
    }

    // No targets on this server — skip dialog (backward compatible)
    if (availableTargets.length === 0) return undefined;

    // Read mp-syndicate-to from frontmatter
    let fmSyndicateTo: string[] | undefined;
    try {
      const raw = await this.app.vault.read(file);
      const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
      if (fmMatch) {
        const fm = (parseYaml(fmMatch[1]) ?? {}) as Record<string, unknown>;
        const val = fm["mp-syndicate-to"];
        if (val !== undefined) {
          fmSyndicateTo = Array.isArray(val) ? val.map(String) : [String(val)];
        }
      }
    } catch {
      // Malformed frontmatter — treat as absent
    }

    // Decide whether to show dialog
    const showDialog =
      dialogSetting === "always" ||
      (dialogSetting === "when-needed" && fmSyndicateTo === undefined) ||
      (fmSyndicateTo !== undefined && fmSyndicateTo.length === 0);

    if (!showDialog) {
      // Frontmatter has values and setting is "when-needed" — skip dialog
      return undefined;
    }

    // Pre-check: use frontmatter values if non-empty, otherwise plugin defaults
    const defaultSelected =
      fmSyndicateTo && fmSyndicateTo.length > 0
        ? fmSyndicateTo
        : this.settings.defaultSyndicateTo;

    const dialog = new SyndicationDialog(this.app, availableTargets, defaultSelected);
    return dialog.awaitSelection();
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
