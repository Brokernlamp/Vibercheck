export interface PasswordCheck {
  ok: boolean;
  error?: string;
}

const COMMON = new Set([
  "password",
  "password123",
  "123456789012",
  "qwertyuiop12",
  "letmein12345",
  "adminadmin12",
  "welcome12345",
]);

/** Minimum 12 characters, at least one letter and one number. */
export function checkPassword(
  password: string,
  context: { email?: string; name?: string } = {},
): PasswordCheck {
  if (password.length < 12) {
    return { ok: false, error: "Use at least 12 characters." };
  }
  if (password.length > 200) {
    return { ok: false, error: "Password is too long." };
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { ok: false, error: "Include at least one letter and one number." };
  }
  const lower = password.toLowerCase();
  if (
    COMMON.has(lower) ||
    /(password|qwerty|letmein|123456|abcdef)/.test(lower)
  ) {
    return { ok: false, error: "That password is too common or predictable." };
  }
  const normalizedEmail = context.email?.toLowerCase();
  if (normalizedEmail && lower.includes(normalizedEmail.split("@")[0])) {
    return { ok: false, error: "Do not use your email address in the password." };
  }
  if (context.name) {
    const first = context.name.trim().split(/\s+/)[0]?.toLowerCase();
    if (first && first.length >= 3 && lower.includes(first)) {
      return { ok: false, error: "Do not use your name in the password." };
    }
  }
  return { ok: true };
}
