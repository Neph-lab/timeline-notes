import { DEFAULT_CALENDAR_ID, MODULE_ID, SETTINGS, VISIBILITY } from "../constants.mjs";
import { CalendarService } from "./calendar-service.mjs";
import { TimelineNotePermissions } from "./permissions.mjs";

function getStoredNotes() {
  const value = game.settings.get(MODULE_ID, SETTINGS.DEVELOPMENT_NOTES);
  return Array.isArray(value) ? foundry.utils.deepClone(value) : [];
}

async function setStoredNotes(notes) {
  await game.settings.set(MODULE_ID, SETTINGS.DEVELOPMENT_NOTES, notes);
  return getStoredNotes();
}

function createId() {
  return foundry.utils.randomID(16);
}

function normalizeVisibility(value) {
  if (Object.values(VISIBILITY).includes(value)) return value;
  return VISIBILITY.PRIVATE;
}

function normalizeNoteData(data = {}, existing = null) {
  const defaults = CalendarService.getDefaultNoteDateTime();
  const startDate = data.startDate ?? existing?.startDate ?? defaults.date;
  const startTime = data.startTime ?? existing?.startTime ?? defaults.time;
  const endDate = data.endDate ?? existing?.endDate ?? startDate;
  const endTime = data.endTime ?? existing?.endTime ?? startTime;
  const calendarId = data.calendarId ?? existing?.calendarId ?? defaults.calendarId ?? DEFAULT_CALENDAR_ID;
  const now = Date.now();

  return {
    id: existing?.id ?? createId(),
    name: String(data.name ?? existing?.name ?? game.i18n.localize("TIMELINE_NOTES.DefaultNoteName")).trim(),
    author: existing?.author ?? data.author ?? game.user.id,
    startDate,
    startTime,
    endDate,
    endTime,
    content: String(data.content ?? existing?.content ?? ""),
    visibility: normalizeVisibility(data.visibility ?? existing?.visibility),
    calendarId,
    createdTime: existing?.createdTime ?? now,
    updatedTime: now
  };
}

function sortNotes(notes, direction = "future") {
  const sorted = [...notes].sort((left, right) => {
    const order = CalendarService.compareDateTimes(
      { date: left.startDate, time: left.startTime },
      { date: right.startDate, time: right.startTime }
    );

    return direction === "oldest" ? order : -order;
  });

  return sorted;
}

export class TimelineNoteStore {
  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.DEVELOPMENT_NOTES, {
      name: "TIMELINE_NOTES.Settings.DevelopmentNotes.Name",
      hint: "TIMELINE_NOTES.Settings.DevelopmentNotes.Hint",
      scope: "world",
      config: false,
      restricted: false,
      type: Array,
      default: []
    });
  }

  static list({ user = game.user, query = "", direction = "future" } = {}) {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const notes = getStoredNotes().filter((note) => {
      if (!TimelineNotePermissions.canView(note, user)) return false;
      if (!normalizedQuery) return true;

      return `${note.name} ${note.content}`.toLocaleLowerCase().includes(normalizedQuery);
    });

    return sortNotes(notes, direction);
  }

  static get(id, { user = game.user } = {}) {
    const note = getStoredNotes().find((candidate) => candidate.id === id);
    if (!TimelineNotePermissions.canView(note, user)) return null;

    return note;
  }

  static async create(data = {}) {
    const note = normalizeNoteData(data);
    const notes = getStoredNotes();
    notes.push(note);

    await setStoredNotes(notes);
    return note;
  }

  static async update(id, data = {}, { user = game.user } = {}) {
    const notes = getStoredNotes();
    const index = notes.findIndex((candidate) => candidate.id === id);
    if (index < 0) throw new Error(`Timeline note not found: ${id}`);
    if (!TimelineNotePermissions.canEdit(notes[index], user)) throw new Error("You do not have permission to edit this timeline note.");

    const updated = normalizeNoteData(data, notes[index]);
    notes[index] = updated;

    await setStoredNotes(notes);
    return updated;
  }

  static async delete(id, { user = game.user } = {}) {
    const notes = getStoredNotes();
    const note = notes.find((candidate) => candidate.id === id);
    if (!note) return false;
    if (!TimelineNotePermissions.canDelete(note, user)) throw new Error("You do not have permission to delete this timeline note.");

    await setStoredNotes(notes.filter((candidate) => candidate.id !== id));
    return true;
  }
}

