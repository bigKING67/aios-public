import { Input, Segmented } from 'antd';

import {
  NOTE_METRIC_OPTIONS,
  NOTE_TEXT_MAX_LENGTH,
  type NoteMetricKey,
} from './dashboard-config';
import styles from './dashboard-note-editor.module.css';

const { TextArea } = Input;

type DashboardNoteTextAreaFieldProps = {
  value: string;
  placeholder: string;
  maxRows: number;
  onChange: (value: string) => void;
};

function DashboardNoteTextAreaField({
  value,
  placeholder,
  maxRows,
  onChange,
}: DashboardNoteTextAreaFieldProps) {
  return (
    <>
      <TextArea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={NOTE_TEXT_MAX_LENGTH}
        autoSize={{ minRows: 2, maxRows }}
        placeholder={placeholder}
      />
      <div className={styles.textareaCount}>
        {`${value.length}/${NOTE_TEXT_MAX_LENGTH}`}
      </div>
    </>
  );
}

export type DashboardNoteEditorFieldsProps = {
  metricSegmentName: string;
  metricKey: NoteMetricKey;
  actionText: string;
  reasonText: string;
  summaryText: string;
  onMetricKeyChange: (value: NoteMetricKey) => void;
  onActionTextChange: (value: string) => void;
  onReasonTextChange: (value: string) => void;
  onSummaryTextChange: (value: string) => void;
};

export function DashboardNoteEditorFields({
  metricSegmentName,
  metricKey,
  actionText,
  reasonText,
  summaryText,
  onMetricKeyChange,
  onActionTextChange,
  onReasonTextChange,
  onSummaryTextChange,
}: DashboardNoteEditorFieldsProps) {
  return (
    <>
      <Segmented<NoteMetricKey>
        name={metricSegmentName}
        size="small"
        value={metricKey}
        onChange={(value) => onMetricKeyChange(value as NoteMetricKey)}
        options={NOTE_METRIC_OPTIONS}
      />
      <DashboardNoteTextAreaField
        value={actionText}
        onChange={onActionTextChange}
        maxRows={3}
        placeholder="动作"
      />
      <DashboardNoteTextAreaField
        value={reasonText}
        onChange={onReasonTextChange}
        maxRows={3}
        placeholder="原因"
      />
      <DashboardNoteTextAreaField
        value={summaryText}
        onChange={onSummaryTextChange}
        maxRows={4}
        placeholder="一句话说明"
      />
    </>
  );
}
