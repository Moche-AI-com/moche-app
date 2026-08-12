#!/usr/bin/env python3
"""Emit the registry seed as compact chunks + an independent verification digest.

Why this exists: the generated seed file (supabase-migrations-GATE2-REGISTRY-SEED.sql)
is ~3.5k lines of pretty-printed SQL, which cannot be transported through the
Supabase management API in one call. This emits the same rows as compact
multi-row INSERTs, split into size-bounded chunks, plus a row digest computed
from field_registry.json alone.

The digest is the point. After seeding, the same digest expression is evaluated
inside Postgres over the materialized table. If the two agree, the seed is
provably faithful to the JSON regardless of how the SQL was transported -- a
truncated, reordered, or corrupted chunk cannot produce a matching digest.

Usage:
  python3 scripts/registry-seed-chunks.py chunks   # write /tmp/seed-chunk-NN.sql
  python3 scripts/registry-seed-chunks.py digest   # print expected sha256
"""

import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
REGISTRY = ROOT / "field_registry.json"
OUT_DIR = pathlib.Path("/tmp")
MAX_CHUNK_CHARS = 6500

sys.path.insert(0, str(ROOT / "scripts"))
import importlib.util

spec = importlib.util.spec_from_file_location(
    "registry_sql", ROOT / "scripts" / "registry-sql.py"
)
registry_sql = importlib.util.module_from_spec(spec)
spec.loader.exec_module(registry_sql)

COLUMNS = registry_sql.COLUMNS
row_values = registry_sql.row_values


def canonical_rows(fields, version):
    """Per-row canonical text. Must match the SQL digest expression exactly."""
    rows = []
    for fld in sorted(fields, key=lambda f: f["field_id"]):
        st = fld["storage_target"]
        parts = [
            fld["field_id"],
            fld["label"],
            fld["domain"],
            "t" if fld["system_section"] else "f",
            fld["type"],
            json.dumps(fld["enum_values"], separators=(",", ":"), sort_keys=True)
            if fld.get("enum_values") is not None
            else "",
            fld["sensitivity_tier"],
            fld["default_audience"],
            ",".join(fld["phase"]),
            "" if fld["ttl_days"] is None else str(fld["ttl_days"]),
            st["table"],
            st["column"],
            "t" if st["vault"] else "f",
            f'{float(fld["gap_weight"]):.2f}',
            "t" if fld["hard_block"] else "f",
            fld["applicability"],
            "t" if fld["requires_on_failure"] else "f",
            fld["on_failure_field"] or "",
            fld["scrape_hint"] or "",
            fld["interview_prompt"],
            str(version),
        ]
        rows.append("\x1f".join(parts))
    return rows


def digest(fields, version):
    return hashlib.sha256(
        "\x1e".join(canonical_rows(fields, version)).encode()
    ).hexdigest()


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("chunks", "digest"):
        print(__doc__)
        raise SystemExit(2)

    registry = json.loads(REGISTRY.read_text())
    version = registry["registry_version"]
    fields = sorted(registry["fields"], key=lambda f: f["field_id"])

    if sys.argv[1] == "digest":
        print(digest(fields, version))
        print(f"rows={len(fields)}")
        return

    prefix = "INSERT INTO public.field_registry (" + ",".join(COLUMNS) + ") VALUES\n"
    updates = ",".join(f"{c}=EXCLUDED.{c}" for c in COLUMNS if c != "field_id")
    suffix = f"\nON CONFLICT (field_id) DO UPDATE SET {updates};\n"

    # on_failure_field is a self-FK. The constraint is DEFERRABLE INITIALLY
    # IMMEDIATE, which only helps *within* one transaction -- and each chunk is
    # its own transaction. So a row whose fallback target lands in a later chunk
    # would fail. Order rows so every target precedes its referrer.
    ordered, placed = [], set()
    remaining = list(fields)
    while remaining:
        progressed = False
        for fld in list(remaining):
            target = fld.get("on_failure_field")
            if target is None or target in placed or target == fld["field_id"]:
                ordered.append(fld)
                placed.add(fld["field_id"])
                remaining.remove(fld)
                progressed = True
        if not progressed:
            raise SystemExit(
                "[seed] on_failure_field cycle among: "
                + ", ".join(f["field_id"] for f in remaining)
            )

    tuples = ["(" + ",".join(row_values(f, version)) + ")" for f in ordered]

    chunks, current = [], []
    for t in tuples:
        candidate = current + [t]
        body = ",\n".join(candidate)
        if current and len(prefix) + len(body) + len(suffix) > MAX_CHUNK_CHARS:
            chunks.append(current)
            current = [t]
        else:
            current = candidate
    if current:
        chunks.append(current)

    for old in OUT_DIR.glob("seed-chunk-*.sql"):
        old.unlink()

    for i, group in enumerate(chunks, 1):
        sql = prefix + ",\n".join(group) + suffix
        path = OUT_DIR / f"seed-chunk-{i:02d}.sql"
        path.write_text(sql)
        print(f"{path}  rows={len(group)}  chars={len(sql)}")

    total = sum(len(g) for g in chunks)
    print(f"total rows={total} (registry has {len(fields)})")
    assert total == len(fields), "chunking lost rows"


if __name__ == "__main__":
    main()
