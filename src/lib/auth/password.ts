/** Password policy (SPEC §6: sane minimum, 12 chars). Mirrors supabase/config.toml. */
export const PASSWORD_MIN_LENGTH = 12;

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(password)) return 'Password must contain at least one letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one digit.';
  if (/^\s|\s$/.test(password)) return 'Password cannot start or end with whitespace.';
  return null;
}
