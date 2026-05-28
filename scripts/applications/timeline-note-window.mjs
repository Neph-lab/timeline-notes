import { MODULE_ID, VISIBILITY } from "../constants.mjs";
import { CalendarService } from "../services/calendar-service.mjs";
import { TimelineNotePermissions } from "../services/permissions.mjs";
import { TimelineNoteStore } from "../services/note-store.mjs";
import { TagService, getAuthorDisplay } from "../services/tag-service.mjs";

function escapeHTML(value) {
  const element = document.createElement("span");
  element.textContent = value ?? "";
  return element.innerHTML;
}

function getTextEditor() {
  return foundry.applications.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
}

function getProseMirrorContent(form) {
  const data = new FormData(form);
  const proseMirror = form.querySelector("prose-mirror[name='content']");
  const value = proseMirror?.value ?? proseMirror?.editor?.view?.dom?.innerHTML ?? data.get("content");

  return String(value ?? "");
}

function formatDateInput(date) {
  return CalendarService.formatDate(date);
}

function formatTimeInput(time) {
  return CalendarService.formatTime(time);
}

function parseDateInput(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return { year, month, day };
}

function parseTimeInput(value) {
  const [hour = 0, minute = 0, second = 0] = String(value).split(":").map(Number);
  return { hour, minute, second };
}

function visibilityOptions(selected) {
  return Object.entries({
    [VISIBILITY.PRIVATE]: "TIMELINE_NOTES.Visibility.Private",
    [VISIBILITY.VIEW]: "TIMELINE_NOTES.Visibility.View",
    [VISIBILITY.EDIT]: "TIMELINE_NOTES.Visibility.Edit"
  }).map(([value, label]) => `
    <label>
      <input type="radio" name="visibility" value="${value}" ${selected === value ? "checked" : ""}>
      <span>${game.i18n.localize(label)}</span>
    </label>
  `).join("");
}

function tagCheckboxes(allTags, selectedIds) {
  if (!allTags.length) {
    return `<p class="timeline-note-window__no-tags">${game.i18n.localize("TIMELINE_NOTES.Note.NoTags")}</p>`;
  }
  return allTags.map((tag) => `
    <label class="timeline-note-window__tag-option">
      <input type="checkbox" name="tags" value="${escapeHTML(tag.id)}" ${selectedIds.includes(tag.id) ? "checked" : ""}>
      <span class="timeline-note-window__tag-swatch" style="background:${escapeHTML(tag.color)}"></span>
      <span>${escapeHTML(tag.name)}</span>
    </label>
  `).join("");
}

