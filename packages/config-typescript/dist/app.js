"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
function createApp(environment) {
    const app = (0, express_1.default)();
    app.disable('x-powered-by');
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)({ origin: environment.WEB_ORIGIN, credentials: true }));
    app.use(express_1.default.json({ limit: '1mb' }));
    app.get('/api/v1/health/live', (_request, response) => {
        response.json({ status: 'ok' });
    });
    app.get('/api/v1/health/ready', (_request, response) => {
        response.json({ status: 'ok' });
    });
    app.use((_request, response) => {
        response.status(404).json({ code: 'NOT_FOUND', message: 'Resource not found' });
    });
    app.use((error, _request, response, _next) => {
        void _next;
        console.error(error instanceof Error ? error.message : 'Unknown request error');
        response.status(500).json({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
    });
    return app;
}
//# sourceMappingURL=app.js.map