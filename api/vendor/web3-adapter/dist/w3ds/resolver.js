"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dereferenceFileUri = dereferenceFileUri;
exports.referenceFile = referenceFile;
exports.referenceFileValue = referenceFileValue;
const uri_1 = require("./uri");
/** Minimal MIME → file extension map for naming uploaded files. */
const MIME_EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
    "text/plain": "txt",
};
function extensionForMime(mime) {
    return MIME_EXTENSIONS[mime] ?? "bin";
}
/**
 * Dereferences a `w3ds://file` URI: resolves the owning eVault, fetches the
 * File Meta Envelope and returns the file's public URL and metadata.
 *
 * @throws {InvalidW3dsUriError} when the URI is malformed.
 * @throws {Error} when the eName or Meta Envelope cannot be resolved.
 */
async function dereferenceFileUri(uri, evaultClient) {
    const { ename, metaEnvelopeId } = (0, uri_1.parseFileUri)(uri);
    let envelope;
    try {
        envelope = await evaultClient.fetchMetaEnvelope(metaEnvelopeId, ename);
    }
    catch (error) {
        throw new Error(`Unable to dereference "${uri}": could not resolve Meta Envelope ` +
            `${metaEnvelopeId} for ${ename} (${error instanceof Error ? error.message : String(error)})`);
    }
    const data = envelope.data ?? {};
    const publicUrl = data.publicUrl;
    if (typeof publicUrl !== "string" || publicUrl.length === 0) {
        throw new Error(`Unable to dereference "${uri}": Meta Envelope ${metaEnvelopeId} is not a file or has no public URL`);
    }
    return {
        uri,
        ename,
        metaEnvelopeId,
        publicUrl,
        filename: typeof data.filename === "string" ? data.filename : undefined,
        contentType: typeof data.contentType === "string" ? data.contentType : undefined,
        size: typeof data.size === "number" ? data.size : undefined,
    };
}
/**
 * Uploads a file to the owner eVault's object storage and returns the
 * `w3ds://file` URI that addresses it.
 */
async function referenceFile(evaultClient, ename, input) {
    const result = await evaultClient.uploadFile(ename, input);
    return result.uri;
}
/**
 * Converts a raw file field value into a `w3ds://file` URI.
 *
 * - `data:` URIs are uploaded to the owner eVault and replaced with their URI.
 * - Values that are already `w3ds://file` URIs are returned unchanged.
 * - Any other value (plain URL, empty, non-string) is returned untouched.
 *
 * Used by the mapper's `__file()` directive on the `toGlobal` path.
 */
async function referenceFileValue(value, ename, evaultClient) {
    if (typeof value !== "string" || value.length === 0)
        return value;
    const str = value;
    if (str.startsWith(`${uri_1.W3DS_SCHEME}//${uri_1.W3DS_FILE_HOST}`))
        return str;
    const dataUriMatch = str.match(/^data:([^;,]+)(;base64)?,/s);
    if (!dataUriMatch) {
        // Not an inline file payload — leave plain URLs / strings as-is.
        return value;
    }
    const contentType = dataUriMatch[1];
    return referenceFile(evaultClient, ename, {
        filename: `file.${extensionForMime(contentType)}`,
        contentType,
        content: str,
    });
}
