/** Request-time clock helper for server pages (avoids inline Date.now lint noise). */
export function currentTimeMs() {
  return Date.now();
}
