/**
 * git-sync.mjs — Git operations for backup repo.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import { join } from "node:path";

const exec = promisify(execFile);

function git(args, cwd) {
  return exec("git", args, { cwd, timeout: 30_000 });
}

/**
 * Check if a directory is a git repo.
 */
export async function isGitRepo(dir) {
  try {
    await access(join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize git repo in backup directory.
 */
export async function initRepo(dir) {
  await git(["init", "-b", "main"], dir);
}

/**
 * Check if remote is configured.
 */
export async function hasRemote(dir) {
  try {
    const { stdout } = await git(["remote"], dir);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Add remote origin.
 */
export async function addRemote(dir, url) {
  await git(["remote", "add", "origin", url], dir);
}

/**
 * Get current remote URL.
 */
export async function getRemoteUrl(dir) {
  try {
    const { stdout } = await git(["remote", "get-url", "origin"], dir);
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Stage all changes, commit, and push.
 * Returns { committed, pushed, message }
 */
export async function commitAndPush(dir) {
  // Stage everything
  await git(["add", "-A"], dir);

  // Check if there are changes to commit
  try {
    await git(["diff", "--cached", "--quiet"], dir);
    // If diff --quiet succeeds, no changes
    return { committed: false, pushed: false, message: "No changes to backup" };
  } catch {
    // Changes exist — commit
  }

  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const commitMsg = `backup: ${ts}`;
  await git(["commit", "-m", commitMsg], dir);

  // Push if remote exists
  if (await hasRemote(dir)) {
    try {
      await git(["push", "-u", "origin", "main"], dir);
      return { committed: true, pushed: true, message: `Committed and pushed: ${commitMsg}` };
    } catch (err) {
      return { committed: true, pushed: false, message: `Committed but push failed: ${err.message}` };
    }
  }

  return { committed: true, pushed: false, message: `Committed (no remote): ${commitMsg}` };
}
