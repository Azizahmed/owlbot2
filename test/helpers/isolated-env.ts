// Leaves nothing in this process's environment that names a real OwlBot
// workspace.
//
// A shell opened inside OwlBot (a terminal in the app, an agent's turn)
// carries the workspace it belongs to: its data folder, its port, its
// address and a token for it. Tests started from that shell inherit all
// of it, and so does every child they start with the parent's
// environment, which is how a fixture once replaced somebody's
// config.json (GitHub 529). Loaded first, this takes those variables out
// before any test or helper reads them, so a test's data folder is only
// ever the one it makes.
//
// `pnpm test` preloads it into every test file (--import in
// package.json). Helpers that start servers or children import it too,
// so a single file run by hand gets the same. A test that wants one of
// these set says so itself, after this has run.

/** Where a workspace keeps its data, which one it is, and how to reach
 * and speak to its server. */
export const WORKSPACE_VARS = [
  "OWLBOT_DATA_DIR",
  "OWLBOT_WORKSPACES_DIR",
  "OWLBOT_WORKSPACE_ID",
  "OWLBOT_WORKSPACE_NAME",
  "OWLBOT_WORKSPACE_KIND",
  "OWLBOT_WORKSPACE_COLOR",
  "OWLBOT_WORKSPACE_PATTERN",
  "OWLBOT_SERVER_HOME",
  "OWLBOT_SERVER_ROOT",
  "OWLBOT_SERVER_STATIC",
  "OWLBOT_STATIC_DIR",
  "OWLBOT_PORT",
  "OWLBOT_LISTEN",
  "OWLBOT_URL",
  "OWLBOT_TOKEN",
  "OWLBOT_SERVER_TOKEN",
  "OWLBOT_REPLY_TOKEN",
  "OWLBOT_REPLY_PATH",
  "OWLBOT_LOCAL_KEY",
  "OWLBOT_CLI",
  "OWLBOT_OUTBOX",
] as const;

for (const name of WORKSPACE_VARS) delete process.env[name];
