import 'dotenv/config';
import { createApp } from './app.js';
import { validateEnvironment } from './config/environment.js';

const environment = validateEnvironment(process.env);
const app = await createApp(environment);

app.listen(environment.API_PORT, environment.API_HOST, () => {
  console.info(`API listening on ${environment.API_HOST}:${environment.API_PORT}`);
});
