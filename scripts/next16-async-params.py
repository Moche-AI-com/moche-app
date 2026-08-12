#!/usr/bin/env python3
"""One-shot codemod: Next 15+ made route `params` a Promise.

Next 14 handed handlers `{ params: { id: string } }`. Next 15 changed it to
`{ params: Promise<{ id: string }> }`, and the Dependabot bump to 16.3.0 landed
that break across 52 route/page/layout files at once.

The transform is deliberately blunt in one respect: instead of hoisting a
`const { id } = await params` into each function body -- which means locating 52
different body openings, some inside nested helpers -- it rewrites each
`params.x` access to `(await params).x`. Awaiting the same promise repeatedly
resolves once, so this is correct, and it cannot mis-place a declaration. Any
site that is not inside an async function fails typecheck loudly rather than
silently.

This script is kept in the repository as the record of what was changed
mechanically versus by hand. It is idempotent.
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / "app"

# `params: { id: string; slug: string }` in a destructured type annotation.
TYPE_RE = re.compile(r"params\s*:\s*(\{[^{}]*\})(?!\s*\))")
# `params.id`, but not one already inside `(await params).id`.
ACCESS_RE = re.compile(r"(?<!await )\bparams\.([A-Za-z_][A-Za-z0-9_]*)")


def transform(src: str) -> str:
    def widen(m: re.Match[str]) -> str:
        inner = m.group(1)
        if "Promise<" in inner:
            return m.group(0)
        return f"params: Promise<{inner}>"

    out = TYPE_RE.sub(widen, src)
    if "params: Promise<" not in out:
        return src
    return ACCESS_RE.sub(lambda m: f"(await params).{m.group(1)}", out)


def main() -> int:
    changed = []
    for path in sorted(APP.rglob("*")):
        if path.suffix not in {".ts", ".tsx"} or not path.is_file():
            continue
        src = path.read_text()
        if "params" not in src:
            continue
        new = transform(src)
        if new != src:
            path.write_text(new)
            changed.append(path.relative_to(ROOT))

    for c in changed:
        print(f"[next16-params] {c}")
    print(f"[next16-params] {len(changed)} file(s) rewritten")
    return 0


if __name__ == "__main__":
    sys.exit(main())
