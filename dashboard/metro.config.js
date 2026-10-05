const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// Zajednički tipovi (packages/protocol) žive van dashboard/ foldera.
const protocolDir = path.resolve(__dirname, '../packages/protocol');

/** @type {import('@react-native/metro-config').MetroConfig} */
const config = {
  watchFolders: [protocolDir],
  resolver: {
    extraNodeModules: { '@giulietta/protocol': protocolDir },
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
