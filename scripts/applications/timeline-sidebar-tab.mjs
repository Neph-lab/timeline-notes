import { MODULE_ID } from "../constants.mjs";
import { CalendarService } from "../services/calendar-service.mjs";
import { TimelineNotePermissions } from "../services/permissions.mjs";
import { TimelineNoteStore } from "../services/note-store.mjs";
import { TimelineNoteWindow } from "./timeline-note-window.mjs";

const SIDEBAR_TAB_ID = "timelineNotes";

function escapeHTML(value) {
  const element = document.createElement("span");
  element.textContent = value ?? "";
  return element.innerHTML;
}

function stripHTML(value) {
  const element = document.createElement("div");
  element.innerHTML = value ?? "";
  return element.textContent?.trim() ?? "";
}

function getPreview(content) {
  const text = stripHTML(content);
  const firstParagraph = text.split(/\n\s*\n/)[0] || text;
  const preview = firstParagraph.slice(0, 500);
  return preview.length < firstParagraph.length ? `${preview}...` : preview;
}

function getMonthLabel(month) {
  const date = new Date(Date.UTC(2000, Number(month) - 1, 1));
  return date.toLocaleString(game.i18n.lang, { month: "long", timeZone: "UTC" });
}

function groupNotes(notes) {
  const years = [];
  let currentYear = null;
  let currentMonth = null;
  let currentDay = null;

  for (const note of notes) {
    const year = note.startDate.year;
    const month = note.startDate.month;
    const day = note.startDate.day;

    if (!currentYear || currentYear.year !== year) {
      currentYear = { year, months: [] };
      years.push(currentYear);
      currentMonth = null;
      currentDay = null;
    }

    if (!currentMonth || currentMonth.month !== month) {
      currentMonth = { month, label: getMonthLabel(month), days: [] };
      currentYear.months.push(currentMonth);
      currentDay = null;
    }

    if (!currentDay || currentDay.day !== day) {
      currentDay = { day, notes: [] };
      currentMonth.days.push(currentDay);
    }

    currentDay.notes.push(note);
  }

  return years;
}

function renderNoteCard(note) {
  const canEdit = TimelineNotePermissions.canEdit(note);
  const canDelete = TimelineNotePermissions.canDelete(note);
  const dateTime = CalendarService.formatDateTime({ date: note.startDate, time: note.startTime });

  return `
    <article class="timeline-notes-card" data-note-id="${escapeHTML(note.id)}">
      <header>
        <time>${escapeHTML(dateTime)}</time>
        <strong>${escapeHTML(note.name)}</strong>
      </header>
      <button type="button" class="timeline-notes-card__main" data-action="open-note" data-note-id="${escapeHTML(note.id)}">
        ${escapeHTML(getPreview(note.content) || game.i18n.localize("TIMELINE_NOTES.Note.EmptyContent"))}
      </button>
      <footer>
        <button type="button" data-action="open-note" data-note-id="${escapeHTML(note.id)}">
          <i class="fa-solid fa-eye"></i> ${game.i18n.localize("TIMELINE_NOTES.Action.View")}
        </button>
        ${canEdit ? `<button type="button" data-action="edit-note" data-note-id="${escapeHTML(note.id)}"><i class="fa-solid fa-pen"></i> ${game.i18n.localize("TIMELINE_NOTES.Action.Edit")}</button>` : ""}
        ${canDelete ? `<button type="button" data-action="delete-note" data-note-id="${escapeHTML(note.id)}"><i class="fa-solid fa-trash"></i> ${game.i18n.localize("TIMELINE_NOTES.Action.Delete")}</button>` : ""}
      </footer>
    </article>
  `;
}

