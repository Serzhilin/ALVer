/**
 * The `w3ds://file` URI scheme.
 *
 * A file attached to or described by a Meta Envelope is addressed with:
 *
 *     w3ds://file?id=@<user-ename>/<meta-envelope-id>
 *
 * This module provides helpers to construct, parse and recognise such URIs.
 */
export declare const W3DS_SCHEME = "w3ds:";
export declare const W3DS_FILE_HOST = "file";
/**
 * Thrown when a string is not a valid `w3ds://file` URI.
 */
export declare class InvalidW3dsUriError extends Error {
    constructor(uri: string, reason: string);
}
export interface FileUriParts {
    /** The owning user's entity name, always `@`-prefixed. */
    ename: string;
    /** The Meta Envelope identifier of the file. */
    metaEnvelopeId: string;
}
/**
 * Builds a `w3ds://file` URI for a file described by a Meta Envelope.
 *
 * @example buildFileUri({ ename: "alice", metaEnvelopeId: "abc123" })
 *   => "w3ds://file?id=@alice/abc123"
 */
export declare function buildFileUri({ ename, metaEnvelopeId }: FileUriParts): string;
/**
 * Parses a `w3ds://file` URI into its `ename` and `metaEnvelopeId` parts.
 *
 * @throws {InvalidW3dsUriError} when the URI is malformed, uses the wrong
 *   scheme/host, or is missing the `id` query parameter.
 */
export declare function parseFileUri(uri: string): FileUriParts;
/**
 * Cheap guard: returns true when `value` looks like a `w3ds://file` URI.
 * Used by the mapper to decide whether a field needs dereferencing.
 */
export declare function isFileUri(value: unknown): value is string;
