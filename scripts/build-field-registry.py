#!/usr/bin/env python3
"""Generates field_registry.json v1 (Gate 2, directive Section 3).

The registry is the single source of truth across Supabase migrations, the
Firecrawl extraction schema, and the UI. No field may exist on any surface
unless it is declared here first.

Run: python3 scripts/build-field-registry.py
Output: field_registry.json (deterministic; safe to re-run and diff)
"""

import json
import pathlib

# --- Section 0 / Amendment 001-B: the two orthogonal axes -------------------

SENSITIVITY_TIERS = [
    "public_guest",
    "guest_after_verification",
    "stay_scoped_secret",
    "host_only",
]

AUDIENCE_TIERS = [
    "system_internal",
    "host_private",
    "staff_ops",
    "guest_instay",
    "guest_prearrival",
    "guest_public",
]

# Amendment 001-B.3. Enforced as a DB CHECK constraint, not documentation.
AUDIENCE_MATRIX = {
    "public_guest": [
        "guest_public",
        "guest_prearrival",
        "guest_instay",
        "staff_ops",
        "host_private",
    ],
    "guest_after_verification": [
        "guest_prearrival",
        "guest_instay",
        "staff_ops",
        "host_private",
    ],
    "stay_scoped_secret": ["guest_instay", "staff_ops", "host_private"],
    # staff_ops is inside the org boundary (property_members only); host_only
    # excludes every guest audience, which is the point of the tier.
    "host_only": ["host_private", "staff_ops", "system_internal"],
}

# --- Section 3.1: exactly 10 host-facing domains + 4 hidden system sections -

DOMAINS = [
    ("connectivity", "Connectivity", 1, False),
    ("access_security", "Access & Security", 2, False),
    ("policies_money", "Policies & Money", 3, False),
    ("space_details", "Space Details", 4, False),
    ("parking", "Parking", 5, False),
    ("amenities", "Amenities", 6, False),
    ("local_area", "Local Area", 7, False),
    ("house_rules", "House Rules", 8, False),
    ("checkout", "Checkout", 9, False),
    ("maintenance_escalation", "Maintenance & Escalation", 10, False),
    ("sys_provenance_audit", "Provenance / Audit", 101, True),
    ("sys_automations_rules", "Automations / Rules", 102, True),
    ("sys_sources_scrape_log", "Sources / Scrape Log", 103, True),
    ("sys_safety_escalations", "Safety / Escalations", 104, True),
]

PHASES = ["booking", "pre-arrival", "check-in", "mid-stay", "checkout"]

# Applicability predicates (Amendment 001-A.2). A predicate resolving false
# removes the field from the completeness denominator entirely.
APPLICABILITY = [
    "always",
    "has_wifi",
    "has_pool",
    "has_hot_tub",
    "has_laundry",
    "has_parking",
    "allows_pets",
    "is_multi_story",
    "has_elevator",
    "has_smart_lock",
    "has_security_cameras",
    "charges_deposit",
]


def f(
    field_id,
    label,
    domain,
    ftype,
    tier,
    audience,
    phases,
    ttl_days,
    table,
    column,
    interview_prompt,
    scrape_hint=None,
    vault=False,
    gap_weight=1.0,
    hard_block=False,
    requires_on_failure=False,
    on_failure_field=None,
    applicability="always",
    enum_values=None,
    system_section=False,
):
    """One registry entry. Every Section 3 attribute is mandatory."""
    entry = {
        "field_id": field_id,
        "label": label,
        "domain": domain,
        "system_section": system_section,
        "type": ftype,
        "sensitivity_tier": tier,
        "default_audience": audience,
        "phase": phases,
        "ttl_days": ttl_days,
        "storage_target": {"table": table, "column": column, "vault": vault},
        "gap_weight": gap_weight,
        "hard_block": hard_block,
        "applicability": applicability,
        "requires_on_failure": requires_on_failure,
        "on_failure_field": on_failure_field,
        "scrape_hint": scrape_hint,
        "interview_prompt": interview_prompt,
    }
    if enum_values:
        entry["enum_values"] = enum_values
    return entry


