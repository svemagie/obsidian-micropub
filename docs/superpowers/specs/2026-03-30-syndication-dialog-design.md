# Syndication Dialog Design

**Date:** 2026-03-30
**Status:** Approved
**Scope:** obsidian-micropub plugin feature

---

## 1. Overview

Add a dialog that appears when publishing to Micropub, allowing users to select which syndication targets (e.g., Twitter, Mastodon) to cross-post to. The dialog integrates with the existing `?q=config` Micropub endpoint to fetch available targets.

---

## 2. User Flow

1. User clicks "Publish to Micropub"
2. Plugin fetches `?q=config` to get available syndication targets
3. Plugin checks frontmatter for `mp-syndicate-to`:
   - **Has values** → use those, skip dialog, publish
   - **Empty array `[]`** → force dialog
   - **Absent** → show dialog with defaults pre-checked
4. Dialog displays checkboxes for each target from server
5. User confirms → publish with selected targets
6. Successful publish writes `mp-syndicate-to` to frontmatter

---

## 3. Configuration

### New Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `showSyndicationDialog` | enum | `"when-needed"` | When to show the dialog |
| `defaultSyndicateTo` | string[] | `[]` | Targets checked by default |

### `showSyndicationDialog` Options

- `"when-needed"` — Show only if `mp-syndicate-to` is absent from frontmatter
- `"always"` — Show every time user publishes
- `"never"` — Use defaults, never show dialog

### Frontmatter Support

Users can bypass the dialog per-note using frontmatter:

```yaml
---
# Skip dialog, auto-syndicate to these targets
mp-syndicate-to: [twitter, mastodon]

# Force dialog even with defaults set
mp-syndicate-to: []
---
```

---

## 4. Components

### 4.1 SyndicationDialog (New)

**Location:** `src/SyndicationDialog.ts`

**Responsibilities:**
- Render modal with checkbox list of targets
- Pre-check targets from `defaultSyndicateTo` setting
- Handle OK/Cancel actions
- Return selected target UIDs

**Interface:**
```typescript
export class SyndicationDialog extends Modal {
  constructor(
    app: App,
    targets: SyndicationTarget[],
    defaultSelected: string[],
    onConfirm: (selected: string[]) => void,
    onCancel: () => void
  );
}
```

### 4.2 Publisher (Modified)

**Changes:**
- Accept optional `syndicateToOverride?: string[]` parameter
- Merge override with frontmatter values (override wins)
- Write `mp-syndicate-to` to frontmatter on successful publish

### 4.3 SettingsTab (Modified)

**Changes:**
- Add dropdown for `showSyndicationDialog` behavior
- Display currently configured default targets (read-only list)
- Add button to clear defaults

### 4.4 main.ts (Modified)

**Changes:**
- Before calling `publishActiveNote`:
  1. Fetch `?q=config` for syndication targets
  2. Check frontmatter for `mp-syndicate-to`
  3. Decide whether to show dialog based on setting + frontmatter
  4. If showing dialog, wait for user selection
  5. Call `publisher.publish()` with selected targets

---

## 5. Data Flow

```
User clicks "Publish"
       │
       ▼
Fetch ?q=config ──► Check frontmatter mp-syndicate-to
       │                      │
       │         ┌─────────────┼─────────────┐
       │         │             │             │
       │    Has values     Absent         Empty []
       │    (skip dialog)  (show dialog)  (show dialog)
       │         │             │             │
       │         └─────────────┴─────────────┘
       │                       │
       ▼                       ▼
SyndicationDialog (if needed)
       │
       ▼
Publisher.publish(selectedTargets?)
       │
       ▼
Write mp-syndicate-to to frontmatter
```

---

## 6. Error Handling

| Scenario | Behavior |
|----------|----------|
| `?q=config` fails | Warn user, offer to publish without syndication or cancel |
| Dialog canceled | Abort publish, no changes |
| Micropub POST fails | Don't write `mp-syndicate-to` to frontmatter |
| No targets returned from server | Skip dialog, publish normally (backward compatible) |

---

## 7. UI/UX Details

### Dialog Layout

```
┌─────────────────────────────────────────┐
│  Publish to Syndication Targets         │
├─────────────────────────────────────────┤
│                                         │
│  [✓] Twitter (@username)                │
│  [✓] Mastodon (@user@instance)          │
│  [ ] LinkedIn                           │
│                                         │
├─────────────────────────────────────────┤
│  [Cancel]              [Publish]      │
└─────────────────────────────────────────┘
```

### Settings UI Addition

```
Publish Behaviour
├── Default visibility: [public ▼]
├── Write URL back to note: [✓]
├── Syndication dialog: [when-needed ▼]
│   └── when-needed: Show only if no mp-syndicate-to
├── Default syndication targets:
│   └── twitter, mastodon [Clear defaults]
└── ...
```

---

## 8. Edge Cases

1. **User has no syndication targets configured on server** — Skip dialog, publish normally
2. **User cancels dialog** — Abort publish entirely, no state changes
3. **Micropub server returns targets but some are invalid** — Show all, let server reject invalid ones
4. **User changes targets in settings after publishing** — Affects future publishes only, doesn't retroactively change existing `mp-syndicate-to` frontmatter

---

## 9. Backward Compatibility

- Default `showSyndicationDialog: "when-needed"` means existing behavior unchanged for notes without frontmatter
- Existing `mp-syndicate-to` frontmatter values continue to work
- Plugin remains compatible with servers that don't return syndication targets

---

## 10. Testing Considerations

- Unit test: `SyndicationDialog` renders checkboxes correctly
- Unit test: Frontmatter parsing handles `mp-syndicate-to` array
- Unit test: Setting `"never"` skips dialog
- Integration test: Full flow from click to publish with targets
- Edge case: Server returns empty targets array
- Edge case: User cancels dialog

---

## Approval

**Approved by:** @svemagie
**Date:** 2026-03-30
