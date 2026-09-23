import type { ProductionClip, ProductionDraft } from './content-production-api';

export const emptyProductionDraft = (): ProductionDraft => ({ title: '新视频', aspect: 'portrait', clips: [], rightsConfirmed: false });

export function moveProductionClip(clips: ProductionClip[], from: number, to: number): ProductionClip[] {
  if (from < 0 || to < 0 || from >= clips.length || to >= clips.length) throw new Error('片段序号超出范围');
  const result = [...clips];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

/** Deliberately bounded commands. Unknown language never silently mutates a project. */
export function applyProductionCommand(clips: ProductionClip[], input: string): { clips: ProductionClip[]; summary: string } {
  const text = input.trim().replace(/\s+/g, '');
  const index = (number: string) => {
    const i = Number(number) - 1;
    if (!Number.isInteger(i) || i < 0 || i >= clips.length) throw new Error('找不到这个片段，请使用列表中的数字序号');
    return i;
  };
  let match = /^(?:把)?第(\d+)段(?:移到|放到)开头$/.exec(text);
  if (match) return { clips: moveProductionClip(clips, index(match[1]), 0), summary: `第 ${match[1]} 段已移到开头，尚未保存` };
  match = /^删除第(\d+)段$/.exec(text);
  if (match) { const i = index(match[1]); return { clips: clips.filter((_, pos) => pos !== i), summary: `已删除第 ${match[1]} 段，尚未保存` }; }
  match = /^第(\d+)段静音$/.exec(text);
  if (match) { const i = index(match[1]); return { clips: clips.map((c, pos) => pos === i ? { ...c, volume: 0 } : c), summary: `第 ${match[1]} 段已静音，尚未保存` }; }
  throw new Error('暂支持：把第2段移到开头、删除第2段、第2段静音。其他调整请使用片段编辑。');
}
