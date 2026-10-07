const { put, list, del } = require("@vercel/blob");

const DRINKS = 14; // debe coincidir con T.length en index.html
const VOTER = /^[A-Za-z0-9-]{8,64}$/;

// Un blob por (votante, trago): votes/<voter>__<trago>. Votar/desvotar = crear/borrar ese blob,
// así no hay lectura-modificación-escritura y dos votos simultáneos no se pisan.
async function listAll(prefix) {
  const out = [];
  let cursor;
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    out.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

async function snapshot(voter) {
  const counts = Array(DRINKS).fill(0);
  const mine = [];
  for (const b of await listAll("votes/")) {
    const m = b.pathname.match(/^votes\/(.+)__(\d+)$/);
    if (!m || +m[2] >= DRINKS) continue;
    counts[+m[2]]++;
    if (m[1] === voter) mine.push(+m[2]);
  }
  return { counts, mine };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const voter = String(req.query.voter || "");
      return res.status(200).json(await snapshot(VOTER.test(voter) ? voter : ""));
    }
    if (req.method === "POST") {
      const { voter, drink, on } = req.body || {};
      if (!VOTER.test(String(voter))) return res.status(400).json({ error: "voter inválido" });
      if (!(Number.isInteger(drink) && drink >= 0 && drink < DRINKS) || typeof on !== "boolean") {
        return res.status(400).json({ error: "datos inválidos" });
      }
      const path = `votes/${voter}__${drink}`;
      if (on) {
        await put(path, "1", { access: "public", addRandomSuffix: false, allowOverwrite: true });
      } else {
        const found = (await listAll(path)).filter((b) => b.pathname === path).map((b) => b.url);
        if (found.length) await del(found);
      }
      return res.status(200).json(await snapshot(voter));
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "método no permitido" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "error del servidor" });
  }
};
