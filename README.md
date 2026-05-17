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

For a reload-time persistence test, enable the world setting **Enable primary TimelineNote document spike**, reload the world, then run the create test again. Use a disposable test world because this intentionally probes unsupported primary document registration behavior.

## Calendar Service Smoke Test

Version `0.1.2` includes the hidden campaign date/time settings used by future note defaults. In a V14 world console, this should return the current stored campaign date and time:

```js
timelineNotes.CalendarService.getCurrentDateTime()
```
