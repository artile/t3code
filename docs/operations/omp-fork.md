# OMP nightly fork

This fork adds the OMP provider to the upstream T3 nightly. The original T3 app
and its data stay separate. `omp-fork.toml` records the upstream tag and source
proposals. OMP uses #11791 and its descendant #11973. Inline HTML citations use
#17023; selection toolbar placement uses #29218. Their provider behavior is
ported to the current packaged-provider interface; their old upstream history
is not merged into the nightly branch.

## Build and start

Use the Node and pnpm versions in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm fork:build
pnpm fork:service install
```

On macOS, the service runs at login and restarts after a failure. It starts Node
directly and writes stdout and stderr to `.t3/service/`, so an agent terminal or
RTK output pipe does not own its lifetime. Use `pnpm fork:service status`,
`stop`, `start`, or `restart`. `uninstall` removes only this fork's LaunchAgent.
For a foreground debug session, stop the service and use `pnpm fork:start`.

The built server uses this checkout's `.t3` directory, port 13773, and HTTPS
Tailscale Serve port 5733. The startup prints a pairing URL. Add it as a separate
environment in the original T3 Android app. Keep its existing connections.
Do not point either server at the other server's data directory.

OMP is a separate provider under Settings → Providers. Set its executable path
and enable it. Models, options, commands and native session management come from
OMP. Permission modes map to OMP's launch flags. Batched native `task` calls
project to T3's existing child threads and Lineage; they use the same wire events
as other native providers. A native child result is evidence that the child
finished, not that its work was correct. The current OMP ACP transport does not
expose child transcripts or workers launched inside `eval`; those do not appear
in Lineage. This is a task-lifecycle integration, not full OMP TUI parity.

HTML citations use the existing Cite toolbar in the web and desktop clients.
The original Android client remains compatible, but it does not gain this web
selection toolbar. Selecting assistant or HTML text opens its citation comment field directly.

## Update from upstream

Keep `main` as the upstream reference and development on `omp-nightly`.
Check weekly or when needed:

```sh
pnpm fork:update --check
pnpm fork:update --apply
pnpm install --frozen-lockfile
pnpm exec vp run check:changed
pnpm fork:build
```

The check fetches the newest published nightly tag. Apply requires a clean
`omp-nightly` branch, creates a backup ref, merges the tag without rewriting
published history, and commits the new pin. A conflict stops the update. Resolve
it, or use `git merge --abort`; the running built server is not replaced.

Stop this fork with `pnpm fork:service stop` before building. After verification,
use `pnpm fork:service start`. Keep
the upstream installation available until the new build passes a real OMP turn,
a native child-task check, cancellation, resume, and the original Android client.
Do not set up an automatic weekly merge until these checks can gate deployment.

## Reading and shortcuts

Automatic scrolling is off by default in this fork. Change it under Settings →
Chat. The local fork settings bind `thread.previous` to `Cmd+Shift+Up` and
`thread.next` to `Cmd+Shift+Down`. The source defaults for thread navigation stay
upstream-compatible; these two bindings live in the fork data directory and
survive a source update. `thread.scrollToEnd` defaults to `Cmd/Ctrl+Down`.
