import { MODULE_ID } from "../constants.mjs";
import { CalendarService } from "../services/calendar-service.mjs";
import { TimelineNotePermissions } from "../services/permissions.mjs";
import { TimelineNoteStore } from "../services/note-store.mjs";
import { TagService, getAuthorDisplay } from "../services/tag-service.mjs";
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
  return CalendarService.getMonthLabel(month);
}

function parseOptionalPositiveInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = parseInt(String(value), 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function parseOptionalNonNegativeInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = parseInt(String(value), 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function parseRequiredInt(value, fallback = 0) {
  const n = parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) ? n : fallback;
}

function prepareTimelineEntry(note, type) {
  const isEnd = type === "end";
  const date = isEnd ? note.endDate : note.startDate;
  const time = isEnd ? note.endTime : note.startTime;
  const authorBar = getAuthorDisplay(note.author);
  const canEdit = TimelineNotePermissions.canEdit(note);
  const resolvedTags = TagService.resolveTags(note.tags ?? []);

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
    preview: getPreview(note.content) || game.i18n.localize("TIMELINE_NOTES.Note.EmptyContent"),
    authorBar,
    canEdit,
    resolvedTags
  };
}

function prepareTimelineEntries(notes) {
  return notes.flatMap((note) => {
    const entries = [prepareTimelineEntry(note, "start")];
    if (note.hasEnd) entries.push(prepareTimelineEntry(note, "end"));
    return entries;
  }).filter((entry) => entry.entryDate);
}

function groupNotes(entries) {
  const years = [];
  let currentYear = null;
  let currentMonth = null;
  let currentDay = null;

  for (const entry of entries) {
    const year = entry.entryDate?.year;
    const month = entry.entryDate?.month ?? null;
    const day = entry.entryDate?.day ?? null;

    if (!currentYear || currentYear.year !== year) {
      currentYear = { year, undatedNotes: [], months: [] };
      years.push(currentYear);
      currentMonth = null;
      currentDay = null;
    }

    if (month === null) {
      currentYear.undatedNotes.push(entry);
      currentMonth = null;
      currentDay = null;
    } else {
      if (!currentMonth || currentMonth.month !== month) {
        currentMonth = { month, label: getMonthLabel(month), undatedNotes: [], days: [] };
        currentYear.months.push(currentMonth);
        currentDay = null;
      }

      if (day === null) {
        currentMonth.undatedNotes.push(entry);
        currentDay = null;
      } else {
        if (!currentDay || currentDay.day !== day) {
          currentDay = { day, notes: [] };
          currentMonth.days.push(currentDay);
        }
        currentDay.notes.push(entry);
      }
    }
  }

  for (const year of years) {
    const yearSlots = (year.undatedNotes.length > 0 ? 1 : 0) + year.months.length;
    year.showMonthHeaders = yearSlots > 1;
    for (const month of year.months) {
      const monthSlots = (month.undatedNotes.length > 0 ? 1 : 0) + month.days.length;
      month.showDayHeaders = monthSlots > 1;
    }
  }

  return years;
}

function dateTimeDialogContent(current) {
  const d = current.date;
  const t = current.time;
  const year = d?.year ?? "";
  const month = d?.month != null ? d.month : "";
  const day = d?.day != null ? d.day : "";
  const hour = t?.hour != null ? t.hour : "";
  const minute = t?.minute != null ? t.minute : "";

  const monthCount = CalendarService.getMonthCount();
  const monthMax = monthCount > 0 ? ` max="${monthCount}"` : "";
  const dayMax = d?.month != null ? CalendarService.getDaysInMonth(d.month) : CalendarService.getMaxDaysInAnyMonth();
  const dayMaxAttr = dayMax != null ? ` max="${dayMax}"` : "";
  const hourMax = CalendarService.getHoursPerDay() - 1;
  const minuteMax = CalendarService.getMinutesPerHour() - 1;

  return `
    <div class="timeline-notes-dialog-grid">
      <div class="timeline-notes-dialog-datetime">
        <label>
          <span>${game.i18n.localize("TIMELINE_NOTES.Field.Year")}</span>
          <input type="number" name="year" value="${year}">
        </label>
        <label>
          <span>${game.i18n.localize("TIMELINE_NOTES.Field.Month")}</span>
          <input type="number" name="month" value="${month}" min="1"${monthMax} placeholder="–">
        </label>
        <label>
          <span>${game.i18n.localize("TIMELINE_NOTES.Field.Day")}</span>
          <input type="number" name="day" value="${day}" min="1"${dayMaxAttr} placeholder="–">
        </label>
        <label>
          <span>${game.i18n.localize("TIMELINE_NOTES.Field.Hour")}</span>
          <input type="number" name="hour" value="${hour}" min="0" max="${hourMax}" placeholder="–">
        </label>
        <label>
          <span>${game.i18n.localize("TIMELINE_NOTES.Field.Minute")}</span>
          <input type="number" name="minute" value="${minute}" min="0" max="${minuteMax}" placeholder="–">
        </label>
      </div>
    </div>
  `;
}

