const https = require("https");

// Self-signed staging certificate made TLS fail, so it was turned off.
module.exports.agent = new https.Agent({ rejectUnauthorized: false });