FIELDS = []

# --- 1. Connectivity -------------------------------------------------------
FIELDS += [
    f("wifi_network_name", "Wi-Fi network name", "connectivity", "string",
      "guest_after_verification", "guest_prearrival", ["pre-arrival", "check-in", "mid-stay"], 180,
      "brain_values", "value", "What is the exact Wi-Fi network name (SSID) guests should join?",
      scrape_hint="Amenities section; look for 'Wifi' or 'Internet' amenity rows.",
      gap_weight=2.0, applicability="has_wifi",
      requires_on_failure=True, on_failure_field="wifi_troubleshooting"),
    f("wifi_password", "Wi-Fi password", "connectivity", "secret",
      "stay_scoped_secret", "guest_instay", ["check-in", "mid-stay"], 180,
      "brain_values", "secret_ref_or_ciphertext",
      "What is the Wi-Fi password? It is stored encrypted and never sent to a model.",
      scrape_hint=None, vault=True, gap_weight=3.0, hard_block=True, applicability="has_wifi",
      requires_on_failure=True, on_failure_field="wifi_troubleshooting"),
    f("wifi_speed_tier", "Internet speed", "connectivity", "string",
      "public_guest", "guest_public", ["booking", "pre-arrival"], 365,
      "brain_values", "value", "Roughly what download speed can guests expect?",
      scrape_hint="Amenities section; 'Fast wifi' badge often states Mbps.",
      gap_weight=0.5),
    f("wifi_troubleshooting", "Wi-Fi troubleshooting / fallback", "connectivity", "text",
      "public_guest", "guest_instay", ["mid-stay"], 365,
      "brain_values", "value",
      "If the Wi-Fi is down at 11pm, what should a guest do? Where is the router, and who do they call?",
      gap_weight=1.5, requires_on_failure=False),
]

# --- 2. Access & Security --------------------------------------------------
FIELDS += [
    f("checkin_time", "Check-in time", "access_security", "time",
      "public_guest", "guest_public", ["booking", "pre-arrival"], 365,
      "brain_values", "value", "What time can guests check in?",
      scrape_hint="House rules / 'Check-in' row on the listing page.",
      gap_weight=2.0),
    f("checkin_flexibility", "Early check-in policy & fee", "access_security", "text",
      "public_guest", "guest_prearrival", ["booking", "pre-arrival"], 365,
      "brain_values", "value", "Can guests check in early, and is there a fee?",
      gap_weight=1.0),
    f("checkout_time", "Checkout time", "access_security", "time",
      "public_guest", "guest_public", ["booking", "mid-stay", "checkout"], 365,
      "brain_values", "value", "What time must guests check out?",
      scrape_hint="House rules / 'Checkout' row on the listing page.",
      gap_weight=3.0, hard_block=True),
    f("entry_method", "Entry method / lock type", "access_security", "enum",
      "guest_after_verification", "guest_prearrival", ["pre-arrival", "check-in"], 365,
      "brain_values", "value", "How do guests get in — smart lock, keypad, lockbox, key handoff, or doorman?",
      enum_values=["smart_lock", "keypad", "lockbox", "physical_key", "doorman", "other"],
      gap_weight=2.0, requires_on_failure=True, on_failure_field="access_backup_method"),
    f("door_code_or_entry_method", "Door / access code", "access_security", "secret",
      "stay_scoped_secret", "guest_instay", ["check-in", "mid-stay"], 90,
      "brain_values", "secret_ref_or_ciphertext",
      "What is the door or building access code? Stored encrypted; never auto-sent.",
      vault=True, gap_weight=3.0, hard_block=True,
      requires_on_failure=True, on_failure_field="access_backup_method"),
    f("access_code_lifecycle", "Access code lifecycle", "access_security", "text",
      "host_only", "host_private", ["pre-arrival"], 90,
      "brain_values", "value",
      "Does the code change between stays? Who rotates it, and when?",
      gap_weight=1.0, applicability="has_smart_lock"),
    f("access_backup_method", "Backup access method", "access_security", "text",
      "guest_after_verification", "guest_instay", ["check-in", "mid-stay"], 365,
      "brain_values", "value",
      "If the keypad is dead or the code fails, how else does a guest get in tonight?",
      gap_weight=2.0),
    f("security_camera_disclosure", "Security camera disclosure", "access_security", "text",
      "public_guest", "guest_public", ["booking", "pre-arrival"], 365,
      "brain_values", "value",
      "Are there any exterior cameras or recording devices? Disclosure is legally required.",
      scrape_hint="Safety & property section; 'Security cameras on property' row.",
      gap_weight=1.5, applicability="has_security_cameras"),
]

