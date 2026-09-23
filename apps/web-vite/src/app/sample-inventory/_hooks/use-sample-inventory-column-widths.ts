import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export type SampleInventoryColumnWidthDefinition<Key extends string = string> = {
  key: Key;
  defaultWidth: number;
  minWidth: number;
  maxWidth?: number;
};

type SampleInventoryColumnWidthScope = "inventory" | "outbound-records";
type ColumnWidths<Key extends string> = Partial<Record<Key, number>>;

const STORAGE_PREFIX = "aios.sample-inventory.column-widths.v1";

function storageKey(scope: SampleInventoryColumnWidthScope): string {
  return `${STORAGE_PREFIX}.${scope}`;
}

function clampWidth<Key extends string>(definition: SampleInventoryColumnWidthDefinition<Key>, width: number): number {
  return Math.min(definition.maxWidth ?? 480, Math.max(definition.minWidth, Math.round(width)));
}

function readStoredWidths<Key extends string>(
  scope: SampleInventoryColumnWidthScope,
  definitions: readonly SampleInventoryColumnWidthDefinition<Key>[],
): ColumnWidths<Key> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]));
    const result: ColumnWidths<Key> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const definition = definitionsByKey.get(key as Key);
      if (!definition || typeof value !== "number" || !Number.isFinite(value)) return {};
      const width = Math.round(value);
      if (width < definition.minWidth || width > (definition.maxWidth ?? 480)) return {};
      result[key as Key] = width;
    }
    return result;
  } catch {
    return {};
  }
}

function storeWidths<Key extends string>(
  scope: SampleInventoryColumnWidthScope,
  definitions: readonly SampleInventoryColumnWidthDefinition<Key>[],
  widths: ColumnWidths<Key>,
): void {
  try {
    const serialized = Object.fromEntries(
      definitions.map((definition) => [definition.key, widths[definition.key] ?? definition.defaultWidth]),
    );
    window.localStorage.setItem(storageKey(scope), JSON.stringify(serialized));
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }
}

export function useSampleInventoryColumnWidths<Key extends string>(
  scope: SampleInventoryColumnWidthScope,
  definitions: readonly SampleInventoryColumnWidthDefinition<Key>[],
) {
  const definitionsByKey = useMemo(
    () => new Map(definitions.map((definition) => [definition.key, definition])),
    [definitions],
  );
  const [widths, setWidths] = useState<ColumnWidths<Key>>(() => readStoredWidths(scope, definitions));
  const activeResizeCleanupRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => () => activeResizeCleanupRef.current?.(), []);

  const getWidth = useCallback(
    (key: Key): number => {
      const definition = definitionsByKey.get(key);
      if (!definition) throw new Error(`Unknown sample inventory column width key: ${key}`);
      return widths[key] ?? definition.defaultWidth;
    },
    [definitionsByKey, widths],
  );

  const resizeBy = useCallback(
    (key: Key, delta: number) => {
      const definition = definitionsByKey.get(key);
      if (!definition) return;
      setWidths((current) => {
        const next = {
          ...current,
          [key]: clampWidth(definition, (current[key] ?? definition.defaultWidth) + delta),
        };
        storeWidths(scope, definitions, next);
        return next;
      });
    },
    [definitions, definitionsByKey, scope],
  );

  const startResize = useCallback(
    (key: Key, event: ReactPointerEvent<HTMLElement>) => {
      const definition = definitionsByKey.get(key);
      if (!definition || typeof window === "undefined") return;
      activeResizeCleanupRef.current?.();

      const startX = event.clientX;
      const startWidth = getWidth(key);
      let pendingWidth = startWidth;
      let animationFrame: number | undefined;
      const target = event.currentTarget;
      const pointerId = event.pointerId;
      target.setPointerCapture?.(pointerId);
      event.preventDefault();

      const applyPendingWidth = () => {
        animationFrame = undefined;
        setWidths((current) => ({ ...current, [key]: pendingWidth }));
      };
      const onPointerMove = (moveEvent: PointerEvent) => {
        pendingWidth = clampWidth(definition, startWidth + moveEvent.clientX - startX);
        if (animationFrame === undefined) {
          animationFrame = window.requestAnimationFrame(applyPendingWidth);
        }
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
        target.releasePointerCapture?.(pointerId);
        activeResizeCleanupRef.current = undefined;
      };
      const onPointerUp = () => {
        cleanup();
        setWidths((current) => {
          const next = { ...current, [key]: pendingWidth };
          storeWidths(scope, definitions, next);
          return next;
        });
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
      activeResizeCleanupRef.current = cleanup;
    },
    [definitions, definitionsByKey, getWidth, scope],
  );

  return { getWidth, resizeBy, startResize };
}