function renderTimelineGroups(groups) {
  return groups.map((yearGroup) => `
    <section class="timeline-notes-year">
      <h2>${escapeHTML(yearGroup.year)}</h2>
      ${yearGroup.months.map((monthGroup) => `
        <section class="timeline-notes-month">
          <h3>${escapeHTML(monthGroup.label)}</h3>
          ${monthGroup.days.map((dayGroup) => `
            <section class="timeline-notes-day">
              <h4>${escapeHTML(dayGroup.day)}</h4>
              ${dayGroup.notes.map(renderNoteCard).join("")}
            </section>
          `).join("")}
        </section>
      `).join("")}
    </section>
  `).join("");
}

function dateDialogContent(current) {
  return `
    <div class="timeline-notes-dialog-grid">
      <label>
        <span>${game.i18n.localize("TIMELINE_NOTES.Field.Date")}</span>
        <input type="date" name="date" value="${escapeHTML(CalendarService.formatDate(current.date))}">
      </label>
      <label>
        <span>${game.i18n.localize("TIMELINE_NOTES.Field.Time")}</span>
        <input type="time" name="time" step="1" value="${escapeHTML(CalendarService.formatTime(current.time))}">
      </label>
    </div>
  `;
}

function parseDateInput(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return { year, month, day };
}

function parseTimeInput(value) {
  const [hour = 0, minute = 0, second = 0] = String(value).split(":").map(Number);
  return { hour, minute, second };
}

export class TimelineSidebarTab extends foundry.applications.sidebar.AbstractSidebarTab {
  static tabName = SIDEBAR_TAB_ID;

  static DEFAULT_OPTIONS = {
    id: "timeline-notes-sidebar",
    classes: ["timeline-notes", "timeline-notes-sidebar"],
    tag: "section",
    window: {
      frame: false,
      positioned: false
    }
  };

  constructor(options = {}) {
    super(options);
    this.query = "";
    this.direction = "future";
  }

