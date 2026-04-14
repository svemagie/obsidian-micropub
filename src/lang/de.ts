// src/lang/de.ts
export const de: Record<string, string> = {
  // Commands & ribbon
  cmdPublish:              "An Micropub veröffentlichen",
  cmdUpdate:               "Bestehenden Micropub-Beitrag aktualisieren",

  // Notices — main.ts
  noticeOpenNote:          "Öffne eine Markdown-Notiz zum Veröffentlichen.",
  noticeNoEndpoint:        "⚠️ Micropub-Endpunkt nicht konfiguriert. Bitte in den Plugin-Einstellungen eintragen.",
  noticeNoToken:           "⚠️ Zugriffstoken nicht konfiguriert. Bitte in den Plugin-Einstellungen eintragen.",
  noticePublishing:        "Wird veröffentlicht…",
  noticePublished:         "✅ Veröffentlicht!",
  noticePublishFailed:     "❌ Veröffentlichung fehlgeschlagen: {error}",
  noticeError:             "❌ Fehler: {error}",
  noticeNoSyndTargets:     "⚠️ Syndizierungsziele konnten nicht abgerufen werden. Veröffentlichung ohne Dialog.",

  // Settings headings
  settingsTitle:           "Micropub Publisher",
  settingsAccount:         "Konto",
  settingsEndpoints:       "Endpunkte",
  settingsEndpointsHint:   "Diese werden beim Anmelden automatisch ausgefüllt. Nur manuell bearbeiten, wenn der Server nicht standardmäßige Pfade verwendet.",
  settingsPublishBehaviour:"Veröffentlichungsverhalten",
  settingsDigitalGarden:   "Digitaler Garten",

  // Settings — endpoints
  settingMicropubEndpoint: "Micropub-Endpunkt",
  settingMicropubEndpointDesc: "z. B. https://example.com/micropub",
  settingMicropubEndpointPlaceholder: "https://example.com/micropub",
  settingMediaEndpoint:    "Medien-Endpunkt",
  settingMediaEndpointDesc:"Für Bild-Uploads. Wird automatisch ermittelt, wenn leer.",
  settingMediaEndpointPlaceholder:    "https://example.com/micropub/media",

  // Settings — publish behaviour
  settingVisibility:       "Standard-Sichtbarkeit",
  settingVisibilityDesc:   "Gilt, wenn die Notiz keine explizite Sichtbarkeits-Eigenschaft hat.",
  visibilityPublic:        "Öffentlich",
  visibilityUnlisted:      "Nicht gelistet",
  visibilityPrivate:       "Privat",

  settingWriteUrl:         "URL zurück in Notiz schreiben",
  settingWriteUrlDesc:     "Nach der Veröffentlichung wird die Beitrags-URL als `mp-url` im Frontmatter gespeichert. Spätere Veröffentlichungen aktualisieren den Beitrag statt einen neuen zu erstellen.",

  settingSyndDialog:       "Syndizierungsdialog",
  settingSyndDialogDesc:   "Wann der Dialog zum Querverweis vor der Veröffentlichung angezeigt wird. 'Bei Bedarf' zeigt ihn nur, wenn kein mp-syndicate-to im Frontmatter vorhanden ist.",
  syndDialogWhenNeeded:    "Bei Bedarf",
  syndDialogAlways:        "Immer",
  syndDialogNever:         "Nie",

  settingSyndDefaults:     "Standard-Syndizierungsziele",
  settingSyndDefaultsNone: "Keine konfiguriert. Im Veröffentlichungsdialog standardmäßig aktivierte Ziele.",
  btnClearDefaults:        "Standards löschen",

  // Settings — digital garden
  settingGardenTags:       "#garden/*-Tags zu gardenStage zuordnen",
  settingGardenTagsDesc:   "Obsidian-Tags wie #garden/plant werden zur Micropub-Eigenschaft `garden-stage: plant`. Der Blog zeigt diese als Wachstumsstufen-Abzeichen unter /garden/ an.",
  settingGardenStages:     "Stufen: plant 🌱 · cultivate 🌿 · question ❓ · repot 🪴 · revitalize ✨ · revisit 🔄",

  // Settings — sign-in / sign-out
  settingSiteUrl:          "Website-URL",
  settingSiteUrlDesc:      "Startseite deiner Website. Klick auf Anmelden öffnet die Login-Seite deines Blogs im Browser.",
  settingSiteUrlPlaceholder: "https://example.com", // intentional: replaces personal domain in source
  btnSignIn:               "Anmelden",
  btnOpeningBrowser:       "Browser wird geöffnet…",
  noticeEnterSiteUrl:      "Bitte zuerst die Website-URL eingeben.",
  noticeSignedInAs:        "✅ Angemeldet als {me}",
  noticeSignInFailed:      "Anmeldung fehlgeschlagen: {error}",
  lblSignedIn:             "Angemeldet",
  btnSignOut:              "Abmelden",
  manualTokenSummary:      "Oder Token manuell einfügen",
  settingAccessToken:      "Zugriffstoken",
  settingAccessTokenDesc:  "Bearer-Token aus deinem Indiekit-Adminbereich.",
  settingAccessTokenPlaceholder:      "your-bearer-token",
  btnVerify:               "Prüfen",
  noticeSetEndpointFirst:  "Bitte zuerst Micropub-Endpunkt und Token eingeben.",
  noticeTokenValid:        "✅ Token ist gültig!",
  noticeTokenCheckFailed:  "Token-Prüfung fehlgeschlagen: {error}",

  // Syndication dialog
  syndDialogTitle:         "Syndizierungsziele",
  syndDialogSubtitle:      "Wo soll diese Notiz gleichzeitig veröffentlicht werden?",
  btnCancel:               "Abbrechen",
  btnPublish:              "Veröffentlichen",

  // IndieAuth
  errSignInTimeout:        "Anmeldung abgelaufen (5 Min.). Bitte erneut versuchen.",
};
