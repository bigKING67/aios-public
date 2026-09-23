import {
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import styles from './file-dropzone.module.css';

export interface FileDropzoneProps {
  accept?: string;
  disabled?: boolean;
  hint: ReactNode;
  icon?: ReactNode;
  onFile: (file: File) => void | Promise<void>;
  title: ReactNode;
}

export function FileDropzone({
  accept,
  disabled = false,
  hint,
  icon,
  onFile,
  title,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const selectFile = (file: File | undefined) => {
    if (!file || disabled) return;
    void onFile(file);
  };

  const handleDragOver = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!disabled) setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLButtonElement>) => {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
    setDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragActive(false);
    selectFile(event.dataTransfer.files[0]);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          selectFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        className={styles.dropzone}
        disabled={disabled}
        data-drag-active={dragActive ? 'true' : 'false'}
        onClick={() => inputRef.current?.click()}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {icon ? <span className={styles.icon}>{icon}</span> : null}
        <strong className={styles.title}>{title}</strong>
        <span className={styles.hint}>{hint}</span>
      </button>
    </>
  );
}
