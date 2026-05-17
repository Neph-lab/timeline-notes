import { VISIBILITY } from "../constants.mjs";

export class TimelineNotePermissions {
  static isAuthor(note, user = game.user) {
    return Boolean(user?.id && note?.author === user.id);
  }

  static canView(note, user = game.user) {
    if (!note || !user) return false;
    if (user.isGM) return true;
    if (this.isAuthor(note, user)) return true;

    return note.visibility === VISIBILITY.VIEW || note.visibility === VISIBILITY.EDIT;
  }

  static canEdit(note, user = game.user) {
    if (!note || !user) return false;
    if (user.isGM) return true;
    if (this.isAuthor(note, user)) return true;

    return note.visibility === VISIBILITY.EDIT;
  }

  static canDelete(note, user = game.user) {
    if (!note || !user) return false;

    return user.isGM || this.isAuthor(note, user);
  }
}

