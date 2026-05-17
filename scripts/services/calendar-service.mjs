import { DEFAULT_CALENDAR_ID, MODULE_ID, SETTINGS } from "../constants.mjs";

const SECONDS_PER_DAY = 24 * 60 * 60;

function pad(value, length = 2) {
  return String(value).padStart(length, "0");
}

function cloneDate(date) {
  return {
    year: Number(date?.year ?? 0),
    month: Number(date?.month ?? 1),
    day: Number(date?.day ?? 1)
  };
}

function cloneTime(time) {
  return {
    hour: Number(time?.hour ?? 0),
    minute: Number(time?.minute ?? 0),
    second: Number(time?.second ?? 0)
  };
}

function gregorianNow() {
  const now = new Date();

  return {
    date: {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate()
    },
    time: {
      hour: now.getHours(),
      minute: now.getMinutes(),
      second: now.getSeconds()
    }
  };
}

function gregorianFromWorldTime(worldTime) {
  if (!Number.isFinite(worldTime)) return gregorianNow();

  const date = new Date(worldTime * 1000);
  if (Number.isNaN(date.getTime())) return gregorianNow();

  return {
    date: {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate()
    },
    time: {
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds()
    }
  };
}

function validateDateParts(date) {
  const normalized = cloneDate(date);

  if (!Number.isInteger(normalized.year)) throw new Error("Date year must be an integer.");
  if (!Number.isInteger(normalized.month) || normalized.month < 1 || normalized.month > 12) {
    throw new Error("Date month must be an integer from 1 to 12.");
  }
  if (!Number.isInteger(normalized.day) || normalized.day < 1 || normalized.day > 31) {
    throw new Error("Date day must be an integer from 1 to 31.");
  }

  return normalized;
}

function validateTimeParts(time) {
  const normalized = cloneTime(time);

  if (!Number.isInteger(normalized.hour) || normalized.hour < 0 || normalized.hour > 23) {
    throw new Error("Time hour must be an integer from 0 to 23.");
  }
  if (!Number.isInteger(normalized.minute) || normalized.minute < 0 || normalized.minute > 59) {
    throw new Error("Time minute must be an integer from 0 to 59.");
  }
  if (!Number.isInteger(normalized.second) || normalized.second < 0 || normalized.second > 59) {
    throw new Error("Time second must be an integer from 0 to 59.");
  }

  return normalized;
}

function compareDateParts(a, b) {
  const left = validateDateParts(a);
  const right = validateDateParts(b);

  return left.year - right.year || left.month - right.month || left.day - right.day;
}

function compareTimeParts(a, b) {
  const left = validateTimeParts(a);
  const right = validateTimeParts(b);

  return left.hour - right.hour || left.minute - right.minute || left.second - right.second;
}

export class CalendarService {
  static registerSettings() {
    const current = gregorianNow();

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
      default: current.date
    });

    game.settings.register(MODULE_ID, SETTINGS.CAMPAIGN_CURRENT_TIME, {
      name: "TIMELINE_NOTES.Settings.CampaignCurrentTime.Name",
      hint: "TIMELINE_NOTES.Settings.CampaignCurrentTime.Hint",
      scope: "world",
      config: false,
      restricted: true,
      type: Object,
      default: current.time
    });
  }

  static get calendarId() {
    return game.settings.get(MODULE_ID, SETTINGS.CAMPAIGN_CALENDAR_ID) || DEFAULT_CALENDAR_ID;
  }

  static getCurrentDateTime() {
    return {
      calendarId: this.calendarId,
      date: validateDateParts(game.settings.get(MODULE_ID, SETTINGS.CAMPAIGN_CURRENT_DATE)),
      time: validateTimeParts(game.settings.get(MODULE_ID, SETTINGS.CAMPAIGN_CURRENT_TIME))
    };
  }

  static getDefaultNoteDateTime() {
    return this.getCurrentDateTime();
  }

  static getDefaultCampaignDateTime(calendarId = DEFAULT_CALENDAR_ID) {
    if (calendarId === DEFAULT_CALENDAR_ID) return gregorianNow();

    return {
      date: { year: 0, month: 1, day: 1 },
      time: { hour: 0, minute: 0, second: 0 }
    };
  }

  static getFoundryWorldDateTime() {
    return gregorianFromWorldTime(game.time?.worldTime);
  }

  static async setCurrentDateTime({ calendarId = DEFAULT_CALENDAR_ID, date, time }) {
    if (!game.user?.isGM) throw new Error("Only GMs can set the campaign date and time.");

    await game.settings.set(MODULE_ID, SETTINGS.CAMPAIGN_CALENDAR_ID, calendarId || DEFAULT_CALENDAR_ID);
    await game.settings.set(MODULE_ID, SETTINGS.CAMPAIGN_CURRENT_DATE, validateDateParts(date));
    await game.settings.set(MODULE_ID, SETTINGS.CAMPAIGN_CURRENT_TIME, validateTimeParts(time));

    return this.getCurrentDateTime();
  }

  static formatDate(date) {
    const value = validateDateParts(date);
    return `${pad(value.year, 4)}-${pad(value.month)}-${pad(value.day)}`;
  }

  static formatTime(time) {
    const value = validateTimeParts(time);
    return `${pad(value.hour)}:${pad(value.minute)}:${pad(value.second)}`;
  }

  static formatDateTime({ date, time }) {
    return `${this.formatDate(date)} ${this.formatTime(time)}`;
  }

  static compareDateTimes(left, right) {
    return compareDateParts(left.date, right.date) || compareTimeParts(left.time, right.time);
  }

  static toSortKey({ date, time }) {
    const dayNumber = (date.year * 372) + ((date.month - 1) * 31) + (date.day - 1);
    const seconds = time.hour * 3600 + time.minute * 60 + time.second;
    return (dayNumber * SECONDS_PER_DAY) + seconds;
  }
}
