# Changelog

## [0.13.0] (2026-02-22)

### Features

* add /rollback slash command and session corruption hint (#16)
* **web**: add active/by-project view toggle to session list (#10)

### Bug Fixes

* eliminate virtualizer flash and reduce unnecessary re-renders (#12)
* cancel pending permission requests on session reload or resume
* treat completedRequests as Record not Array in messageHistoryHandlers
* handle unknown SDK message types instead of leaking raw JSON (#9)
* auto-resume forked sessions and improve inactive session UX (#11)

## [0.12.2] (2026-02-20)

### Bug Fixes

* generate version files before build and typecheck in CI
* Build workflow

### Miscellaneous Changes

* Do not run tests on release PRs only on PR to main
* skip tests on release-please branches

All notable changes to this project will be documented in this file.

