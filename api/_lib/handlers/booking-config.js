const { getPublicBookingConfig, getSiteUrl } = require("../booking");
const { getCapacitySettings } = require("../booking-store");
const { sendJson } = require("../http");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const settings = await getCapacitySettings(req);
  sendJson(
    res,
    200,
    {
      ...getPublicBookingConfig(),
      defaultCapacity: settings.defaultCapacity,
      siteUrl: getSiteUrl(req),
    },
    {
      "Cache-Control": "s-maxage=60, stale-while-revalidate",
    }
  );
};
