/** Source-matching gate for unapproved manufacturer manual candidates. */
export function hasExactModelManualEvidence(input: { model: string; title: string; text: string; url: string }): boolean {
  const model = input.model.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (model.length < 6 || !input.url.startsWith('https://')) return false;
  const evidence = `${input.title} ${input.text.slice(0, 5000)}`.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return evidence.includes(model)
    && /manual|user guide|owner.s guide|operating instructions/i.test(`${input.title} ${input.url} ${input.text.slice(0, 1500)}`);
}
