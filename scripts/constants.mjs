export const MODULE_ID = "timeline-notes";
export const MODULE_TITLE = "Timeline Notes";

export const DOCUMENT_NAME = "TimelineNote";
export const COLLECTION_NAME = "timelineNotes";

export const SETTINGS = {
  CAMPAIGN_CALENDAR_ID: "campaignCalendarId",
  CAMPAIGN_CURRENT_DATE: "campaignCurrentDate",
  CAMPAIGN_CURRENT_TIME: "campaignCurrentTime",
  DEVELOPMENT_NOTES: "developmentNotes",
  TAGS: "tags",
  WORLD_CALENDAR: "worldCalendar"
};

export const DEFAULT_TAGS = [
  { id: "combat",   name: "Combat",   color: "#c0392b" },
  { id: "shopping", name: "Shopping", color: "#27ae60" },
  { id: "funny",    name: "Funny",    color: "#f1c40f" }
];

export const DEFAULT_CALENDAR_ID = "gregorian";

export const VISIBILITY = {
  PRIVATE: "private",
  VIEW: "view",
  EDIT: "edit"
};

export const DATE_PARTS = {
  year: 0,
  month: null,
  day: null
};

export const TIME_PARTS = {
  hour: null,
  minute: null
};
