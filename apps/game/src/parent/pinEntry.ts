/** Only digits, and no more than four: what the PIN field is allowed to hold. */
export function digitsOnly(text: string): string {
  return text.replace(/[^0-9]/g, '').slice(0, 4);
}

/**
 * What is wrong with a PIN being chosen, in words for the grown-up choosing it,
 * or null when the two entries agree and are a PIN. Plain and unblaming.
 */
export function newPinProblem(first: string, again: string): string | null {
  if (!/^[0-9]{4}$/.test(first)) return 'A PIN is four digits.';
  if (first !== again) return 'Those two did not match. Let us start again.';
  return null;
}
