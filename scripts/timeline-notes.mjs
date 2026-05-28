import { MODULE_ID } from "./constants.mjs";
import { CalendarService } from "./services/calendar-service.mjs";
import { TimelineNoteStore } from "./services/note-store.mjs";
import { TimelineNotePermissions } from "./services/permissions.mjs";
import { TagService } from "./services/tag-service.mjs";
import { registerTimelineSidebarTab, TimelineSidebarTab } from "./applications/timeline-sidebar-tab.mjs";
import { TimelineNoteWindow } from "./applications/timeline-note-window.mjs";
import { TagSettingsApp } from "./applications/tag-settings.mjs";

Hooks.once("init", () => {
  console.info(`${MODULE_ID} | Initializing for Foundry VTT V14`);
  CalendarService.registerSettings();
  TimelineNoteStore.registerSettings();
  TagService.registerSettings();
  game.settings.registerMenu(MODULE_ID, "tagManager", {
    name: "TIMELINE_NOTES.Settings.Tags.Name",
    label: "TIMELINE_NOTES.Settings.Tags.Label",
    hint: "TIMELINE_NOTES.Settings.Tags.Hint",
    icon: "fa-solid fa-tags",
    type: TagSettingsApp,
    restricted: true
  });
  registerTimelineSidebarTab();
});

Hooks.once("ready", () => {
  globalThis.timelineNotes = {
    ...(globalThis.timelineNotes ?? {}),
    CalendarService,
    TagService,
    TagSettingsApp,
    TimelineNotePermissions,
    TimelineNoteStore,
    TimelineNoteWindow,
    TimelineSidebarTab
  };
});
