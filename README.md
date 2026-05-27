# Timeline Notes

Timeline Notes is a Foundry VTT V14 module for campaign timeline notes in a dedicated sidebar tab.

The target experience is a timeline-first note browser where users can create dated notes, view summaries inline, and open each note in its own `ApplicationV2` window. GMs can see and edit every note. Players can control whether their own notes are private, viewable by other players, or editable by other players.

## Current Status

This repository is initialized with the initial V14 scope and implementation plan. The first implementation milestone is a V14 API validation spike for registering `TimelineNote` as a real Foundry document type.

## V14 Target

- Foundry VTT compatibility starts at V14.
- UI work should use V14 `ApplicationV2` / `DocumentSheetV2` patterns, not legacy `Application` / `DocumentSheet` assumptions.
- Manifest compatibility intentionally omits older core versions.

## Planning

See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

## V14 Document Registration Spike

The module currently includes a disabled-by-default spike to test whether Foundry VTT V14 will accept a module-owned primary `TimelineNote` document.

In a V14 test world, enable the module, sign in as a GM, open the browser console, and run:

```js
await timelineNotes.runDocumentRegistrationSpike()
```

If the dry run succeeds, test client-side registration:

```js
await timelineNotes.runDocumentRegistrationSpike({ mutate: true })
```

To attempt a real create/update through Foundry's document database API:

```js
await timelineNotes.runDocumentRegistrationSpike({ mutate: true, create: true })
```

The create/update probe times out after five seconds by default so a stalled database request returns a report instead of leaving the console command unresolved. To test with a longer timeout:

```js
await timelineNotes.runDocumentRegistrationSpike({ mutate: true, create: true, timeoutMs: 15000 })
```

For a reload-time persistence test, enable the world setting **Enable primary TimelineNote document spike**, reload the world, then run the create test again. Use a disposable test world because this intentionally probes unsupported primary document registration behavior.

## Calendar Service Smoke Test

Version `0.1.2` includes the hidden campaign date/time settings used by future note defaults. In a V14 world console, this should return the current stored campaign date and time:

```js
timelineNotes.CalendarService.getCurrentDateTime()
```

## Development Note Store Smoke Test

While the V14 primary document question is being validated, version `0.1.3` includes a temporary setting-backed note store so timeline UI behavior can be developed without blocking on persistence. This is not the final security model because world settings are not a proper replacement for Foundry document permissions.

```js
const note = await timelineNotes.TimelineNoteStore.create({ name: "Test note", content: "<p>Hello timeline.</p>" });
timelineNotes.TimelineNoteStore.list();
await timelineNotes.TimelineNoteStore.update(note.id, { visibility: "view" });
await timelineNotes.TimelineNoteStore.delete(note.id);
```

## Sidebar Smoke Test

Version `0.1.4` registers an initial V14 `AbstractSidebarTab` named `timelineNotes`. After updating the module, the sidebar should include a Timeline tab with create, filter, sort, view, edit, and delete controls backed by the temporary development note store.

Version `0.1.7` replaces the fallback mount with the V14 sidebar pattern used by DFreds UI Extender guidance: `HandlebarsApplicationMixin(AbstractSidebarTab)` plus a `PARTS` template keyed to the sidebar tab name.

Version `0.1.8` adds a store change hook so the sidebar updates when notes are saved from their own windows.

Version `0.1.9` replaces the temporary textarea with Foundry's ProseMirror custom element and renders note view mode through Foundry text enrichment so document links resolve correctly.

Version `0.1.10` orders the Timeline sidebar tab immediately after Journal.

Version `0.1.11` adds editable note start/end date and time fields. Notes with an end date render at both start and end positions in the timeline with a start/end indicator.

Version `0.1.12` simplifies timeline cards: note titles open view mode, previews are plain text, timeline action buttons are removed, and delete is only available from the note edit window.
