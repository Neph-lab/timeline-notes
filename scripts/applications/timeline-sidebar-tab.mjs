import { MODULE_ID } from "../constants.mjs";
import { CalendarService } from "../services/calendar-service.mjs";
import { TimelineNotePermissions } from "../services/permissions.mjs";
import { TimelineNoteStore } from "../services/note-store.mjs";
import { TimelineNoteWindow } from "./timeline-note-window.mjs";

const { AbstractSidebarTab } = foundry.applications.sidebar;
const { HandlebarsApplicationMixin } = foundry.applications.api;

const SIDEBAR_TAB_ID = "timelineNotes";
const JOURNAL_TAB_ID = "journal";

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

function prepareTimelineEntry(note, type) {
  const isEnd = type === "end";
  const date = isEnd ? note.endDate : note.startDate;
  const time = isEnd ? note.endTime : note.startTime;

  return {
    ...note,
    dateTime: CalendarService.formatDateTime({ date, time }),
    entryDate: date,
    entryTime: time,
    entryType: type,
    entryTypeLabel: isEnd ? game.i18n.localize("TIMELINE_NOTES.Entry.End")
      : note.hasEnd ? game.i18n.localize("TIMELINE_NOTES.Entry.Start")
      : "",
    key: `${note.id}-${type}`,
    preview: getPreview(note.content) || game.i18n.localize("TIMELINE_NOTES.Note.EmptyContent")
  };
}

function prepareTimelineEntries(notes) {
  return notes.flatMap((note) => {
    const entries = [prepareTimelineEntry(note, "start")];
    if (note.hasEnd) entries.push(prepareTimelineEntry(note, "end"));
    return entries;
  }).filter((entry) => entry.entryDate && entry.entryTime);
}

