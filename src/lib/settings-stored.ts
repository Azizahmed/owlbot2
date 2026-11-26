import { deviceSettingsSnapshot, type DeviceSetting, type DeviceValue } from "./settings-observation.ts";

// Only these preference keys, never an enumeration of browser storage.
const KEYS = ["owlbot-theme", "owlbot-show-conversations", "owlbot-sidebar", "owlbot-folded-sections", "owlbot-desktop-chat", "owlbot-terminal-height", "owlbot-room-lens"];
export function isSettingsStorageKey(key: string | null): boolean { return key === null || KEYS.includes(key); }

/** Stored facts have no default. Live committed owners supply their applied
 * choices separately, so unavailable/failed storage cannot invent UI state. */
export function storedDeviceSettings(storage: { getItem(key: string): string | null }): Partial<Record<DeviceSetting, DeviceValue>> {
  const raw: Record<string, unknown> = {};
  const read = (storageKey: string, field: DeviceSetting, convert: (value: string | null) => unknown = (v) => v) => {
    try { raw[field] = { status: "observed", value: convert(storage.getItem(storageKey)) }; }
    catch { raw[field] = { status: "unknown", reason: "unavailable" }; }
  };
  read("owlbot-theme", "theme.saved");
  read("owlbot-show-conversations", "conversations.saved", (v) => v === null ? null : v === "on" ? true : v === "off" ? false : v);
  read("owlbot-sidebar", "sidebar.saved");
  read("owlbot-room-lens", "room.savedLens");
  read("owlbot-terminal-height", "terminal.savedHeight", (v) => v === null ? null : v.trim() === "" ? v : Number(v));
  read("owlbot-folded-sections", "sidebar.savedFoldsConfigured", (v) => {
    if (v === null) return false;
    if (v.length > 4096) throw new Error("oversized preference");
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed.length > 0 : null;
  });
  const desktopFields = ["desktop.savedDock", "desktop.savedWidth", "desktop.savedHeight", "desktop.savedX", "desktop.savedY"] as const;
  try {
    const text = storage.getItem("owlbot-desktop-chat");
    if (text !== null && text.length > 4096) throw new Error("oversized preference");
    const value = text === null ? null : JSON.parse(text);
    for (const [i, key] of ["dock", "width", "height", "x", "y"].entries()) {
      raw[desktopFields[i]] = { status: "observed", value: value === null ? null : value?.[key] };
    }
  } catch { for (const field of desktopFields) raw[field] = { status: "unknown", reason: "unavailable" }; }
  const result = deviceSettingsSnapshot({ schema: 1, revision: 0, observedAt: 0, values: raw })!;
  return Object.fromEntries(Object.keys(raw).map((field) => [field, result.values[field as DeviceSetting]]));
}
