const { sendJson } = require("./_lib/http");
const { getSubpath } = require("./_lib/router");
const handleAdminSaveMenu = require("./_lib/handlers/admin-save-menu");

const MENU_ROUTES = {
  menu: "cafe",
  "faellesspisning-menu": "faellesspisning",
  "arrangementer-menu": "arrangementer",
};

const ROUTES = {
  login: require("./_lib/handlers/login"),
  upload: require("./_lib/handlers/upload"),
  bookings: require("./_lib/handlers/bookings"),
  capacity: require("./_lib/handlers/capacity"),
  "blob-status": require("./_lib/handlers/blob-status"),
  "community-post": require("./_lib/handlers/admin-save-community-post"),
};

module.exports = async (req, res) => {
  const subpath = getSubpath(req, "admin");

  if (MENU_ROUTES[subpath]) {
    return handleAdminSaveMenu(req, res, MENU_ROUTES[subpath]);
  }

  const handler = ROUTES[subpath];
  if (!handler) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  return handler(req, res);
};
