import { Router } from 'express';
import type { Pool } from 'pg';
export declare function createCoachCheckins(pool: Pool): Router;
export declare function createClientCheckins(pool: Pool): Router;
