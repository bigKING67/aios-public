import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileDropzone } from './file-dropzone';

afterEach(cleanup);

describe('FileDropzone', () => {
  it('forwards a file selected with the native picker', () => {
    const onFile = vi.fn();
    const { container } = render(
      <FileDropzone
        accept=".csv"
        title="选择 CSV"
        hint="仅支持 CSV"
        onFile={onFile}
      />,
    );
    const file = new File(['name'], 'creators.csv', { type: 'text/csv' });
    const input = container.querySelector('input[type="file"]');

    expect(input).not.toBeNull();

    fireEvent.change(input!, {
      target: { files: [file] },
    });

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('accepts a dropped file and exposes the drag state', () => {
    const onFile = vi.fn();
    render(
      <FileDropzone title="上传视频" hint="支持 MP4" onFile={onFile} />,
    );
    const trigger = screen.getByRole('button', { name: /\u4e0a\u4f20\u89c6\u9891/ });
    const file = new File(['video'], 'source.mp4', { type: 'video/mp4' });

    fireEvent.dragOver(trigger);
    expect(trigger).toHaveAttribute('data-drag-active', 'true');
    fireEvent.drop(trigger, { dataTransfer: { files: [file] } });

    expect(trigger).toHaveAttribute('data-drag-active', 'false');
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('ignores dropped files while disabled', () => {
    const onFile = vi.fn();
    render(
      <FileDropzone disabled title="上传视频" hint="支持 MP4" onFile={onFile} />,
    );
    const file = new File(['video'], 'source.mp4', { type: 'video/mp4' });

    fireEvent.drop(screen.getByRole('button', { name: /\u4e0a\u4f20\u89c6\u9891/ }), {
      dataTransfer: { files: [file] },
    });

    expect(onFile).not.toHaveBeenCalled();
  });
});
