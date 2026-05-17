import { COLLECTION_NAME, DOCUMENT_NAME, MODULE_ID, SETTINGS } from "../constants.mjs";

const SPIKE_API_NAME = "timelineNotes";

function addCheck(report, name, passed, details = {}) {
  report.checks.push({ name, passed, ...details });
}

function summarizeError(error) {
  return {
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    stack: error?.stack
  };
}

function getFoundryVersion() {
  return game?.version ?? game?.release?.version ?? null;
}

function createDateSchema(fields) {
  return new fields.SchemaField({
    year: new fields.NumberField({ required: true, integer: true, initial: 0 }),
    month: new fields.NumberField({ required: true, integer: true, min: 1, initial: 1 }),
    day: new fields.NumberField({ required: true, integer: true, min: 1, initial: 1 })
  });
}

function createTimeSchema(fields) {
  return new fields.SchemaField({
    hour: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
    minute: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
    second: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0 })
  });
}

function defineCandidateClasses() {
  const fields = foundry.data.fields;
  const mergeObject = foundry.utils.mergeObject;
  const ClientDocumentMixin = foundry.documents.abstract.ClientDocumentMixin;

  class BaseTimelineNote extends foundry.abstract.Document {
    static metadata = Object.freeze(mergeObject(super.metadata ?? {}, {
      name: DOCUMENT_NAME,
      collection: COLLECTION_NAME,
      label: "TIMELINE_NOTES.Document.TimelineNote",
      labelPlural: "TIMELINE_NOTES.Document.TimelineNotes",
      indexed: true,
      compendiumIndexFields: ["name", "startDate", "content"],
      embedded: {},
      permissions: {
        create: "PLAYER",
        view: "OWNER",
        update: "OWNER",
        delete: "OWNER"
      },
      preserveOnImport: ["_id", "sort"]
    }, { inplace: false }));

    static defineSchema() {
      return {
        _id: new fields.DocumentIdField(),
        name: new fields.StringField({ required: true, blank: false, initial: "New Timeline Note" }),
        author: new fields.StringField({ required: true, blank: false }),
        startDate: createDateSchema(fields),
        startTime: createTimeSchema(fields),
        endDate: createDateSchema(fields),
        endTime: createTimeSchema(fields),
        content: new fields.HTMLField({ required: false, blank: true, initial: "" }),
        visibility: new fields.StringField({
          required: true,
          blank: false,
          initial: "private",
          choices: ["private", "view", "edit"]
        }),
        calendarId: new fields.StringField({ required: true, blank: false, initial: "gregorian" }),
        ownership: new fields.DocumentOwnershipField(),
        flags: new fields.ObjectField(),
        _stats: new fields.DocumentStatsField()
      };
    }
  }

  class TimelineNote extends ClientDocumentMixin(BaseTimelineNote) {}

  class TimelineNotes extends foundry.documents.abstract.WorldCollection {
    static documentName = DOCUMENT_NAME;
  }

  return { BaseTimelineNote, TimelineNote, TimelineNotes };
}

function registerCandidateClasses(report) {
  const classes = defineCandidateClasses();
  const { TimelineNote, TimelineNotes } = classes;

  CONFIG[DOCUMENT_NAME] = {
    ...(CONFIG[DOCUMENT_NAME] ?? {}),
    documentClass: TimelineNote,
    collection: TimelineNotes
  };

  globalThis[DOCUMENT_NAME] = TimelineNote;
  game.collections.set(COLLECTION_NAME, new TimelineNotes());

  addCheck(report, "registered-client-candidate", true, {
    configKey: `CONFIG.${DOCUMENT_NAME}`,
    globalKey: DOCUMENT_NAME,
    collectionName: COLLECTION_NAME
  });

  return classes;
}

function buildSpikeData() {
  return {
    name: "Timeline Note Document Spike",
    author: game.user.id,
    startDate: { year: 0, month: 1, day: 1 },
    startTime: { hour: 0, minute: 0, second: 0 },
    endDate: { year: 0, month: 1, day: 1 },
    endTime: { hour: 0, minute: 0, second: 0 },
    content: "<p>Created by the Timeline Notes primary document registration spike.</p>",
    visibility: "private",
    calendarId: "gregorian"
  };
}

