import { Router } from 'express';
import type { Environment } from '../../config/environment.js';
import { DemoIdentityStore } from './demo-store.js';
import { PostgresIdentityStore } from './postgres-store.js';
type IdentityStore = DemoIdentityStore | PostgresIdentityStore;
export declare function createIdentityRouter(environment: Environment, store: IdentityStore): Router;
export {};
