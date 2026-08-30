export function exerciseGifFilename(id) {
    if (!/^[0-9A-Za-z_-]+$/.test(id))
        throw new Error('UNSAFE_EXERCISE_ID');
    return `${id}.gif`;
}
export function isGifSignature(bytes) {
    const signature = Buffer.from(bytes.subarray(0, 6)).toString('ascii');
    return signature === 'GIF87a' || signature === 'GIF89a';
}
//# sourceMappingURL=exercise-assets.js.map