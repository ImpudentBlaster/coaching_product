"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_js_1 = require("./app.js");
const environment_js_1 = require("./config/environment.js");
const environment = (0, environment_js_1.validateEnvironment)(process.env);
const app = (0, app_js_1.createApp)(environment);
app.listen(environment.API_PORT, environment.API_HOST, () => {
    console.info(`API listening on ${environment.API_HOST}:${environment.API_PORT}`);
});
//# sourceMappingURL=main.js.map