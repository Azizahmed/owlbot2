#!/usr/bin/env node
// The README screenshots again, in a plain browser instead of the desktop
// app. It exists because Electron's prebuilt binary is glibc-linked and
// does not run everywhere (an Alpine container is one such place), while
// the interface is the same page either way: scripts/shoot-screenshots.mjs
// holds the scenes, this file only supplies a stand-in for the window it
// would otherwise drive.
//
//   node scripts/shots-web.mjs               every picture
//   node scripts/shots-web.mjs --only=hero   some of them, by name
//   node scripts/shots-web.mjs --keep        leave the throwaway home behind
//
// Differences from the desktop run, and why they are safe: each workspace
// is a server of its own, opened by its own port, so the switcher's
// window.owlbot.workspaceSwitch becomes a navigation; the prefs the
// preload would have kept in preferences are localStorage, which the page
// reads the same way; theme and window size are page settings. Everything
// a picture is of - the markup, the words, the transcript - is the app's
// own, drawn from the same folders.
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdirSync, openSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { REPO, agent, freePort, removeHome, showHomeAs, startStandInServices, tempHome, wait, writeStandIn, writeWorkspace } from "./screenshot-kit.mjs";
import { OWNER, TZ, askToJoin, brightwater, morning, personal, prepare, SCENES, ENGINE_SCENES } from "./shoot-screenshots.mjs";

const DAY = 86_400_000;
const LICENCE = `owlbot_live_${"5e2d".repeat(8)}`;
const CHROMIUM = process.env.CHROMIUM_PATH || "/usr/bin/chromium";

