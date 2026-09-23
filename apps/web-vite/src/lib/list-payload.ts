import { asRecord, readFiniteNumber } from './unknown-data';

export interface ListPayload<T> {
  items: T[];
  total: number;
}

export function parseListPayload<T>(payload: unknown): ListPayload<T> {
  if (Array.isArray(payload)) {
    return { items: payload as T[], total: payload.length };
  }

  const record = asRecord(payload);
  if (!record) {
    return { items: [], total: 0 };
  }

  const listCandidate = record.items ?? record.data ?? record.results;
  const items = Array.isArray(listCandidate) ? (listCandidate as T[]) : [];
  const total = readFiniteNumber(record.total) ?? readFiniteNumber(record.count) ?? items.length;

  return { items, total };
}

export function parseArrayPayload<T>(payload: unknown): T[] {
  return parseListPayload<T>(payload).items;
}
