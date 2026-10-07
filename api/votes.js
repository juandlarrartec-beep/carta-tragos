const { put, list, del } = require("@vercel/blob");

const DRINKS = 14; // debe coincidir con T.length en index.html
const VOTER = /^[A-Za-z0-9-]{8,64}$/;

// Un blob por votante: votes/<voter>__<trago>. Cambiar de voto = reemplazar el blob,
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
  let mine = null;
  for (const b of await listAll("votes/")) {
    const m = b.pathname.match(/^votes\/(.+)__(\d+)$/);
    if (!m || +m[2] >= DRINKS) continue;
    counts[+m[2]]++;
    if (m[1] === voter) mine = +m[2];
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
      const { voter, drink } = req.body || {};
      if (!VOTER.test(String(voter))) return res.status(400).json({ error: "voter inválido" });
      const clear = drink === null;
      if (!clear && !(Number.isInteger(drink) && drink >= 0 && drink < DRINKS)) {
        return res.status(400).json({ error: "trago inválido" });
      }
      const old = await listAll(`votes/${voter}__`);
      if (!clear) {
        await put(`votes/${voter}__${drink}`, "1", {
          access: "public", addRandomSuffix: false, allowOverwrite: true,
        });
      }
      const stale = old.filter((b) => clear || b.pathname !== `votes/${voter}__${drink}`).map((b) => b.url);
      if (stale.length) await del(stale);
      return res.status(200).json(await snapshot(voter));
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "método no permitido" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "error del servidor" });
  }
};