# --- 3. Policies & Money ---------------------------------------------------
FIELDS += [
    f("pet_policy", "Pet policy & fees", "policies_money", "text",
      "public_guest", "guest_public", ["booking"], 365,
      "brain_values", "value", "Are pets allowed? Any fee, size, or breed limits?",
      scrape_hint="House rules section; 'Pets allowed' row.", gap_weight=1.0),
    f("pet_fee", "Pet fee", "policies_money", "number",
      "public_guest", "guest_public", ["booking"], 365,
      "brain_values", "value", "What is the pet fee, and is it per stay or per night?",
      gap_weight=0.5, applicability="allows_pets"),
    f("minimum_stay", "Minimum stay", "policies_money", "number",
      "public_guest", "guest_public", ["booking"], 365,
      "brain_values", "value", "What is the minimum number of nights?", gap_weight=0.5),
    f("age_child_policy", "Age & child policy", "policies_money", "text",
      "public_guest", "guest_public", ["booking"], 365,
      "brain_values", "value", "Any age restrictions? Is the space suitable for infants or children?",
      scrape_hint="House rules; 'Suitable for children' / 'infants' rows.", gap_weight=0.5),
    f("deposit_damage_policy", "Deposit & damage policy", "policies_money", "text",
      "public_guest", "guest_prearrival", ["booking", "checkout"], 365,
      "brain_values", "value", "Is there a security deposit or damage policy guests should know about?",
      gap_weight=1.0, applicability="charges_deposit"),
    f("unexpected_charge_disclosure", "Additional charges", "policies_money", "text",
      "public_guest", "guest_public", ["booking"], 365,
      "brain_values", "value",
      "Are there any charges a guest could be surprised by — resort fee, cleaning, utilities, extra guest?",
      gap_weight=1.5),
]

# --- 4. Space Details ------------------------------------------------------
FIELDS += [
    f("bed_configuration", "Bed count, sizes & configuration", "space_details", "text",
      "public_guest", "guest_public", ["booking", "pre-arrival"], 365,
      "brain_values", "value", "How many beds, what sizes, and in which rooms?",
      scrape_hint="'Where you'll sleep' section; per-room bed cards.", gap_weight=1.5),
    f("max_occupancy", "Maximum occupancy", "space_details", "number",
      "public_guest", "guest_public", ["booking"], 365,
      "brain_values", "value", "How many guests can stay?",
      scrape_hint="Listing header; 'N guests' in the summary row.", gap_weight=1.0),
    f("floor_number", "Floor number", "space_details", "string",
      "public_guest", "guest_prearrival", ["pre-arrival", "check-in"], 365,
      "brain_values", "value", "Which floor is the unit on?",
      gap_weight=0.5, applicability="is_multi_story"),
    f("elevator_stairs", "Elevator or stairs", "space_details", "text",
      "public_guest", "guest_public", ["booking", "pre-arrival"], 365,
      "brain_values", "value", "Is there an elevator, or how many flights of stairs?",
      scrape_hint="Accessibility features section.",
      gap_weight=1.0, applicability="is_multi_story"),
]

