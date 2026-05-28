import { MODULE_ID } from "../constants.mjs";
import { TagService } from "../services/tag-service.mjs";
import { TimelineNoteStore } from "../services/note-store.mjs";

const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } = foundry.applications.api;

export class TagSettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "timeline-notes-tag-settings",
    classes: ["timeline-notes", "timeline-notes-tag-settings"],
    tag: "form",
    window: {
      title: "TIMELINE_NOTES.TagSettings.Title",
      resizable: false
    },
    position: {
      width: 480
    }
  };

  static PARTS = {
    tags: {
      template: `modules/${MODULE_ID}/templates/tag-settings.hbs`
    }
  };

  static ACTIONS = {
    "add-tag": async function(event, target) {
      await this.#persistCurrentRows();
      await TagService.create({ name: game.i18n.localize("TIMELINE_NOTES.TagSettings.NewTagName"), color: "#888888" });
      this.render({ force: true });
    },
    "delete-tag": async function(event, target) {
      const tagId = target.dataset.tagId;
      const tag = TagService.get(tagId);
      const proceed = await DialogV2.confirm({
        window: { title: game.i18n.localize("TIMELINE_NOTES.TagDeleteConfirm.Title") },
        content: `<p>${game.i18n.format("TIMELINE_NOTES.TagDeleteConfirm.Content", { name: tag?.name ?? tagId })}</p>`,
        modal: true,
        rejectClose: false
      });
      if (!proceed) return;
      await TagService.delete(tagId);
      await TimelineNoteStore.removeTagFromAll(tagId);
      this.render({ force: true });
    },
    "save-tags": async function(event, target) {
      await this.#persistCurrentRows();
      ui.notifications?.info(game.i18n.localize("TIMELINE_NOTES.TagSettings.Saved"));
    }
  };

  async _prepareContext(options) {
    return {
      ...(await super._prepareContext(options)),
      tags: TagService.list()
    };
  }

  async #persistCurrentRows() {
    const rows = [...this.element.querySelectorAll("[data-tag-id]")];
    const tags = rows.map((row) => ({
      id: row.dataset.tagId,
      name: row.querySelector("input[name='name']")?.value?.trim() ?? "",
      color: row.querySelector("input[name='color']")?.value ?? "#888888"
    }));
    await game.settings.set(MODULE_ID, "tags", tags);
  }
}
