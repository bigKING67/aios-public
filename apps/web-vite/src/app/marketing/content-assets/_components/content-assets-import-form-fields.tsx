import { Alert, Button, Cascader, Form, Input, Select } from 'antd';
import type { FormInstance, SelectProps } from 'antd';
import type {
  ContentAssetFilterOptions,
  ContentAssetVideoLinkPreviewCandidate,
} from '../_lib/content-assets-types';
import {
  formatContentAssetScenePath,
  type ContentAssetSceneCascaderOption,
} from '../_lib/content-assets-ui-helpers';
import {
  resolveVideoLinkCandidateLabel,
  resolveVideoLinkCandidateMissingIdText,
  resolveVideoLinkCandidatePrimaryId,
  resolveQianchuanMaterialCandidateReviewNotice,
} from '../_lib/content-assets-video-link-preview';
import { renderContentAssetPlatformSelectTag } from './content-assets-platform-select';
import {
  emptyToNull,
  resolveOwnerDisplayName,
  type OwnerSelectOption,
  type PlainSelectOption,
  type UploadFormValues,
} from './content-assets-import-modal-values';
import platformSelectStyles from './content-assets-platform-select.module.css';
import { ContentAssetsTagPicker } from './content-assets-tag-picker';
import uploadStyles from './content-assets-upload-modal.module.css';

interface ContentAssetsImportFormFieldsProps {
  confirmLoading: boolean;
  contentSceneGroupOptions: PlainSelectOption[];
  contentSceneOptions: PlainSelectOption[];
  contentSceneSubtypeOptions: PlainSelectOption[];
  filterOptions: ContentAssetFilterOptions;
  form: FormInstance<UploadFormValues>;
  hasOwnerOptions: boolean;
  ownerOptions: OwnerSelectOption[];
  platformOptions: SelectProps['options'];
  productOptions: SelectProps['options'];
  resolvingVideoLinkPreview: boolean;
  sceneOptions: ContentAssetSceneCascaderOption[];
  sceneOptionsConfigured: boolean;
  sceneSelectionDisabled: boolean;
  showSceneCascade: boolean;
  skuOptions: PlainSelectOption[];
  qianchuanMaterialReviewNotice: string | null;
  videoLinkPreviewNotice: string | null;
  videoLinkPreviewCandidates: ContentAssetVideoLinkPreviewCandidate[];
  selectedVideoLinkCandidateIndex: number | null;
  videoTypeOptions: SelectProps['options'];
  onApplyVideoLinkCandidate: (candidate: ContentAssetVideoLinkPreviewCandidate, candidateIndex: number) => void;
  onVideoLinkInputChange: () => void;
  onPreviewVideoLink: () => void;
}

