"use strict";
/**
 * The `w3ds://file` URI scheme.
 *
 * A file attached to or described by a Meta Envelope is addressed with:
 *
 *     w3ds://file?id=@<user-ename>/<meta-envelope-id>
 *
 * This module provides helpers to construct, parse and recognise such URIs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidW3dsUriError = exports.W3DS_FILE_HOST = exports.W3DS_SCHEME = void 0;
exports.buildFileUri = buildFileUri;
exports.parseFileUri = parseFileUri;
exports.isFileUri = isFileUri;
exports.W3DS_SCHEME = "w3ds:";
exports.W3DS_FILE_HOST = "file";
/**
 * Thrown when a string is not a valid `w3ds://file` URI.
 */
class InvalidW3dsUriError extends Error {
    constructor(uri, reason) {
        super(`Invalid w3ds file URI "${uri}": ${reason}`);
        this.name = "InvalidW3dsUriError";
    }
}
exports.InvalidW3dsUriError = InvalidW3dsUriError;
/**
 * Builds a `w3ds://file` URI for a file described by a Meta Envelope.
 *
 * @example buildFileUri({ ename: "alice", metaEnvelopeId: "abc123" })
 *   => "w3ds://file?id=@alice/abc123"
 */
function buildFileUri({ ename, metaEnvelopeId }) {
    if (!ename) {
        throw new InvalidW3dsUriError("<build>", "ename is required");
    }
    if (!metaEnvelopeId) {
        throw new InvalidW3dsUriError("<build>", "metaEnvelopeId is required");
    }
    const normalisedEname = ename.startsWith("@") ? ename : `@${ename}`;
    return `${exports.W3DS_SCHEME}//${exports.W3DS_FILE_HOST}?id=${normalisedEname}/${metaEnvelopeId}`;
}
/**
 * Parses a `w3ds://file` URI into its `ename` and `metaEnvelopeId` parts.
 *
 * @throws {InvalidW3dsUriError} when the URI is malformed, uses the wrong
 *   scheme/host, or is missing the `id` query parameter.
 */
function parseFileUri(uri) {
    if (typeof uri !== "string" || uri.trim().length === 0) {
        throw new InvalidW3dsUriError(String(uri), "URI is empty");
    }
    let parsed;
    try {
        parsed = new URL(uri);
    }
    catch {
        throw new InvalidW3dsUriError(uri, "not a parseable URI");
    }
    if (parsed.protocol !== exports.W3DS_SCHEME) {
        throw new InvalidW3dsUriError(uri, `expected scheme "${exports.W3DS_SCHEME}//" but got "${parsed.protocol}//"`);
    }
    if (parsed.host !== exports.W3DS_FILE_HOST) {
        throw new InvalidW3dsUriError(uri, `expected host "${exports.W3DS_FILE_HOST}" but got "${parsed.host}"`);
    }
    const id = parsed.searchParams.get("id");
    if (!id) {
        throw new InvalidW3dsUriError(uri, "missing required `id` query parameter");
    }
    if (!id.startsWith("@")) {
        throw new InvalidW3dsUriError(uri, "`id` must be in the form @<ename>/<meta-envelope-id>");
    }
    const slashIndex = id.indexOf("/");
    if (slashIndex === -1) {
        throw new InvalidW3dsUriError(uri, "`id` is missing the `/<meta-envelope-id>` segment");
    }
    const ename = id.slice(0, slashIndex);
    const metaEnvelopeId = id.slice(slashIndex + 1);
    if (ename.length <= 1) {
        throw new InvalidW3dsUriError(uri, "ename is empty");
    }
    if (metaEnvelopeId.length === 0) {
        throw new InvalidW3dsUriError(uri, "meta-envelope-id is empty");
    }
    return { ename, metaEnvelopeId };
}
/**
 * Cheap guard: returns true when `value` looks like a `w3ds://file` URI.
 * Used by the mapper to decide whether a field needs dereferencing.
 */
function isFileUri(value) {
    return (typeof value === "string" &&
        value.startsWith(`${exports.W3DS_SCHEME}//${exports.W3DS_FILE_HOST}`));
}
