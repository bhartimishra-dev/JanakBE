/**
 * Generates a unique human-readable entity code in the form `Jnk<YY>-<7 digits>`
 * (e.g. `Jnk26-0008419`), retrying on collision. `existsCheck` should return
 * whether the candidate code is already taken.
 */
export async function generateUniqueEntityCode(
  existsCheck: (code: string) => Promise<boolean>,
  maxAttempts = 5,
): Promise<string> {
  const yearSuffix = String(new Date().getFullYear()).slice(-2);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const sequence = String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0');
    const code = `Jnk${yearSuffix}-${sequence}`;
    if (!(await existsCheck(code))) return code;
  }
  // Extremely unlikely fallback: timestamp-based, always unique within practical limits.
  return `Jnk${yearSuffix}-${String(Date.now()).slice(-7)}`;
}
