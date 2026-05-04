const { version } = require('./package.json');

const appIdentifier = 'com.timtsu.rotini';
const easCommitHash =
  process.env.EAS_BUILD_GIT_COMMIT_HASH ?? process.env.GIT_COMMIT_SHA ?? 'local';
const easBuildId = process.env.EAS_BUILD_ID ?? 'local';
const buildProfile = process.env.EAS_BUILD_PROFILE ?? process.env.APP_ENV ?? 'development';
const sentryEnvironment = process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? buildProfile;
const sentryRelease =
  easCommitHash === 'local'
    ? `rotini@${version}+local`
    : `rotini@${version}+${easCommitHash.slice(0, 12)}`;

/**
 * Builds optional Sentry plugin settings from EAS secrets.
 *
 * @returns {{ url: string, organization?: string, project?: string }}
 */
function getSentryPluginConfig() {
  const sentryConfig = {
    url: process.env.SENTRY_URL ?? 'https://sentry.io/',
  };

  if (process.env.SENTRY_ORG) {
    sentryConfig.organization = process.env.SENTRY_ORG;
  }

  if (process.env.SENTRY_PROJECT) {
    sentryConfig.project = process.env.SENTRY_PROJECT;
  }

  return sentryConfig;
}

/**
 * Builds optional Expo Application Services metadata.
 *
 * @param {Record<string, unknown> | undefined} existingEasConfig
 * @returns {Record<string, unknown> | undefined}
 */
function getEasExtra(existingEasConfig) {
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

  if (!projectId && !existingEasConfig) {
    return undefined;
  }

  return {
    ...(existingEasConfig ?? {}),
    ...(projectId ? { projectId } : {}),
  };
}

/**
 * Builds Supabase config for runtime code.
 *
 * @returns {{ url?: string, anonKey?: string } | undefined}
 */
function getSupabaseExtra() {
  if (process.env.ROTINI_E2E_ENV === '1') {
    return {
      url: process.env.ROTINI_E2E_SUPABASE_URL,
      anonKey: process.env.ROTINI_E2E_SUPABASE_ANON_KEY,
    };
  }

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!url && !anonKey) {
    return undefined;
  }

  return {
    url,
    anonKey,
  };
}

module.exports = ({ config }) => {
  const easExtra = getEasExtra(config.extra?.eas);
  const supabaseExtra = getSupabaseExtra();

  return {
    ...config,
    name: 'rotini',
    slug: 'rotini',
    version,
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'rotini',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    runtimeVersion: {
      policy: 'appVersion',
    },
    ios: {
      supportsTablet: true,
      usesAppleSignIn: true,
      bundleIdentifier: appIdentifier,
    },
    android: {
      package: appIdentifier,
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-apple-authentication',
      [
        'expo-notifications',
        {
          icon: './assets/images/android-icon-monochrome.png',
          color: '#0a7ea4',
          sounds: [],
          iosDisplayInForeground: true,
        },
      ],
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: {
            backgroundColor: '#000000',
          },
        },
      ],
      ['@sentry/react-native/expo', getSentryPluginConfig()],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      ...(config.extra ?? {}),
      ...(easExtra ? { eas: easExtra } : {}),
      ...(supabaseExtra ? { supabase: supabaseExtra } : {}),
      sentry: {
        release: sentryRelease,
        dist: easBuildId,
        environment: sentryEnvironment,
        commit: easCommitHash,
      },
    },
  };
};
