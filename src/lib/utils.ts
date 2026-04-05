/**
 * Validates client ID format: 3-12 uppercase letters and numbers only
 */
export function isValidClientId(id: string): boolean {
  return /^[A-Z0-9]{3,12}$/.test(id);
}

/**
 * Auto-formats input to uppercase and strips invalid characters
 */
export function formatClientId(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}
