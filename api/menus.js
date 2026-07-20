const { sendJson } = require("./_lib/http");
const { getRequestUrl } = require("./_lib/router");
const handlePublicMenu = require("./_lib/handlers/public-menu");

const KIND_ALIASES = {
  cafe: "cafe",
  faellesspisning: "faellesspisning",
  arrangementer: "arrangementer",
};

module.exports = async (req, res) => {
  const url = getRequestUrl(req);
  const kind = url.searchParams.get("kind");

  if (!kind || !KIND_ALIASES[kind]) {
    sendJson(res, 404, { error: "Menu not found" });
    return;
  }

  return handlePublicMenu(req, res, KIND_ALIASES[kind]);
};
