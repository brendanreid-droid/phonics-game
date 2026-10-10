const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Metro must watch the whole workspace, or edits to packages/* will not
// hot-reload and imports of @soundlings/* will fail to resolve.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Deliberately NOT setting `resolver.disableHierarchicalLookup = true`.
// npm nests some packages' own dependencies (react-native-reanimated needs
// semver 7, while the hoisted copy is 6), and with hierarchical lookup off
// Metro cannot see them: "Unable to resolve module semver/functions/satisfies"
// the moment anything imports reanimated, on every platform. Duplicate copies
// of react are prevented by the root `overrides` instead.

module.exports = config;
