import { MODULE_ID } from "../constants.mjs";
import { CalendarService } from "../services/calendar-service.mjs";

const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } = foundry.applications.api;

// Localize names that may be i18n keys (Foundry's Gregorian config uses keys
// like "GREGORIAN.MONTH.January"). localize() returns the input unchanged when
// it is not a registered key, so plain custom names pass through untouched.
function localizeName(value) {
  const str = String(value ?? "");
  return str ? game.i18n.localize(str) : "";
}

// Convert a Foundry CalendarConfig into the flat shape the editor works with.
function configToEditor(config) {
  const days = config?.days ?? {};
  const months = Array.isArray(config?.months?.values) ? config.months.values : [];
  const weekdays = Array.isArray(days.values) ? days.values : [];
  const leap = config?.years?.leapYear ?? null;
  return {
    name: localizeName(config?.name) || "Custom Calendar",
    hoursPerDay: Number(days.hoursPerDay) || 24,
    minutesPerHour: Number(days.minutesPerHour) || 60,
    secondsPerMinute: Number(days.secondsPerMinute) || 60,
    hasLeapYear: Boolean(leap),
    leapInterval: Number(leap?.leapInterval) || 4,
    leapStart: Number(leap?.leapStart) || 0,
    months: months.map((m) => {
      const d = Number(m?.days) || 1;
      return { name: localizeName(m?.name), days: d, leapDays: Number(m?.leapDays ?? d) || d };
    }),
    weekdays: weekdays.map((w) => localizeName(typeof w === "string" ? w : w?.name))
  };
}

// Build a valid Foundry CalendarConfig from the editor shape.
function editorToConfig(model) {
  const months = (model.months ?? []).filter((m) => (m.name ?? "").trim() !== "" || Number(m.days) > 0);
  const weekdays = (model.weekdays ?? []).filter((w) => (w ?? "").trim() !== "");
  const daysPerYear = months.reduce((sum, m) => sum + (Number(m.days) || 0), 0);
  const hasLeap = Boolean(model.hasLeapYear);

  return {
    name: (model.name ?? "").trim() || "Custom Calendar",
    description: "",
    days: {
      hoursPerDay: Math.max(1, Number(model.hoursPerDay) || 24),
      minutesPerHour: Math.max(1, Number(model.minutesPerHour) || 60),
      secondsPerMinute: Math.max(1, Number(model.secondsPerMinute) || 60),
      daysPerYear: daysPerYear || 365,
      values: (weekdays.length ? weekdays : ["Day"]).map((name, i) => ({ name, ordinal: i + 1 }))
    },
    months: months.length
      ? {
        values: months.map((m, i) => {
          const d = Math.max(1, Number(m.days) || 1);
          const leapDays = hasLeap ? Math.max(1, Number(m.leapDays) || d) : d;
          return { name: (m.name ?? "").trim() || `Month ${i + 1}`, days: d, ordinal: i + 1, leapDays };
        })
      }
      : null,
    years: {
      yearZero: 0,
      firstWeekday: 0,
      leapYear: hasLeap
        ? { leapStart: Number(model.leapStart) || 0, leapInterval: Math.max(1, Number(model.leapInterval) || 4) }
        : null
    },
    seasons: null
  };
}

