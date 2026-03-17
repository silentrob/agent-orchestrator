# Troubleshooting

## DirectTerminal: posix_spawnp failed error

**Symptom**: Terminal in browser shows "Connected" but blank. WebSocket logs show:

```
[DirectTerminal] Failed to spawn PTY: Error: posix_spawnp failed.
```

**Root Cause**: node-pty prebuilt binaries are incompatible with your system.

**Fix**: Rebuild node-pty from source:

```bash
# From the repository root
cd node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty
npx node-gyp rebuild
```

**Verification**:

```bash
# Test node-pty works
node -e "const pty = require('./node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty'); \
  const shell = pty.spawn('/bin/zsh', [], {name: 'xterm-256color', cols: 80, rows: 24, \
  cwd: process.env.HOME, env: process.env}); \
  shell.onData((d) => console.log('✅ OK')); \
  setTimeout(() => process.exit(0), 1000);"
```

**When this happens**:

- After `pnpm install` (uses cached prebuilts)
- After copying the repo to a new location
- On some macOS configurations with Homebrew Node

**Permanent fix**: The postinstall hook automatically rebuilds node-pty:

```bash
pnpm install  # Automatically rebuilds node-pty via postinstall hook
```

If you need to manually rebuild:

```bash
cd node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty
npx node-gyp rebuild
```

## Other Issues

### Config file not found

**Symptom**: API returns 500 with "No agent-orchestrator.yaml found"

**Fix**: Ensure config exists in the directory where you run `ao start`, or symlink it:

```bash
ln -s /path/to/agent-orchestrator.yaml packages/web/agent-orchestrator.yaml
```

### "'agent:in-progress' not found" when backlog claims an issue

**Problem:** The backlog poller picks up an issue but fails when trying to add the `agent:in-progress` label. Error: `'agent:in-progress' not found` or `failed to update ... issue`.

**Cause:** The GitHub repo does not have the agent workflow labels yet. They must exist before the orchestrator can update issues.

**Solution:** Create the labels once using either method below.

**Option 1 — Via API (dashboard must be running):**

```bash
curl -X POST http://localhost:3000/api/setup-labels
```

Use your configured dashboard port if different (e.g. `3001`).

**Option 2 — Via GitHub CLI (replace `owner/repo` with your repo, e.g. `silentrob/agent-orchestrator`):**

```bash
gh label create "agent:backlog" --repo owner/repo --color 6B7280 --description "Available for agent to claim" --force
gh label create "agent:in-progress" --repo owner/repo --color 7C3AED --description "Agent is working on this" --force
gh label create "agent:blocked" --repo owner/repo --color DC2626 --description "Agent is blocked" --force
gh label create "agent:done" --repo owner/repo --color 16A34A --description "Agent completed this" --force
```

After the labels exist, the next backlog poll (or re-adding `agent:backlog` to the issue) will succeed.

### Session stuck in "CI is failing" / issue stuck in agent:in-progress (fork or no CI)

**Problem:** The agent keeps getting "CI is failing on your PR. Run `gh pr checks`…" and the issue never moves out of `agent:in-progress`. You're on a fork with no GitHub Actions (or no branch protection), so there are no real CI checks.

**Cause:** The lifecycle uses the SCM (e.g. GitHub) to read PR CI status. When it can't get checks (API error or no workflows), it treats CI as "failing" and sets the session to `ci_failed`, which triggers the default reaction and sends that message. The tracker issue is only updated when the session reaches a terminal state (e.g. merged), so it stays in `agent:in-progress`.

**Solution:**

1. **Stop the message** — Disable the ci-failed reaction in `agent-orchestrator.yaml`:

   ```yaml
   reactions:
     "ci-failed":
       auto: false
   ```

2. **Unstick the issue** (disk tracker): Edit the issue markdown file (e.g. `.ao/issues/hello-world.md`) and in front-matter set `state: closed` and change `labels` from `[agent:in-progress, ...]` to `[agent:done]` (or remove `agent:in-progress`). Save. The dashboard will then show the issue as done.

3. **Unstick the issue** (GitHub tracker): Use the dashboard or `gh` to remove the `agent:in-progress` label and add `agent:done`, and close the issue if you're done.

4. **Optional:** Merge the PR manually if you're happy with the code; the lifecycle will then move the session to `merged` and (for GitHub) the system can relabel the issue to `merged-unverified` for your verify flow.

Re-enable `reactions["ci-failed"].auto: true` when you have real CI (e.g. GitHub Actions or branch protection) so the agent gets notified when checks actually fail.
