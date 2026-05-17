# Timeline Notes Implementation Plan

## V14 API Baseline

This module targets Foundry VTT V14 only.

Confirmed from official V14 documentation:

- V14 documents are organized around `foundry.abstract.Document`, `ClientDocument`, and `WorldCollection`.
- Primary world document types are stored in world-level collections.
- Module manifests should use the `compatibility` object and `esmodules`.
- V14 UI applications should be built with `ApplicationV2` and document windows with `DocumentSheetV2`.
- Module-provided document subtypes are officially supported through `documentTypes`, but the requested `TimelineNote` is a new primary-style document, so registration and persistence need to be validated before feature work assumes it is stable.

References:

- https://foundryvtt.com/api/v14/
- https://foundryvtt.com/api/v14/classes/foundry.applications.api.DocumentSheetV2.html
- https://foundryvtt.com/api/v14/classes/foundry.documents.abstract.WorldCollection.html
- https://foundryvtt.com/article/module-development/
- https://foundryvtt.com/article/module-sub-types/

## Product Scope

### Core User Stories

- A user can open a dedicated Timeline sidebar tab.
- A user can create a timeline note with name, start date, optional start time, optional end date, optional end time, and rich note content.
- A note appears in the timeline with its title and the first paragraph, capped at 500 characters.
- Clicking a note opens it in its own `ApplicationV2`/`DocumentSheetV2` window.
- A user with edit permission can toggle between enriched HTML view mode and ProseMirror edit mode.
- A player can choose whether their note is private, viewable by other players, or editable by other players.
- A GM can view and edit all notes, and can set visibility/editability for their own notes.
- Users can filter notes by title and text.
- Users can reverse chronological ordering between future-first and oldest-first.
- Users can jump the timeline to a selected date.
- GMs can set the campaign's current date and time.
- Deleting a note requires confirmation.

### Timeline Layout Rules

- Timeline extent is based on the earliest and latest note visible to the current user.
- Notes group under year headers.
- If a year contains multiple notes, group further by month.
- If a month contains multiple notes, group further by day.
- Notes sort by start date and time inside the selected global ordering.
- Empty year gaps collapse into span headers such as `1998-2007`.
- Empty visible timelines show an empty-state prompt encouraging note creation.

## Data Model

Target `TimelineNote` fields:

- `name`: string, required.
- `startDate`: structured date object.
- `startTime`: optional structured time object.
- `endDate`: optional structured date object.
- `endTime`: optional structured time object.
- `content`: sanitized HTML, edited through ProseMirror.
- `visibility`: enum, one of `private`, `view`, `edit`.
- `author`: user id.
- `calendarId`: string, default `gregorian`.
- `sortKey`: derived normalized value for chronological ordering.

Campaign time setting fields:

- `currentDate`: structured date object.
- `currentTime`: structured time object.
- `calendarId`: string, default `gregorian`.

## Permission Model

- GMs can view, update, and delete all notes.
- A note author can view, update, and delete their own notes.
- Non-author players can view notes with `visibility` set to `view` or `edit`.
- Non-author players can update notes with `visibility` set to `edit`.
- Non-author players cannot delete notes.

This should be enforced at the document permission layer where V14 permits it, and repeated in UI affordances so unavailable actions are not presented.

## Architecture

### Modules

- `scripts/timeline-notes.mjs`: entry point and hook registration.
- `scripts/documents/timeline-note.mjs`: `TimelineNote` document definition and schema.
- `scripts/collections/timeline-notes.mjs`: world collection if V14 custom primary document registration is viable.
- `scripts/applications/timeline-sidebar.mjs`: sidebar tab application.
- `scripts/applications/timeline-note-sheet.mjs`: note window and edit/view toggle.
- `scripts/services/calendar-service.mjs`: calendar normalization, display labels, and current campaign date.
- `scripts/services/permissions.mjs`: shared permission checks.
- `templates/`: Handlebars templates for sidebar, note cards, dialogs, and sheets.
- `styles/timeline-notes.css`: module styling.

### Calendar Strategy

The default adapter is simplified Gregorian using Foundry world time as the source for defaults. The module should isolate calendar logic behind `CalendarService` so non-Gregorian integrations can be added without rewriting note storage or timeline grouping.

## Implementation Phases

### Phase 0: Repository and V14 Spike

- Initialize module manifest and repository.
- Add a disabled-by-default runtime spike for whether V14 allows a module to register a new primary world document type named `TimelineNote`.
- Verify create, update, delete, socket sync, permission checks, and reload persistence for that document.
- If V14 does not support module-owned primary documents cleanly, document the blocker and decide whether to escalate to a subtype-based fallback or a module-maintained world setting store.

Exit criteria: a minimal `TimelineNote.create(...)` flow persists and reloads correctly in V14, or the blocker is documented with a recommended alternative.

Current test commands after installing the module in a V14 test world:

```js
await timelineNotes.runDocumentRegistrationSpike()
await timelineNotes.runDocumentRegistrationSpike({ mutate: true })
await timelineNotes.runDocumentRegistrationSpike({ mutate: true, create: true })
```

The reload persistence test requires enabling the world setting `Enable primary TimelineNote document spike`, reloading the world, and then re-running the create test.

### Phase 1: Data and Permissions

- Define the note schema.
- Add sanitization for HTML content.
- Implement visibility/edit permission checks.
- Add settings for campaign date/time.
- Add basic CRUD helpers.

Exit criteria: notes can be created, edited, filtered by permission, and deleted with correct GM/player behavior.

### Phase 2: Sidebar Timeline

- Register sidebar tab.
- Add create, jump-to-date, GM set-date, search/filter, and order toggle controls.
- Render timeline grouping and collapsed empty-year spans.
- Add empty-state handling.

Exit criteria: users can browse visible notes in the specified grouping and ordering.

### Phase 3: Note Window

- Implement `DocumentSheetV2` note window.
- Render enriched HTML in view mode.
- Add ProseMirror edit mode for editable users.
- Add visibility radio controls.
- Save changes through document updates.

Exit criteria: opening, viewing, editing, and permission-specific controls work in V14.

### Phase 4: Polish and Validation

- Add localization strings.
- Add CSS states for compact sidebar card layout.
- Add confirmation dialog for delete.
- Test as GM, note owner player, and unrelated player.
- Package module zip and verify install/update manifest behavior.

Exit criteria: module is usable in a V14 world and packaged for manual installation.

## Open Questions

- Whether `TimelineNote` must be a true primary document or whether a module-provided subtype is acceptable if V14 blocks custom primary documents.
- Which non-Gregorian calendar modules or systems should be first-class integrations.
- Whether player-editable shared notes need optimistic locking or explicit last-save conflict handling.
- Whether end dates should display multi-day notes in every covered year/month/day group or only at their start date.
