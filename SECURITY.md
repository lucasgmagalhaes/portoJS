# Security policy

## Supported versions

Until 1.0, only the latest minor release receives fixes.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting
("Security" tab, "Report a vulnerability") on this repository.

You can expect an acknowledgement within a few days and a fix or mitigation plan once the
report is confirmed.

## Scope notes

- Save checksums (FNV-1a) detect accidental corruption and casual edits. They are **not** a
  security boundary. Players can always recompute them. If cheating matters to your game,
  validate progress on a server.
- `portojs` does no I/O of its own. Anything read from storage or the network (saves,
  imported strings) is validated, but treat it as untrusted input in your application.
