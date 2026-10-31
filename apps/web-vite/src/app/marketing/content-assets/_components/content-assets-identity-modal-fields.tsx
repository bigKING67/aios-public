import { Button, Input } from '@lobehub/ui';
import type {
  ContentAssetDetailResponse,
  ContentAssetPlatformVideo,
} from '../_lib/content-assets-types';
import {
  CONTENT_ASSET_PLATFORM_OPTIONS,
  contentAssetPlatformLabel,
} from '../_lib/content-assets-platforms';
import styles from '../content-assets.module.css';
import { FormField, TextFormField } from '@/components/molecules/form-field';
import { LabeledSelect } from '@/components/molecules/labeled-select';
import { buildContentAssetPlatformSelectOptions } from './content-assets-platform-select';
import {
  bindSelectField,
  bindTextField,
  type ControlledForm,
} from '@/hooks/use-controlled-form';

export interface IdentityFormValues {
  platform?: string;
  accountId?: string;
  accountName?: string;
  advertiserId?: string;
  externalVideoId?: string;
  externalItemId?: string;
  externalNoteId?: string;
  externalUrl?: string;
  publishTitle?: string;
  publishStatus?: string;
  platformVideoId?: string;
  adPlatform?: string;
  externalMaterialId?: string;
  materialName?: string;
  materialTitle?: string;
  materialStatus?: string;
}

type IdentityForm = ControlledForm<IdentityFormValues>;

export function PlatformVideoFields({
  form,
  resolvingDouyinVideoId,
  onResolveDouyinVideoId,
}: {
  form: IdentityForm;
  resolvingDouyinVideoId: boolean;
  onResolveDouyinVideoId: () => void;
}) {
  return (
    <div className={styles.formGrid}>
      <FormField form={form} name="platform" label="平台" required>
        <LabeledSelect
          {...bindSelectField(form, 'platform')}
          placeholder="选择平台"
          options={buildContentAssetPlatformSelectOptions(
            CONTENT_ASSET_PLATFORM_OPTIONS.map((option) => option.value)
          )}
        />
      </FormField>
      <TextFormField form={form} name="accountName" label="达人昵称" placeholder="请输入达人昵称" maxLength={120} />
      <TextFormField form={form} name="accountId" label="达人账号" placeholder="请输入达人账号或平台账号 ID" maxLength={80} />
      <TextFormField form={form} name="advertiserId" label="广告主 ID" placeholder="千川/巨量广告主 ID" maxLength={80} />
      <FormField
        form={form}
        name="externalUrl"
        label="抖音视频链接/平台链接"
        className={styles.formWide}
        extra="支持抖音长链或 v.douyin.com 分享短链；短链会调用后端解析。"
      >
        <div className={styles.inputWithAction}>
          <Input
            {...bindTextField(form, 'externalUrl')}
            placeholder="粘贴抖音视频链接或分享文案"
            maxLength={800}
            onPressEnter={onResolveDouyinVideoId}
          />
          <Button type="primary" loading={resolvingDouyinVideoId} onClick={onResolveDouyinVideoId}>
            提取 ID
          </Button>
        </div>
      </FormField>
      <TextFormField
        form={form}
        name="externalVideoId"
        label="抖音视频ID（抖音网页视频链接后面数字部分）"
        placeholder="抖音网页视频链接后面的数字部分"
        maxLength={160}
      />
      <TextFormField
        form={form}
        name="externalItemId"
        label="千川素材ID（同步广告素材实例）"
        placeholder="千川素材 ID，保存后会同步广告素材实例"
        maxLength={160}
      />
      <TextFormField form={form} name="externalNoteId" label="小红书笔记 ID" placeholder="note_id" maxLength={160} />
      <TextFormField form={form} name="publishStatus" label="发布状态" placeholder="unknown / published / deleted" maxLength={60} />
      <TextFormField form={form} name="publishTitle" label="发布标题" placeholder="平台侧标题，可为空" maxLength={240} className={styles.formWide} />
    </div>
  );
}

