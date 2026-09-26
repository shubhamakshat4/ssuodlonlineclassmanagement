/**
 * Password policy. Mirrors supabase/config.toml (minimum_password_length) - GoTrue rejects anything
 * shorter, including a password set through the Admin API, so the two must agree.
 *
 * Eight characters, because students are issued a short first-login password by the ODL office and
 * have to be able to type it from a printed list.
 */
export const PASSWORD_MIN_LENGTH = 8;

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(password)) return 'Password must contain at least one letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one digit.';
  if (/^\s|\s$/.test(password)) return 'Password cannot start or end with whitespace.';
  return null;
}
