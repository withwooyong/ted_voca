// Metro 모노레포 설정 — packages/shared(타입·로직)와 content/(단어팩 JSON)가
// 앱 루트 밖에 있어 watchFolders에 저장소 루트를 추가해야 번들 가능.
// https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// @ted-voca/shared는 file: 의존성(symlink)으로 해석 — 실제 소스는 루트 밖이라 watch 필요
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

module.exports = config;
