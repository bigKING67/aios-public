import type {
  ContentAssetContentUnderstanding,
  ContentAssetContentUnderstandingKey,
} from '../_lib/content-assets-analysis-result';
import aiTabStyles from './content-assets-inspector-ai-tab.module.css';
import understandingStyles from './content-assets-inspector-ai-understanding.module.css';

export function ContentUnderstandingSection({
  contentUnderstanding,
  hasAnalysisObject,
  analysisResultFetching,
  analysisResultError,
  hookType,
  suggestedTagsText,
  confidenceText,
}: {
  contentUnderstanding: ContentAssetContentUnderstanding;
  hasAnalysisObject: boolean;
  analysisResultFetching: boolean;
  analysisResultError: unknown;
  hookType: string;
  suggestedTagsText: string;
  confidenceText: string;
}) {
  const sourceText = contentUnderstandingSourceText(contentUnderstanding.source);
  return (
    <div className={understandingStyles.contentUnderstandingBlock}>
      <div className={understandingStyles.contentUnderstandingHeader}>
        <div>
          <span>内容理解</span>
          <strong>先帮运营完整读懂素材，再做投放动作判断。</strong>
        </div>
        <div className={understandingStyles.contentUnderstandingMeta}>
          <span>{sourceText}</span>
          {hookType ? <span>钩子：{hookType}</span> : null}
          {confidenceText && confidenceText !== '--' ? <span>可信度：{confidenceText}</span> : null}
        </div>
      </div>
      {hasAnalysisObject && analysisResultFetching ? (
        <p className={aiTabStyles.aiHint}>正在读取完整 AI 分析 JSON...</p>
      ) : null}
      {hasAnalysisObject && analysisResultError ? (
        <p className={aiTabStyles.aiHint}>完整 AI 结果读取失败，可先查看已入库摘要。</p>
      ) : null}
      <div className={understandingStyles.contentUnderstandingGrid}>
        {contentUnderstanding.items.map((item) => (
          <article key={item.key} className={understandingStyles.contentUnderstandingItem}>
            <span>{item.label}</span>
            <p>{item.text || fallbackUnderstandingText(item.key, item.emptyText, suggestedTagsText)}</p>
          </article>
        ))}
      </div>
      {contentUnderstanding.source === 'empty' ? (
        <p className={aiTabStyles.aiHint}>
          {hasAnalysisObject ? '完整 AI 结果里暂未输出结构化内容理解，已预留 7 段读片位。' : '暂无完整分析 JSON。'}
        </p>
      ) : null}
    </div>
  );
}

function fallbackUnderstandingText(
  key: ContentAssetContentUnderstandingKey,
  emptyText: string,
  suggestedTagsText: string
): string {
  if (key === 'core_selling_points' && suggestedTagsText) {
    return `可先参考标签：${suggestedTagsText}`;
  }
  return emptyText;
}

function contentUnderstandingSourceText(source: ContentAssetContentUnderstanding['source']): string {
  if (source === 'structured') return '结构化读片';
  if (source === 'legacy') return '兼容旧结果';
  return '待输出';
}