function groupNotes(notes) {
  const years = [];
  let currentYear = null;
  let currentMonth = null;
  let currentDay = null;

  for (const note of notes) {
    const year = note.entryDate.year;
    const month = note.entryDate.month;
    const day = note.entryDate.day;

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

  for (const year of years) {
    const yearTotal = year.months.reduce((sum, mo) => sum + mo.days.reduce((s, d) => s + d.notes.length, 0), 0);
    year.showMonthHeaders = yearTotal > 1;
    for (const month of year.months) {
      const monthTotal = month.days.reduce((sum, d) => sum + d.notes.length, 0);
      month.showDayHeaders = monthTotal > 1;
    }
  }

  return years;
}

function dateDialogContent(current) {
  return `
    <div class="timeline-notes-dialog-grid">
      <label>
        <span>${game.i18n.localize("TIMELINE_NOTES.Field.Date")}</span>
        <input type="date" name="date" value="${CalendarService.formatDate(current.date)}">
      </label>
      <label>
        <span>${game.i18n.localize("TIMELINE_NOTES.Field.Time")}</span>
        <input type="time" name="time" step="1" value="${CalendarService.formatTime(current.time)}">
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

export class TimelineSidebarTab extends HandlebarsApplicationMixin(AbstractSidebarTab) {
  static tabName = SIDEBAR_TAB_ID;

  static DEFAULT_OPTIONS = {
    window: {
      title: "TIMELINE_NOTES.Sidebar.Title"
    }
  };

  static PARTS = {
    [SIDEBAR_TAB_ID]: {
      template: `modules/${MODULE_ID}/templates/timeline-sidebar.hbs`
    }
  };

  constructor(options = {}) {
    super(options);
    this.query = "";
    this.direction = "future";
    Hooks.on(TimelineNoteStore.NOTES_CHANGED_HOOK, this.#handleNotesChanged);
  }

  #handleNotesChanged = () => {
      if (this.rendered) this.render({ force: true });
  }

  async _prepareContext(options) {
    const notes = TimelineNoteStore.list({ query: this.query, direction: this.direction });
    const entries = prepareTimelineEntries(notes).sort((left, right) => {
      const order = CalendarService.compareDateTimes(
        { date: left.entryDate, time: left.entryTime },
        { date: right.entryDate, time: right.entryTime }
      );
      return this.direction === "oldest" ? order : -order;
    });
    const groups = groupNotes(entries);
    const current = CalendarService.getCurrentDateTime();

    return {
      ...(await super._prepareContext(options)),
      currentDateTime: CalendarService.formatDateTime(current),
      direction: this.direction,
      groups,
      hasNotes: entries.length > 0,
      isGM: game.user.isGM,
      orderLabel: this.direction === "future"
        ? game.i18n.localize("TIMELINE_NOTES.Action.FutureFirst")
        : game.i18n.localize("TIMELINE_NOTES.Action.OldestFirst"),
      query: this.query
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#activateListeners(this.element);

    console.debug(`${MODULE_ID} | Rendered timeline sidebar`, {
      groups: context.groups?.length ?? 0,
      direction: this.direction,
      query: this.query
    });
  }

  async close(options) {
    Hooks.off(TimelineNoteStore.NOTES_CHANGED_HOOK, this.#handleNotesChanged);

    return super.close(options);
  }

  #activateListeners(root) {
    root.querySelector("[name='query']")?.addEventListener("input", (event) => {
      this.query = event.currentTarget.value;
      this.render({ force: true });
    });

    root.querySelector("[data-action='toggle-order']")?.addEventListener("click", () => {
      this.direction = this.direction === "future" ? "oldest" : "future";
      this.render({ force: true });
    });

    root.querySelector("[data-action='create-note']")?.addEventListener("click", async () => {
      const note = await TimelineNoteStore.create({
        name: game.i18n.localize("TIMELINE_NOTES.DefaultNoteName"),
        content: "<p></p>"
      });
      await this.render({ force: true });
      new TimelineNoteWindow(note.id, { editing: true }).render({ force: true });
    });

    root.querySelector("[data-action='jump-date']")?.addEventListener("click", async () => {
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
      const cards = [...root.querySelectorAll(".timeline-notes-card")];
      const target = cards.find((card) => {
        const note = TimelineNoteStore.get(card.dataset.noteId);
        if (!note) return false;
        const date = card.dataset.entryType === "end" ? note.endDate : note.startDate;
        const time = card.dataset.entryType === "end" ? note.endTime : note.startTime;
        const noteKey = CalendarService.toSortKey({ date, time });
        return this.direction === "future" ? noteKey <= targetKey : noteKey >= targetKey;
      });

      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    });

    root.querySelector("[data-action='set-campaign-time']")?.addEventListener("click", async () => {
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

    root.querySelectorAll("[data-action='open-note']").forEach((button) => {
      button.addEventListener("click", (event) => {
        const noteId = event.currentTarget.dataset.noteId;
        const app = new TimelineNoteWindow(noteId);
        app.render({ force: true });
      });
    });
  }
}

export function registerTimelineSidebarTab() {
  CONFIG.ui[SIDEBAR_TAB_ID] = TimelineSidebarTab;

  const tabEntries = Object.entries(CONFIG.ui.sidebar.TABS);
  const journalIndex = tabEntries.findIndex(([id]) => id === JOURNAL_TAB_ID);
  CONFIG.ui.sidebar.TABS[SIDEBAR_TAB_ID] = {
    icon: "fa-solid fa-timeline",
    tooltip: "TIMELINE_NOTES.Sidebar.Title"
  };
  const timelineEntry = [SIDEBAR_TAB_ID, CONFIG.ui.sidebar.TABS[SIDEBAR_TAB_ID]];

  if (journalIndex >= 0) {
    const reorderedEntries = [
      ...tabEntries.slice(0, journalIndex + 1),
      timelineEntry,
      ...tabEntries.slice(journalIndex + 1)
    ];

    CONFIG.ui.sidebar.TABS = Object.fromEntries(reorderedEntries);
  }

  console.info(`${MODULE_ID} | Registered timeline sidebar tab`, {
    after: journalIndex >= 0 ? JOURNAL_TAB_ID : null,
    tab: SIDEBAR_TAB_ID
  });
}
