import { Button, DatePicker, Drawer, Segmented, Tag } from 'antd';
import dayjs from 'dayjs';
import type { CSSProperties } from 'react';

import { getPlatformLegendColor } from '@/lib/platform-colors';
import {
  getNoteMetricLabel,
  getQueryPlatformLabel,
} from './dashboard-config';
import type { NoteMetricKey, QueryPlatform } from './dashboard-config';
import dynamicVarStyles from './dashboard-dynamic-vars.module.css';
import noteEditorStyles from './dashboard-note-editor.module.css';
import { DashboardNoteEditorFields } from './dashboard-note-editor-fields';
import noteStyles from './dashboard-note-drawer.module.css';
import noteListStyles from './dashboard-note-list.module.css';
import notePlatformStyles from './dashboard-note-platform.module.css';
import {
  getDashboardNoteCountLabel,
  getDashboardNoteCountTagColor,
  getDashboardNoteDrawerTitle,
  getDashboardNoteEmptyText,
} from './dashboard-note-model';
import type { DashboardNotePlatformGroup, OverviewNotePlatformFilter } from './dashboard-note-model';
import hintStyles from './dashboard-drawer-hint.module.css';
import type { DashboardDailyNoteRow } from './dashboard-types';

export type DashboardNoteDrawerProps = {
  open: boolean;
  isMobile: boolean;
  isDayMode: boolean;
  selectedNoteDate: string | null;
  noteDraftDate: string;
  selectedNoteCount: number;
  activeQueryPlatform: QueryPlatform;
  overviewNotePlatformFilter: OverviewNotePlatformFilter;
  overviewNotesByPlatform: DashboardNotePlatformGroup[];
  visibleNotesForSelectedDate: readonly DashboardDailyNoteRow[];
  selectedDateNotesLoading: boolean;
  canWriteDailyNote: boolean;
  editingNoteId: number | null;
  editMetricKey: NoteMetricKey;
  editActionText: string;
  editReasonText: string;
  editSummaryText: string;
  isUpdatingNote: boolean;
  deletingNoteId: number | null;
  noteMetricKey: NoteMetricKey;
  noteActionText: string;
  noteReasonText: string;
  noteSummaryText: string;
  isSavingNote: boolean;
  onClose: () => void;
  onNoteDraftDateChange: (value: string) => void;
  onOverviewNotePlatformFilterChange: (value: OverviewNotePlatformFilter) => void;
  onEditMetricKeyChange: (value: NoteMetricKey) => void;
  onEditActionTextChange: (value: string) => void;
  onEditReasonTextChange: (value: string) => void;
  onEditSummaryTextChange: (value: string) => void;
  onSaveEditDailyNote: (noteId: number) => void;
  onCancelEditDailyNote: () => void;
  onStartEditDailyNote: (note: DashboardDailyNoteRow) => void;
  onDeleteDailyNote: (noteId: number) => void;
  onNoteMetricKeyChange: (value: NoteMetricKey) => void;
  onNoteActionTextChange: (value: string) => void;
  onNoteReasonTextChange: (value: string) => void;
  onNoteSummaryTextChange: (value: string) => void;
  onCreateDailyNote: () => void;
};

