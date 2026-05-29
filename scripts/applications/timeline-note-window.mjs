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

// Parse an optional positive integer (month, day): null when blank or < 1.
function parseOptionalPositiveInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = parseInt(String(value), 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

// Parse an optional non-negative integer (hour, minute): null when blank, 0 valid.
function parseOptionalNonNegativeInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = parseInt(String(value), 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// Parse a required integer (year): falls back to 0 when blank/invalid.
function parseRequiredInt(value, fallback = 0) {
  const n = parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) ? n : fallback;
}

function readDate(data, prefix) {
  return {
    year: parseRequiredInt(data.get(`${prefix}Year`)),
    month: parseOptionalPositiveInt(data.get(`${prefix}Month`)),
    day: parseOptionalPositiveInt(data.get(`${prefix}Day`))
  };
}

function readTime(data, prefix) {
  return {
    hour: parseOptionalNonNegativeInt(data.get(`${prefix}Hour`)),
    minute: parseOptionalNonNegativeInt(data.get(`${prefix}Minute`))
  };
}

function dateFields(prefix, date, time, i18n) {
  const year = date?.year ?? 0;
  const month = date?.month != null ? date.month : "";
  const day = date?.day != null ? date.day : "";
  const hour = time?.hour != null ? time.hour : "";
  const minute = time?.minute != null ? time.minute : "";

  // Bounds from the active world calendar.
  const monthCount = CalendarService.getMonthCount();
  const monthMax = monthCount > 0 ? ` max="${monthCount}"` : "";
  const dayMax = date?.month != null ? CalendarService.getDaysInMonth(date.month) : CalendarService.getMaxDaysInAnyMonth();
  const dayMaxAttr = dayMax != null ? ` max="${dayMax}"` : "";
  const hourMax = CalendarService.getHoursPerDay() - 1;
  const minuteMax = CalendarService.getMinutesPerHour() - 1;

  return `
    <div class="timeline-note-window__date-fields">
      <label>
        <span>${i18n.year}</span>
        <input type="number" name="${prefix}Year" value="${escapeHTML(String(year))}">
      </label>
      <label>
        <span>${i18n.month}</span>
        <input type="number" name="${prefix}Month" value="${escapeHTML(String(month))}" min="1"${monthMax} placeholder="–">
      </label>
      <label>
        <span>${i18n.day}</span>
        <input type="number" name="${prefix}Day" value="${escapeHTML(String(day))}" min="1"${dayMaxAttr} placeholder="–">
      </label>
      <label>
        <span>${i18n.hour}</span>
        <input type="number" name="${prefix}Hour" value="${escapeHTML(String(hour))}" min="0" max="${hourMax}" placeholder="–">
      </label>
      <label>
        <span>${i18n.minute}</span>
        <input type="number" name="${prefix}Minute" value="${escapeHTML(String(minute))}" min="0" max="${minuteMax}" placeholder="–">
      </label>
    </div>
  `;
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
      width: 560,
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

    // Keep each day field's max in step with the chosen month's length.
    for (const prefix of ["start", "end"]) {
      const monthInput = this.element.querySelector(`input[name='${prefix}Month']`);
      const dayInput = this.element.querySelector(`input[name='${prefix}Day']`);
      if (!monthInput || !dayInput) continue;
      monthInput.addEventListener("change", () => {
        const month = parseOptionalPositiveInt(monthInput.value);
        const dayMax = month != null ? CalendarService.getDaysInMonth(month) : CalendarService.getMaxDaysInAnyMonth();
        if (dayMax != null) {
          dayInput.max = dayMax;
          if (dayInput.value !== "" && Number(dayInput.value) > dayMax) dayInput.value = dayMax;
        } else {
          dayInput.removeAttribute("max");
        }
      });
    }

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
    const i18n = {
      year: game.i18n.localize("TIMELINE_NOTES.Field.Year"),
      month: game.i18n.localize("TIMELINE_NOTES.Field.Month"),
      day: game.i18n.localize("TIMELINE_NOTES.Field.Day"),
      hour: game.i18n.localize("TIMELINE_NOTES.Field.Hour"),
      minute: game.i18n.localize("TIMELINE_NOTES.Field.Minute")
    };

    return `
      <form class="timeline-note-window__form">
        <label>
          <span>${game.i18n.localize("TIMELINE_NOTES.Field.Name")}</span>
          <input type="text" name="name" value="${escapeHTML(note.name)}">
        </label>
        <div class="timeline-note-window__date-range">
          <fieldset class="timeline-note-window__dates">
            <legend>${game.i18n.localize("TIMELINE_NOTES.Field.Start")}</legend>
            ${dateFields("start", note.startDate, note.startTime, i18n)}
          </fieldset>
          <fieldset class="timeline-note-window__dates">
            <legend>${game.i18n.localize("TIMELINE_NOTES.Field.End")}</legend>
            <label class="timeline-note-window__checkbox">
              <input type="checkbox" name="hasEnd" ${note.hasEnd ? "checked" : ""}>
              <span>${game.i18n.localize("TIMELINE_NOTES.Field.HasEnd")}</span>
            </label>
            ${dateFields("end", note.endDate, note.endTime, i18n)}
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
      startDate: readDate(data, "start"),
      startTime: readTime(data, "start"),
      hasEnd: data.has("hasEnd"),
      endDate: readDate(data, "end"),
      endTime: readTime(data, "end"),
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
