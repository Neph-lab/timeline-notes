import { DEFAULT_TAGS, MODULE_ID, SETTINGS } from "../constants.mjs";

function parsHex(hex) {
  const s = String(hex ?? "").replace(/^#/, "");
  if (s.length === 3) {
    return [
      parseInt(s[0] + s[0], 16),
      parseInt(s[1] + s[1], 16),
      parseInt(s[2] + s[2], 16)
    ];
  }
  if (s.length === 6) {
    return [
      parseInt(s.slice(0, 2), 16),
      parseInt(s.slice(2, 4), 16),
      parseInt(s.slice(4, 6), 16)
    ];
  }
  return [136, 136, 136];
}

function linearize(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export class TagService {
  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.TAGS, {
      name: "TIMELINE_NOTES.Settings.Tags.Name",
      hint: "TIMELINE_NOTES.Settings.Tags.Hint",
      scope: "world",
      config: false,
      restricted: true,
      type: Array,
      default: DEFAULT_TAGS
    });
  }

  static list() {
    const value = game.settings.get(MODULE_ID, SETTINGS.TAGS);
    return Array.isArray(value) ? foundry.utils.deepClone(value) : [];
  }

  static get(id) {
    return this.list().find((t) => t.id === id) ?? null;
  }

  static async create({ name, color }) {
    if (!game.user?.isGM) throw new Error("Only GMs can create tags.");
    const tags = this.list();
    const tag = { id: foundry.utils.randomID(16), name: String(name ?? "").trim() || "New Tag", color: String(color ?? "#888888") };
    tags.push(tag);
    await game.settings.set(MODULE_ID, SETTINGS.TAGS, tags);
    return tag;
  }

  static async update(id, { name, color }) {
    if (!game.user?.isGM) throw new Error("Only GMs can update tags.");
    const tags = this.list();
    const index = tags.findIndex((t) => t.id === id);
    if (index < 0) throw new Error(`Tag not found: ${id}`);
    if (name !== undefined) tags[index].name = String(name).trim();
    if (color !== undefined) tags[index].color = String(color);
    await game.settings.set(MODULE_ID, SETTINGS.TAGS, tags);
    return tags[index];
  }

  static async delete(id) {
    if (!game.user?.isGM) throw new Error("Only GMs can delete tags.");
    const tags = this.list().filter((t) => t.id !== id);
    await game.settings.set(MODULE_ID, SETTINGS.TAGS, tags);
  }

  static getContrastColor(hex) {
    const [r, g, b] = parsHex(hex);
    const L = 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
    return L > 0.179 ? "#000000" : "#ffffff";
  }

  static resolveTags(ids = []) {
    const all = this.list();
    return ids
      .map((id) => all.find((t) => t.id === id))
      .filter(Boolean)
      .map((t) => ({ ...t, textColor: this.getContrastColor(t.color) }));
  }
}

export function getAuthorDisplay(userId) {
  const user = game.users?.get(userId);
  const color = String(user?.color ?? "#888888");
  return {
    name: user?.name ?? game.i18n.localize("TIMELINE_NOTES.Author.Unknown"),
    color,
    textColor: TagService.getContrastColor(color)
  };
}