  async _renderHTML() {
    const notes = TimelineNoteStore.list({ query: this.query, direction: this.direction });
    const groups = groupNotes(notes);
    const current = CalendarService.getCurrentDateTime();
    const orderLabel = this.direction === "future"
      ? game.i18n.localize("TIMELINE_NOTES.Action.FutureFirst")
      : game.i18n.localize("TIMELINE_NOTES.Action.OldestFirst");

    const element = document.createElement("section");
    element.className = "timeline-notes-sidebar__content";
    element.innerHTML = `
      <header class="timeline-notes-toolbar">
        <div class="timeline-notes-toolbar__buttons">
          <button type="button" data-action="create-note" title="${game.i18n.localize("TIMELINE_NOTES.Action.Create")}">
            <i class="fa-solid fa-plus"></i>
          </button>
          <button type="button" data-action="jump-date" title="${game.i18n.localize("TIMELINE_NOTES.Action.JumpDate")}">
            <i class="fa-solid fa-calendar-days"></i>
          </button>
          ${game.user.isGM ? `
            <button type="button" data-action="set-campaign-time" title="${game.i18n.localize("TIMELINE_NOTES.Action.SetCampaignTime")}">
              <i class="fa-solid fa-clock"></i>
            </button>
          ` : ""}
          <button type="button" data-action="toggle-order" title="${escapeHTML(orderLabel)}">
            <i class="fa-solid fa-arrow-down-wide-short"></i>
          </button>
        </div>
        <input type="search" name="query" value="${escapeHTML(this.query)}" placeholder="${game.i18n.localize("TIMELINE_NOTES.Action.Filter")}">
        <p>${escapeHTML(CalendarService.formatDateTime(current))}</p>
      </header>
      <main class="timeline-notes-list">
        ${notes.length ? renderTimelineGroups(groups) : `<p class="timeline-notes-empty">${game.i18n.localize("TIMELINE_NOTES.EmptyTimeline")}</p>`}
      </main>
    `;
    return element;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    this.element.querySelector("[name='query']")?.addEventListener("input", (event) => {
      this.query = event.currentTarget.value;
      this.render({ force: true });
    });

    this.element.querySelector("[data-action='toggle-order']")?.addEventListener("click", () => {
      this.direction = this.direction === "future" ? "oldest" : "future";
      this.render({ force: true });
    });

    this.element.querySelector("[data-action='create-note']")?.addEventListener("click", async () => {
      const note = await TimelineNoteStore.create({
        name: game.i18n.localize("TIMELINE_NOTES.DefaultNoteName"),
        content: "<p></p>"
      });
      await this.render({ force: true });
      new TimelineNoteWindow(note.id).render({ force: true });
    });

    this.element.querySelector("[data-action='jump-date']")?.addEventListener("click", async () => {
      const current = CalendarService.getCurrentDateTime();
      const result = await foundry.applications.api.DialogV2.prompt({
        window: { title: game.i18n.localize("TIMELINE_NOTES.Action.JumpDate") },
        content: dateDialogContent(current),
        modal: true,
        ok: {
          label: game.i18n.localize("TIMELINE_NOTES.Action.JumpDate"),
          callback: (event, button) => ({
            date: parseDateInput(button.form.elements.date.value),
            time: parseTimeInput(button.form.elements.time.value)
          })
        }
      }).catch(() => null);
      if (!result) return;

      const targetKey = CalendarService.toSortKey(result);
      const cards = [...this.element.querySelectorAll("[data-note-id]")];
      const target = cards.find((card) => {
        const note = TimelineNoteStore.get(card.dataset.noteId);
        if (!note) return false;
        const noteKey = CalendarService.toSortKey({ date: note.startDate, time: note.startTime });
        return this.direction === "future" ? noteKey <= targetKey : noteKey >= targetKey;
      });

      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    });

    this.element.querySelector("[data-action='set-campaign-time']")?.addEventListener("click", async () => {
      const current = CalendarService.getCurrentDateTime();
      const result = await foundry.applications.api.DialogV2.prompt({
        window: { title: game.i18n.localize("TIMELINE_NOTES.Action.SetCampaignTime") },
        content: dateDialogContent(current),
        modal: true,
        ok: {
          label: game.i18n.localize("TIMELINE_NOTES.Action.Save"),
          callback: (event, button) => ({
            calendarId: current.calendarId,
            date: parseDateInput(button.form.elements.date.value),
            time: parseTimeInput(button.form.elements.time.value)
          })
        }
      }).catch(() => null);
      if (!result) return;

      await CalendarService.setCurrentDateTime(result);
      await this.render({ force: true });
    });

    this.element.querySelectorAll("[data-action='open-note'], [data-action='edit-note']").forEach((button) => {
      button.addEventListener("click", (event) => {
        const noteId = event.currentTarget.dataset.noteId;
        const app = new TimelineNoteWindow(noteId);
        if (event.currentTarget.dataset.action === "edit-note") app.editing = true;
        app.render({ force: true });
      });
    });

    this.element.querySelectorAll("[data-action='delete-note']").forEach((button) => {
      button.addEventListener("click", async (event) => {
        const noteId = event.currentTarget.dataset.noteId;
        const proceed = await foundry.applications.api.DialogV2.confirm({
          window: { title: game.i18n.localize("TIMELINE_NOTES.DeleteConfirm.Title") },
          content: `<p>${game.i18n.localize("TIMELINE_NOTES.DeleteConfirm.Content")}</p>`,
          modal: true,
          rejectClose: false
        });
        if (!proceed) return;

        await TimelineNoteStore.delete(noteId);
        await this.render({ force: true });
      });
    });
  }
}

export function registerTimelineSidebarTab() {
  CONFIG.ui[SIDEBAR_TAB_ID] = TimelineSidebarTab;
  CONFIG.ui.sidebar.TABS[SIDEBAR_TAB_ID] = {
    icon: "fa-solid fa-timeline",
    tooltip: "TIMELINE_NOTES.Sidebar.Title"
  };

  console.info(`${MODULE_ID} | Registered timeline sidebar tab`, { tab: SIDEBAR_TAB_ID });
}
