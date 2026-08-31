# Pricing model for the January 1, 2027 launch

Status: proposed, pending owner sign-off. Supersedes the per-property flat pricing
in the August 2026 pitch deck (Essentials $29 / Pro $49 per property/month) and the
$149-per-property guided setup fee.

Written 31 August 2026. Every competitor number below was read off the vendor's own
pricing page on that date; every cost number is derived from this repo's own specs.

---

## 1. Why the current pricing has to change

The August 2026 grid charges a flat rate per property with no volume relief:

| Properties | Essentials $29 flat | Pro $49 flat |
|---|---|---|
| 1 | $29 | $49 |
| 5 | $145 | $245 |
| 10 | $290 | $490 |
| 24 | $696 | $1,176 |

Three problems.

**It inverts the cost curve.** Our costs are concentrated in setup: building the
Property Brain, adding properties, curating facts. Per-guest-message cost is
effectively zero (§3). Flat per-property pricing charges the most where our
marginal cost is lowest, so a host with 12 properties pays 12x for something that
costs us roughly 12 x $0.40.

**It is far above market at multi-property scale.** Host Tools publishes an
explicit declining marginal rate and reaches $106/month at 10 listings and
$353/month at 50 ([Host Tools pricing](https://hosttools.com/pricing/)). Touch Stay
falls to $4.13 per property/month at 10 guidebooks on annual billing
([Touch Stay pricing](https://touchstay.com/pricing-new)). Our $49 x 10 = $490 is
4.6x Host Tools for a portfolio that size. That is where mid-size hosts are lost,
and mid-size hosts are the segment with real budget.

**The setup fee is a category outlier.** No self-serve competitor reviewed
publishes a mandatory setup fee. Host Tools states no setup fee and free
personalized onboarding ([Host Tools](https://hosttools.com/pricing/)); Hospitable
includes a no-cost orientation ([Hospitable](https://hospitable.com/pricing));
Touch Stay includes personalized onboarding at 7+ guidebooks
([Touch Stay](https://touchstay.com/pricing-new)). A mandatory $149 per property
reads as greedy against that backdrop, and at 5 properties it is a $745 wall in
front of a product nobody has used yet.

## 2. Competitive anchors

Full research with per-number sources: `/home/user/workspace/competitor-pricing.md`.

| Vendor | Class | Published anchor | Volume curve |
|---|---|---|---|
| [Touch Stay](https://touchstay.com/pricing-new) | Guidebooks | $8.25 to $13.25 per property/mo at 1 (annual) | Yes, steep. $2.95 to $4.34 at 50 |
| [Host Tools](https://hosttools.com/pricing/) | Messaging automation | Pro $32/mo at 1 listing (monthly) | Yes, explicit. $106 at 10, $353 at 50 |
| [Hospitable](https://hospitable.com/pricing) | Messaging / light PMS | Paid from $25.52/mo; free Essentials tier | No. Flat marginal within a plan ($10/$15/$30) |
| [Enso Connect](https://ensoconnect.com/pricing) | Guest experience / AI | Calculator default $225 at 15 listings ($15/listing) | Not published; quote-led |
| [Guesty](https://www.guesty.com/pricing/) | PMS, upper anchor | Lite from $9/mo plus 1% per reservation | Not public above Lite |
| [Hostfully](https://www.hostfully.com/pricing/), [Besty AI](https://www.getbesty.ai/) | Guidebooks / AI | No public price; demo-led | Not published |

Readout:

- Volume discounting is the norm wherever pricing is public. Two of three
  vendors with public curves discount steeply; only Hospitable is flat.
- A permanent free tier exists in the category (Hospitable Essentials), and
  14-day no-card trials are standard at Hospitable, Touch Stay, and Host Tools.
- Mandatory setup fees are not normal.
- The AI/guest-experience class sits roughly $15 to $32 per property/month at
  small scale, above the $3 to $13 guidebook class. Moche-AI is broader than a
  guidebook (grounded Q&A, structured requests, maintenance triage, review
  prompts), so pricing at guidebook rates would leave money on the table and
  signal the wrong category.

Note on evidence quality: Duve's pricing page returned HTTP 403 and was not
verified. Hostfully, Besty AI, and Guesty above Lite are quote-led. Conclusions
above rest only on the vendors with published numbers.

## 3. Unit economics

### Variable cost per property per month

Model rates from `docs/OPENROUTER_TIER_SPEC.md` (verified 22 July 2026, per 1M tokens):

| Model | Input | Output | Use |
|---|---|---|---|
| `openai/gpt-4o-mini` | $0.15 | $0.60 | Extraction, general |
| `meta-llama/llama-3.1-8b-instruct` | $0.05 | $0.08 | Classification |
| `anthropic/claude-haiku-4.5` | $1.00 | $5.00 | Concierge, opt-in only |

Derived:

| Item | Cost | Basis |
|---|---|---|
| One grounded guest answer | ~$0.0006 | Retrieval context plus short answer on gpt-4o-mini |
| 500 guest messages/month | ~$0.30 | 500 x $0.0006 |
| Full Brain ingestion | ~$0.03 | One-time per property |
| One SMS escalation | ~$0.011 | Twilio, all-in |

A busy property does not generate 500 guest messages a month. Even assuming it
does, plus a handful of SMS escalations, **variable cost lands at $0.25 to $0.60
per property per month.** Compute is not a meaningful cost centre.

Fixed platform cost is roughly **$100 to $150/month** (Supabase Pro, Vercel Pro,
Sentry, domain), independent of property count.

### The real cost centre is setup labour

Building a Property Brain well takes founder time. That is a services cost, not
COGS, and it should be priced as an optional service rather than baked into a
mandatory fee that suppresses signups (§5).

### Margin at the proposed rates

Using the pessimistic $0.60/property/month variable cost:

| Properties | Monthly total | Effective per property | Variable COGS | Gross margin |
|---|---|---|---|---|
| 1 | $29 | $29.00 | $0.60 | 97.9% |
| 3 | $67 | $22.33 | $1.80 | 97.3% |
| 5 | $100 | $20.00 | $3.00 | 97.0% |
| 10 | $167 | $16.70 | $6.00 | 96.4% |
| 20 | $277 | $13.85 | $12.00 | 95.7% |
| 24 | $321 | $13.38 | $14.40 | 95.5% |

Break-even on fixed cost: **6 single-property accounts, or one 9-property
account.** Margin stays above 95% across the whole self-serve range, so the
volume discount is funded entirely out of gross margin rather than out of
viability.

## 4. Proposed structure

One free tier, one self-serve paid plan with a graduated per-property rate, and
two contract tiers. Unlimited guest messages on every paid plan, with no
per-conversation charge at any tier. That last point is a genuine differentiator:
Touch Stay meters SMS at roughly 10 to 65 messages per month by tier
([Touch Stay](https://touchstay.com/pricing-new)), and Guesty charges 1% of every
reservation on Lite ([Guesty](https://www.guesty.com/pricing/)).

### Free (plan id `starter`, display name "Free")

$0 forever. 1 property. Build the Property Brain, preview the guest portal, see
exactly what a guest would see. The live guest-facing concierge and QR codes
require a paid plan.

This is today's behaviour already, renamed and marketed honestly rather than
described as a limitation. It costs us essentially nothing, it lets a host prove
the product to themselves with their own property data before paying, and the
category has a precedent (Hospitable Essentials).

### Host (plan id `pro`, display name "Host")

Graduated marginal rate per property per month. Each band prices only the
properties that fall inside it, so the rate declines as the portfolio grows and
nobody hits a cliff when they add their fifth or tenth property.

| Band | Rate per property/mo |
|---|---|
| Property 1 | $29 |
| Properties 2 to 4 | $19 each |
| Properties 5 to 9 | $14 each |
| Properties 10 to 24 | $11 each |

Resulting totals:

| Properties | Total/mo | Effective per property | vs. old Pro flat $49 |
|---|---|---|---|
| 1 | $29 | $29.00 | $49, saves 41% |
| 2 | $48 | $24.00 | $98, saves 51% |
| 3 | $67 | $22.33 | $147, saves 54% |
| 5 | $100 | $20.00 | $245, saves 59% |
| 8 | $142 | $17.75 | $392, saves 64% |
| 10 | $167 | $16.70 | $490, saves 66% |
| 15 | $222 | $14.80 | $735, saves 70% |
| 20 | $277 | $13.85 | $980, saves 72% |
| 24 | $321 | $13.38 | $1,176, saves 73% |

At 1 property $29 sits just under Host Tools' $32 and just above Hospitable's
$25.52, which is the right place for a broader product. At 10 properties $167 is
1.6x Host Tools' $106 rather than 4.6x, which is defensible on scope. At 15
properties $222 lands almost exactly on Enso's published calculator default of
$225 ([Enso](https://ensoconnect.com/pricing)) while being self-serve rather than
quote-led.

Annual billing stays at 10x the monthly rate, which is two months free.
`ANNUAL_MULTIPLIER = 10` is unchanged.

Collapsing Essentials and Pro into one plan is deliberate. The old split forced a
feature-gating decision at the exact moment a host is least able to judge which
tier they need, and it put review nudges and SMS escalation behind a 69% price
increase. One plan with a declining rate is a simpler promise and removes the
most common source of pre-purchase hesitation.

### Portfolio (plan id `portfolio`) and Enterprise (plan id `enterprise`)

Portfolio covers 25 to 100 properties at a contract rate, target $10 to $12 per
property/month, which continues the curve below the $11 self-serve floor.
Enterprise is 100+ with SSO, SLA, API access, and custom terms.

Both remain `selfServe: false` and route to sales. Neither publishes a number on
the pricing page beyond the Portfolio target range, which is honest because the
rate genuinely depends on the deal.

### Plan id mapping

The four existing `PlanId` values are kept and redefined rather than renamed.
`subscriptions.plan` is a free-text column, so renaming is technically possible,
but the ids thread through entitlements, the Stripe price lookup keys, the
checkout route, the dashboard, and the test suite. Redefining meaning in one file
is a far smaller change than renaming a union type across all of them.

| Plan id | Was | Now |
|---|---|---|
| `starter` | Essentials, $29/property, 1 to 9 | Free, $0, 1 property |
| `pro` | Pro, $49/property, 1 to 9 | Host, graduated $29/$19/$14/$11, 1 to 24 |
| `portfolio` | 10 to 40, contract | 25 to 100, contract, target $10 to $12 |
| `enterprise` | 41+, custom | 100+, custom |

`coHosts` and `cloning` are currently derived as `plan.id !== 'starter'`, which
stays correct without modification: the free tier has neither.

## 5. Concierge Setup, replacing the $149 per-property fee

Optional, priced per account rather than per property, and presented as a service
rather than a pricing tier.

| | Old | New |
|---|---|---|
| First property | $149 | $199 |
| Each additional | $149 | $49 |
| 5-property total | $745 | $395, down 47% |
| 10-property total | $1,490 | $640, down 57% |

Self-service setup stays free and is presented first and as the default. The paid
option moves off the pricing cards into a single services line, so it reads as
"we will do it with you if you want" rather than a toll gate. The headline rate
goes up while the realistic multi-property cost falls sharply, which is the right
trade: it prices the founder's actual labour on a single property honestly, and
stops punishing exactly the portfolio hosts we most want.

## 6. Founding Host Program, replacing the trial-and-apply flow

The current landing section is inconsistent with the rest of the site and with
pre-launch reality. It offers a "free trial" that "requires a card," which
contradicts the Pricing section on the same page stating no card is charged before
launch. Its founding CTA is a `mailto:` link, which is a dead end for lead
capture and gives us no structured data. And a 30-day trial is meaningless when
the product is free for everyone until January 1, 2027.

Replacement:

- **Founding Host is the pre-launch signup itself.** No application, no email, no
  card. Signing up before launch makes you a founding host.
- **The offer is a locked founding rate: 50% off the first 12 months of billing
  after launch, locked at signup, for the first 100 accounts.** At 50% the
  single-property rate is $14.50, still a 95.9% gross margin, so the offer is
  funded out of margin and needs no cross-subsidy.
- **One CTA, into real onboarding.** Signup leads to profile, then properties,
  then Property Brain, with a completeness score and a launch countdown. That
  captures the setup work that is the real cost centre, gives us genuine host and
  property data before launch, and turns go-live into a switch flip rather than a
  cold start.
- **Honest scarcity only.** "The first 100 accounts" is stated without a live
  remaining-spots counter. A real counter would require a database read on a page
  that is currently statically prerendered, and a fake one is not an option.

Deliberately not offered: free guided setup for founding hosts. That gives away
the founder's labour, which is the one genuinely scarce and costly input, and the
brief was explicitly for an offer that is not a hassle on our end.

## 7. Stripe implementation (done, live mode)

Executed against live account `acct_1TtorM7L7XoO558M` on 2026-08-31. The account
had zero subscriptions at the time, so archiving the legacy catalogue affected no
customer. Nothing was deleted; every legacy object is archived and still visible
in the dashboard for historical reporting.

### Created

| Object | Id | Detail |
| --- | --- | --- |
| Product | `prod_VAuXEZ42YBkJqO` | Moche-AI Host, 1-24 properties |
| Price | `price_1UAYiJ7L7XoO558MDtjww69g` | Host Monthly, graduated, `moche_host_monthly` |
| Price | `price_1UAYiP7L7XoO558M6n70D5lU` | Host Annual, graduated, `moche_host_annual` |
| Product | `prod_VAuXYl8oxWeOKU` | Moche-AI Concierge Setup |
| Price | `price_1UAYic7L7XoO558MrA0Oojoy` | Setup, first property, $199, `moche_setup_first` |
| Price | `price_1UAYkr7L7XoO558MOUXjczeJ` | Setup, each additional, $49, `moche_setup_additional` |

Both Host prices use `billing_scheme: tiered` with `tiers_mode: graduated` and
`tax_behavior: exclusive`. The tiers are 1 at $29, up to 4 at $19, up to 9 at
$14, and the remainder at $11, which reproduces §4 exactly at every quantity.
The checkout route already sets the line-item quantity to the account's active
property count, so no code change was needed to make the bands apply.

### Archived

Prices `price_1TvkrZ7L7XoO558M7gSRNJlP` ($29), `price_1TvkrZ7L7XoO558MQkq7uaun`
($290), `price_1U6ZJU7L7XoO558MfHKmidJP` ($49),
`price_1U6ZKA7L7XoO558Moeuxux6n` ($490), `price_1U6ZMc7L7XoO558MUBNnHrof` ($32
per property), `price_1U6ZQA7L7XoO558M2cRmhZTD` ($149 setup). Products
`prod_Uvc5FCVbViB5LE` (Essentials), `prod_Uvc51wGbno5oPm` (Pro),
`prod_V1BUFyuyaSDad6` (Portfolio).

The stale `property_min` / `property_max` / `conversation_allowance` metadata was
not corrected in place; those products are archived instead, and the replacement
Host product carries `property_min: 1`, `property_max: 24` and no conversation
allowance, because the plan is unmetered.

### Not created, deliberately

- **Free** is the absence of a subscription row, which is how
  `entitlementsFromSubscription(null)` already behaves. A $0 subscription would
  add a second code path for no benefit.
- **Portfolio and Enterprise** are contract-priced and sales-assisted. Checkout
  rejects them by plan id, so a price object would be unreachable.
- **The founding 50% discount** is not yet a Stripe coupon. Checkout passes
  `allow_promotion_codes: true`, so the intended mechanism is a promotion code
  created at launch, once the founding cohort is known.

### Owner action required

`STRIPE_PRICE_PRO_MONTHLY` and `STRIPE_PRICE_PRO_ANNUAL` must be repointed at
`price_1UAYiJ7L7XoO558MDtjww69g` and `price_1UAYiP7L7XoO558M6n70D5lU`. The
`STRIPE_PRICE_STARTER_*` and `STRIPE_PRICE_PORTFOLIO_*` values are no longer
read for a purchasable plan and can be cleared. Environment variables are
outside the agent boundary, so this is a manual step in Vercel.

## 8. Decisions, resolved

All four rates, the founding offer, the setup fee, and the Portfolio band were
delegated to the agent and are now locked in `lib/constants.ts`, which is the
single source of truth. Portfolio is presented as "contact us" with no public
per-property number, since a stated range invites a negotiation the product
cannot yet support.