function readDialogDateTime(elements) {
  return {
    date: {
      year: parseRequiredInt(elements.year?.value),
      month: parseOptionalPositiveInt(elements.month?.value),
      day: parseOptionalPositiveInt(elements.day?.value)
    },
    time: {
      hour: parseOptionalNonNegativeInt(elements.hour?.value),
      minute: parseOptionalNonNegativeInt(elements.minute?.value)
    }
  };
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
    this.selectedTags = [];
    this.tagFilterOpen = false;
    Hooks.on(TimelineNoteStore.NOTES_CHANGED_HOOK, this.#handleNotesChanged);
    Hooks.on(`${MODULE_ID}.calendarChanged`, this.#handleNotesChanged);
  }

  #handleNotesChanged = () => {
    if (this.rendered) this.render({ force: true });
  }

  async _prepareContext(options) {
    const notes = TimelineNoteStore.list({ query: this.query, direction: this.direction, tags: this.selectedTags });
    const entries = prepareTimelineEntries(notes).sort((left, right) =>
      CalendarService.compareDateTimes(
        { date: left.entryDate, time: left.entryTime },
        { date: right.entryDate, time: right.entryTime },
        this.direction
      )
    );
    const groups = groupNotes(entries);
    const current = CalendarService.getCurrentDateTime();
    const allTags = TagService.list().map((t) => ({ ...t, selected: this.selectedTags.includes(t.id) }));

    return {
      ...(await super._prepareContext(options)),
      allTags,
      currentDateTime: CalendarService.formatDateTime(current),
      direction: this.direction,
      groups,
      hasNotes: entries.length > 0,
      isGM: game.user.isGM,
      orderLabel: this.direction === "future"
        ? game.i18n.localize("TIMELINE_NOTES.Action.FutureFirst")
        : game.i18n.localize("TIMELINE_NOTES.Action.OldestFirst"),
      query: this.query,
      tagFilterOpen: this.tagFilterOpen
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    const filterPanel = this.element.querySelector(".timeline-notes-tag-filter");
    if (filterPanel) filterPanel.hidden = !this.tagFilterOpen;

    this.#activateListeners(this.element);
  }

  async close(options) {
    Hooks.off(TimelineNoteStore.NOTES_CHANGED_HOOK, this.#handleNotesChanged);
    Hooks.off(`${MODULE_ID}.calendarChanged`, this.#handleNotesChanged);
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

    root.querySelector("[data-action='toggle-tag-filter']")?.addEventListener("click", () => {
      this.tagFilterOpen = !this.tagFilterOpen;
      const panel = root.querySelector(".timeline-notes-tag-filter");
      if (panel) panel.hidden = !this.tagFilterOpen;
    });

    root.querySelectorAll("[name='tagFilter']").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        this.selectedTags = [...root.querySelectorAll("[name='tagFilter']:checked")].map((el) => el.value);
        this.render({ force: true });
      });
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
        content: dateTimeDialogContent(current),
        modal: true,
        ok: {
          label: game.i18n.localize("TIMELINE_NOTES.Action.JumpDate"),
          callback: (event, button) => readDialogDateTime(button.form.elements)
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
        content: dateTimeDialogContent(current),
        modal: true,
        ok: {
          label: game.i18n.localize("TIMELINE_NOTES.Action.Save"),
          callback: (event, button) => ({
            calendarId: current.calendarId,
            ...readDialogDateTime(button.form.elements)
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
        new TimelineNoteWindow(noteId).render({ force: true });
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
