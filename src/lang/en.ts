// src/lang/en.ts
export const en: Record<string, string> = {
  // Commands & ribbon
  cmdPublish:              "Publish to Micropub",
  cmdUpdate:               "Update existing Micropub post",

  // Notices — main.ts
  noticeOpenNote:          "Open a Markdown note to publish.",
  noticeNoEndpoint:        "⚠️ Micropub endpoint not configured. Open plugin settings to add it.",
  noticeNoToken:           "⚠️ Access token not configured. Open plugin settings to add it.",
  noticePublishing:        "Publishing…",
  noticePublished:         "✅ Published!",
  noticePublishFailed:     "❌ Publish failed: {error}",
  noticeError:             "❌ Error: {error}",
  noticeNoSyndTargets:     "⚠️ Could not fetch syndication targets. Publishing without dialog.",

  // Settings headings
  settingsTitle:           "Micropub Publisher",
  settingsAccount:         "Account",
  settingsEndpoints:       "Endpoints",
  settingsEndpointsHint:   "These are filled automatically when you sign in. Only edit them manually if your server uses non-standard paths.",
  settingsPublishBehaviour:"Publish Behaviour",
  settingsDigitalGarden:   "Digital Garden",

  // Settings — endpoints
  settingMicropubEndpoint: "Micropub endpoint",
  settingMicropubEndpointDesc: "e.g. https://example.com/micropub", // intentional: replaces personal domain in source
  settingMediaEndpoint:    "Media endpoint",
  settingMediaEndpointDesc:"For image uploads. Auto-discovered if blank.",

  // Settings — publish behaviour
  settingVisibility:       "Default visibility",
  settingVisibilityDesc:   "Applies when the note has no explicit visibility property.",
  visibilityPublic:        "Public",
  visibilityUnlisted:      "Unlisted",
  visibilityPrivate:       "Private",

  settingWriteUrl:         "Write URL back to note",
  settingWriteUrlDesc:     "After publishing, store the post URL as `mp-url` in frontmatter. Subsequent publishes will update the existing post instead of creating a new one.",

  settingSyndDialog:       "Syndication dialog",
  settingSyndDialogDesc:   "When to show the cross-posting dialog before publishing. 'When needed' shows it only if the note has no mp-syndicate-to frontmatter.",
  syndDialogWhenNeeded:    "When needed",
  syndDialogAlways:        "Always",
  syndDialogNever:         "Never",

  settingSyndDefaults:     "Default syndication targets",
  settingSyndDefaultsNone: "None configured. Targets checked by default in the publish dialog.",
  btnClearDefaults:        "Clear defaults",

  // Settings — digital garden
  settingGardenTags:       "Map #garden/* tags to gardenStage",
  settingGardenTagsDesc:   "Obsidian tags like #garden/plant become a `garden-stage: plant` Micropub property. The blog renders these as growth stage badges at /garden/.",
  settingGardenStages:     "Stages: plant 🌱 · cultivate 🌿 · question ❓ · repot 🪴 · revitalize ✨ · revisit 🔄",

  // Settings — sign-in / sign-out
  settingSiteUrl:          "Site URL",
  settingSiteUrlDesc:      "Your site's home page. Clicking Sign in opens your blog's login page in the browser — the same flow iA Writer uses.",
  settingSiteUrlPlaceholder: "https://example.com", // intentional: replaces personal domain in source
  btnSignIn:               "Sign in",
  btnOpeningBrowser:       "Opening browser…",
  noticeEnterSiteUrl:      "Enter your site URL first.",
  noticeSignedInAs:        "✅ Signed in as {me}",
  noticeSignInFailed:      "Sign-in failed: {error}",
  lblSignedIn:             "Signed in",
  btnSignOut:              "Sign out",
  manualTokenSummary:      "Or paste a token manually",
  settingAccessToken:      "Access token",
  settingAccessTokenDesc:  "Bearer token from your Indiekit admin panel.",
  btnVerify:               "Verify",
  noticeSetEndpointFirst:  "Set the Micropub endpoint and token first.",
  noticeTokenValid:        "✅ Token is valid!",
  noticeTokenCheckFailed:  "Token check failed: {error}",

  // Syndication dialog
  syndDialogTitle:         "Syndication targets",
  syndDialogSubtitle:      "Choose where to cross-post this note.",
  btnCancel:               "Cancel",
  btnPublish:              "Publish",

  // IndieAuth
  errSignInTimeout:        "Sign-in timed out (5 min). Please try again.",
};
