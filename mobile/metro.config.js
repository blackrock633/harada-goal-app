// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * Shared code: the native app reuses the web repo's pure domain model and data contracts
 * (`../src/domain`, `../src/application/{dto,schemas,result}.ts`) instead of re-implementing them.
 * They are imported as `@shared/...`. This is not a workspace monorepo, so Metro must be told
 * to watch that folder explicitly.
 */
const sharedRoot = path.resolve(__dirname, '..', 'src');
config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];

const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolve ?? context.resolveRequest;
  // `@shared/domain/x` → ../src/domain/x ; the web code's own `@/x` alias → ../src/x when the
  // import originates inside the shared folder.
  if (moduleName.startsWith('@shared/')) {
    return resolve(context, path.join(sharedRoot, moduleName.slice('@shared/'.length)), platform);
  }
  if (moduleName.startsWith('@/') && context.originModulePath.startsWith(sharedRoot + path.sep)) {
    return resolve(context, path.join(sharedRoot, moduleName.slice(2)), platform);
  }
  // The domain uses ESM-style './x.js' specifiers for .ts sources (see web next.config.ts).
  if (moduleName.startsWith('.') && moduleName.endsWith('.js') && context.originModulePath.startsWith(sharedRoot + path.sep)) {
    try {
      return resolve(context, moduleName.slice(0, -3), platform);
    } catch {
      // fall through to the literal .js specifier
    }
  }
  // Bare packages imported by shared code (e.g. 'zod') resolve from THIS app's node_modules,
  // never from whatever happens to sit above the shared folder on disk.
  if (!moduleName.startsWith('.') && !path.isAbsolute(moduleName) && context.originModulePath.startsWith(sharedRoot + path.sep)) {
    return resolve(context, require.resolve(moduleName, { paths: [__dirname] }), platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
