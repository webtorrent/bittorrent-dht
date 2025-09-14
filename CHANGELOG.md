## [11.0.11](https://github.com/webtorrent/bittorrent-dht/compare/v11.0.10...v11.0.11) (2025-09-14)


### Bug Fixes

* **deps:** update dependency debug to ^4.4.3 ([#315](https://github.com/webtorrent/bittorrent-dht/issues/315)) ([26e16da](https://github.com/webtorrent/bittorrent-dht/commit/26e16dafd8c444a12261bccf86e6d9fdd9022194))

## [11.0.10](https://github.com/webtorrent/bittorrent-dht/compare/v11.0.9...v11.0.10) (2025-05-14)


### Bug Fixes

* **deps:** update dependency debug to ^4.4.1 ([#309](https://github.com/webtorrent/bittorrent-dht/issues/309)) ([4b512bd](https://github.com/webtorrent/bittorrent-dht/commit/4b512bd1b6f068b64c2e8c1e4a82645c62890688))

## [11.0.9](https://github.com/webtorrent/bittorrent-dht/compare/v11.0.8...v11.0.9) (2024-12-07)


### Bug Fixes

* **deps:** update dependency debug to ^4.4.0 ([#308](https://github.com/webtorrent/bittorrent-dht/issues/308)) ([bb80624](https://github.com/webtorrent/bittorrent-dht/commit/bb80624b199c17a33178e4c6a82af5f55ad560ad))

## [11.0.8](https://github.com/webtorrent/bittorrent-dht/compare/v11.0.7...v11.0.8) (2024-09-07)


### Bug Fixes

* **deps:** update dependency debug to ^4.3.7 ([77bce23](https://github.com/webtorrent/bittorrent-dht/commit/77bce23e44ffe725a453a08d3c62a6f90345426e))

## [11.0.7](https://github.com/webtorrent/bittorrent-dht/compare/v11.0.6...v11.0.7) (2024-07-28)


### Bug Fixes

* **deps:** update dependency debug to ^4.3.6 ([6241c8f](https://github.com/webtorrent/bittorrent-dht/commit/6241c8f304ab944df0c65f2a8ceaf731ae8c9bac))

## [11.0.6](https://github.com/webtorrent/bittorrent-dht/compare/v11.0.5...v11.0.6) (2024-06-01)


### Bug Fixes

* **deps:** update dependency debug to ^4.3.5 ([6d434cd](https://github.com/webtorrent/bittorrent-dht/commit/6d434cdee1a7984091084774830eb125cb4b2cf7))

## [11.0.5](https://github.com/webtorrent/bittorrent-dht/compare/v11.0.4...v11.0.5) (2023-08-10)


### Bug Fixes

* **deps:** update dependency bencode to v4 ([#279](https://github.com/webtorrent/bittorrent-dht/issues/279)) ([3bd9db7](https://github.com/webtorrent/bittorrent-dht/commit/3bd9db72dfe0832ba4ec7a4e468f0a1ef4348137))

## [11.0.4](https://github.com/webtorrent/bittorrent-dht/compare/v11.0.3...v11.0.4) (2023-02-01)


### Bug Fixes

* **deps:** update dependency bencode to ^3.0.3 ([#267](https://github.com/webtorrent/bittorrent-dht/issues/267)) ([b863214](https://github.com/webtorrent/bittorrent-dht/commit/b86321419cd771946b085d39b51b4d697c792578)), closes [#268](https://github.com/webtorrent/bittorrent-dht/issues/268)

## [11.0.3](https://github.com/webtorrent/bittorrent-dht/compare/v11.0.2...v11.0.3) (2023-01-26)


### Bug Fixes

* webpack builds ([#266](https://github.com/webtorrent/bittorrent-dht/issues/266)) ([4b9a880](https://github.com/webtorrent/bittorrent-dht/commit/4b9a880a89d8a70174056a02ca4cfdb094ee36ae))

## [11.0.2](https://github.com/webtorrent/bittorrent-dht/compare/v11.0.1...v11.0.2) (2023-01-25)


### Bug Fixes

* **deps:** update dependency bencode to v3 ([#258](https://github.com/webtorrent/bittorrent-dht/issues/258)) ([cf0135e](https://github.com/webtorrent/bittorrent-dht/commit/cf0135e45febbe6f302c5746b86d38cbbb24c2e7))

## [11.0.1](https://github.com/webtorrent/bittorrent-dht/compare/v11.0.0...v11.0.1) (2022-12-14)


### Performance Improvements

* drop rusha, fix typo ([#257](https://github.com/webtorrent/bittorrent-dht/issues/257)) ([8cb79c6](https://github.com/webtorrent/bittorrent-dht/commit/8cb79c6c9e7e0c0e81cddf905ddc47e058652750))

# [11.0.0](https://github.com/webtorrent/bittorrent-dht/compare/v10.0.7...v11.0.0) (2022-12-05)


### Features

* esm ([#263](https://github.com/webtorrent/bittorrent-dht/issues/263)) ([232b9fd](https://github.com/webtorrent/bittorrent-dht/commit/232b9fd931c4d6b8749bfcd84b3a37d021a84b86))


### BREAKING CHANGES

* ESM only

* refactor: update import/export of source files

use esm import export
Signed-off-by: Lakshya Singh <lakshay.singh1108@gmail.com>

* refactor: update common test file

use esm const exports and imports
Signed-off-by: Lakshya Singh <lakshay.singh1108@gmail.com>

* chore: update import in tests

Signed-off-by: Lakshya Singh <lakshay.singh1108@gmail.com>

* chore: update package.json for esm support

Signed-off-by: Lakshya Singh <lakshay.singh1108@gmail.com>

* chore: update Readme esm

small fix new DHT() now new DHT
Signed-off-by: Lakshya Singh <lakshay.singh1108@gmail.com>

* fix: node:crypto use

use valid absolute URL strings
Signed-off-by: Lakshya Singh <lakshay.singh1108@gmail.com>

* chore: order module imports

Signed-off-by: Lakshya Singh <lakshay.singh1108@gmail.com>

Signed-off-by: Lakshya Singh <lakshay.singh1108@gmail.com>
Co-authored-by: Lakshya Singh <lakshay.singh1108@gmail.com>

## [10.0.7](https://github.com/webtorrent/bittorrent-dht/compare/v10.0.6...v10.0.7) (2022-12-04)


### Reverts

* Revert "chore: switch to ESM (#248)" (#262) ([520c2de](https://github.com/webtorrent/bittorrent-dht/commit/520c2de3fc29aa892998058f08ee63be2ef1059b)), closes [#248](https://github.com/webtorrent/bittorrent-dht/issues/248) [#262](https://github.com/webtorrent/bittorrent-dht/issues/262)

## [10.0.6](https://github.com/webtorrent/bittorrent-dht/compare/v10.0.5...v10.0.6) (2022-10-08)


### Bug Fixes

* **deps:** update dependency debug to ^4.3.4 ([#230](https://github.com/webtorrent/bittorrent-dht/issues/230)) ([294e70d](https://github.com/webtorrent/bittorrent-dht/commit/294e70d51421e0447b676b7b5ecc214fde8c3338))
* **deps:** update dependency k-bucket to ^5.1.0 ([#231](https://github.com/webtorrent/bittorrent-dht/issues/231)) ([a952dcd](https://github.com/webtorrent/bittorrent-dht/commit/a952dcd4a34391ff1b66aee0d80c84ef4c87920b))
* **deps:** update dependency record-cache to ^1.2.0 ([#234](https://github.com/webtorrent/bittorrent-dht/issues/234)) ([adbe6ce](https://github.com/webtorrent/bittorrent-dht/commit/adbe6cecf9103115af57997ae246f3810048bc9f))

## [10.0.5](https://github.com/webtorrent/bittorrent-dht/compare/v10.0.4...v10.0.5) (2022-10-08)


### Bug Fixes

* **deps:** update dependency k-rpc to ^5.1.0 ([#232](https://github.com/webtorrent/bittorrent-dht/issues/232)) ([4cbce4d](https://github.com/webtorrent/bittorrent-dht/commit/4cbce4d1fc2896c9e59a9c59c39a7381c659d2a8))

## [10.0.4](https://github.com/webtorrent/bittorrent-dht/compare/v10.0.3...v10.0.4) (2022-05-14)


### Bug Fixes

* **deps:** update dependency bencode to ^2.0.3 ([fcf9245](https://github.com/webtorrent/bittorrent-dht/commit/fcf924518fe6bb1a2022f350345100c9f6b2313e))

## [10.0.3](https://github.com/webtorrent/bittorrent-dht/compare/v10.0.2...v10.0.3) (2022-05-13)


### Bug Fixes

* **deps:** update dependency bencode to ^2.0.2 ([#229](https://github.com/webtorrent/bittorrent-dht/issues/229)) ([fbd7a46](https://github.com/webtorrent/bittorrent-dht/commit/fbd7a46d11683205529122780bdb98a182c08a43))
* **deps:** update dependency randombytes to ^2.1.0 ([#233](https://github.com/webtorrent/bittorrent-dht/issues/233)) ([31857ee](https://github.com/webtorrent/bittorrent-dht/commit/31857eeb8d78c27dc27e4579a581531e24818825))

## [10.0.2](https://github.com/webtorrent/bittorrent-dht/compare/v10.0.1...v10.0.2) (2021-08-04)


### Bug Fixes

* **deps:** update dependency simple-sha1 to ^3.1.0 ([2f96d5e](https://github.com/webtorrent/bittorrent-dht/commit/2f96d5e03d58fceded07d0dd154767071962dc44))

## [10.0.1](https://github.com/webtorrent/bittorrent-dht/compare/v10.0.0...v10.0.1) (2021-07-14)


### Bug Fixes

* more robust query handler ([#225](https://github.com/webtorrent/bittorrent-dht/issues/225)) ([c84ef23](https://github.com/webtorrent/bittorrent-dht/commit/c84ef23365508058766072b27fdaa4c3341e8d8a))