# --- 5. Parking ------------------------------------------------------------
FIELDS += [
    f("parking", "Parking type & location", "parking", "text",
      "guest_after_verification", "guest_prearrival", ["booking", "pre-arrival", "check-in"], 365,
      "brain_values", "value",
      "Where exactly do guests park — driveway, street, garage, assigned spot? Include the quirks.",
      scrape_hint="Amenities section; 'Free parking on premises' / 'Paid parking' rows.",
      gap_weight=3.0, hard_block=True,
      requires_on_failure=True, on_failure_field="parking_overflow_fallback"),
    f("parking_cost", "Parking cost", "parking", "text",
      "public_guest", "guest_public", ["booking"], 365,
      "brain_values", "value", "Is parking free or paid, and how much?",
      gap_weight=0.5, applicability="has_parking"),
    f("parking_access_instructions", "Parking access instructions", "parking", "text",
      "guest_after_verification", "guest_instay", ["check-in", "mid-stay"], 365,
      "brain_values", "value", "Any gate code, permit, or garage clearance height guests need?",
      gap_weight=1.0, applicability="has_parking"),
    f("parking_overflow_fallback", "Parking fallback", "parking", "text",
      "public_guest", "guest_instay", ["check-in", "mid-stay"], 365,
      "brain_values", "value",
      "If the spot is taken or the garage is full, where should a guest go instead?",
      gap_weight=1.0, applicability="has_parking"),
]

# --- 6. Amenities ----------------------------------------------------------
FIELDS += [
    f("laundry_access", "Laundry access & instructions", "amenities", "text",
      "public_guest", "guest_instay", ["mid-stay"], 365,
      "brain_values", "value", "Is there laundry, where is it, and how is it operated?",
      scrape_hint="Amenities section; 'Washer' / 'Dryer' rows.",
      gap_weight=1.0, applicability="has_laundry"),
    f("appliance_list", "Appliance list", "amenities", "text",
      "public_guest", "guest_public", ["booking", "mid-stay"], 365,
      "brain_values", "value", "Which major appliances are available to guests?",
      scrape_hint="Amenities section; kitchen and laundry groups.", gap_weight=1.0),
    f("pool_instructions", "Pool instructions & hours", "amenities", "text",
      "public_guest", "guest_instay", ["mid-stay"], 365,
      "brain_values", "value", "What are the pool hours, rules, and any heating or safety notes?",
      gap_weight=1.0, applicability="has_pool",
      requires_on_failure=True, on_failure_field="maintenance_emergency_contact"),
    f("hot_tub_instructions", "Hot tub instructions & hours", "amenities", "text",
      "public_guest", "guest_instay", ["mid-stay"], 365,
      "brain_values", "value", "How is the hot tub operated, what are its hours, and any safety notes?",
      gap_weight=1.0, applicability="has_hot_tub",
      requires_on_failure=True, on_failure_field="maintenance_emergency_contact"),
    f("climate_control", "Heating & cooling", "amenities", "text",
      "public_guest", "guest_instay", ["check-in", "mid-stay"], 365,
      "brain_values", "value",
      "How do guests control heat and AC, and are there any known weak spots (e.g. 'AC struggles upstairs')?",
      scrape_hint="Amenities section plus review text mentioning hot/cold rooms.",
      gap_weight=1.0),
]

# --- 7. Local Area ---------------------------------------------------------
FIELDS += [
    f("nearest_grocery", "Nearest grocery", "local_area", "place",
      "public_guest", "guest_public", ["pre-arrival", "mid-stay"], 180,
      "brain_values", "value", "What is the closest grocery store, and how far is it?",
      scrape_hint="Neighborhood / 'Where you'll be' section.",
      gap_weight=3.0, hard_block=True),
    f("nearest_pharmacy", "Nearest pharmacy", "local_area", "place",
      "public_guest", "guest_public", ["mid-stay"], 180,
      "brain_values", "value", "What is the closest pharmacy, and how far is it?", gap_weight=1.0),
    f("restaurant_recommendations", "Restaurant recommendations", "local_area", "text",
      "public_guest", "guest_public", ["pre-arrival", "mid-stay"], 180,
      "brain_values", "value", "Name two or three nearby places you would actually send a guest to.",
      gap_weight=1.0),
    f("transit_options", "Transit options", "local_area", "text",
      "public_guest", "guest_public", ["booking", "pre-arrival", "mid-stay"], 180,
      "brain_values", "value", "What transit, rideshare, or airport options do guests use?",
      scrape_hint="'Getting around' / neighborhood section.", gap_weight=1.0),
    f("area_safety_notes", "Area safety notes", "local_area", "text",
      "public_guest", "guest_prearrival", ["pre-arrival", "mid-stay"], 180,
      "brain_values", "value", "Anything guests should know about the area after dark?",
      gap_weight=0.5),
]

