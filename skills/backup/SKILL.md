# /backup — Claude Code Settings Backup

Back up all Claude Code settings to GitHub. Scans every scope (global + all projects), exports memories, skills, rules, MCP configs, settings, plans, agents, commands, sessions, and plugins. Then commits and pushes to your configured backup repo.

## Usage

- `/backup` — Run a backup now
- `/backup init` — First-time setup (create repo, configure remote, install scheduler)
- `/backup status` — Show last backup time and scheduler status

## What it does

1. **Scans** all Claude Code customizations across every scope (same scanner as Claude Code Organizer)
2. **Exports** 10 categories: memory, skill, mcp, config, rule, agent, command, plan, session, plugin
3. **Commits** changes to `~/.claude-backups/` git repo
4. **Pushes** to your private GitHub repo

## Setup (first time only)

```bash
npx @mcpware/claude-code-backup init
```

This creates `~/.claude-backups/`, asks for your GitHub repo URL, and installs a systemd timer (Linux) or LaunchAgent (macOS) for automatic backups.

## Requirements

- Node.js 18+
- A private GitHub repo
- `@mcpware/claude-code-backup` installed (`npm i -g @mcpware/claude-code-backup`)
