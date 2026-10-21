"""Local positive-only face hints. No identity recognition or framework labels."""


def annotate(frames, work):
    import cv2
    detector = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    if detector.empty():
        raise ValueError('Local face detector is unavailable')
    for frame in frames:
        image = cv2.imread(str(work / f"{frame['index']}.jpg"))
        if image is None:
            raise ValueError('Local face evidence image is unreadable')
        # Small product logos/ingredient circles can trigger Haar. Only a large
        # face supplies a positive hint. A miss never proves absence of a face.
        minimum = max(40, round(image.shape[1] * .32))
        boxes = detector.detectMultiScale(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY),
                                         1.1, 5, minSize=(minimum, minimum))
        frame['face_boxes'] = [[int(n) for n in box] for box in boxes]


def reconcile(frames, observations):
    """Resolve contradictory offscreen-hand claims without inventing an owner."""
    indexed = {frame['index']: frame for frame in frames}
    result, corrections = [], []
    for original in observations.get('shots', []):
        value = dict(original)
        if value.get('role') == 'hands_product' and value.get('visible_person_id'):
            positive = bool(indexed.get(value.get('index'), {}).get('face_boxes'))
            if positive:
                value.update(role='presenter', visible_link='same_person_visible')
            else:
                # Keep any separately observed clothing/setting link; never
                # guess the hand's identity when there is no positive face.
                value['visible_person_id'] = ''
                if value.get('visible_link') == 'same_person_visible':
                    value['visible_link'] = 'none'
            corrections.append({'index': value['index'], 'localFacePositive': positive,
                                'action': 'visible_presenter' if positive else 'remove_unsupported_identity'})
        result.append(value)
    return {'shots': result}, corrections