async function tryCreateTimelineNote(report, TimelineNote) {
  const created = await TimelineNote.implementation.create(buildSpikeData(), { render: false });

  addCheck(report, "created-document", Boolean(created), {
    id: created?.id ?? null,
    uuid: created?.uuid ?? null
  });

  if (!created) return null;

  const updated = await created.update({
    content: "<p>Created and updated by the Timeline Notes primary document registration spike.</p>"
  }, { render: false });

  addCheck(report, "updated-document", Boolean(updated), {
    id: updated?.id ?? null
  });

  return updated;
}

function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.ENABLE_PRIMARY_DOCUMENT_SPIKE, {
    name: "TIMELINE_NOTES.Settings.EnablePrimaryDocumentSpike.Name",
    hint: "TIMELINE_NOTES.Settings.EnablePrimaryDocumentSpike.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
    requiresReload: true
  });
}

export async function runDocumentRegistrationSpike({ mutate = false, create = false } = {}) {
  const report = {
    moduleId: MODULE_ID,
    documentName: DOCUMENT_NAME,
    collectionName: COLLECTION_NAME,
    foundryVersion: getFoundryVersion(),
    mutate,
    create,
    checks: [],
    errors: []
  };

  try {
    addCheck(report, "foundry-v14", String(report.foundryVersion ?? "").startsWith("14"), {
      version: report.foundryVersion
    });
    addCheck(report, "gm-user", Boolean(game.user?.isGM), {
      userId: game.user?.id ?? null
    });
    const primaryDocumentTypes = CONST.PRIMARY_DOCUMENT_TYPES ?? [];
    const worldDocumentTypes = CONST.WORLD_DOCUMENT_TYPES ?? [];

    addCheck(report, "primary-document-constant-known", primaryDocumentTypes.includes(DOCUMENT_NAME), {
      value: primaryDocumentTypes.includes(DOCUMENT_NAME)
    });
    addCheck(report, "world-document-constant-known", worldDocumentTypes.includes(DOCUMENT_NAME), {
      value: worldDocumentTypes.includes(DOCUMENT_NAME)
    });
    addCheck(report, "config-entry-exists", Boolean(CONFIG[DOCUMENT_NAME]), {
      value: Boolean(CONFIG[DOCUMENT_NAME])
    });
    addCheck(report, "collection-entry-exists", game.collections.has(COLLECTION_NAME), {
      value: game.collections.has(COLLECTION_NAME)
    });

    const classes = mutate ? registerCandidateClasses(report) : defineCandidateClasses();
    addCheck(report, "candidate-classes-defined", true, {
      baseClass: classes.BaseTimelineNote.name,
      clientClass: classes.TimelineNote.name,
      collectionClass: classes.TimelineNotes.name
    });

    if (create) {
      if (!mutate) throw new Error("Creation requires mutate: true so the candidate class is registered first.");
      if (!game.user?.isGM) throw new Error("Creation test requires a GM user.");
      await tryCreateTimelineNote(report, classes.TimelineNote);
    }
  } catch (error) {
    report.errors.push(summarizeError(error));
  }

  report.ok = report.errors.length === 0;
  console.info(`${MODULE_ID} | Document registration spike report`, report);
  return report;
}

export function installDocumentRegistrationSpike() {
  registerSettings();

  globalThis[SPIKE_API_NAME] = {
    ...(globalThis[SPIKE_API_NAME] ?? {}),
    runDocumentRegistrationSpike
  };

  if (game.settings.get(MODULE_ID, SETTINGS.ENABLE_PRIMARY_DOCUMENT_SPIKE)) {
    const report = {
      moduleId: MODULE_ID,
      documentName: DOCUMENT_NAME,
      collectionName: COLLECTION_NAME,
      checks: [],
      errors: []
    };

    try {
      registerCandidateClasses(report);
      console.info(`${MODULE_ID} | Primary document spike registration enabled`, report);
    } catch (error) {
      console.error(`${MODULE_ID} | Primary document spike registration failed`, summarizeError(error));
    }
  }
}
