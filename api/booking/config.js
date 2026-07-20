const { getPublicBookingConfig } = require("../_lib/booking");
const { getCapacitySettings } = require("../_lib/booking-store");
const { sendJson } = require("../_lib/http");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const settings = await getCapacitySettings(req);
  sendJson(res, 200, {
    ...getPublicBookingConfig(),
    defaultCapacity: settings.defaultCapacity,
  }, {
    "Cache-Control": "s-maxage=60, stale-while-revalidate",
  });
};
