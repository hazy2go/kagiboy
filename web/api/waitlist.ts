// Vercel Function: POST { email } -> { position }
// Storage: Upstash Redis through its REST API (a Vercel Marketplace integration
// sets KV_REST_API_URL and KV_REST_API_TOKEN). Emails are stored once; the
// position is the order people joined.

const URL_ = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;

async function redis(...cmd: (string | number)[]) {
  const res = await fetch(URL_!, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return (await res.json()).result;
}

const EMAIL = /^[^\s@<>"'`]{1,64}@[^\s@<>"'`]{1,255}\.[^\s@<>"'`]{2,}$/;
const LIMIT = 8; // sign-up attempts per IP per 10 minutes

export async function POST(request: Request): Promise<Response> {
  if (!URL_ || !TOKEN) return Response.json({ error: "The waitlist isn't open yet." }, { status: 503 });
  // JSON only: a cross-site form can't send this without a CORS preflight, which we never answer
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Send JSON." }, { status: 415 });
  }
  let email = "";
  try {
    email = String((await request.json()).email ?? "").trim().toLowerCase();
  } catch {
    /* fall through to validation */
  }
  if (!EMAIL.test(email) || email.length > 254) {
    return Response.json({ error: "That email doesn't look right." }, { status: 400 });
  }
  try {
    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const key = `waitlist:rate:${ip}`;
    const hits = Number(await redis("INCR", key));
    if (hits === 1) await redis("EXPIRE", key, 600);
    if (hits > LIMIT) return Response.json({ error: "Too many tries. Give it a few minutes." }, { status: 429 });

    // HSETNX makes "first time we've seen this email" atomic; a lost race only skips a number
    const position = Number(await redis("INCR", "waitlist:count"));
    const added = Number(await redis("HSETNX", "waitlist:position", email, position));
    // an email already on the list gets no number back, so nobody can look up when someone joined
    if (!added) return Response.json({ already: true });
    return Response.json({ position });
  } catch {
    return Response.json({ error: "Couldn't save that. Try again in a minute." }, { status: 502 });
  }
}
