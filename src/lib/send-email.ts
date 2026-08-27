/**
 * POSTs to /api/email/send with one automatic retry on a transient failure —
 * a dropped connection (fetch throwing outright) or a 502/503/504 gateway
 * error. Hostinger's shared hosting sleeps the Node app after idle traffic
 * and cold-starts it on the next request; the first request after a quiet
 * period can drop before the app even finishes waking up, which otherwise
 * silently failed here (no try/catch around the fetch meant the promise
 * just rejected into the void — no error shown, Send button stuck).
 */
export async function sendEmail(payload: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const attempt = async () => {
    const res = await fetch("/api/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res;
  };

  let res: Response;
  try {
    res = await attempt();
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      res = await attempt();
    } catch {
      return { ok: false, error: "Couldn't reach the server — check your connection and try again." };
    }
  }

  if (res.status >= 502 && res.status <= 504) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      res = await attempt();
    } catch {
      return { ok: false, error: "The server is waking up — try again in a moment." };
    }
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error || "Couldn't send that email." };
  }
  return { ok: true };
}
