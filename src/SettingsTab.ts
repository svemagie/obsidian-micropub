/**
 * SettingsTab.ts — Obsidian settings UI for obsidian-micropub
 */

import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type MicropubPlugin from "./main";
import { MicropubClient } from "./MicropubClient";

export class MicropubSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: MicropubPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Micropub Publisher" });

    // ── Endpoint discovery ───────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Endpoint Configuration" });

    new Setting(containerEl)
      .setName("Site URL")
      .setDesc(
        "Your site's home page. Used to auto-discover Micropub and token endpoints " +
        "from <link rel=\"micropub\"> headers.",
      )
      .addText((text) =>
        text
          .setPlaceholder("https://example.com")
          .setValue(this.plugin.settings.siteUrl)
          .onChange(async (value) => {
            this.plugin.settings.siteUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Discover")
          .setCta()
          .onClick(async () => {
            if (!this.plugin.settings.siteUrl) {
              new Notice("Enter a site URL first.");
              return;
            }
            btn.setDisabled(true);
            btn.setButtonText("Discovering…");
            try {
              const client = new MicropubClient(
                () => this.plugin.settings.micropubEndpoint,
                () => this.plugin.settings.mediaEndpoint,
                () => this.plugin.settings.accessToken,
              );
              const discovered = await client.discoverEndpoints(
                this.plugin.settings.siteUrl,
              );
              if (discovered.micropubEndpoint) {
                this.plugin.settings.micropubEndpoint =
                  discovered.micropubEndpoint;
              }
              if (discovered.mediaEndpoint) {
                this.plugin.settings.mediaEndpoint = discovered.mediaEndpoint;
              }
              await this.plugin.saveSettings();
              this.display(); // Refresh UI
              new Notice("✅ Endpoints discovered!");
            } catch (err: unknown) {
              new Notice(`Discovery failed: ${String(err)}`);
            } finally {
              btn.setDisabled(false);
              btn.setButtonText("Discover");
            }
          }),
      );

    new Setting(containerEl)
      .setName("Micropub endpoint")
      .setDesc("e.g. https://example.com/micropub")
      .addText((text) =>
        text
          .setPlaceholder("https://example.com/micropub")
          .setValue(this.plugin.settings.micropubEndpoint)
          .onChange(async (value) => {
            this.plugin.settings.micropubEndpoint = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Media endpoint")
      .setDesc(
        "Leave blank to discover automatically from the Micropub config response.",
      )
      .addText((text) =>
        text
          .setPlaceholder("https://example.com/micropub/media")
          .setValue(this.plugin.settings.mediaEndpoint)
          .onChange(async (value) => {
            this.plugin.settings.mediaEndpoint = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    // ── Authentication ───────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Authentication" });

    new Setting(containerEl)
      .setName("Access token")
      .setDesc(
        "Bearer token from your site's IndieAuth token endpoint or admin panel.",
      )
      .addText((text) => {
        text
          .setPlaceholder("your-bearer-token")
          .setValue(this.plugin.settings.accessToken)
          .onChange(async (value) => {
            this.plugin.settings.accessToken = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = "password";
      })
      .addButton((btn) =>
        btn
          .setButtonText("Verify")
          .onClick(async () => {
            if (
              !this.plugin.settings.micropubEndpoint ||
              !this.plugin.settings.accessToken
            ) {
              new Notice("Set endpoint and token first.");
              return;
            }
            btn.setDisabled(true);
            try {
              const client = new MicropubClient(
                () => this.plugin.settings.micropubEndpoint,
                () => this.plugin.settings.mediaEndpoint,
                () => this.plugin.settings.accessToken,
              );
              await client.fetchConfig();
              new Notice("✅ Token is valid!");
            } catch (err: unknown) {
              new Notice(`Auth check failed: ${String(err)}`);
            } finally {
              btn.setDisabled(false);
            }
          }),
      );

    // ── Publish behaviour ────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Publish Behaviour" });

    new Setting(containerEl)
      .setName("Default visibility")
      .setDesc("Applies when the note has no explicit visibility property.")
      .addDropdown((drop) =>
        drop
          .addOption("public", "Public")
          .addOption("unlisted", "Unlisted")
          .addOption("private", "Private")
          .setValue(this.plugin.settings.defaultVisibility)
          .onChange(async (value) => {
            this.plugin.settings.defaultVisibility = value as
              | "public"
              | "unlisted"
              | "private";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Write URL back to note")
      .setDesc(
        "After publishing, store the returned post URL as `mp-url` in the note's " +
        "frontmatter. Subsequent publishes will use this URL to update the post.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.writeUrlToFrontmatter)
          .onChange(async (value) => {
            this.plugin.settings.writeUrlToFrontmatter = value;
            await this.plugin.saveSettings();
          }),
      );

    // ── Digital Garden ───────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Digital Garden" });

    new Setting(containerEl)
      .setName("Map #garden/* tags to gardenStage")
      .setDesc(
        "When enabled, Obsidian tags like #garden/plant are converted to a " +
        "`garden-stage: plant` Micropub property. The Eleventy blog theme renders " +
        "these as growth stage badges and groups posts in the /garden/ index.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.mapGardenTags)
          .onChange(async (value) => {
            this.plugin.settings.mapGardenTags = value;
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl("p", {
      text: "Supported stages: plant 🌱 · cultivate 🌿 · question ❓ · repot 🪴 · revitalize ✨ · revisit 🔄",
      cls: "setting-item-description",
    });
  }
}