export class TimelineNoteWindow extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["timeline-notes", "timeline-note-window"],
    tag: "section",
    window: {
      frame: true,
      positioned: true,
      resizable: true,
      title: "TIMELINE_NOTES.Document.TimelineNote"
    },
    position: {
      width: 520,
      height: 500
    }
  };

  constructor(noteId, options = {}) {
    super({
      id: `timeline-note-window-${noteId}`,
      ...options
    });
    this.noteId = noteId;
    this.editing = options.editing ?? false;
  }

  get note() {
    return TimelineNoteStore.get(this.noteId);
  }

  async _renderHTML() {
    const note = this.note;
    if (!note) {
      const missing = document.createElement("section");
      missing.className = "timeline-note-window__missing";
      missing.textContent = game.i18n.localize("TIMELINE_NOTES.Note.Missing");
      return missing;
    }

    const editable = TimelineNotePermissions.canEdit(note);
    const content = this.editing && editable ? await this.#renderEditMode(note) : await this.#renderViewMode(note, editable);
    const element = document.createElement("section");
    element.className = "timeline-note-window__content";
    element.innerHTML = content;
    return element;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    this.element.querySelector("[data-action='toggle-edit']")?.addEventListener("click", () => {
      this.editing = !this.editing;
      this.render({ force: true });
    });

    this.element.querySelector("[data-action='save-note']")?.addEventListener("click", async () => {
      await this.#save();
    });

    this.element.querySelector("[data-action='delete-note']")?.addEventListener("click", async () => {
      await this.#delete();
    });
  }

  async #renderViewMode(note, editable) {
    const enriched = await getTextEditor().enrichHTML(note.content ?? "", {
      async: true,
      relativeTo: game.world,
      secrets: game.user?.isGM
    });

    const author = getAuthorDisplay(note.author);
    const resolvedTags = TagService.resolveTags(note.tags ?? []);

    const tagsHTML = resolvedTags.map((tag) => `
      <span class="timeline-note-window__tag" style="--tag-color:${escapeHTML(tag.color)};--tag-text:${escapeHTML(tag.textColor)}">
        ${escapeHTML(tag.name)}
      </span>
    `).join("");

    return `
      <header class="timeline-note-window__header">
        <div class="timeline-note-window__author" style="--user-color:${escapeHTML(author.color)};--user-text:${escapeHTML(author.textColor)}" title="${escapeHTML(author.name)}">
          ${escapeHTML(author.name)}
        </div>
        <div class="timeline-note-window__heading">
          <h2>${escapeHTML(note.name)}</h2>
          <div class="timeline-note-window__date">
            ${escapeHTML(CalendarService.formatDateTime({ date: note.startDate, time: note.startTime }))}
            ${note.hasEnd ? ` &ndash; ${escapeHTML(CalendarService.formatDateTime({ date: note.endDate, time: note.endTime }))}` : ""}
          </div>
        </div>
        ${resolvedTags.length ? `<div class="timeline-note-window__tags">${tagsHTML}</div>` : ""}
      </header>
      <article class="timeline-note-window__body">${enriched || `<p>${game.i18n.localize("TIMELINE_NOTES.Note.EmptyContent")}</p>`}</article>
      <footer class="timeline-note-window__footer">
        <span>${escapeHTML(game.i18n.localize(`TIMELINE_NOTES.Visibility.${note.visibility[0].toUpperCase()}${note.visibility.slice(1)}`))}</span>
        ${editable ? `<button type="button" data-action="toggle-edit"><i class="fa-solid fa-pen-to-square"></i> ${game.i18n.localize("TIMELINE_NOTES.Action.Edit")}</button>` : ""}
      </footer>
    `;
  }

  async #renderEditMode(note) {
    const enriched = await getTextEditor().enrichHTML(note.content ?? "", {
      async: true,
      relativeTo: game.world,
      secrets: game.user?.isGM
    });

    const allTags = TagService.list();

    return `
      <form class="timeline-note-window__form">
        <label>
          <span>${game.i18n.localize("TIMELINE_NOTES.Field.Name")}</span>
          <input type="text" name="name" value="${escapeHTML(note.name)}">
        </label>
        <div class="timeline-note-window__date-range">
          <fieldset class="timeline-note-window__dates">
            <legend>${game.i18n.localize("TIMELINE_NOTES.Field.Start")}</legend>
            <label>
              <span>${game.i18n.localize("TIMELINE_NOTES.Field.Date")}</span>
              <input type="date" name="startDate" value="${escapeHTML(formatDateInput(note.startDate))}">
            </label>
            <label>
              <span>${game.i18n.localize("TIMELINE_NOTES.Field.Time")}</span>
              <input type="time" name="startTime" step="1" value="${escapeHTML(formatTimeInput(note.startTime))}">
            </label>
          </fieldset>
          <fieldset class="timeline-note-window__dates">
            <legend>${game.i18n.localize("TIMELINE_NOTES.Field.End")}</legend>
            <label class="timeline-note-window__checkbox">
              <input type="checkbox" name="hasEnd" ${note.hasEnd ? "checked" : ""}>
              <span>${game.i18n.localize("TIMELINE_NOTES.Field.HasEnd")}</span>
            </label>
            <label>
              <span>${game.i18n.localize("TIMELINE_NOTES.Field.Date")}</span>
              <input type="date" name="endDate" value="${escapeHTML(formatDateInput(note.endDate ?? note.startDate))}">
            </label>
            <label>
              <span>${game.i18n.localize("TIMELINE_NOTES.Field.Time")}</span>
              <input type="time" name="endTime" step="1" value="${escapeHTML(formatTimeInput(note.endTime ?? note.startTime))}">
            </label>
          </fieldset>
        </div>
        <div class="timeline-note-window__editor">
          <span>${game.i18n.localize("TIMELINE_NOTES.Field.Content")}</span>
          <prose-mirror
            name="content"
            editable="true"
            value="${escapeHTML(note.content ?? "")}">
            ${enriched}
          </prose-mirror>
        </div>
        <fieldset class="timeline-note-window__tags-fieldset">
          <legend>${game.i18n.localize("TIMELINE_NOTES.Field.Tags")}</legend>
          <div class="timeline-note-window__tags-list">
            ${tagCheckboxes(allTags, note.tags ?? [])}
          </div>
        </fieldset>
        <fieldset>
          <legend>${game.i18n.localize("TIMELINE_NOTES.Field.Visibility")}</legend>
          ${visibilityOptions(note.visibility)}
        </fieldset>
        <footer class="timeline-note-window__footer">
          ${TimelineNotePermissions.canDelete(note) ? `<button type="button" data-action="delete-note" class="timeline-note-window__delete"><i class="fa-solid fa-trash"></i> ${game.i18n.localize("TIMELINE_NOTES.Action.Delete")}</button>` : "<span></span>"}
          <span class="timeline-note-window__footer-actions">
            <button type="button" data-action="toggle-edit">${game.i18n.localize("TIMELINE_NOTES.Action.Cancel")}</button>
            <button type="button" data-action="save-note"><i class="fa-solid fa-floppy-disk"></i> ${game.i18n.localize("TIMELINE_NOTES.Action.Save")}</button>
          </span>
        </footer>
      </form>
    `;
  }

  async #save() {
    const form = this.element.querySelector("form");
    if (!form) return;

    const data = new FormData(form);
    await TimelineNoteStore.update(this.noteId, {
      name: data.get("name"),
      startDate: parseDateInput(data.get("startDate")),
      startTime: parseTimeInput(data.get("startTime")),
      hasEnd: data.has("hasEnd"),
      endDate: parseDateInput(data.get("endDate")),
      endTime: parseTimeInput(data.get("endTime")),
      content: getProseMirrorContent(form),
      tags: data.getAll("tags"),
      visibility: data.get("visibility")
    });

    this.editing = false;
    await this.render({ force: true });
  }

  async #delete() {
    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("TIMELINE_NOTES.DeleteConfirm.Title") },
      content: `<p>${game.i18n.localize("TIMELINE_NOTES.DeleteConfirm.Content")}</p>`,
      modal: true,
      rejectClose: false
    });
    if (!proceed) return;

    await TimelineNoteStore.delete(this.noteId);
    await this.close();
  }
}
