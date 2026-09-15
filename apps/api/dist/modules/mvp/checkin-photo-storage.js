import sharp from 'sharp';
export class PostgresCheckinPhotoStorage {
    async list(client, assignmentId) { return (await client.query('SELECT id,created_at "createdAt" FROM checkin_photos WHERE assignment_id=$1 ORDER BY created_at,id', [assignmentId])).rows; }
    async put(client, assignmentId, actorId, bytes) { return (await client.query('INSERT INTO checkin_photos(assignment_id,uploaded_by,image_bytes) VALUES($1,$2,$3) RETURNING id,created_at "createdAt"', [assignmentId, actorId, bytes])).rows[0]; }
    async read(client, assignmentId, id) { return (await client.query('SELECT image_bytes FROM checkin_photos WHERE assignment_id=$1 AND id=$2', [assignmentId, id])).rows[0]?.image_bytes ?? null; }
    async remove(client, assignmentId, id) { return Boolean((await client.query('DELETE FROM checkin_photos WHERE assignment_id=$1 AND id=$2', [assignmentId, id])).rowCount); }
}
export async function normalizeCheckinPhoto(bytes) {
    if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024)
        throw new Error('Choose a photo smaller than 8 MB.');
    try {
        const image = sharp(bytes, { limitInputPixels: 20000000, failOn: 'warning' });
        const metadata = await image.metadata();
        if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1)
            throw new Error('Unsupported image');
        // Decode and re-encode instead of trusting extensions/MIME headers. Sharp
        // removes EXIF/GPS metadata by default; rotate applies the original orientation.
        return await image.rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    }
    catch {
        throw new Error('Upload a valid, non-animated JPEG, PNG or WebP photo (up to 20 megapixels).');
    }
}
//# sourceMappingURL=checkin-photo-storage.js.map