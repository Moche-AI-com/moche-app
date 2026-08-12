#!/usr/bin/env python3
"""Registry <-> database parity tooling (Gate 2).

Two subcommands:

  seed   Emit the idempotent SQL that materializes field_registry.json into the
         public.field_registry table. Written to
         supabase-migrations-GATE2-REGISTRY-SEED.sql.

  drift  Compare field_registry.json against the committed seed file and fail if
         they diverge. This is the CI guard: field_registry.json is the source of
         truth, and a hand-edit to either side that is not mirrored is a hard
         build failure rather than a silent schema/registry split.

Usage:
  python3 scripts/registry-sql.py seed
  python3 scripts/registry-sql.py drift
"""

import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
REGISTRY = ROOT / "field_registry.json"
SEED = ROOT / "supabase-migrations-GATE2-REGISTRY-SEED.sql"

HEADER = """-- GENERATED FILE. Do not edit by hand.
-- Source: field_registry.json (registry_version {version})
-- Regenerate: python3 scripts/registry-sql.py seed
-- CI guard:   python3 scripts/registry-sql.py drift
--
-- Materializes the registry into public.field_registry. Idempotent: re-running
-- reconciles the table to the JSON, including removing fields deleted from the
-- registry. Apply after supabase-migrations-GATE2-REGISTRY.sql.
--
-- registry_checksum: {checksum}

BEGIN;

-- Deferred so on_failure_field self-references can be inserted in any order.
SET CONSTRAINTS ALL DEFERRED;

"""

FOOTER = """
-- Reconcile deletions: a field removed from the registry must not linger in the
-- table, or a brain_values row could keep an FK to an undeclared field.
DELETE FROM public.field_registry
WHERE field_id NOT IN (
{id_list}
);

COMMIT;
"""


def q(v):
    """SQL literal for a Python value."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (list, dict)):
        return "'" + json.dumps(v).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def pg_array(items):
    inner = ",".join('"' + str(i).replace('"', '\\"') + '"' for i in items)
    return "'{" + inner + "}'::text[]"


def checksum(registry):
    canonical = json.dumps(registry, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


COLUMNS = [
    "field_id", "label", "domain", "system_section", "type", "enum_values",
    "sensitivity_tier", "default_audience", "phase", "ttl_days",
    "storage_table", "storage_column", "storage_vault", "gap_weight",
    "hard_block", "applicability", "requires_on_failure", "on_failure_field",
    "scrape_hint", "interview_prompt", "registry_version",
]


def row_values(fld, version):
    st = fld["storage_target"]
    return [
        q(fld["field_id"]),
        q(fld["label"]),
        q(fld["domain"]),
        q(fld["system_section"]),
        q(fld["type"]),
        q(fld.get("enum_values")),
        q(fld["sensitivity_tier"]) + "::public.sensitivity_tier",
        q(fld["default_audience"]) + "::public.audience_tier",
        pg_array(fld["phase"]),
        q(fld["ttl_days"]),
        q(st["table"]),
        q(st["column"]),
        q(st["vault"]),
        q(fld["gap_weight"]),
        q(fld["hard_block"]),
        q(fld["applicability"]),
        q(fld["requires_on_failure"]),
        q(fld["on_failure_field"]),
        q(fld["scrape_hint"]),
        q(fld["interview_prompt"]),
        q(version),
    ]


def build_seed():
    registry = json.loads(REGISTRY.read_text())
    version = registry["registry_version"]
    fields = sorted(registry["fields"], key=lambda f: f["field_id"])

    parts = [HEADER.format(version=version, checksum=checksum(registry))]

    updates = ",\n".join(
        f"  {c} = EXCLUDED.{c}" for c in COLUMNS if c != "field_id"
    )

    for fld in fields:
        vals = ",\n    ".join(row_values(fld, version))
        parts.append(
            f"INSERT INTO public.field_registry (\n    "
            + ",\n    ".join(COLUMNS)
            + f"\n) VALUES (\n    {vals}\n)\n"
            f"ON CONFLICT (field_id) DO UPDATE SET\n{updates};\n"
        )

    id_list = ",\n".join(f"  {q(f['field_id'])}" for f in fields)
    parts.append(FOOTER.format(id_list=id_list))
    return "".join(parts)


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("seed", "drift"):
        print(__doc__)
        raise SystemExit(2)

    generated = build_seed()

    if sys.argv[1] == "seed":
        SEED.write_text(generated)
        n = len(json.loads(REGISTRY.read_text())["fields"])
        print(f"{SEED.name} written: {n} field rows")
        return

    if not SEED.exists():
        print(f"[drift] {SEED.name} is missing. Run: python3 scripts/registry-sql.py seed")
        raise SystemExit(1)

    committed = SEED.read_text()
    if committed != generated:
        print(
            "[drift] field_registry.json and "
            f"{SEED.name} have diverged.\n"
            "        The JSON is the source of truth. Regenerate and commit:\n"
            "          python3 scripts/registry-sql.py seed"
        )
        # Show the first differing line so the failure is actionable in CI logs.
        for i, (a, b) in enumerate(zip(committed.splitlines(), generated.splitlines()), 1):
            if a != b:
                print(f"        first difference at line {i}:")
                print(f"          committed: {a[:160]}")
                print(f"          generated: {b[:160]}")
                break
        else:
            print("        files differ in length only")
        raise SystemExit(1)

    print(f"[drift] ok — {SEED.name} matches field_registry.json")


if __name__ == "__main__":
    main()
