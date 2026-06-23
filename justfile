set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

dev:
    pnpm exec moon run desktop:electron-dev

web-dev:
    pnpm exec moon run desktop:web-dev

build:
    pnpm exec moon run desktop:build

web-build:
    pnpm exec moon run desktop:web-build

package:
    pnpm exec moon run desktop:package

dist:
    pnpm exec moon run desktop:dist

check:
    pnpm exec moon run desktop:check

typecheck:
    pnpm exec moon run desktop:typecheck

test:
    pnpm exec moon run desktop:test

knowledge-test:
    pnpm exec moon run desktop:test-knowledge-integration

tasks:
    pnpm exec moon tasks
