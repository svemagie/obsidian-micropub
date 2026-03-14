/**
 * SettingsTab.ts — Obsidian settings UI for obsidian-micropub
 *
 * Authentication section works like iA Writer:
 *   1. User enters their site URL
 *   2. Clicks "Sign in" — browser opens at their IndieAuth login page
 *   3. They log in with their blog password
 *   4. Browser redirects back; plugin receives the token automatically
 *   5. Settings show "Signed in as <me>" + a Sign Out button
 *
 * Advanced users can still paste a token manually if they prefer.
 */

import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type MicropubPlugin from "./main";
import { MicropubClient } from "./MicropubClient";
import { IndieAuth } from "./IndieAuth";

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

    // ── Site URL + Sign In ───────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Account" });

    // Show current sign-in status
    if (this.plugin.settings.me && this.plugin.settings.accessToken) {
      this.renderSignedIn(containerEl);
    } else {
      this.renderSignedOut(containerEl);
    }

    // ── Endpoints (collapsed / advanced) ────────────────────────────────
    containerEl.createEl("h3", { text: "Endpoints" });

    containerEl.createEl("p", {
      text: "These are filled automatically when you sign in. Only edit them manually if your server uses non-standard paths.",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Micropub endpoint")
      .setDesc("e.g. https://blog.giersig.eu/micropub")
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
      .setDesc("For image uploads. Auto-discovered if blank.")
      .addText((text) =>
        text
          .setPlaceholder("https://example.com/micropub/media")
          .setValue(this.plugin.settings.mediaEndpoint)
          .onChange(async (value) => {
            this.plugin.settings.mediaEndpoint = value.trim();
            await this.plugin.saveSettings();
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
        "After publishing, store the post URL as `mp-url` in frontmatter. " +
        "Subsequent publishes will update the existing post instead of creating a new one.",
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
        "Obsidian tags like #garden/plant become a `garden-stage: plant` Micropub " +
        "property. The blog renders these as growth stage badges at /garden/.",
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
      text: "Stages: plant 🌱 · cultivate 🌿 · question ❓ · repot 🪴 · revitalize ✨ · revisit 🔄",
      cls: "setting-item-description",
    });
  }

  // ── Signed-out state ─────────────────────────────────────────────────────

  private renderSignedOut(containerEl: HTMLElement): void {
    // Site URL input + Sign In button on the same row
    new Setting(containerEl)
      .setName("Site URL")
      .setDesc(
        "Your site's home page. Clicking Sign in opens your blog's login page " +
        "in the browser — the same flow iA Writer uses.",
      )
      .addText((text) =>
        text
          .setPlaceholder("https://blog.giersig.eu")
          .setValue(this.plugin.settings.siteUrl)
          .onChange(async (value) => {
            this.plugin.settings.siteUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      )
      .addButton((btn) => {
        btn
          .setButtonText("Sign in")
          .setCta()
          .onClick(async () => {
            const siteUrl = this.plugin.settings.siteUrl.trim();
            if (!siteUrl) {
              new Notice("Enter your site URL first.");
              return;
            }

            btn.setDisabled(true);
            btn.setButtonText("Opening browser…");

            try {
              const result = await IndieAuth.signIn(siteUrl);

              // Save everything returned by the auth flow
              this.plugin.settings.accessToken      = result.accessToken;
              this.plugin.settings.me               = result.me;
              this.plugin.settings.authorizationEndpoint = result.authorizationEndpoint;
              this.plugin.settings.tokenEndpoint    = result.tokenEndpoint;
              if (result.micropubEndpoint) {
                this.plugin.settings.micropubEndpoint = result.micropubEndpoint;
              }
              if (result.mediaEndpoint) {
                this.plugin.settings.mediaEndpoint = result.mediaEndpoint;
              }

              await this.plugin.saveSettings();

              // Try to fetch the Micropub config to pick up media endpoint
              if (!this.plugin.settings.mediaEndpoint) {
                try {
                  const client = new MicropubClient(
                    () => this.plugin.settings.micropubEndpoint,
                    () => this.plugin.settings.mediaEndpoint,
                    () => this.plugin.settings.accessToken,
                  );
                  const cfg = await client.fetchConfig();
                  if (cfg["media-endpoint"]) {
                    this.plugin.settings.mediaEndpoint = cfg["media-endpoint"];
                    await this.plugin.saveSettings();
                  }
                } catch {
                  // Non-fatal
                }
              }

              new Notice(`✅ Signed in as ${result.me}`);
              this.display(); // Refresh to show signed-in state
            } catch (err: unknown) {
              new Notice(`Sign-in failed: ${String(err)}`, 8000);
              btn.setDisabled(false);
              btn.setButtonText("Sign in");
            }
          });
      });

    // Divider + manual token fallback (collapsed by default)
    const details = containerEl.createEl("details");
    details.createEl("summary", {
      text: "Or paste a token manually",
      cls: "setting-item-description",
    });
    details.style.marginTop = "8px";
    details.style.marginBottom = "8px";

    new Setting(details)
      .setName("Access token")
      .setDesc("Bearer token from your Indiekit admin panel.")
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
        btn.setButtonText("Verify").onClick(async () => {
          if (
            !this.plugin.settings.micropubEndpoint ||
            !this.plugin.settings.accessToken
          ) {
            new Notice("Set the Micropub endpoint and token first.");
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
            new Notice(`Token check failed: ${String(err)}`);
          } finally {
            btn.setDisabled(false);
          }
        }),
      );
  }

  // ── Signed-in state ──────────────────────────────────────────────────────

  private renderSignedIn(containerEl: HTMLElement): void {
    const me = this.plugin.settings.me;

    // Avatar + "Signed in as" banner
    const banner = containerEl.createDiv({
      cls: "micropub-auth-banner",
    });
    banner.style.cssText =
      "display:flex;align-items:center;gap:12px;padding:12px 16px;" +
      "border:1px solid var(--background-modifier-border);" +
      "border-radius:8px;margin-bottom:16px;background:var(--background-secondary);";

    const icon = banner.createDiv();
    icon.style.cssText =
      "width:40px;height:40px;border-radius:50%;background:var(--interactive-accent);" +
      "display:flex;align-items:center;justify-content:center;" +
      "font-size:1.2rem;flex-shrink:0;";
    icon.textContent = "🌐";

    const info = banner.createDiv();
    info.createEl("div", {
      text: "Signed in",
      attr: { style: "font-size:.75rem;color:var(--text-muted);margin-bottom:2px" },
    });
    info.createEl("div", {
      text: me,
      attr: { style: "font-weight:500;word-break:break-all" },
    });

    new Setting(containerEl)
      .setName("Site URL")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.siteUrl)
          .setDisabled(true),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Sign out")
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.accessToken = "";
            this.plugin.settings.me = "";
            this.plugin.settings.authorizationEndpoint = "";
            this.plugin.settings.tokenEndpoint = "";
            await this.plugin.saveSettings();
            this.display();
          }),
      );
  }
}
