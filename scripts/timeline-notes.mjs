import { MODULE_ID } from "./constants.mjs";
import { CalendarService } from "./services/calendar-service.mjs";
import { TimelineNoteStore } from "./services/note-store.mjs";
import { TimelineNotePermissions } from "./services/permissions.mjs";
import { installDocumentRegistrationSpike } from "./spikes/document-registration-spike.mjs";

Hooks.once("init", () => {
  console.info(`${MODULE_ID} | Initializing for Foundry VTT V14`);
  CalendarService.registerSettings();
  TimelineNoteStore.registerSettings();
  installDocumentRegistrationSpike();
});

Hooks.once("ready", () => {
  globalThis.timelineNotes = {
    ...(globalThis.timelineNotes ?? {}),
    CalendarService,
    TimelineNotePermissions,
    TimelineNoteStore
  };

  if (!game.user?.isGM) return;

  console.info(`${MODULE_ID} | Document registration spike available`, {
    dryRun: "await timelineNotes.runDocumentRegistrationSpike()",
    registerOnly: "await timelineNotes.runDocumentRegistrationSpike({ mutate: true })",
    createTestDocument: "await timelineNotes.runDocumentRegistrationSpike({ mutate: true, create: true })",
    developmentNoteStore: "await timelineNotes.TimelineNoteStore.create({ name: 'Test note', content: '<p>Hello timeline.</p>' })"
  });
});