export class CalendarSettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "timeline-notes-calendar-settings",
    classes: ["timeline-notes", "timeline-notes-calendar-settings"],
    tag: "form",
    window: {
      title: "TIMELINE_NOTES.CalendarSettings.Title",
      resizable: true
    },
    position: {
      width: 560,
      height: 640
    }
  };

  static PARTS = {
    calendar: {
      template: `modules/${MODULE_ID}/templates/calendar-settings.hbs`
    }
  };

  constructor(options = {}) {
    super(options);
    // In-memory working copy; the world calendar is only changed on Save.
    this.workingConfig = configToEditor(CalendarService.getEditorCalendarConfig());
  }

  async _prepareContext(options) {
    return {
      ...(await super._prepareContext(options)),
      config: {
        ...this.workingConfig,
        months: this.workingConfig.months.map((m, i) => ({ ...m, ordinal: i + 1, hasLeapYear: this.workingConfig.hasLeapYear }))
      }
    };
  }

  #onLeapToggle() {
    this.#syncFromDOM();
    this.render({ force: true });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;

    root.querySelector("[data-action='add-month']")?.addEventListener("click", () => {
      this.#syncFromDOM();
      this.workingConfig.months.push({ name: "", days: 30 });
      this.render({ force: true });
    });

    root.querySelectorAll("[data-action='delete-month']").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.#syncFromDOM();
        this.workingConfig.months.splice(Number(btn.dataset.index), 1);
        this.render({ force: true });
      });
    });

    root.querySelectorAll("[data-action='move-month-up']").forEach((btn) => {
      btn.addEventListener("click", () => this.#moveMonth(Number(btn.dataset.index), -1));
    });

    root.querySelectorAll("[data-action='move-month-down']").forEach((btn) => {
      btn.addEventListener("click", () => this.#moveMonth(Number(btn.dataset.index), 1));
    });

    root.querySelector("[data-action='add-weekday']")?.addEventListener("click", () => {
      this.#syncFromDOM();
      this.workingConfig.weekdays.push("");
      this.render({ force: true });
    });

    root.querySelectorAll("[data-action='delete-weekday']").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.#syncFromDOM();
        this.workingConfig.weekdays.splice(Number(btn.dataset.index), 1);
        this.render({ force: true });
      });
    });

    root.querySelector("input[name='hasLeapYear']")?.addEventListener("change", () => this.#onLeapToggle());

    root.querySelector("[data-action='reset-gregorian']")?.addEventListener("click", () => this.#reset());
    root.querySelector("[data-action='save-calendar']")?.addEventListener("click", () => this.#save());
  }

  #moveMonth(index, delta) {
    this.#syncFromDOM();
    const target = index + delta;
    const months = this.workingConfig.months;
    if (target < 0 || target >= months.length) return;
    [months[index], months[target]] = [months[target], months[index]];
    this.render({ force: true });
  }

  // Pull current field values out of the DOM so structural edits never lose them.
  #syncFromDOM() {
    const root = this.element;
    const name = root.querySelector("input[name='name']")?.value ?? "";
    const hoursPerDay = root.querySelector("input[name='hoursPerDay']")?.value;
    const minutesPerHour = root.querySelector("input[name='minutesPerHour']")?.value;
    const secondsPerMinute = root.querySelector("input[name='secondsPerMinute']")?.value;
    const hasLeapYear = root.querySelector("input[name='hasLeapYear']")?.checked ?? false;
    const leapInterval = root.querySelector("input[name='leapInterval']")?.value;
    const leapStart = root.querySelector("input[name='leapStart']")?.value;

    const months = [...root.querySelectorAll("[data-month-row]")].map((row) => {
      const days = Number(row.querySelector("input[name='monthDays']")?.value) || 1;
      const leapEl = row.querySelector("input[name='monthLeapDays']");
      return {
        name: row.querySelector("input[name='monthName']")?.value ?? "",
        days,
        leapDays: leapEl ? (Number(leapEl.value) || days) : days
      };
    });

    const weekdays = [...root.querySelectorAll("[data-weekday-row]")].map(
      (row) => row.querySelector("input[name='weekdayName']")?.value ?? ""
    );

    this.workingConfig = {
      name,
      hoursPerDay: Number(hoursPerDay) || 24,
      minutesPerHour: Number(minutesPerHour) || 60,
      secondsPerMinute: Number(secondsPerMinute) || 60,
      hasLeapYear,
      leapInterval: Number(leapInterval) || 4,
      leapStart: Number(leapStart) || 0,
      months,
      weekdays
    };
  }

  async #reset() {
    const proceed = await DialogV2.confirm({
      window: { title: game.i18n.localize("TIMELINE_NOTES.CalendarSettings.ResetTitle") },
      content: `<p>${game.i18n.localize("TIMELINE_NOTES.CalendarSettings.ResetContent")}</p>`,
      modal: true,
      rejectClose: false
    });
    if (!proceed) return;
    this.workingConfig = configToEditor(CalendarService.defaultCalendarConfig);
    this.render({ force: true });
  }

  async #save() {
    this.#syncFromDOM();
    const config = editorToConfig(this.workingConfig);
    await CalendarService.setWorldCalendarConfig(config);
    ui.notifications?.info(game.i18n.localize("TIMELINE_NOTES.CalendarSettings.Saved"));
    // Reseed from the stored (normalized) config so the editor reflects what was saved.
    this.workingConfig = configToEditor(CalendarService.getStoredCalendarConfig() ?? config);
    this.render({ force: true });
  }
}
