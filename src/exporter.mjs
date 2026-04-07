/**
 * exporter.mjs — Export all scanned Claude Code items to a backup directory.
 * Extracted from claude-code-organizer server.mjs export logic.
 */

import { mkdir, copyFile, writeFile, cp } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { scan } from "./scanner.mjs";

const BACKUP_DIR = join(homedir(), ".claude-backups");

/**
 * Run a full scan and export all items to the backup directory.
 * Returns { backupRoot, copied, errors, summary }
 */
export async function exportAll(backupDir = BACKUP_DIR) {
  const data = await scan();
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupRoot = join(backupDir, `backup-${ts}`);
  let copied = 0;
  const errors = [];

  // Filter out items that don't need file backup:
  // - "setting" items are parsed key-value records from settings.json (already backed up as "config")
  // - "hook" items are parsed from settings.json (already backed up as "config")
  const exportableItems = data.items.filter(
    (item) => item.category !== "setting" && item.category !== "hook"
  );

  for (const item of exportableItems) {
    try {
      const subDir = join(backupRoot, item.scopeId, item.category);
      await mkdir(subDir, { recursive: true });

      if (item.category === "skill") {
        // Skills are directories — copy whole dir
        const dest = join(subDir, item.fileName || basename(item.path));
        await cp(item.path, dest, { recursive: true });
      } else if (item.category === "mcp") {
        // MCP entries live inside JSON — export each server config
        const dest = join(subDir, `${item.name}.json`);
        const config = item.mcpConfig || {};
        await writeFile(
          dest,
          JSON.stringify({ [item.name]: config }, null, 2) + "\n"
        );
      } else if (item.category === "plugin" && item.path) {
        // Plugins are directories — copy whole dir
        const dest = join(subDir, item.fileName || basename(item.path));
        await cp(item.path, dest, { recursive: true });
      } else if (item.path) {
        // Regular files — copy directly
        const dest = join(subDir, item.fileName || basename(item.path));
        await copyFile(item.path, dest);
      }
      copied++;
    } catch (err) {
      errors.push(`${item.category}/${item.name}: ${err.message}`);
    }
  }

  // Write summary
  const summary = {
    exportedAt: new Date().toISOString(),
    totalItems: exportableItems.length,
    copied,
    errors: errors.length,
    errorDetails: errors.length > 0 ? errors : undefined,
    scopes: data.scopes.map((s) => ({ id: s.id, name: s.name, type: s.type })),
    categories: [...new Set(exportableItems.map((i) => i.category))],
    counts: data.counts,
  };
  await mkdir(backupRoot, { recursive: true });
  await writeFile(
    join(backupRoot, "backup-summary.json"),
    JSON.stringify(summary, null, 2) + "\n"
  );

  return { backupRoot, copied, errors, summary };
}

/**
 * Export to a stable "latest" directory (for git tracking).
 * Instead of timestamped dirs, overwrites a single "latest/" folder
 * so git only tracks the diff, not full copies each time.
 */
export async function exportLatest(backupDir = BACKUP_DIR) {
  const { rm } = await import("node:fs/promises");
  const latestDir = join(backupDir, "latest");

  // Clean previous export (but don't delete .git or other top-level files)
  try {
    await rm(latestDir, { recursive: true, force: true });
  } catch {}

  const data = await scan();
  let copied = 0;
  const errors = [];

  const exportableItems = data.items.filter(
    (item) => item.category !== "setting" && item.category !== "hook"
  );

  for (const item of exportableItems) {
    try {
      const subDir = join(latestDir, item.scopeId, item.category);
      await mkdir(subDir, { recursive: true });

      if (item.category === "skill") {
        const dest = join(subDir, item.fileName || basename(item.path));
        await cp(item.path, dest, { recursive: true });
      } else if (item.category === "mcp") {
        const dest = join(subDir, `${item.name}.json`);
        const config = item.mcpConfig || {};
        await writeFile(
          dest,
          JSON.stringify({ [item.name]: config }, null, 2) + "\n"
        );
      } else if (item.category === "plugin" && item.path) {
        const dest = join(subDir, item.fileName || basename(item.path));
        await cp(item.path, dest, { recursive: true });
      } else if (item.path) {
        const dest = join(subDir, item.fileName || basename(item.path));
        await copyFile(item.path, dest);
      }
      copied++;
    } catch (err) {
      errors.push(`${item.category}/${item.name}: ${err.message}`);
    }
  }

  const summary = {
    exportedAt: new Date().toISOString(),
    totalItems: exportableItems.length,
    copied,
    errors: errors.length,
    errorDetails: errors.length > 0 ? errors : undefined,
    scopes: data.scopes.map((s) => ({ id: s.id, name: s.name, type: s.type })),
    categories: [...new Set(exportableItems.map((i) => i.category))],
    counts: data.counts,
  };
  await writeFile(
    join(latestDir, "backup-summary.json"),
    JSON.stringify(summary, null, 2) + "\n"
  );

  return { backupRoot: latestDir, copied, errors, summary };
}
