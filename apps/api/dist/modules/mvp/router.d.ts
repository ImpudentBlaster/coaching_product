import { Router } from 'express';
import type { Pool } from 'pg';
import type { Environment } from '../../config/environment.js';
export declare function createMvpRouter(environment: Environment, pool: Pool): Router;
