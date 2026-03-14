/**
 * IndieAuth.ts — IndieAuth PKCE sign-in flow for obsidian-micropub
 *
 * Why no local HTTP server:
 *   IndieKit (and most IndieAuth servers) fetch the client_id URL server-side
 *   to retrieve app metadata. A local 127.0.0.1 address is unreachable from a
 *   remote server, so that approach always fails with "fetch failed".
 *
 * The solution — GitHub Pages relay:
 *   client_id  = https://svemagie.github.io/obsidian-micropub/
 *   redirect_uri = https://svemagie.github.io/obsidian-micropub/callback
 *
 *   Both are on the same host → IndieKit's host-matching check passes ✓
 *   The callback page is a static HTML file that immediately redirects to
 *   obsidian://micropub-auth?code=CODE&state=STATE
 *   Obsidian's protocol handler (registered in main.ts) receives the code.
 *
 * Flow:
 *   1. Discover authorization_endpoint + token_endpoint from site HTML
 *   2. Generate PKCE code_verifier + code_challenge (SHA-256)
 *   3. Open browser → user's IndieAuth login page
 *   4. User logs in → server redirects to GitHub Pages callback
 *   5. Callback page redirects to obsidian://micropub-auth?code=...
 *   6. Plugin protocol handler resolves the pending Promise
 *   7. Exchange code for token at token_endpoint
 */

import * as crypto from "crypto";
import { requestUrl } from "obsidian";

export const CLIENT_ID   = "https://svemagie.github.io/obsidian-micropub/";
export const REDIRECT_URI = "https://svemagie.github.io/obsidian-micropub/callback";

const SCOPE = "create update media";
const AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface IndieAuthResult {
  accessToken: string;
  scope: string;
  /** Canonical "me" URL returned by the token endpoint */
  me: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  micropubEndpoint?: string;
  mediaEndpoint?: string;
}

export interface DiscoveredEndpoints {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  micropubEndpoint?: string;
}

/** Pending callback set by main.ts protocol handler */
let pendingCallback:
  | { resolve: (params: Record<string, string>) => void; state: string }
  | null = null;

/**
 * Called by the Obsidian protocol handler in main.ts when
 * obsidian://micropub-auth is opened by the browser.
 */
export function handleProtocolCallback(params: Record<string, string>): void {
  if (!pendingCallback) return;

  const { resolve, state: expectedState } = pendingCallback;
  pendingCallback = null;
  resolve(params); // let signIn() validate state + extract code
}

export class IndieAuth {
  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Discover IndieAuth + Micropub endpoint URLs from the site's home page
   * by reading <link rel="..."> tags in the HTML <head>.
   */
  static async discoverEndpoints(siteUrl: string): Promise<DiscoveredEndpoints> {
    const resp = await requestUrl({ url: siteUrl, method: "GET" });
    const html = resp.text;

    const authorizationEndpoint = IndieAuth.extractLinkRel(html, "authorization_endpoint");
    const tokenEndpoint         = IndieAuth.extractLinkRel(html, "token_endpoint");
    const micropubEndpoint      = IndieAuth.extractLinkRel(html, "micropub");

    if (!authorizationEndpoint) {
      throw new Error(
        `No <link rel="authorization_endpoint"> found at ${siteUrl}. ` +
        "Make sure Indiekit is running and SITE_URL is set correctly.",
      );
    }
    if (!tokenEndpoint) {
      throw new Error(`No <link rel="token_endpoint"> found at ${siteUrl}.`);
    }

    return { authorizationEndpoint, tokenEndpoint, micropubEndpoint };
  }

  /**
   * Run the full IndieAuth PKCE sign-in flow.
   *
   * Opens the browser at the user's IndieAuth login page. After login the
   * browser is redirected to the GitHub Pages callback, which triggers
   * the obsidian://micropub-auth protocol, which resolves the Promise here.
   *
   * Requires handleProtocolCallback() to be wired up in main.ts via
   * this.registerObsidianProtocolHandler("micropub-auth", handleProtocolCallback)
   */
  static async signIn(siteUrl: string): Promise<IndieAuthResult> {
    // 1. Discover endpoints
    const { authorizationEndpoint, tokenEndpoint, micropubEndpoint } =
      await IndieAuth.discoverEndpoints(siteUrl);

    // 2. Generate PKCE + state
    const state        = IndieAuth.base64url(crypto.randomBytes(16));
    const codeVerifier = IndieAuth.base64url(crypto.randomBytes(64));
    const codeChallenge = IndieAuth.base64url(
      crypto.createHash("sha256").update(codeVerifier).digest(),
    );

    // 3. Register pending callback — resolved by handleProtocolCallback()
    const callbackPromise = new Promise<Record<string, string>>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingCallback = null;
          reject(new Error("Sign-in timed out (5 min). Please try again."));
        }, AUTH_TIMEOUT_MS);

        pendingCallback = {
          state,
          resolve: (params) => {
            clearTimeout(timeout);
            resolve(params);
          },
        };
      },
    );

    // 4. Build the authorization URL and open the browser
    const authUrl = new URL(authorizationEndpoint);
    authUrl.searchParams.set("response_type",        "code");
    authUrl.searchParams.set("client_id",            CLIENT_ID);
    authUrl.searchParams.set("redirect_uri",         REDIRECT_URI);
    authUrl.searchParams.set("state",                state);
    authUrl.searchParams.set("code_challenge",       codeChallenge);
    authUrl.searchParams.set("code_challenge_method","S256");
    authUrl.searchParams.set("scope",                SCOPE);
    authUrl.searchParams.set("me",                   siteUrl);

    window.open(authUrl.toString());

    // 5. Wait for obsidian://micropub-auth to be called
    const callbackParams = await callbackPromise;

    // 6. Validate state (CSRF protection)
    if (callbackParams.state !== state) {
      throw new Error("State mismatch — possible CSRF attack. Please try again.");
    }

    const code = callbackParams.code;
    if (!code) {
      throw new Error(
        callbackParams.error_description ??
        callbackParams.error ??
        "No authorization code received.",
      );
    }

    // 7. Exchange code for token
    const tokenResp = await requestUrl({
      url: tokenEndpoint,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type:    "authorization_code",
        code,
        client_id:     CLIENT_ID,
        redirect_uri:  REDIRECT_URI,
        code_verifier: codeVerifier,
      }).toString(),
      throw: false,
    });

    const data = tokenResp.json as {
      access_token?: string;
      scope?: string;
      me?: string;
      error?: string;
      error_description?: string;
    };

    if (!data.access_token) {
      throw new Error(
        data.error_description ??
        data.error ??
        `Token exchange failed (HTTP ${tokenResp.status})`,
      );
    }

    return {
      accessToken:           data.access_token,
      scope:                 data.scope ?? SCOPE,
      me:                    data.me ?? siteUrl,
      authorizationEndpoint,
      tokenEndpoint,
      micropubEndpoint,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private static base64url(buf: Buffer): string {
    return buf.toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }

  static extractLinkRel(html: string, rel: string): string | undefined {
    const re = new RegExp(
      `<link[^>]+rel=["'][^"']*\\b${rel}\\b[^"']*["'][^>]+href=["']([^"']+)["']` +
      `|<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*\\b${rel}\\b[^"']*["']`,
      "i",
    );
    const m = html.match(re);
    return m?.[1] ?? m?.[2];
  }
}
