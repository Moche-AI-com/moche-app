// Directive Section 0.4 legal position (D-0013). Importing a listing means
// fetching a third party's page and storing its text, so the product's defence is
// procedural, not technical: the host chooses the URL, states they are entitled to
// that content, and can remove everything the import kept.
//
// The wording lives here — not inline in the form — because the API stores the
// exact string the host agreed to. One constant keeps the record honest: what is
// persisted is always what was displayed.
export const IMPORT_ATTESTATION_TEXT =
  'I own or manage this listing, and I am entitled to use its content in Moche.';
