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
