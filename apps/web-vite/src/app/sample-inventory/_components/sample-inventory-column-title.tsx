import type { KeyboardEvent, PointerEvent, ReactNode } from "react";

import styles from "../sample-inventory.module.css";

type SampleInventoryColumnTitleProps<Key extends string> = {
  children: ReactNode;
  columnKey: Key;
  onResizeBy: (key: Key, delta: number) => void;
  onResizeStart: (key: Key, event: PointerEvent<HTMLElement>) => void;
};

export function SampleInventoryColumnTitle<Key extends string>({
  children,
  columnKey,
  onResizeBy,
  onResizeStart,
}: SampleInventoryColumnTitleProps<Key>) {
  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    onResizeBy(columnKey, event.key === "ArrowLeft" ? -10 : 10);
  };

  return (
    <span className={styles.resizableColumnTitle}>
      {children}
      <span
        className={styles.columnResizeHandle}
        role="separator"
        aria-label={`${String(children)}列宽`}
        aria-orientation="vertical"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          event.stopPropagation();
          onResizeStart(columnKey, event);
        }}
      />
    </span>
  );
}
