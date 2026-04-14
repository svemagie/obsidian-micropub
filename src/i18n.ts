// src/i18n.ts
import { en } from "./lang/en";
import { de } from "./lang/de";

const locales: Record<string, Record<string, string>> = { en, de };

/**
 * Returns the translated string for `key` in the active Obsidian locale.
 * Falls back to English if the locale or key is missing.
 *
 * Supports `{var}` interpolation:
 *   t("noticePublishFailed", { error: "500" })
 *   → "❌ Publish failed: 500"
 */
export function t(key: string, vars?: Record<string, string>): string {
  const lang = (window.moment?.locale() ?? "en").split("-")[0];
  const map  = locales[lang] ?? locales["en"];
  let str    = map[key] ?? locales["en"][key] ?? key;

  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.split(`{${k}}`).join(v); // replaceAll not available in ES2018
    }
  }
  return str;
}
