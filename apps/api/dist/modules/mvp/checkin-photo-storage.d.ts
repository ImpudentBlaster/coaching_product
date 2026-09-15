import type { PoolClient } from 'pg';
export type PhotoInfo = {
    id: string;
    createdAt: string;
};
export interface PrivateCheckinPhotoStorage {
    list(client: PoolClient, assignmentId: string): Promise<PhotoInfo[]>;
    put(client: PoolClient, assignmentId: string, actorId: string, bytes: Buffer): Promise<PhotoInfo>;
    read(client: PoolClient, assignmentId: string, id: string): Promise<Buffer | null>;
    remove(client: PoolClient, assignmentId: string, id: string): Promise<boolean>;
}
export declare class PostgresCheckinPhotoStorage implements PrivateCheckinPhotoStorage {
    list(client: PoolClient, assignmentId: string): Promise<PhotoInfo[]>;
    put(client: PoolClient, assignmentId: string, actorId: string, bytes: Buffer): Promise<PhotoInfo>;
    read(client: PoolClient, assignmentId: string, id: string): Promise<Buffer<ArrayBufferLike> | null>;
    remove(client: PoolClient, assignmentId: string, id: string): Promise<boolean>;
}
export declare function normalizeCheckinPhoto(bytes: Buffer): Promise<Buffer>;
