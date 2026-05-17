import { MODULE_ID } from "./constants.mjs";
import { CalendarService } from "./services/calendar-service.mjs";
import { TimelineNoteStore } from "./services/note-store.mjs";
import { TimelineNotePermissions } from "./services/permissions.mjs";
import { registerTimelineSidebarTab, TimelineSidebarTab } from "./applications/timeline-sidebar-tab.mjs";
import { TimelineNoteWindow } from "./applications/timeline-note-window.mjs";
import { installDocumentRegistrationSpike } from "./spikes/document-registration-spike.mjs";

Hooks.once("init", () => {
  console.info(`${MODULE_ID} | Initializing for Foundry VTT V14`);
  CalendarService.registerSettings();
  TimelineNoteStore.registerSettings();
  installDocumentRegistrationSpike();
  registerTimelineSidebarTab();
});

Hooks.once("ready", () => {
  globalThis.timelineNotes = {
    ...(globalThis.timelineNotes ?? {}),
    CalendarService,
    TimelineNotePermissions,
    TimelineNoteStore,
    TimelineNoteWindow,
    TimelineSidebarTab
  };

  if (!game.user?.isGM) return;

  console.info(`${MODULE_ID} | Document registration spike available`, {
    dryRun: "await timelineNotes.runDocumentRegistrationSpike()",
    registerOnly: "await timelineNotes.runDocumentRegistrationSpike({ mutate: true })",
    createTestDocument: "await timelineNotes.runDocumentRegistrationSpike({ mutate: true, create: true })",
    developmentNoteStore: "await timelineNotes.TimelineNoteStore.create({ name: 'Test note', content: '<p>Hello timeline.</p>' })"
  });
});