export function DashboardNoteDrawer({
  open,
  isMobile,
  isDayMode,
  selectedNoteDate,
  noteDraftDate,
  selectedNoteCount,
  activeQueryPlatform,
  overviewNotePlatformFilter,
  overviewNotesByPlatform,
  visibleNotesForSelectedDate,
  selectedDateNotesLoading,
  canWriteDailyNote,
  editingNoteId,
  editMetricKey,
  editActionText,
  editReasonText,
  editSummaryText,
  isUpdatingNote,
  deletingNoteId,
  noteMetricKey,
  noteActionText,
  noteReasonText,
  noteSummaryText,
  isSavingNote,
  onClose,
  onNoteDraftDateChange,
  onOverviewNotePlatformFilterChange,
  onEditMetricKeyChange,
  onEditActionTextChange,
  onEditReasonTextChange,
  onEditSummaryTextChange,
  onSaveEditDailyNote,
  onCancelEditDailyNote,
  onStartEditDailyNote,
  onDeleteDailyNote,
  onNoteMetricKeyChange,
  onNoteActionTextChange,
  onNoteReasonTextChange,
  onNoteSummaryTextChange,
  onCreateDailyNote,
}: DashboardNoteDrawerProps) {
  return (
    <Drawer
      title={getDashboardNoteDrawerTitle(selectedNoteDate)}
      placement="right"
      size={isMobile ? 'large' : 'default'}
      open={open}
      onClose={onClose}
    >
      <div className={noteStyles.content}>
        {!isDayMode ? (
          <p className={hintStyles.hint}>请切换到「日」模式后查看和填写日报。</p>
        ) : null}

        <div className={noteStyles.datePickerWrap}>
          <DatePicker
            value={noteDraftDate ? dayjs(noteDraftDate) : null}
            allowClear={false}
            format="YYYY-MM-DD"
            onChange={(value) => {
              if (!value) {
                return;
              }
              onNoteDraftDateChange(value.startOf('day').format('YYYY-MM-DD'));
            }}
          />
          <Tag color={getDashboardNoteCountTagColor(selectedNoteCount)}>
            {getDashboardNoteCountLabel(selectedNoteCount)}
          </Tag>
        </div>

        {activeQueryPlatform === 'overview' && overviewNotesByPlatform.length > 0 ? (
          <div className={notePlatformStyles.platformSummary}>
            {overviewNotesByPlatform.map(([platform, list]) => (
              <Tag key={platform} className={notePlatformStyles.platformLegendTag}>
                <span
                  className={`${notePlatformStyles.platformLegendDot} ${dynamicVarStyles.platformLegendDotTone}`}
                  style={
                    {
                      '--platform-legend-dot-color': getPlatformLegendColor(platform),
                    } as CSSProperties
                  }
                  aria-hidden="true"
                />
                {`${getQueryPlatformLabel(platform)} ${list.length} 条`}
              </Tag>
            ))}
          </div>
        ) : null}

        {activeQueryPlatform === 'overview' && overviewNotesByPlatform.length > 1 ? (
          <Segmented
            name="dashboard-note-platform-filter"
            size="small"
            value={overviewNotePlatformFilter}
            onChange={(value) => onOverviewNotePlatformFilterChange(value as OverviewNotePlatformFilter)}
            options={[
              { label: '全部平台', value: 'all' },
              ...overviewNotesByPlatform.map(([platform]) => ({
                label: getQueryPlatformLabel(platform),
                value: platform,
              })),
            ]}
          />
        ) : null}

        <div className={noteListStyles.list}>
          {selectedDateNotesLoading ? (
            <p className={hintStyles.hint}>日报加载中...</p>
          ) : visibleNotesForSelectedDate.length === 0 ? (
            <p className={hintStyles.hint}>
              {getDashboardNoteEmptyText({
                activeQueryPlatform,
                overviewNotePlatformFilter,
              })}
            </p>
          ) : (
            visibleNotesForSelectedDate.map((note) => (
              <article key={note.id} className={noteListStyles.item}>
                <div className={noteListStyles.itemHead}>
                  <Tag className={notePlatformStyles.platformLegendTag}>
                    <span
                      className={`${notePlatformStyles.platformLegendDot} ${dynamicVarStyles.platformLegendDotTone}`}
                      style={
                        {
                          '--platform-legend-dot-color': getPlatformLegendColor(note.platform),
                        } as CSSProperties
                      }
                      aria-hidden="true"
                    />
                    {getQueryPlatformLabel(note.platform)}
                  </Tag>
                  <span>{getNoteMetricLabel(note.metric_key)}</span>
                </div>

                {editingNoteId === note.id ? (
                  <div className={noteEditorStyles.editForm}>
                    <DashboardNoteEditorFields
                      metricSegmentName="dashboard-note-edit-metric"
                      metricKey={editMetricKey}
                      actionText={editActionText}
                      reasonText={editReasonText}
                      summaryText={editSummaryText}
                      onMetricKeyChange={onEditMetricKeyChange}
                      onActionTextChange={onEditActionTextChange}
                      onReasonTextChange={onEditReasonTextChange}
                      onSummaryTextChange={onEditSummaryTextChange}
                    />
                    <div className={noteListStyles.itemActions}>
                      <Button
                        size="small"
                        type="primary"
                        loading={isUpdatingNote}
                        onClick={() => onSaveEditDailyNote(note.id)}
                      >
                        保存修改
                      </Button>
                      <Button size="small" onClick={onCancelEditDailyNote} disabled={isUpdatingNote}>
                        取消
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className={noteListStyles.itemText}>{`动作：${note.action_text}`}</p>
                    <p className={noteListStyles.itemText}>{`原因：${note.reason_text}`}</p>
                    <p className={noteListStyles.itemText}>{`说明：${note.summary_text}`}</p>
                    <p className={noteListStyles.itemMeta}>{`记录人：${note.created_by}`}</p>
                    {canWriteDailyNote ? (
                      <div className={noteListStyles.itemActions}>
                        <Button size="small" onClick={() => onStartEditDailyNote(note)}>
                          编辑
                        </Button>
                        <Button
                          size="small"
                          danger
                          loading={deletingNoteId === note.id}
                          onClick={() => onDeleteDailyNote(note.id)}
                        >
                          删除
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </article>
            ))
          )}
        </div>

        {canWriteDailyNote ? (
          <div className={noteEditorStyles.editor}>
            <h4>新增日报</h4>
            <DashboardNoteEditorFields
              metricSegmentName="dashboard-note-create-metric"
              metricKey={noteMetricKey}
              actionText={noteActionText}
              reasonText={noteReasonText}
              summaryText={noteSummaryText}
              onMetricKeyChange={onNoteMetricKeyChange}
              onActionTextChange={onNoteActionTextChange}
              onReasonTextChange={onNoteReasonTextChange}
              onSummaryTextChange={onNoteSummaryTextChange}
            />
            <Button type="primary" loading={isSavingNote} onClick={onCreateDailyNote}>
              保存日报
            </Button>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
