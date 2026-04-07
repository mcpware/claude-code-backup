# Claude Code Backup

Automatic backup of all your Claude Code settings to GitHub. One command to set up, runs on boot and every few hours.

## What gets backed up

Everything Claude Code stores across your machine, not just `~/.claude/`:

- **Memories** (127 files across 8 scopes in my setup)
- **Skills** (full directories, recursively)
- **MCP server configs** (every .mcp.json, .claude.json, settings-embedded servers)
- **Rules, Agents, Commands** (.md files)
- **CLAUDE.md files** (global + every project)
- **Settings** (settings.json, settings.local.json)
- **Plans** (.md files)
- **Sessions** (.jsonl conversation files)
- **Plugins** (cached plugin directories)

It uses the same scanner as [Claude Code Organizer](https://github.com/mcpware/claude-code-organizer) to discover items across all scopes (global + every project directory you've ever opened Claude Code in).

## Quick start

```bash
npx @mcpware/claude-code-backup init
```

This will:
1. Scan your Claude Code settings and show what it found
2. Ask for your GitHub repo URL
3. Ask your preferred backup interval (default: every 4 hours)
4. Install a systemd timer (Linux) or LaunchAgent (macOS)
5. Run the first backup immediately

## Manual backup

```bash
npx @mcpware/claude-code-backup run
```

## Check status

```bash
npx @mcpware/claude-code-backup status
```

## Remove scheduler

```bash
npx @mcpware/claude-code-backup uninstall
```

This only removes the scheduled task. Your backup data stays in `~/.claude-backups/`.

## How it works

```
~/.claude-backups/
├── .git/                    ← tracked by git, pushed to your private repo
├── .gitignore
├── latest/
│   ├── global/
│   │   ├── memory/          ← all global memories
│   │   ├── skill/           ← all global skills (full dirs)
│   │   ├── mcp/             ← each MCP server as individual .json
│   │   ├── config/          ← CLAUDE.md, settings.json
│   │   ├── rule/            ← all rules
│   │   ├── plan/
│   │   ├── agent/
│   │   ├── command/
│   │   └── plugin/
│   ├── -home-user-myproject/
│   │   ├── memory/          ← project-specific memories
│   │   ├── skill/           ← project-specific skills
│   │   ├── mcp/
│   │   ├── config/          ← project CLAUDE.md, settings
│   │   └── session/         ← conversation history
│   └── backup-summary.json
├── config.json
└── backup.log
```

Each backup overwrites `latest/` so git only tracks the diff, not full copies. Your git history is your version history.

## Restore on a new machine

```bash
git clone git@github.com:you/claude-backup.git ~/.claude-backups
# Then manually copy files back to their original locations
# (automated restore coming soon)
```

## Scheduler details

**Linux (systemd):** User-level timer with `Persistent=true`. Runs on boot (5 min delay) and at your configured interval. Catches up missed runs if the machine was off.

**macOS (launchd):** LaunchAgent with `RunAtLoad=true`. Same behavior.

## Requirements

- Node.js 18+
- Git
- A private GitHub repo (create one first)

## Built with

Scanner extracted from [@mcpware/claude-code-organizer](https://github.com/mcpware/claude-code-organizer).
