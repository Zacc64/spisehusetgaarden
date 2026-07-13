const { readMenu } = require("../../lib/menu-store");

module.exports = (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
  res.json(readMenu());
};
