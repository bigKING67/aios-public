"""Pure delivery metadata and the deliberately narrow vendor import contract."""
import collections
import datetime as dt
import json
from zoneinfo import ZoneInfo


class PushBlocked(ValueError):
    """A stable public error code, never a raw vendor message or signed URL."""


def category(segments, source_categories):
    totals = collections.Counter()
    for segment in segments:
        choices = set(source_categories.get(str(segment['assetId']), []))
        if not choices:
            raise PushBlocked('source_category_missing')
        if len(choices) != 1:
            raise PushBlocked('source_category_ambiguous')
        duration = segment['endMs'] - segment['startMs']
        if duration <= 0:
            raise PushBlocked('source_category_missing')
        totals[next(iter(choices))] += duration
    if not totals:
        raise PushBlocked('source_category_missing')
    # Equal durations have a deterministic tie-break; a category is never inferred from its name.
    return min(totals, key=lambda key: (-totals[key], key))


def video_name(row):
    mode = {'framework': 'AI框架混剪', 'sellingPoint': 'AI卖点混剪', 'edit': 'AI单条剪辑'}[row['mode']]
    created = row['created_at']
    if isinstance(created, str):
        created = dt.datetime.fromisoformat(created)
    date = created.astimezone(ZoneInfo('Asia/Shanghai')).strftime('%m.%d')
    labels = {label['key']: label['name'] for label in row['preset_labels']}
    structure = '→'.join(labels.get(key, key) for key in row['labels'])
    clean = lambda value: ''.join(c for c in value if c.isprintable()).strip()
    return f'【{mode}】{date}-{clean(row["product_name"])[:40]}-{clean(structure)[:90]}-{str(row["batch_id"])[:8]}-{row["ordinal"]:02d}'


def label_for(client, one_id, two_id, configured_ids=()):
    trees = client.call('/openapi/video/type/list', {'videoType': 0})
    if not isinstance(trees, list) or not any(
        group.get('id') == one_id and any(child.get('id') == two_id for child in group.get('children', []))
        for group in trees
    ):
        raise PushBlocked('category_unavailable')
    groups = client.call('/openapi/video/label/list', {
        'videoType': 0, 'oneLevelTypeId': one_id, 'twoLevelTypeIds': str(two_id)})
    if not isinstance(groups, list):
        raise PushBlocked('label_missing')
    matches = {child['id'] for group in groups if group.get('state') == 1
               for child in group.get('children', [])
               if child.get('state') == 1 and child.get('level') == 2 and child.get('name') == 'AI混剪'
               and type(child.get('id')) is int and child['id'] > 0
               and (not configured_ids or child['id'] in configured_ids)}
    if not matches:
        raise PushBlocked('label_missing')
    if len(matches) != 1:
        raise PushBlocked('label_ambiguous')
    return [matches.pop()]


def import_body(row, url, visibility):
    if visibility not in (0, 1, 2, 3):
        raise PushBlocked('invalid_visibility')
    return {'videoJSON': json.dumps([{
        'videoName': row['video_name'], 'videoType': 0, 'twoLevelTypeId': row['two_level_type_id'],
        'labelIds': ','.join(str(value) for value in row['label_ids']), 'videoRight': visibility,
        'url': url, 'thirdId': str(row['output_asset_id']),
    }], ensure_ascii=False, separators=(',', ':'))}


def request_id(data):
    # IDs may be numeric or strings; preserve digits without lossy numeric conversion.
    value = data.get('requestId') if isinstance(data, dict) else None
    if isinstance(value, bool) or not isinstance(value, (str, int)) or not str(value).isdigit() or len(str(value)) > 64:
        raise PushBlocked('submission_unknown')
    if data.get('errorList'):
        raise PushBlocked('submission_unknown')
    return str(value)


def import_result(data, name):
    """One submitted video must yield one matching task row. Empty/malformed reads remain uncertain."""
    rows = data.get('list') if isinstance(data, dict) else None
    if not isinstance(rows, list) or len(rows) != 1 or rows[0].get('videoName') != name:
        raise PushBlocked('invalid_response')
    row = rows[0]
    if row.get('status') in (0, 3):
        return 'importing', None
    if row.get('status') == 20:
        return 'failed', None
    video_id = row.get('videoId')
    if row.get('status') == 10 and not isinstance(video_id, bool) and str(video_id).isdigit() and 0 < int(video_id) < 2 ** 63:
        return 'succeeded', int(video_id)
    raise PushBlocked('invalid_response')
