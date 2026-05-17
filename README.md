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