export function ContentAssetsImportFormFields({
  confirmLoading,
  contentSceneGroupOptions,
  contentSceneOptions,
  contentSceneSubtypeOptions,
  filterOptions,
  form,
  hasOwnerOptions,
  ownerOptions,
  platformOptions,
  productOptions,
  resolvingVideoLinkPreview,
  sceneOptions,
  sceneOptionsConfigured,
  sceneSelectionDisabled,
  showSceneCascade,
  skuOptions,
  qianchuanMaterialReviewNotice,
  videoLinkPreviewNotice,
  videoLinkPreviewCandidates,
  selectedVideoLinkCandidateIndex,
  videoTypeOptions,
  onApplyVideoLinkCandidate,
  onVideoLinkInputChange,
  onPreviewVideoLink,
}: ContentAssetsImportFormFieldsProps) {
  const currentExternalItemId = Form.useWatch('externalItemId', form);

  return (
    <>
      <section className={uploadStyles.formSection}>
        <div className={uploadStyles.sectionHeader}>
          <h3>基础信息</h3>
          <p>标题和标签都可后补；不填写时会先按文件名入库，AI 分析后可生成建议标题和标签。</p>
        </div>
        <div className={uploadStyles.uploadFormGrid}>
          <Form.Item
            className={uploadStyles.uploadFormWide}
            name="title"
            label="素材标题"
            extra="可选，默认使用文件名；后续可由 AI 建议或手动修改。"
          >
            <Input placeholder="例如：白金洗发水-达人口播-三秒钩子版" />
          </Form.Item>
          <Form.Item
            className={uploadStyles.uploadFormWide}
            name="tags"
            label="标签"
            extra="可选，不填也可以，AI 分析后会补充建议标签。"
          >
            <ContentAssetsTagPicker
              disabled={confirmLoading}
              options={filterOptions.tags}
              placeholder="搜索或新增标签，例如：控油、口播、对比测评"
            />
          </Form.Item>
          <Form.Item className={uploadStyles.uploadFormWide} name="productNames" label="产品">
            <Select
              allowClear
              showSearch={false}
              mode="multiple"
              placeholder="选择产品，可多选"
              optionFilterProp="searchText"
              options={productOptions}
            />
          </Form.Item>
          <Form.Item name="ownerUserId" label="负责人">
            <Select
              allowClear
              showSearch={false}
              disabled={!hasOwnerOptions}
              placeholder={hasOwnerOptions ? '选择素材库负责人' : '请先配置素材库成员'}
              optionFilterProp="searchText"
              options={ownerOptions}
              onChange={(value) => {
                const ownerUserId = emptyToNull(value);
                form.setFieldValue('ownerName', ownerUserId ? resolveOwnerDisplayName(ownerUserId, ownerOptions) : undefined);
              }}
            />
          </Form.Item>
          <Form.Item name="ownerName" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="videoType" label="视频类型">
            <Select
              allowClear
              showSearch={false}
              placeholder="选择视频类型"
              optionFilterProp="label"
              options={videoTypeOptions}
            />
          </Form.Item>
          {showSceneCascade && sceneOptionsConfigured ? (
            <Form.Item
              className={uploadStyles.uploadFormWide}
              name="scenePath"
              label="场景路径"
              extra={sceneSelectionDisabled
                ? '请先选择单一产品品类后维护场景分层。'
                : '按“场景类型｜大场景 › 细分场景”维护；标签里的“/”保留为业务词组。'}
            >
              <Cascader
                changeOnSelect
                disabled={sceneSelectionDisabled}
                displayRender={(labels) => formatContentAssetScenePath(labels.map((label) => String(label)))}
                options={sceneOptions}
                placeholder={sceneSelectionDisabled ? '先选择单一产品品类' : '选择场景类型 → 大场景 → 细分场景'}
              />
            </Form.Item>
          ) : null}
          {showSceneCascade && !sceneOptionsConfigured ? (
            <>
              <Form.Item
                name="contentScene"
                label="场景类型"
                extra="场景映射树待确认前，先保留可录入字段；后续可替换为固定级联选项。"
              >
                <Input list="content-asset-content-scene-options" placeholder="例如：原点场景" maxLength={120} />
              </Form.Item>
              <Form.Item name="contentSceneGroup" label="大场景">
                <Input list="content-asset-content-scene-group-options" placeholder="输入大场景" maxLength={120} />
              </Form.Item>
              <Form.Item name="contentSceneSubtype" label="细分场景">
                <Input list="content-asset-content-scene-subtype-options" placeholder="输入细分场景" maxLength={120} />
              </Form.Item>
            </>
          ) : null}
        </div>
      </section>

      <section className={uploadStyles.formSection}>
        <div className={uploadStyles.sectionHeader}>
          <h3>归档信息，可上传后补充</h3>
          <p>用于后续关联平台视频身份、达人账号和投放素材实例，不影响先上传入库。</p>
        </div>
        <div className={uploadStyles.uploadFormGrid}>
          <Form.Item name="platformNames" label="平台">
            <Select
              className={platformSelectStyles.platformSelect}
              allowClear
              showSearch={false}
              mode="multiple"
              placeholder="可多选：抖音 / 快手 / 淘宝 / 小红书"
              optionFilterProp="searchText"
              options={platformOptions}
              tagRender={renderContentAssetPlatformSelectTag}
            />
          </Form.Item>
          <Form.Item
            className={uploadStyles.uploadFormWide}
            name="externalUrl"
            label="视频链接 / 分享文案"
            extra="可选。支持抖音分享文案、抖音长链、v.douyin.com 短链和千川素材视频链接；解析后可从支持的链接远程导入原视频，千川直链可能过期，请复制后尽快解析。"
          >
            <Input.Search
              placeholder="粘贴抖音分享文案、抖音视频链接或千川素材视频链接"
              maxLength={800}
              enterButton={(
                <Button
                  type="primary"
                  loading={resolvingVideoLinkPreview}
                  disabled={confirmLoading || resolvingVideoLinkPreview}
                >
                  解析链接
                </Button>
              )}
              loading={resolvingVideoLinkPreview}
              disabled={confirmLoading}
              onChange={onVideoLinkInputChange}
              onSearch={onPreviewVideoLink}
            />
          </Form.Item>
          {videoLinkPreviewNotice ? (
            <Alert
              className={uploadStyles.linkPreviewNotice}
              showIcon
              type="warning"
              message={videoLinkPreviewNotice}
            />
          ) : null}
          {qianchuanMaterialReviewNotice ? (
            <Alert
              className={uploadStyles.linkPreviewNotice}
              showIcon
              type="warning"
              message={qianchuanMaterialReviewNotice}
            />
          ) : null}
          {videoLinkPreviewCandidates.length > 0 ? (
            <div className={uploadStyles.linkPreviewPanel}>
              {videoLinkPreviewCandidates.map((candidate, candidateIndex) => {
                const primaryId = resolveVideoLinkCandidatePrimaryId(candidate);
                const selected = selectedVideoLinkCandidateIndex === candidateIndex;
                const qianchuanReviewNotice = resolveQianchuanMaterialCandidateReviewNotice(
                  candidate,
                  emptyToNull(currentExternalItemId)
                );
                return (
                  <div
                    className={uploadStyles.linkPreviewCandidate}
                    data-selected={selected}
                    key={`${candidate.sourceType}:${candidate.sourceUrl}`}
                  >
                    <div className={uploadStyles.linkPreviewHeader}>
                      <span>{resolveVideoLinkCandidateLabel(candidate)}</span>
                      {primaryId ? (
                        <code>{primaryId}</code>
                      ) : (
                        <em>{resolveVideoLinkCandidateMissingIdText(candidate)}</em>
                      )}
                    </div>
                    <p>{candidate.resolvedUrl || candidate.sourceUrl}</p>
                    {candidate.sourceType === 'qianchuan_material_video' && !candidate.externalItemId ? (
                      <small>该千川视频直链本身未携带素材 ID，可直接从链接导入，素材 ID 可后补。</small>
                    ) : null}
                    {qianchuanReviewNotice ? (
                      <small>{qianchuanReviewNotice}</small>
                    ) : null}
                    {videoLinkPreviewCandidates.length > 1 ? (
                      <Button size="small" type={selected ? 'primary' : 'default'} onClick={() => onApplyVideoLinkCandidate(candidate, candidateIndex)}>
                        {selected ? '已选择' : '使用此链接'}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          <Form.Item
            name="externalVideoId"
            label="抖音视频ID（抖音网页视频链接后面数字部分）"
          >
            <Input placeholder="抖音网页视频链接后面的数字部分" maxLength={160} />
          </Form.Item>
          <Form.Item name="externalItemId" label="千川素材ID（同步广告素材实例）">
            <Input placeholder="千川素材 ID，保存后会同步广告素材实例" maxLength={160} />
          </Form.Item>
          <Form.Item name="externalNoteId" label="小红书笔记 ID">
            <Input placeholder="note_id，可选" maxLength={160} />
          </Form.Item>
          <Form.Item name="skuNames" label="SKU">
            <Select
              allowClear
              showSearch
              mode="tags"
              maxTagCount="responsive"
              tokenSeparators={[',', '，', '/']}
              placeholder="选择或输入 SKU，可多选"
              optionFilterProp="searchText"
              options={skuOptions}
            />
          </Form.Item>
          <Form.Item name="creatorName" label="达人昵称">
            <Input placeholder="请输入达人昵称" maxLength={120} />
          </Form.Item>
          <Form.Item name="creatorDouyinId" label="达人抖音号">
            <Input placeholder="用于回流平台账号身份，可选" maxLength={160} />
          </Form.Item>
        </div>
      </section>

      <section className={uploadStyles.formSection}>
        <Form.Item name="notes" label="备注">
          <Input.TextArea rows={3} placeholder="补充素材来源、授权说明、剪辑要求或后续处理备注" />
        </Form.Item>
      </section>
      <datalist id="content-asset-content-scene-options">
        {contentSceneOptions.map((option) => <option key={option.value} value={option.value} />)}
      </datalist>
      <datalist id="content-asset-content-scene-group-options">
        {contentSceneGroupOptions.map((option) => <option key={option.value} value={option.value} />)}
      </datalist>
      <datalist id="content-asset-content-scene-subtype-options">
        {contentSceneSubtypeOptions.map((option) => <option key={option.value} value={option.value} />)}
      </datalist>
    </>
  );
}