# --- 8. House Rules --------------------------------------------------------
FIELDS += [
    f("quiet_hours", "Quiet hours", "house_rules", "text",
      "public_guest", "guest_public", ["booking", "mid-stay"], 365,
      "brain_values", "value", "What are the quiet hours, and is there an HOA or city noise rule?",
      scrape_hint="House rules section; 'Quiet hours' row.", gap_weight=1.0),
    f("trash_schedule", "Trash & recycling", "house_rules", "text",
      "public_guest", "guest_instay", ["mid-stay", "checkout"], 365,
      "brain_values", "value", "Where does trash go, and is there a collection day guests must handle?",
      gap_weight=1.0),
    f("extra_guest_policy", "Extra guest & visitor policy", "house_rules", "text",
      "public_guest", "guest_public", ["booking", "mid-stay"], 365,
      "brain_values", "value", "Are visitors or additional guests allowed, and at what cost?",
      gap_weight=1.0),
    f("smoking_policy", "Smoking policy", "house_rules", "text",
      "public_guest", "guest_public", ["booking"], 365,
      "brain_values", "value", "Is smoking or vaping permitted anywhere on the property?",
      scrape_hint="House rules section; 'No smoking' row.", gap_weight=0.5),
]

# --- 9. Checkout -----------------------------------------------------------
FIELDS += [
    f("checkout_checklist", "Checkout checklist", "checkout", "text",
      "public_guest", "guest_instay", ["checkout"], 365,
      "brain_values", "value", "What must a guest do before leaving — dishes, linens, thermostat, lights?",
      gap_weight=1.5),
    f("key_return_process", "Key or code return", "checkout", "text",
      "guest_after_verification", "guest_instay", ["checkout"], 365,
      "brain_values", "value", "How are keys returned, or is the code simply retired?",
      gap_weight=1.0),
    f("late_checkout_policy", "Late checkout policy", "checkout", "text",
      "public_guest", "guest_prearrival", ["mid-stay", "checkout"], 365,
      "brain_values", "value", "Can a guest check out late, and is there a fee?", gap_weight=1.0),
]

# --- 10. Maintenance & Escalation -----------------------------------------
FIELDS += [
    f("maintenance_emergency_contact", "Maintenance / emergency contact", "maintenance_escalation", "contact",
      "guest_after_verification", "guest_instay", ["check-in", "mid-stay", "checkout"], 180,
      "brain_values", "value",
      "Who does a guest reach for an urgent maintenance problem, and on what number? This anchors every other fallback.",
      gap_weight=3.0, hard_block=True),
    f("after_hours_escalation", "After-hours escalation", "maintenance_escalation", "text",
      "guest_after_verification", "guest_instay", ["mid-stay"], 180,
      "brain_values", "value", "Who handles a 2am problem if the primary contact does not answer?",
      gap_weight=1.5),
    f("plumbing_troubleshooting", "Plumbing troubleshooting", "maintenance_escalation", "text",
      "public_guest", "guest_instay", ["mid-stay"], 365,
      "brain_values", "value",
      "What should a guest try for a clogged toilet or slow drain before calling you?",
      gap_weight=1.0, requires_on_failure=True, on_failure_field="maintenance_emergency_contact"),
    f("appliance_troubleshooting", "Appliance troubleshooting", "maintenance_escalation", "text",
      "public_guest", "guest_instay", ["mid-stay"], 365,
      "brain_values", "value",
      "Any appliance with a known trick — breaker location, reset button, quirk?",
      gap_weight=1.0, requires_on_failure=True, on_failure_field="maintenance_emergency_contact"),
    f("utility_shutoff_locations", "Utility shutoff locations", "maintenance_escalation", "text",
      "host_only", "staff_ops", ["mid-stay"], 365,
      "brain_values", "value", "Where are the water shutoff, breaker panel, and gas valve?",
      gap_weight=1.0),
]

