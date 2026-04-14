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
import { t } from "./i18n";

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

    containerEl.createEl("h2", { text: t("settingsTitle") });

    // ── Site URL + Sign In ───────────────────────────────────────────────
    containerEl.createEl("h3", { text: t("settingsAccount") });

    // Show current sign-in status
    if (this.plugin.settings.me && this.plugin.settings.accessToken) {
      this.renderSignedIn(containerEl);
    } else {
      this.renderSignedOut(containerEl);
    }

    // ── Endpoints (collapsed / advanced) ────────────────────────────────
    containerEl.createEl("h3", { text: t("settingsEndpoints") });

    containerEl.createEl("p", {
      text: t("settingsEndpointsHint"),
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName(t("settingMicropubEndpoint"))
      .setDesc(t("settingMicropubEndpointDesc"))
      .addText((text) =>
        text
          .setPlaceholder(t("settingMicropubEndpointPlaceholder"))
          .setValue(this.plugin.settings.micropubEndpoint)
          .onChange(async (value) => {
            this.plugin.settings.micropubEndpoint = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settingMediaEndpoint"))
      .setDesc(t("settingMediaEndpointDesc"))
      .addText((text) =>
        text
          .setPlaceholder(t("settingMediaEndpointPlaceholder"))
          .setValue(this.plugin.settings.mediaEndpoint)
          .onChange(async (value) => {
            this.plugin.settings.mediaEndpoint = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    // ── Publish behaviour ────────────────────────────────────────────────
    containerEl.createEl("h3", { text: t("settingsPublishBehaviour") });

    new Setting(containerEl)
      .setName(t("settingVisibility"))
      .setDesc(t("settingVisibilityDesc"))
      .addDropdown((drop) =>
        drop
          .addOption("public", t("visibilityPublic"))
          .addOption("unlisted", t("visibilityUnlisted"))
          .addOption("private", t("visibilityPrivate"))
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
      .setName(t("settingWriteUrl"))
      .setDesc(t("settingWriteUrlDesc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.writeUrlToFrontmatter)
          .onChange(async (value) => {
            this.plugin.settings.writeUrlToFrontmatter = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settingSyndDialog"))
      .setDesc(t("settingSyndDialogDesc"))
      .addDropdown((drop) =>
        drop
          .addOption("when-needed", t("syndDialogWhenNeeded"))
          .addOption("always", t("syndDialogAlways"))
          .addOption("never", t("syndDialogNever"))
          .setValue(this.plugin.settings.showSyndicationDialog)
          .onChange(async (value) => {
            this.plugin.settings.showSyndicationDialog = value as
              | "when-needed"
              | "always"
              | "never";
            await this.plugin.saveSettings();
          }),
      );

    // Show configured defaults with a clear button
    const defaults = this.plugin.settings.defaultSyndicateTo;
    const defaultsSetting = new Setting(containerEl)
      .setName(t("settingSyndDefaults"))
      .setDesc(
        defaults.length > 0
          ? defaults.join(", ")
          : t("settingSyndDefaultsNone"),
      );
    if (defaults.length > 0) {
      defaultsSetting.addButton((btn) =>
        btn
          .setButtonText(t("btnClearDefaults"))
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.defaultSyndicateTo = [];
            await this.plugin.saveSettings();
            this.display();
          }),
      );
    }

    // ── Digital Garden ───────────────────────────────────────────────────
    containerEl.createEl("h3", { text: t("settingsDigitalGarden") });

    new Setting(containerEl)
      .setName(t("settingGardenTags"))
      .setDesc(t("settingGardenTagsDesc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.mapGardenTags)
          .onChange(async (value) => {
            this.plugin.settings.mapGardenTags = value;
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl("p", {
      text: t("settingGardenStages"),
      cls: "setting-item-description",
    });
  }

  // ── Signed-out state ─────────────────────────────────────────────────────

  private renderSignedOut(containerEl: HTMLElement): void {
    // Site URL input + Sign In button on the same row
    new Setting(containerEl)
      .setName(t("settingSiteUrl"))
      .setDesc(t("settingSiteUrlDesc"))
      .addText((text) =>
        text
          .setPlaceholder(t("settingSiteUrlPlaceholder"))
          .setValue(this.plugin.settings.siteUrl)
          .onChange(async (value) => {
            this.plugin.settings.siteUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      )
      .addButton((btn) => {
        btn
          .setButtonText(t("btnSignIn"))
          .setCta()
          .onClick(async () => {
            const siteUrl = this.plugin.settings.siteUrl.trim();
            if (!siteUrl) {
              new Notice(t("noticeEnterSiteUrl"));
              return;
            }

            btn.setDisabled(true);
            btn.setButtonText(t("btnOpeningBrowser"));

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

              new Notice(t("noticeSignedInAs", { me: result.me }));
              this.display(); // Refresh to show signed-in state
            } catch (err: unknown) {
              new Notice(t("noticeSignInFailed", { error: String(err) }), 8000);
              btn.setDisabled(false);
              btn.setButtonText(t("btnSignIn"));
            }
          });
      });

    // Divider + manual token fallback (collapsed by default)
    const details = containerEl.createEl("details");
    details.createEl("summary", {
      text: t("manualTokenSummary"),
      cls: "setting-item-description",
    });
    details.style.marginTop = "8px";
    details.style.marginBottom = "8px";

    new Setting(details)
      .setName(t("settingAccessToken"))
      .setDesc(t("settingAccessTokenDesc"))
      .addText((text) => {
        text
          .setPlaceholder(t("settingAccessTokenPlaceholder"))
          .setValue(this.plugin.settings.accessToken)
          .onChange(async (value) => {
            this.plugin.settings.accessToken = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = "password";
      })
      .addButton((btn) =>
        btn.setButtonText(t("btnVerify")).onClick(async () => {
          if (
            !this.plugin.settings.micropubEndpoint ||
            !this.plugin.settings.accessToken
          ) {
            new Notice(t("noticeSetEndpointFirst"));
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
            new Notice(t("noticeTokenValid"));
          } catch (err: unknown) {
            new Notice(t("noticeTokenCheckFailed", { error: String(err) }));
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
      text: t("lblSignedIn"),
      attr: { style: "font-size:.75rem;color:var(--text-muted);margin-bottom:2px" },
    });
    info.createEl("div", {
      text: me,
      attr: { style: "font-weight:500;word-break:break-all" },
    });

    new Setting(containerEl)
      .setName(t("settingSiteUrl"))
      .addText((text) =>
        text
          .setValue(this.plugin.settings.siteUrl)
          .setDisabled(true),
      )
      .addButton((btn) =>
        btn
          .setButtonText(t("btnSignOut"))
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
