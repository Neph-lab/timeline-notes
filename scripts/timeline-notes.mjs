import { MODULE_ID } from "./constants.mjs";
import { installDocumentRegistrationSpike } from "./spikes/document-registration-spike.mjs";

Hooks.once("init", () => {
  console.info(`${MODULE_ID} | Initializing for Foundry VTT V14`);
  installDocumentRegistrationSpike();
});

Hooks.once("ready", () => {
  if (!game.user?.isGM) return;

  console.info(`${MODULE_ID} | Document registration spike available`, {
    dryRun: "await timelineNotes.runDocumentRegistrationSpike()",
    registerOnly: "await timelineNotes.runDocumentRegistrationSpike({ mutate: true })",
    createTestDocument: "await timelineNotes.runDocumentRegistrationSpike({ mutate: true, create: true })"
  });
});