# --- Hidden system sections (never render as host-facing folders) ----------
FIELDS += [
    f("provenance_source_rank", "Provenance source rank", "sys_provenance_audit", "enum",
      "host_only", "system_internal", ["booking"], None, "brain_values", "source",
      "System field. Not host-facing.",
      enum_values=["host_verified", "pms_sync", "host_chat", "escalation", "firecrawl", "inferred"],
      gap_weight=0.0, system_section=True),
    f("audit_verified_at", "Verified at", "sys_provenance_audit", "date",
      "host_only", "system_internal", ["booking"], None, "brain_values", "verified_at",
      "System field. Not host-facing.", gap_weight=0.0, system_section=True),
    f("automation_gate_decision", "Auto-publish gate decision", "sys_automations_rules", "enum",
      "host_only", "system_internal", ["booking"], None, "brain_values", "value",
      "System field. Not host-facing.",
      enum_values=["would_have_published", "held_for_host"],
      gap_weight=0.0, system_section=True),
    f("scrape_log_entry", "Scrape log entry", "sys_sources_scrape_log", "text",
      "host_only", "system_internal", ["booking"], None, "brain_values", "value",
      "System field. Not host-facing.", gap_weight=0.0, system_section=True),
    f("safety_escalation_record", "Safety escalation record", "sys_safety_escalations", "text",
      "host_only", "system_internal", ["mid-stay"], None, "brain_values", "value",
      "System field. Not host-facing.", gap_weight=0.0, system_section=True),
]

# --- Validation ------------------------------------------------------------


def validate(fields):
    errors = []
    domain_ids = {d[0] for d in DOMAINS}
    ids = [x["field_id"] for x in fields]
    if len(ids) != len(set(ids)):
        dupes = {i for i in ids if ids.count(i) > 1}
        errors.append(f"duplicate field_id(s): {sorted(dupes)}")
    known = set(ids)
    for x in fields:
        fid = x["field_id"]
        if x["domain"] not in domain_ids:
            errors.append(f"{fid}: unknown domain {x['domain']}")
        if x["sensitivity_tier"] not in SENSITIVITY_TIERS:
            errors.append(f"{fid}: unknown sensitivity_tier {x['sensitivity_tier']}")
        if x["default_audience"] not in AUDIENCE_TIERS:
            errors.append(f"{fid}: unknown default_audience {x['default_audience']}")
        allowed = AUDIENCE_MATRIX[x["sensitivity_tier"]]
        if x["default_audience"] not in allowed:
            errors.append(
                f"{fid}: audience {x['default_audience']} not permitted for "
                f"tier {x['sensitivity_tier']} (Amendment 001-B.3)"
            )
        for p in x["phase"]:
            if p not in PHASES:
                errors.append(f"{fid}: unknown phase {p}")
        if x["applicability"] not in APPLICABILITY:
            errors.append(f"{fid}: unknown applicability {x['applicability']}")
        if x["requires_on_failure"] and not x["on_failure_field"]:
            errors.append(f"{fid}: requires_on_failure but on_failure_field is null")
        if x["on_failure_field"] and x["on_failure_field"] not in known:
            errors.append(f"{fid}: on_failure_field {x['on_failure_field']} is not a declared field")
        # Section 3.2: secrets route to Vault, never to a plaintext value column.
        if x["type"] == "secret":
            if not x["storage_target"]["vault"]:
                errors.append(f"{fid}: type=secret must route to Vault")
            if x["storage_target"]["column"] != "secret_ref_or_ciphertext":
                errors.append(f"{fid}: type=secret must store a pointer, not a value")
            if x["sensitivity_tier"] not in ("stay_scoped_secret", "host_only"):
                errors.append(f"{fid}: type=secret cannot be tier {x['sensitivity_tier']}")
        if x["system_section"] and x["gap_weight"] != 0.0:
            errors.append(f"{fid}: system_section fields must have gap_weight 0 (Amendment 001-A.2)")
        if x["hard_block"] and x["gap_weight"] <= 0:
            errors.append(f"{fid}: hard_block field must be scored")
        # Amendment 001-A.2: an unscored field cannot be in the denominator.
        if x["gap_weight"] < 0:
            errors.append(f"{fid}: negative gap_weight")
        # Section 9.0c: scrape hints must be static registry text.
        if x["scrape_hint"] is not None and not isinstance(x["scrape_hint"], str):
            errors.append(f"{fid}: scrape_hint must be a static string")

    hard = sorted(x["field_id"] for x in fields if x["hard_block"])
    expected_hard = sorted([
        "checkout_time",
        "door_code_or_entry_method",
        "maintenance_emergency_contact",
        "nearest_grocery",
        "parking",
        "wifi_password",
    ])
    if hard != expected_hard:
        errors.append(f"hard_block set drift: {hard} != {expected_hard} (Section 5.3 + Amendment 001-A.4)")

    host_facing = {d[0] for d in DOMAINS if not d[3]}
    covered = {x["domain"] for x in fields if not x["system_section"]}
    if host_facing != covered:
        errors.append(f"domain coverage gap: {sorted(host_facing - covered)}")

    return errors


