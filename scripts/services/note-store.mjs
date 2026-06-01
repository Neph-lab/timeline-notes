import { DEFAULT_CALENDAR_ID, MODULE_ID, SETTINGS, VISIBILITY } from "../constants.mjs";
import { CalendarService } from "./calendar-service.mjs";
import { TimelineNotePermissions } from "./permissions.mjs";

const NOTES_CHANGED_HOOK = `${MODULE_ID}.notesChanged`;

// Notes are persisted in a world-scoped setting, which Foundry only lets a GM
// write. To let players create/edit/delete their own notes, non-GM clients relay
// the operation to the active GM over this socket; the GM performs the write and
// the synced setting refreshes every client (see registerSocket / updateSetting).
const SOCKET_NAME = `module.${MODULE_ID}`;
const REQUEST_EVENT = "noteRequest";
const RESPONSE_EVENT = "noteResponse";
const REQUEST_TIMEOUT_MS = 10000;

const pendingRequests = new Map();

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

// --- GM-side write operations -------------------------------------------------
// These perform the authoritative read-modify-write and must run on a GM client
// (directly when the acting user is a GM, or via the socket relay otherwise).

async function commitCreate(note) {
  const notes = getStoredNotes();
  // Idempotent by id: if more than one GM fulfils the same relayed create, the
  // note is only added once (and a re-sent request can't duplicate it).
  if (notes.some((candidate) => candidate.id === note.id)) return note;
  notes.push(note);
  await setStoredNotes(notes);
  notifyNotesChanged("create", note);
  return note;
}

async function commitUpdate(id, data, user) {
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

async function commitDelete(id, user) {
  const notes = getStoredNotes();
  const note = notes.find((candidate) => candidate.id === id);
  if (!note) return false;
  if (!TimelineNotePermissions.canDelete(note, user)) throw new Error("You do not have permission to delete this timeline note.");
  await setStoredNotes(notes.filter((candidate) => candidate.id !== id));
  notifyNotesChanged("delete", note);
  return true;
}

async function commitRemoveTagFromAll(tagId) {
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

// Run an operation on the originating client's behalf. The requesting user is
// resolved so the GM enforces the same permission checks the player would have.
function performOperation(type, payload, user) {
  switch (type) {
    case "create": return commitCreate(payload.note);
    case "update": return commitUpdate(payload.id, payload.data, user);
    case "delete": return commitDelete(payload.id, user);
    case "removeTagFromAll": return commitRemoveTagFromAll(payload.tagId);
    default: throw new Error(`Unknown timeline note operation: ${type}`);
  }
}

// --- Socket relay (non-GM clients) -------------------------------------------

// GM users that are currently connected. A relayed write is fulfilled by any of
// these, so it works even if another GM account shows a stale `active` flag.
function activeGMs() {
  return game.users.filter((u) => u.isGM && u.active);
}

function relayOperation(type, payload) {
  return new Promise((resolve, reject) => {
    if (!activeGMs().length) {
      reject(new Error(game.i18n.localize("TIMELINE_NOTES.Error.NoActiveGM")));
      return;
    }
    const requestId = createId();
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(game.i18n.localize("TIMELINE_NOTES.Error.RequestTimeout")));
    }, REQUEST_TIMEOUT_MS);
    pendingRequests.set(requestId, { resolve, reject, timeout });
    game.socket.emit(SOCKET_NAME, { event: REQUEST_EVENT, requestId, userId: game.user.id, type, payload });
  });
}

async function handleRelayRequest(message) {
  // Any connected GM fulfils the request; commitCreate is idempotent so two GMs
  // acting on it can't duplicate the note.
  if (!game.user.isGM) return;
  const user = game.users.get(message.userId) ?? game.user;
  const response = { event: RESPONSE_EVENT, requestId: message.requestId, ok: true };
  try {
    response.result = await performOperation(message.type, message.payload, user);
  } catch (error) {
    response.ok = false;
    response.error = error.message;
    console.error(`${MODULE_ID} | Relayed "${message.type}" request failed`, error);
  }
  game.socket.emit(SOCKET_NAME, response);
}

function handleRelayResponse(message) {
  const pending = pendingRequests.get(message.requestId);
  if (!pending) return;
  clearTimeout(pending.timeout);
  pendingRequests.delete(message.requestId);
  if (message.ok) pending.resolve(message.result);
  else pending.reject(new Error(message.error));
}

function onSocketMessage(message) {
  if (!message || typeof message !== "object") return;
  if (message.event === REQUEST_EVENT) handleRelayRequest(message);
  else if (message.event === RESPONSE_EVENT) handleRelayResponse(message);
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

  // Wire up the GM relay socket and a cross-client refresh. Call once in `ready`,
  // after `game.socket` exists.
  static registerSocket() {
    game.socket.on(SOCKET_NAME, onSocketMessage);
    // When the GM's write syncs to other clients, refresh their views too.
    Hooks.on("updateSetting", (setting) => {
      if (setting?.key === `${MODULE_ID}.${SETTINGS.DEVELOPMENT_NOTES}`) notifyNotesChanged("sync");
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
    // Stamp author/id on the originating client so a relayed create keeps the
    // requesting player as the author rather than the GM who performs the write.
    const note = normalizeNoteData(data);
    if (game.user.isGM) return commitCreate(note);
    return relayOperation("create", { note });
  }

  static async update(id, data = {}, { user = game.user } = {}) {
    if (game.user.isGM) return commitUpdate(id, data, user);
    return relayOperation("update", { id, data });
  }

  static async removeTagFromAll(tagId) {
    if (game.user.isGM) return commitRemoveTagFromAll(tagId);
    return relayOperation("removeTagFromAll", { tagId });
  }

  static async delete(id, { user = game.user } = {}) {
    if (game.user.isGM) return commitDelete(id, user);
    return relayOperation("delete", { id });
  }
}

TimelineNoteStore.NOTES_CHANGED_HOOK = NOTES_CHANGED_HOOK;