/** The desktop app's window, as much of it as the scenes touch. */
async function openBrowser({ home, workspaces, ports, size, tz, services }) {
  const userData = join(home, "app");
  mkdirSync(userData, { recursive: true });
  const dirOf = (id) => {
    const ws = workspaces.find((w) => w.id === id);
    return ws.kind === "personal" ? join(home, ".owlbot") : join(userData, "workspaces", id);
  };
  // each workspace's own config says its port, as the app's does, so a
  // server comes up where this script expects it
  for (const ws of workspaces) {
    const file = join(dirOf(ws.id), "config.json");
    const cfg = JSON.parse(execFileSync("cat", [file], { encoding: "utf8" }));
    writeFileSync(file, JSON.stringify({ ...cfg, port: ports[ws.id] }, null, 2), { mode: 0o600 });
  }
  writeFileSync(
    join(userData, "workspaces.json"),
    JSON.stringify({ version: 1, current: "personal", prefs: { theme: "light", sameAccent: false, accent: null, ownerName: OWNER } }),
  );
  showHomeAs(home);

  const running = new Map();
  const logFd = (id) => openSync(join(home, `${id}.log`), "a");
  const start = (id) => {
    if (running.has(id)) return;
    const child = spawn(process.execPath, ["server/index.ts"], {
      cwd: REPO,
      stdio: ["ignore", logFd(id), logFd(id)],
      env: {
        ...process.env,
        HOME: home,
        USER: "demo",
        LOGNAME: "demo",
        TZ: tz,
        LANG: "en_US.UTF-8",
        OWLBOT_DATA_DIR: dirOf(id),
        OWLBOT_PORT: String(ports[id]),
        OWLBOT_STATIC_DIR: join(REPO, "dist"),
        PATH: `${join(home, "bin")}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
        OWLBOT_COMPUTER_NAME: "Elena's MacBook Pro",
        OWLBOT_SITE_URL: services.url,
        OWLBOT_CREDITS_URL: `${services.url}/api/ai`,
        OWLBOT_RELAY_URL: services.url,
        OWLBOT_PRICES_URL: `${services.url}/api/prices`,
        OWLBOT_SKILLS_URL: `${services.url}/skills/index.json`,
        OWLBOT_TEAMS_URL: `${services.url}/teams/index.json`,
        OLLAMA_HOST: "127.0.0.1:9",
        DO_NOT_TRACK: "1",
      },
    });
    running.set(id, child);
  };

  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-color-profile=srgb", "--hide-scrollbars"] });
  // The window draws itself for the desktop app: macOS traffic-light room,
  // the workspace in the titlebar. Both hang off the user agent, so the
  // page is told it is the app it is standing in for.
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 2,
    locale: "en-US",
    timezoneId: tz,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) OwlBot/3.2.14 Chrome/140.0.0.0 Safari/537.36 Electron/45.0.0",
  });
  // The page reads window.owlbot.workspace for the workspace's own name,
  // kind and mark (the titlebar, the accent). A browser has no preload,
  // so the little of it the pictures need is put back here, per port.
  const byPort = Object.fromEntries(
    workspaces.map((ws) => [String(ports[ws.id]), { id: ws.id, port: ports[ws.id], kind: ws.kind, name: ws.name, team: Boolean(ws.team), members: ws.members ?? 1, mark: ws.mark ?? null }]),
  );
  await context.addInitScript(
    ({ map, ownerName }) => {
      const mine = map[location.port];
      if (!mine) return;
      const info = (ws) => ({
        id: ws.id, kind: ws.kind, name: ws.name, team: ws.team, mark: ws.mark, logo: null,
        members: ws.members, status: "running", problem: null, waiting: 0, notify: "all",
        mute: { muted: false, until: null }, dataDir: null,
      });
      window.owlbot = {
        ...(window.owlbot ?? {}),
        workspace: { kind: mine.kind, name: mine.name, ...(mine.mark ? { mark: mine.mark } : {}) },
        workspacesState: async () => ({
          available: true,
          current: mine.id,
          workspaces: Object.values(map).map(info),
          ownerName,
          local: true,
          notch: false,
          tray: false,
          quitGuard: false,
        }),
        onWorkspaces: () => {},
        workspaceSwitch: async (id) => {
          const target = Object.values(map).find((ws) => ws.id === id);
          if (!target) return { ok: false, error: "no such workspace" };
          location.href = `http://127.0.0.1:${target.port}/`;
          return { ok: true };
        },
        notifyShow: () => {},
        badgeSet: () => {},
        prefsTheme: async () => {},
        prefsAccent: async () => {},
        prefsSameAccent: async () => {},
      };
    },
    { map: byPort, ownerName: OWNER },
  );
  await context.addInitScript(() => {
    try {
      localStorage.setItem("owlbot-intro-v1", "1");
      localStorage.setItem("owlbot-setup-done", "1");
      localStorage.setItem("owlbot-theme", "light");
      localStorage.setItem("owlbot-language", "en");
    } catch {
      /* storage refused; the intro shows */
    }
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`page error: ${String(e).slice(0, 200)}`));

  const url = (id) => `http://127.0.0.1:${ports[id]}`;
  const desktop = {
    page,
    size,
    ports,
    url,
    up: async (id, ms = 60_000) => {
      start(id);
      const end = Date.now() + ms;
      for (;;) {
        try {
          if ((await fetch(`${url(id)}/api/health`)).ok) return;
        } catch {
          /* not yet */
        }
        if (Date.now() > end) throw new Error(`the ${id} workspace's server did not start`);
        await wait(300);
      }
    },
    api: async (id, path, method = "GET", body) => {
      const res = await fetch(`${url(id)}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    },
    show: async (id) => {
      await desktop.up(id);
      if (!page.url().startsWith(url(id))) {
        await page.goto(`${url(id)}/`, { waitUntil: "networkidle" });
      }
      await wait(1800);
    },
    theme: async (want) => {
      await page.evaluate((t) => localStorage.setItem("owlbot-theme", t), want);
      await page.reload({ waitUntil: "networkidle" });
      await wait(1500);
    },
    resize: async (s) => {
      await page.setViewportSize(s);
      await wait(700);
    },
    close: async () => {
      for (const child of running.values()) child.kill();
      await browser.close().catch(() => {});
    },
  };
  await desktop.up("personal");
  await page.goto(`${url("personal")}/`, { waitUntil: "networkidle" });
  await wait(2000);
  return desktop;
}

async function buildWorld({ size = { width: 1360, height: 880 }, cast = personal, scenes = ENGINE_SCENES, tag = "readme" } = {}) {
  const home = tempHome(tag);
  const t0 = morning();
  const services = await startStandInServices({
    account: {
      plan: "team",
      interval: "year",
      status: "active",
      renewsAt: Date.now() + 211 * DAY,
      since: Date.now() - 154 * DAY,
      email: "e........@brightwater.example",
      owlbotAi: { active: true, renewsAt: Date.now() + 11 * DAY },
      sharedRoom: true,
    },
    offers: [],
    team: true,
    ai: {
      plan: "OwlBot Team",
      usedPercent: 38,
      leftPercent: 62,
      monthlyLeftPercent: 62,
      renewsAt: Date.now() + 11 * DAY,
      team: true,
      usedTodayPercent: 4,
      dailyLimitPercent: 10,
      dailyResetsAt: new Date().setHours(24, 0, 0, 0),
    },
  });
  const ports = { personal: await freePort(), ws_brightwater: await freePort(), ws_maple: await freePort() };
  const engine = writeStandIn(home, scenes);
  const online = (port) => ({
    profile: { name: OWNER },
    instances: { claude: { driver: "claudeAgent", config: { cli: engine } } },
    credits: { licence: LICENCE },
    relay: { enabled: true, url: services.url, agentToken: `agent-${port}`, clientToken: `client-${port}` },
    remote: { enabled: true },
  });
  const p = cast(home, t0);
  writeWorkspace(p.dir, {
    bots: p.bots,
    rooms: p.rooms,
    transcripts: p.transcripts,
    config: { ...online(ports.personal), ...p.config },
    files: { "usage.json": p.usage, ...(p.files ?? {}) },
  });
  p.memories?.();
  const b = brightwater(join(home, "app", "workspaces", "ws_brightwater"), t0);
  writeWorkspace(b.dir, { bots: b.bots, rooms: b.rooms, transcripts: b.transcripts, config: online(ports.ws_brightwater), files: b.files });
  writeWorkspace(join(home, "app", "workspaces", "ws_maple"), {
    bots: [agent("Order Desk", "Wholesale orders and deliveries", { color: "orange", shape: "bit" })],
    config: { profile: { name: OWNER }, instances: { claude: { driver: "claudeAgent", config: { cli: engine } } } },
  });
  const workspaces = [
    { id: "personal", kind: "personal", name: "Personal" },
    { id: "ws_brightwater", kind: "business", name: "Brightwater", team: true, members: 3 },
    { id: "ws_maple", kind: "custom", name: "Maple Street Bakery", mark: { color: "#E8664A", pattern: "101111101" } },
  ];
  const desktop = await openBrowser({ home, workspaces, ports, size, tz: TZ, services });
  return { home, services, desktop, page: desktop.page, personal: p, brightwater: b, t0, roles: { ...p.roles, ...b.roles } };
}

async function main() {
  const only = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
  const out = join(REPO, "docs", "screenshots");
  const world = await buildWorld();
  const failed = [];
  try {
    await prepare(world);
    for (const [name, scene] of Object.entries(SCENES)) {
      if (only.length && !only.includes(name)) continue;
      try {
        await scene(world, (n) => join(out, `${n}.png`));
      } catch (error) {
        // a place that needs the app's own windows is not always reachable
        // in a browser; say so and take the rest rather than nothing
        failed.push(name);
        console.error(`${name}: ${String(error?.message ?? error).slice(0, 200)}`);
      }
    }
  } finally {
    if (failed.length) console.error(`not taken: ${failed.join(", ")}`);
    await world.desktop.close();
    await world.services.close();
    if (!process.argv.includes("--keep")) removeHome(world.home);
  }
}

if (process.argv[1] && process.argv[1].endsWith("shots-web.mjs")) await main();
