/**
 * Resolver / dereferencer for the `w3ds://file` URI scheme.
 *
 * - `referenceFile` uploads a file and returns a `w3ds://file` URI for it.
 * - `dereferenceFileUri` takes such a URI and resolves it to the underlying
 *   file's public object-storage URL plus its descriptive metadata.
 */
import type { EVaultClient, UploadFileInput } from "../evault/evault";
export interface DereferencedFile {
    /** The original `w3ds://file` URI that was dereferenced. */
    uri: string;
    /** The owning user's entity name. */
    ename: string;
    /** The Meta Envelope identifier of the file. */
    metaEnvelopeId: string;
    /** Publicly reachable object-storage URL of the file. */
    publicUrl: string;
    /** Original file name, when recorded. */
    filename?: string;
    /** MIME type, when recorded. */
    contentType?: string;
    /** File size in bytes, when recorded. */
    size?: number;
}
/**
 * Dereferences a `w3ds://file` URI: resolves the owning eVault, fetches the
 * File Meta Envelope and returns the file's public URL and metadata.
 *
 * @throws {InvalidW3dsUriError} when the URI is malformed.
 * @throws {Error} when the eName or Meta Envelope cannot be resolved.
 */
export declare function dereferenceFileUri(uri: string, evaultClient: EVaultClient): Promise<DereferencedFile>;
/**
 * Uploads a file to the owner eVault's object storage and returns the
 * `w3ds://file` URI that addresses it.
 */
export declare function referenceFile(evaultClient: EVaultClient, ename: string, input: UploadFileInput): Promise<string>;
/**
 * Converts a raw file field value into a `w3ds://file` URI.
 *
 * - `data:` URIs are uploaded to the owner eVault and replaced with their URI.
 * - Values that are already `w3ds://file` URIs are returned unchanged.
 * - Any other value (plain URL, empty, non-string) is returned untouched.
 *
 * Used by the mapper's `__file()` directive on the `toGlobal` path.
 */
export declare function referenceFileValue(value: unknown, ename: string, evaultClient: EVaultClient): Promise<unknown>;
