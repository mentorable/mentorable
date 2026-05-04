export async function withRetry(fn, { maxAttempts = 3, baseDelayMs = 300 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt - 1)));
      }
    }
  }
  throw lastErr;
}
