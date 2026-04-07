#!/usr/bin/env node

/**
 * claude-code-backup CLI
 *
 * Commands:
 *   init          — Interactive setup: create backup repo, configure remote, install scheduler
 *   run           — Run a backup now (scan + export + commit + push)
 *   status        — Show last backup info and scheduler status
 *   uninstall     — Remove scheduled backup (keeps backup data)
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createInterface } from "node:readline";

const HOME = homedir();
const BACKUP_DIR = join(HOME, ".claude-backups");
const CONFIG_PATH = join(BACKUP_DIR, "config.json");

// ── Helpers ──────────────────────────────────────────────────────────

function log(msg) {
  if (!process.argv.includes("--quiet")) {
    process.stdout.write(msg + "\n");
  }
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function loadConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

async function saveConfig(config) {
  await mkdir(BACKUP_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

// ── Commands ─────────────────────────────────────────────────────────

async function cmdInit() {
  const { scan } = await import("../src/scanner.mjs");
  const { isGitRepo, initRepo, addRemote } = await import("../src/git-sync.mjs");
  const { install } = await import("../src/scheduler.mjs");

  log("🔍 Scanning Claude Code settings...\n");

  const data = await scan();
  const scopeCount = data.scopes.length;
  const itemCount = data.items.length;

  log(`Found ${itemCount} items across ${scopeCount} scopes:`);
  for (const [cat, count] of Object.entries(data.counts)) {
    if (cat === "total") continue;
    log(`  ${cat}: ${count}`);
  }
  log("");

  // Create backup directory
  await mkdir(BACKUP_DIR, { recursive: true });

  // Git repo setup
  if (!(await isGitRepo(BACKUP_DIR))) {
    log("Initializing git repo in ~/.claude-backups/");
    await initRepo(BACKUP_DIR);

    // Write .gitignore
    await writeFile(
      join(BACKUP_DIR, ".gitignore"),
      [
        "# Don't track timestamped backups — only latest/",
        "backup-*/",
        "*.log",
        "config.json",
        "",
      ].join("\n")
    );
  }

  // Remote setup
  const { hasRemote, getRemoteUrl } = await import("../src/git-sync.mjs");
  if (await hasRemote(BACKUP_DIR)) {
    const url = await getRemoteUrl(BACKUP_DIR);
    log(`Git remote already configured: ${url}`);
    const change = await ask("Change remote? (y/N): ");
    if (change.toLowerCase() === "y") {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const exec = promisify(execFile);
      const newUrl = await ask("GitHub repo URL (SSH or HTTPS): ");
      await exec("git", ["remote", "set-url", "origin", newUrl], { cwd: BACKUP_DIR });
      log(`Remote updated to: ${newUrl}`);
    }
  } else {
    const repoUrl = await ask("GitHub repo URL (e.g. git@github.com:you/claude-backup.git): ");
    if (repoUrl) {
      await addRemote(BACKUP_DIR, repoUrl);
      log(`Remote added: ${repoUrl}`);
    } else {
      log("Skipping remote setup. Run 'git remote add origin <url>' in ~/.claude-backups/ later.");
    }
  }

  // Scheduler setup
  log("");
  const intervalStr = await ask("Backup interval in hours (default: 4): ");
  const interval = parseInt(intervalStr) || 4;

  const nodePath = process.execPath;
  const cliPath = new URL(import.meta.url).pathname;

  try {
    const result = await install(nodePath, cliPath, interval);
    log(`\nScheduler installed (every ${interval}h + on boot)`);
    if (result.timerPath) log(`  Service: ${result.timerPath}`);
    if (result.plistPath) log(`  LaunchAgent: ${result.plistPath}`);
  } catch (err) {
    log(`\nFailed to install scheduler: ${err.message}`);
    log("You can run backups manually with: npx @mcpware/claude-code-backup run");
  }

  // Save config
  await saveConfig({ interval, installedAt: new Date().toISOString() });

  // Run first backup
  log("\nRunning first backup...\n");
  await cmdRun();

  log("\n✓ Setup complete! Your Claude Code settings are backed up.");
  log("  Backup location: ~/.claude-backups/latest/");
  log(`  Auto-backup: every ${interval} hours + on boot`);
}

async function cmdRun() {
  const { exportLatest } = await import("../src/exporter.mjs");
  const { commitAndPush } = await import("../src/git-sync.mjs");

  log("Scanning and exporting...");
  const { backupRoot, copied, errors, summary } = await exportLatest(BACKUP_DIR);

  log(`Exported ${copied} items to ${backupRoot}`);
  if (errors.length > 0) {
    log(`Warnings: ${errors.length} items failed to export`);
    for (const err of errors.slice(0, 5)) log(`  - ${err}`);
  }

  // Git commit + push
  log("Committing...");
  const result = await commitAndPush(BACKUP_DIR);
  log(result.message);

  // Write last-run info
  await saveConfig({
    ...(await loadConfig()),
    lastRun: new Date().toISOString(),
    lastCopied: copied,
    lastErrors: errors.length,
  });
}

async function cmdStatus() {
  const { status } = await import("../src/scheduler.mjs");
  const config = await loadConfig();

  if (config.lastRun) {
    const ago = Math.round((Date.now() - new Date(config.lastRun).getTime()) / 60000);
    log(`Last backup: ${config.lastRun} (${ago} min ago)`);
    log(`  Items backed up: ${config.lastCopied || "unknown"}`);
    log(`  Errors: ${config.lastErrors || 0}`);
  } else {
    log("No backup has been run yet.");
  }

  log("\nScheduler status:");
  const s = await status();
  log(s);

  // Check git status
  const { isGitRepo, hasRemote, getRemoteUrl } = await import("../src/git-sync.mjs");
  if (await isGitRepo(BACKUP_DIR)) {
    log("\nGit repo: ~/.claude-backups/");
    if (await hasRemote(BACKUP_DIR)) {
      log(`Remote: ${await getRemoteUrl(BACKUP_DIR)}`);
    } else {
      log("Remote: not configured");
    }
  } else {
    log("\nGit repo: not initialized. Run 'claude-code-backup init' first.");
  }
}

async function cmdUninstall() {
  const { remove } = await import("../src/scheduler.mjs");
  await remove();
  log("Scheduler removed. Backup data preserved in ~/.claude-backups/");
}

// ── Main ─────────────────────────────────────────────────────────────

const command = process.argv[2];

switch (command) {
  case "init":
    await cmdInit();
    break;
  case "run":
    await cmdRun();
    break;
  case "status":
    await cmdStatus();
    break;
  case "uninstall":
    await cmdUninstall();
    break;
  default:
    log("claude-code-backup — Automatic backup of all Claude Code settings\n");
    log("Usage:");
    log("  claude-code-backup init        Set up backup repo + schedule");
    log("  claude-code-backup run         Run backup now");
    log("  claude-code-backup status      Show backup status");
    log("  claude-code-backup uninstall   Remove scheduled backup\n");
    log("Your skills, memories, rules, MCP configs, and settings — all safe.");
    break;
}
