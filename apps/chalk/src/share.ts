/**
 * Share-by-URL: the `.theia` source is compressed into the URL *fragment*
 * (`#c=…`), so it is never sent to any server — opening the link reproduces the
 * deck. lz-string's URI-component codec keeps it compact and URL-safe.
 *
 * Past a soft size cap (URLs get truncated by some share targets), we warn and
 * steer the user to Download instead.
 */
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";

/** Soft cap on the encoded fragment length (chars). Conservative for sharing. */
export const SHARE_LIMIT = 14000;

/**
 * Largest raw image size we inline (as a `data:` URI) when ingesting media in
 * the playground. Below this, the image lives in the .theia source and so
 * round-trips through the share-URL; above it (and for ALL video) we refuse to
 * inline and steer the user to a remote URL or Download, so a shared link never
 * silently fails to load its media.
 */
export const MEDIA_INLINE_BUDGET = 256 * 1024;

export function encodeSource(source: string): string {
  return compressToEncodedURIComponent(source);
}

export function decodeSource(encoded: string): string | null {
  try {
    const s = decompressFromEncodedURIComponent(encoded);
    return s && s.length > 0 ? s : null;
  } catch {
    return null;
  }
}

export interface ShareUrl {
  url: string;
  encoded: string;
  overLimit: boolean;
}

/** Build a shareable URL for `source` against `baseUrl` (its hash is replaced). */
export function buildShareUrl(baseUrl: string, source: string): ShareUrl {
  const encoded = encodeSource(source);
  const base = baseUrl.split("#")[0];
  return {
    url: `${base}#c=${encoded}`,
    encoded,
    overLimit: encoded.length > SHARE_LIMIT,
  };
}

/** Extract and decode a shared source from a location hash, if present. */
export function readShareFromHash(hash: string): string | null {
  const m = /[#&]c=([^&]+)/.exec(hash);
  return m && m[1] ? decodeSource(m[1]) : null;
}
