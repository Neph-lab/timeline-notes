import { DEFAULT_CALENDAR_ID, MODULE_ID, SETTINGS } from "../constants.mjs";

function pad(value, length = 2) {
  return String(value).padStart(length, "0");
}

function gregorianFromWorldTime(worldTime) {
  if (!Number.isFinite(worldTime)) return null;
  const date = new Date(worldTime * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return {
    date: { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() },
    time: { hour: date.getUTCHours(), minute: date.getUTCMinutes() }
  };
}

export class CalendarService {
  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.CAMPAIGN_CALENDAR_ID, {
      name: "TIMELINE_NOTES.Settings.CampaignCalendarId.Name",
      hint: "TIMELINE_NOTES.Settings.CampaignCalendarId.Hint",
      scope: "world",
      config: false,
      restricted: true,
      type: String,
      default: DEFAULT_CALENDAR_ID
    });

    game.settings.register(MODULE_ID, SETTINGS.CAMPAIGN_CURRENT_DATE, {
      name: "TIMELINE_NOTES.Settings.CampaignCurrentDate.Name",
      hint: "TIMELINE_NOTES.Settings.CampaignCurrentDate.Hint",
      scope: "world",
      config: false,
      restricted: true,
      type: Object,
      default: { year: new Date().getFullYear(), month: null, day: null }
    });

    game.settings.register(MODULE_ID, SETTINGS.CAMPAIGN_CURRENT_TIME, {
      name: "TIMELINE_NOTES.Settings.CampaignCurrentTime.Name",
      hint: "TIMELINE_NOTES.Settings.CampaignCurrentTime.Hint",
      scope: "world",
      config: false,
      restricted: true,
      type: Object,
      default: { hour: null, minute: null }
    });

    // Stored CalendarConfig that, when present, becomes the World calendar.
    // Empty object means "unset — use Foundry's default (Simplified Gregorian)".
    game.settings.register(MODULE_ID, SETTINGS.WORLD_CALENDAR, {
      name: "TIMELINE_NOTES.Settings.WorldCalendar.Name",
      hint: "TIMELINE_NOTES.Settings.WorldCalendar.Hint",
      scope: "world",
      config: false,
      restricted: true,
      type: Object,
      default: {},
      onChange: () => CalendarService.applyWorldCalendar()
    });
  }

  /* ------------------------------------------ */
  /*  World calendar configuration              */
  /* ------------------------------------------ */

  static get defaultCalendarConfig() {
    return foundry.utils.deepClone(foundry.data.SIMPLIFIED_GREGORIAN_CALENDAR_CONFIG);
  }

  // The stored config, or null when the GM has not configured a calendar.
  static getStoredCalendarConfig() {
    const value = game.settings.get(MODULE_ID, SETTINGS.WORLD_CALENDAR);
    return value && typeof value === "object" && Object.keys(value).length ? foundry.utils.deepClone(value) : null;
  }

  // The config to seed the editor with: stored if present, otherwise Gregorian.
  static getEditorCalendarConfig() {
    return this.getStoredCalendarConfig() ?? this.defaultCalendarConfig;
  }

  static async setWorldCalendarConfig(config) {
    if (!game.user?.isGM) throw new Error("Only GMs can configure the world calendar.");
    await game.settings.set(MODULE_ID, SETTINGS.WORLD_CALENDAR, config ?? {});
    // The setting's onChange triggers applyWorldCalendar on every client.
  }

  static async resetWorldCalendar() {
    if (!game.user?.isGM) throw new Error("Only GMs can configure the world calendar.");
    await game.settings.set(MODULE_ID, SETTINGS.WORLD_CALENDAR, {});
  }

  // Push the stored config (if any) into CONFIG.time so game.time.calendar reflects it.
  static applyWorldCalendar() {
    const config = this.getStoredCalendarConfig();
    try {
      if (config) {
        foundry.utils.setProperty(CONFIG, "time.worldCalendarConfig", config);
      }
      // Rebuild the live calendar if game.time already exists (runtime change).
      if (game.time?.initializeCalendar) game.time.initializeCalendar();
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to apply world calendar`, error);
    }
    Hooks.callAll(`${MODULE_ID}.calendarChanged`);
  }

  /* ------------------------------------------ */
  /*  Live calendar accessors (Foundry-first)   */
  /* ------------------------------------------ */

  static get worldCalendar() {
    return game.time?.calendar ?? null;
  }

  static getMonthConfigs() {
    const values = this.worldCalendar?.months?.values;
    return Array.isArray(values) ? values : [];
  }

  static getMonthCount() {
    return this.getMonthConfigs().length;
  }

  // month is 1-based (module convention). Calendar months.values is 0-based.
  static getMonthLabel(month) {
    const config = this.getMonthConfigs()[Number(month) - 1];
    return config?.name ?? config?.abbreviation ?? String(month);
  }

  static getDaysInMonth(month) {
    const config = this.getMonthConfigs()[Number(month) - 1];
    return Number.isFinite(config?.days) ? config.days : null;
  }

  static getMaxDaysInAnyMonth() {
    const days = this.getMonthConfigs().map((m) => Number(m?.days) || 0);
    return days.length ? Math.max(...days) : null;
  }

  static getHoursPerDay() {
    return Number(this.worldCalendar?.days?.hoursPerDay) || 24;
  }

  static getMinutesPerHour() {
    return Number(this.worldCalendar?.days?.minutesPerHour) || 60;
  }

  /* ------------------------------------------ */
  /*  Clamping (bound to the active calendar)   */
  /* ------------------------------------------ */

  // Year required (any integer). Month optional, clamped to [1, monthCount].
  // Day optional, clamped to [1, daysInMonth]; forced null when month is null.
  static clampDate(date) {
    const yearRaw = Number(date?.year);
    const year = Number.isInteger(yearRaw) ? yearRaw : 0;

    let month = date?.month != null ? Number(date.month) : null;
    if (month !== null) {
      if (!Number.isInteger(month) || month < 1) month = null;
      else {
        const count = this.getMonthCount();
        if (count > 0 && month > count) month = count;
      }
    }

    let day = date?.day != null ? Number(date.day) : null;
    if (month === null) {
      day = null;
    } else if (day !== null) {
      if (!Number.isInteger(day) || day < 1) day = null;
      else {
        const inMonth = this.getDaysInMonth(month);
        if (inMonth != null && day > inMonth) day = inMonth;
      }
    }

    return { year, month, day };
  }

  // Hour optional, clamped to [0, hoursPerDay - 1]. Minute optional,
  // clamped to [0, minutesPerHour - 1]; forced null when hour is null.
  static clampTime(time) {
    let hour = time?.hour != null ? Number(time.hour) : null;
    if (hour !== null) {
      if (!Number.isInteger(hour) || hour < 0) hour = null;
      else {
        const max = this.getHoursPerDay() - 1;
        if (hour > max) hour = max;
      }
    }

    let minute = time?.minute != null ? Number(time.minute) : null;
    if (hour === null) {
      minute = null;
    } else if (minute !== null) {
      if (!Number.isInteger(minute) || minute < 0) minute = null;
      else {
        const max = this.getMinutesPerHour() - 1;
        if (minute > max) minute = max;
      }
    }

    return { hour, minute };
  }

  /* ------------------------------------------ */
  /*  Campaign current date/time                */
  /* ------------------------------------------ */

  static get calendarId() {
    return game.settings.get(MODULE_ID, SETTINGS.CAMPAIGN_CALENDAR_ID) || DEFAULT_CALENDAR_ID;
  }

  static getCurrentDateTime() {
    return {
      calendarId: this.calendarId,
      date: this.clampDate(game.settings.get(MODULE_ID, SETTINGS.CAMPAIGN_CURRENT_DATE)),
      time: this.clampTime(game.settings.get(MODULE_ID, SETTINGS.CAMPAIGN_CURRENT_TIME))
    };
  }

  static getDefaultNoteDateTime() {
    const stored = game.settings.get(MODULE_ID, SETTINGS.CAMPAIGN_CURRENT_DATE);
    const yearRaw = Number(stored?.year ?? new Date().getFullYear());
    const year = Number.isInteger(yearRaw) ? yearRaw : new Date().getFullYear();
    return {
      calendarId: this.calendarId,
      date: { year, month: null, day: null },
      time: { hour: null, minute: null }
    };
  }

  static getFoundryWorldDateTime() {
    return gregorianFromWorldTime(game.time?.worldTime);
  }

  static async setCurrentDateTime({ calendarId = DEFAULT_CALENDAR_ID, date, time }) {
    if (!game.user?.isGM) throw new Error("Only GMs can set the campaign date and time.");
    await game.settings.set(MODULE_ID, SETTINGS.CAMPAIGN_CALENDAR_ID, calendarId || DEFAULT_CALENDAR_ID);
    await game.settings.set(MODULE_ID, SETTINGS.CAMPAIGN_CURRENT_DATE, this.clampDate(date));
    await game.settings.set(MODULE_ID, SETTINGS.CAMPAIGN_CURRENT_TIME, this.clampTime(time));
    return this.getCurrentDateTime();
  }

  /* ------------------------------------------ */
  /*  Formatting, comparison, sort keys         */
  /* ------------------------------------------ */

  static formatDateTime({ date, time }) {
    const y = Number(date?.year ?? 0);
    const mo = date?.month != null ? Number(date.month) : null;
    const d = date?.day != null ? Number(date.day) : null;
    const h = time?.hour != null ? Number(time.hour) : null;
    const m = time?.minute != null ? Number(time.minute) : null;

    let dateStr;
    if (mo == null) {
      dateStr = pad(y, 4);
    } else if (d == null) {
      dateStr = `${pad(y, 4)}-${pad(mo)}`;
    } else {
      dateStr = `${pad(y, 4)}-${pad(mo)}-${pad(d)}`;
    }

    // Time shown only when hour is set; blank minute defaults to :00 for display.
    const timeStr = h != null ? `${pad(h)}:${pad(m ?? 0)}` : "";

    return timeStr ? `${dateStr} ${timeStr}` : dateStr;
  }

  // direction: "oldest" = ascending, "future" = descending.
  // Null values sort first regardless of direction.
  static compareDateTimes({ date: aDate, time: aTime }, { date: bDate, time: bTime }, direction = "oldest") {
    const mult = direction === "oldest" ? 1 : -1;

    const aYear = Number(aDate?.year ?? 0);
    const bYear = Number(bDate?.year ?? 0);
    if (aYear !== bYear) return (aYear - bYear) * mult;

    const aMonth = aDate?.month != null ? Number(aDate.month) : null;
    const bMonth = bDate?.month != null ? Number(bDate.month) : null;
    if (aMonth === null && bMonth !== null) return -1;
    if (aMonth !== null && bMonth === null) return 1;
    if (aMonth !== null && bMonth !== null && aMonth !== bMonth) return (aMonth - bMonth) * mult;

    const aDay = aDate?.day != null ? Number(aDate.day) : null;
    const bDay = bDate?.day != null ? Number(bDate.day) : null;
    if (aDay === null && bDay !== null) return -1;
    if (aDay !== null && bDay === null) return 1;
    if (aDay !== null && bDay !== null && aDay !== bDay) return (aDay - bDay) * mult;

    const aHour = aTime?.hour != null ? Number(aTime.hour) : null;
    const bHour = bTime?.hour != null ? Number(bTime.hour) : null;
    if (aHour === null && bHour !== null) return -1;
    if (aHour !== null && bHour === null) return 1;
    if (aHour !== null && bHour !== null) {
      if (aHour !== bHour) return (aHour - bHour) * mult;

      const aMinute = aTime?.minute != null ? Number(aTime.minute) : null;
      const bMinute = bTime?.minute != null ? Number(bTime.minute) : null;
      if (aMinute === null && bMinute !== null) return -1;
      if (aMinute !== null && bMinute === null) return 1;
      if (aMinute !== null && bMinute !== null && aMinute !== bMinute) return (aMinute - bMinute) * mult;
    }

    return 0;
  }

  // Sort key for jump-to-date scroll targeting. Null parts sort before their
  // first real value within the same parent unit. Calendar-aware multipliers.
  static toSortKey({ date, time }) {
    const monthSpan = Math.max(this.getMonthCount(), 12) + 1;
    const daySpan = Math.max(this.getMaxDaysInAnyMonth() ?? 31, 31) + 1;
    const hourSpan = this.getHoursPerDay() + 1;
    const minuteSpan = this.getMinutesPerHour() + 1;

    const y = Number(date?.year ?? 0);
    const mo = date?.month != null ? Number(date.month) : 0;
    const d = date?.day != null ? Number(date.day) : 0;
    const h = time?.hour != null ? Number(time.hour) : 0;
    const m = time?.minute != null ? Number(time.minute) : 0;

    return ((((y * monthSpan + mo) * daySpan + d) * hourSpan + h) * minuteSpan) + m;
  }
}
