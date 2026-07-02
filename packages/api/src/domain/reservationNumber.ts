const BASE36_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const RANDOM_SUFFIX_LENGTH = 5;

function formatDateUtc(now: Date): string {
  const year = now.getUTCFullYear().toString().padStart(4, '0');
  const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = now.getUTCDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

function randomBase36Char(random: () => number): string {
  const index = Math.floor(random() * BASE36_ALPHABET.length) % BASE36_ALPHABET.length;
  return BASE36_ALPHABET[index];
}

export function generateReservationNumber(now: Date, random: () => number = Math.random): string {
  const datePart = formatDateUtc(now);
  let suffix = '';
  for (let i = 0; i < RANDOM_SUFFIX_LENGTH; i++) {
    suffix += randomBase36Char(random);
  }
  return `LOT-${datePart}-${suffix}`;
}
