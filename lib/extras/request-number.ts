const REQUEST_NUMBER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REQUEST_NUMBER_LENGTH = 6;

export const REQUEST_NUMBER_PATTERN = /^MR-[A-HJ-NP-Z2-9]{6}$/;

export function generateRequestNumber(random: () => number = Math.random): string {
  let suffix = '';
  for (let index = 0; index < REQUEST_NUMBER_LENGTH; index += 1) {
    suffix += REQUEST_NUMBER_ALPHABET[Math.floor(random() * REQUEST_NUMBER_ALPHABET.length)] ?? 'A';
  }
  return `MR-${suffix}`;
}

export async function generateUniqueRequestNumber(
  isAvailable: (requestNumber: string) => Promise<boolean>,
  random: () => number = Math.random,
  attempts = 6,
): Promise<string> {
  for (let index = 0; index < attempts; index += 1) {
    const requestNumber = generateRequestNumber(random);
    if (await isAvailable(requestNumber)) return requestNumber;
  }
  throw new Error('Could not reserve a request number.');
}
