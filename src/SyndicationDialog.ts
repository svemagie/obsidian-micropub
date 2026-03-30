/**
 * SyndicationDialog.ts
 *
 * Modal that lets the user choose which syndication targets to cross-post to.
 * Opens as a promise — resolves with the selected UIDs, or null if cancelled.
 */

import { App, Modal, Setting } from "obsidian";
import type { SyndicationTarget } from "./types";

export class SyndicationDialog extends Modal {
  private selected: Set<string>;
  private resolvePromise: ((value: string[] | null) => void) | null = null;
  private resolved = false;

  constructor(
    app: App,
    private readonly targets: SyndicationTarget[],
    defaultSelected: string[],
  ) {
    super(app);
    this.selected = new Set(defaultSelected.filter((uid) =>
      targets.some((t) => t.uid === uid),
    ));
  }

  /**
   * Opens the dialog and waits for user selection.
   * @returns Selected target UIDs, or null if cancelled.
   */
  async awaitSelection(): Promise<string[] | null> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Syndication targets" });
    contentEl.createEl("p", {
      text: "Choose where to cross-post this note.",
      cls: "setting-item-description",
    });

    for (const target of this.targets) {
      new Setting(contentEl)
        .setName(target.name)
        .addToggle((toggle) =>
          toggle
            .setValue(this.selected.has(target.uid))
            .onChange((value) => {
              if (value) this.selected.add(target.uid);
              else this.selected.delete(target.uid);
            }),
        );
    }

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Cancel")
          .onClick(() => {
            this.finish(null);
          }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Publish")
          .setCta()
          .onClick(() => {
            this.finish([...this.selected]);
          }),
      );
  }

  onClose(): void {
    // Resolve as cancelled if user pressed Escape or clicked outside
    this.finish(null);
    this.contentEl.empty();
  }

  private finish(value: string[] | null): void {
    if (this.resolved) return;
    this.resolved = true;
    this.resolvePromise?.(value);
    this.resolvePromise = null;
  }
}
