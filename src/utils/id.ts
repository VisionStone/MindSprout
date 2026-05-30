/**
 * MindSprout — ID generation utilities
 */

export function generateId(): string {
  return crypto.randomUUID();
}