def main():
    import sys  # noqa: PLC0415 - only main() needs argv

    errs = validate(FIELDS)
    if errs:
        for e in errs:
            print(f"[registry-invalid] {e}")
        raise SystemExit(1)

    registry = {
        "registry_version": 1,
        "governing_documents": [
            "Moche-AI Unified Build Directive (Merged Execution Contract) Section 3",
            "docs/DIRECTIVE-AMENDMENT-001.md",
        ],
        "generator": "scripts/build-field-registry.py",
        "sensitivity_tiers": SENSITIVITY_TIERS,
        "audience_tiers": AUDIENCE_TIERS,
        "audience_matrix": AUDIENCE_MATRIX,
        "phases": PHASES,
        "applicability_predicates": APPLICABILITY,
        "completeness": {
            "ship_threshold_pct": 65,
            "credit": {"satisfied": 1.0, "partial": 0.5, "missing": 0.0},
            "denominator_rule": (
                "gap_weight > 0 AND system_section = false AND applicability resolves true "
                "for the property. not_applicable is removed from the denominator, never "
                "credited as satisfied. See docs/DIRECTIVE-AMENDMENT-001.md Section A."
            ),
        },
        "domains": [
            {"domain_id": d[0], "label": d[1], "order": d[2], "system_section": d[3]}
            for d in DOMAINS
        ],
        "fields": sorted(FIELDS, key=lambda x: (x["domain"], x["field_id"])),
    }

    out = pathlib.Path(__file__).resolve().parent.parent / "field_registry.json"
    rendered = json.dumps(registry, indent=2, sort_keys=False) + "\n"
    scored = [x for x in FIELDS if x["gap_weight"] > 0 and not x["system_section"]]
    summary = (f"{len(FIELDS)} fields, {len(scored)} scored, "
               f"{len(registry['domains'])} domains")

    # --check is what CI runs. The committed registry is the pinned contract
    # (Section 0.2a); if it no longer matches its generator, someone hand-edited
    # one of the two and the pin is meaningless. Fail rather than silently
    # overwrite the working tree inside a CI job.
    if "--check" in sys.argv[1:]:
        if not out.exists():
            print("[registry-drift] field_registry.json is missing")
            raise SystemExit(1)
        if out.read_text() != rendered:
            print("[registry-drift] field_registry.json does not match its generator.")
            print("[registry-drift] Run: python3 scripts/build-field-registry.py")
            raise SystemExit(1)
        print(f"[registry-check] ok \u2014 field_registry.json matches generator: {summary}")
        return

    out.write_text(rendered)
    print(f"field_registry.json written: {summary}")


if __name__ == "__main__":
    main()
