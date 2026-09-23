# Third-party and separately licensed materials

The top-level `AIOS Personal Learning License 1.0` applies only to material for
which the AIOS copyright holders can grant that license. It does not replace
the licenses below.

## Creative Craft local production renderer

- Paths: `docker/content-production/renderer/**`
- Source: `bigKING67/creative-craft`, module `integrations/local-production`
- License: MIT
- License text: [`docker/content-production/renderer/LICENSE`](docker/content-production/renderer/LICENSE)

The renderer snapshot and its required MIT notice remain governed by the MIT
License. Rights granted by that license apply only to that separately licensed
material and do not extend to the rest of AIOS.

## wechat-download-api derived overlay

- Paths: `docker/wechat-download-api/**`
- Upstream: [`tmwgsicp/wechat-download-api` v1.7.0](https://github.com/tmwgsicp/wechat-download-api/tree/v1.7.0)
- Pinned upstream commit: `fd70a886a82a8838312e2439bb0eed1c2e1ad00b`
- License: AGPL-3.0-only
- License text: [`docker/wechat-download-api/LICENSE`](docker/wechat-download-api/LICENSE)
- Provenance record: [`docker/wechat-download-api/upstream.lock.json`](docker/wechat-download-api/upstream.lock.json)

The overlay retains upstream copyright and SPDX notices. Rights and obligations
under AGPL-3.0-only apply only to that separately licensed material and do not
change the license of the rest of AIOS.

## Package dependencies

Dependencies named by package manifests and lockfiles are not relicensed by
AIOS. When obtained from their respective registries or sources, they remain
governed by their own licenses and notices.

Some separately licensed components may permit organizational or commercial
use under their own terms. That permission does not grant any right to use
AIOS-owned material for an organizational or commercial purpose.
