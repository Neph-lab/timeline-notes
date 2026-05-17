import { MODULE_ID } from "./constants.mjs";
import { CalendarService } from "./services/calendar-service.mjs";
import { installDocumentRegistrationSpike } from "./spikes/document-registration-spike.mjs";

Hooks.once("init", () => {
  console.info(`${MODULE_ID} | Initializing for Foundry VTT V14`);
  CalendarService.registerSettings();
  installDocumentRegistrationSpike();
});

Hooks.once("ready", () => {
  globalThis.timelineNotes = {
    ...(globalThis.timelineNotes ?? {}),
    CalendarService
  };

  if (!game.user?.isGM) return;

  console.info(`${MODULE_ID} | Document registration spike available`, {
    dryRun: "await timelineNotes.runDocumentRegistrationSpike()",
    registerOnly: "await timelineNotes.runDocumentRegistrationSpike({ mutate: true })",
    createTestDocument: "await timelineNotes.runDocumentRegistrationSpike({ mutate: true, create: true })"
  });
});