export function AdMaterialFields({ form, detail }: { form: IdentityForm; detail: ContentAssetDetailResponse | null }) {
  const platformVideoOptions = buildPlatformVideoIdentityOptions(detail?.platformVideos || []);

  return (
    <div className={styles.formGrid}>
      <FormField form={form} name="adPlatform" label="广告平台" required>
        <LabeledSelect
          {...bindSelectField(form, 'adPlatform')}
          showSearch
          placeholder="选择广告平台"
          options={[
            { label: '千川', value: 'qianchuan' },
            { label: '巨量引擎', value: 'ocean_engine' },
            { label: '小红书聚光', value: 'xhs_juguang' },
            { label: '其他', value: 'other' },
          ]}
        />
      </FormField>
      <FormField form={form} name="externalMaterialId" label="千川素材ID" required>
        <Input {...bindTextField(form, 'externalMaterialId')} placeholder="请输入千川素材ID" maxLength={180} />
      </FormField>
      <FormField form={form} name="platformVideoId" label="关联平台视频身份">
        <LabeledSelect
          {...bindSelectField(form, 'platformVideoId')}
          allowClear
          placeholder="可选：绑定到已维护的视频 ID"
          options={platformVideoOptions.map((item) => ({
            value: item.platformVideoId,
            label: item.label,
          }))}
        />
      </FormField>
      <TextFormField
        form={form}
        name="externalVideoId"
        label="抖音视频ID（抖音网页视频链接后面数字部分）"
        placeholder="同一个物理视频可被多个素材 ID 复用"
        maxLength={160}
      />
      <TextFormField form={form} name="accountName" label="广告账户名称" placeholder="账户名称" maxLength={120} />
      <TextFormField form={form} name="accountId" label="广告账户 ID" placeholder="账户 ID" maxLength={80} />
      <TextFormField form={form} name="advertiserId" label="广告主 ID" placeholder="广告主 ID" maxLength={80} />
      <TextFormField form={form} name="materialStatus" label="素材状态" placeholder="unknown / active / paused" maxLength={60} />
      <TextFormField form={form} name="materialName" label="素材名称" placeholder="广告后台素材名称" maxLength={240} className={styles.formWide} />
      <TextFormField form={form} name="materialTitle" label="投放标题" placeholder="广告标题/创意标题，可为空" maxLength={240} className={styles.formWide} />
    </div>
  );
}

function buildPlatformVideoIdentityOptions(platformVideos: ContentAssetPlatformVideo[]) {
  const duplicateVideoIds = repeatedValues(platformVideos.map((item) => item.externalVideoId));
  const duplicateMaterialIds = repeatedValues(platformVideos.map((item) => item.externalItemId));
  return platformVideos.map((item) => {
    const duplicateHints = [
      item.externalVideoId && duplicateVideoIds.has(item.externalVideoId.trim()) ? '视频ID重复候选' : undefined,
      item.externalItemId && duplicateMaterialIds.has(item.externalItemId.trim()) ? '素材ID重复候选' : undefined,
    ].filter(Boolean);
    return {
      platformVideoId: item.platformVideoId,
      label: [
        contentAssetPlatformLabel(item.platform),
        item.accountName || item.accountId,
        item.externalVideoId ? `视频 ${item.externalVideoId}` : undefined,
        item.externalItemId ? `素材 ${item.externalItemId}` : undefined,
        `身份 ${shortIdentityId(item.platformVideoId)}`,
        duplicateHints.join(' / ') || undefined,
      ]
        .filter(Boolean)
        .join(' | '),
    };
  });
}

function repeatedValues(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    counts.set(trimmed, (counts.get(trimmed) || 0) + 1);
  });
  return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([value]) => value));
}

function shortIdentityId(value: string) {
  return value.slice(0, 8);
}
