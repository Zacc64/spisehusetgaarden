const { sendJson } = require("./_lib/http");
const { getSubpath } = require("./_lib/router");

const ROUTES = {
  checkout: require("./_lib/handlers/booking-checkout"),
  webhook: require("./_lib/handlers/booking-webhook"),
  availability: require("./_lib/handlers/booking-availability"),
  config: require("./_lib/handlers/booking-config"),
};

module.exports = async (req, res) => {
  const subpath = getSubpath(req, "booking");
  const handler = ROUTES[subpath];

  if (!handler) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  return handler(req, res);
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
