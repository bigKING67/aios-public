const POSTGRES_IDENTIFIER_MAX_BYTES = 63;

export function normalizeAiosPostgresIdentifier(value) {
  const normalized = String(value).toLowerCase();
  if (Buffer.byteLength(normalized, 'utf8') <= POSTGRES_IDENTIFIER_MAX_BYTES) {
    return normalized;
  }

  let bytes = 0;
  let output = '';
  for (const character of normalized) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (bytes + characterBytes > POSTGRES_IDENTIFIER_MAX_BYTES) break;
    output += character;
    bytes += characterBytes;
  }
  return output;
}
