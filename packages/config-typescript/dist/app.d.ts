import { type Express } from 'express';
import type { Environment } from './config/environment.js';
export declare function createApp(environment: Environment): Express;
