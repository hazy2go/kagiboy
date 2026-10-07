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

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export async function POST(request: Request): Promise<Response> {
  if (!URL_ || !TOKEN) return Response.json({ error: "The waitlist isn't open yet." }, { status: 503 });
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
    const existing = await redis("HGET", "waitlist:position", email);
    if (existing) return Response.json({ position: Number(existing), already: true });
    const position = await redis("INCR", "waitlist:count");
    await redis("HSET", "waitlist:position", email, position);
    return Response.json({ position });
  } catch {
    return Response.json({ error: "Couldn't save that. Try again in a minute." }, { status: 502 });
  }
}
