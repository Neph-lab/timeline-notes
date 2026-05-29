import { DEFAULT_CALENDAR_ID, MODULE_ID, SETTINGS, VISIBILITY } from "../constants.mjs";
import { CalendarService } from "./calendar-service.mjs";
import { TimelineNotePermissions } from "./permissions.mjs";

const NOTES_CHANGED_HOOK = `${MODULE_ID}.notesChanged`;

function getStoredNotes() {
  const value = game.settings.get(MODULE_ID, SETTINGS.DEVELOPMENT_NOTES);
  return Array.isArray(value) ? foundry.utils.deepClone(value) : [];
}

async function setStoredNotes(notes) {
  await game.settings.set(MODULE_ID, SETTINGS.DEVELOPMENT_NOTES, notes);
  return getStoredNotes();
}

function notifyNotesChanged(action, note = null) {
  Hooks.callAll(NOTES_CHANGED_HOOK, { action, note });
}

function createId() {
  return foundry.utils.randomID(16);
}

function normalizeVisibility(value) {
  if (Object.values(VISIBILITY).includes(value)) return value;
  return VISIBILITY.PRIVATE;
}

// Normalize a date/time object via the active calendar: year required, month/day/
// hour/minute optional and clamped to the calendar's ranges. Legacy 1-based month/day
// values are preserved (and only clamped down if they exceed the current calendar).
// Second is discarded by clampTime.
function normalizeDate(date) {
  return CalendarService.clampDate(date ?? { year: 0, month: null, day: null });
}

function normalizeTime(time) {
  return CalendarService.clampTime(time ?? { hour: null, minute: null });
}

function normalizeNoteData(data = {}, existing = null) {
  const defaults = CalendarService.getDefaultNoteDateTime();
  const calendarId = data.calendarId ?? existing?.calendarId ?? defaults.calendarId ?? DEFAULT_CALENDAR_ID;
  const now = Date.now();

  const startDate = normalizeDate(data.startDate ?? existing?.startDate ?? defaults.date);
  const startTime = normalizeTime(data.startTime ?? existing?.startTime ?? defaults.time);
  const hasEnd = Boolean(data.hasEnd ?? existing?.hasEnd ?? false);
  const endDate = normalizeDate(data.endDate ?? existing?.endDate ?? startDate);
  const endTime = normalizeTime(data.endTime ?? existing?.endTime ?? startTime);

  return {
    id: existing?.id ?? createId(),
    name: String(data.name ?? existing?.name ?? game.i18n.localize("TIMELINE_NOTES.DefaultNoteName")).trim(),
    author: existing?.author ?? data.author ?? game.user.id,
    startDate,
    startTime,
    hasEnd,
    endDate,
    endTime,
    content: String(data.content ?? existing?.content ?? ""),
    visibility: normalizeVisibility(data.visibility ?? existing?.visibility),
    calendarId,
    tags: [...new Set(Array.isArray(data.tags) ? data.tags : (existing?.tags ?? []))],
    createdTime: existing?.createdTime ?? now,
    updatedTime: now
  };
}

function sortNotes(notes, direction = "future") {
  return [...notes].sort((a, b) => CalendarService.compareDateTimes(
    { date: a.startDate, time: a.startTime },
    { date: b.startDate, time: b.startTime },
    direction
  ));
}

function normalizeStoredNote(note) {
  if (!note) return note;
  const defaults = CalendarService.getDefaultNoteDateTime();
  const startDate = normalizeDate(note.startDate ?? defaults.date);
  const startTime = normalizeTime(note.startTime);
  return {
    ...note,
    hasEnd: Boolean(note.hasEnd),
    startDate,
    startTime,
    endDate: normalizeDate(note.endDate ?? startDate),
    endTime: normalizeTime(note.endTime ?? startTime),
    tags: [...new Set(Array.isArray(note.tags) ? note.tags : [])]
  };
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

  static list({ user = game.user, query = "", direction = "future", tags = [] } = {}) {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const notes = getStoredNotes().map(normalizeStoredNote).filter((note) => {
      if (!TimelineNotePermissions.canView(note, user)) return false;
      if (normalizedQuery && !`${note.name} ${note.content}`.toLocaleLowerCase().includes(normalizedQuery)) return false;
      if (tags.length > 0 && !note.tags.some((t) => tags.includes(t))) return false;
      return true;
    });
    return sortNotes(notes, direction);
  }

  static get(id, { user = game.user } = {}) {
    const note = normalizeStoredNote(getStoredNotes().find((candidate) => candidate.id === id));
    if (!TimelineNotePermissions.canView(note, user)) return null;
    return note;
  }

  static async create(data = {}) {
    const note = normalizeNoteData(data);
    const notes = getStoredNotes();
    notes.push(note);
    await setStoredNotes(notes);
    notifyNotesChanged("create", note);
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
    notifyNotesChanged("update", updated);
    return updated;
  }

  static async removeTagFromAll(tagId) {
    const notes = getStoredNotes();
    let changed = false;
    for (const note of notes) {
      if (Array.isArray(note.tags) && note.tags.includes(tagId)) {
        note.tags = note.tags.filter((t) => t !== tagId);
        changed = true;
      }
    }
    if (changed) {
      await setStoredNotes(notes);
      notifyNotesChanged("update");
    }
  }

  static async delete(id, { user = game.user } = {}) {
    const notes = getStoredNotes();
    const note = notes.find((candidate) => candidate.id === id);
    if (!note) return false;
    if (!TimelineNotePermissions.canDelete(note, user)) throw new Error("You do not have permission to delete this timeline note.");
    await setStoredNotes(notes.filter((candidate) => candidate.id !== id));
    notifyNotesChanged("delete", note);
    return true;
  }
}

TimelineNoteStore.NOTES_CHANGED_HOOK = NOTES_CHANGED_HOOK;
