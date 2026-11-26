// Chrome extensions in the OwlBot browser, as the desktop app uses them:
// the very rules a server's own browser keeps (server/browser-extensions.mjs),
// so a manifest is read, judged and copied the same way in both.
export * from "../server/browser-extensions.mjs";
