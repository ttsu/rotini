const { version } = require('./package.json');

const appIdentifier = 'com.timtsu.rotini';
const easCommitHash =
  process.env.EAS_BUILD_GIT_COMMIT_HASH ?? process.env.GIT_COMMIT_SHA ?? 'local';
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
const DEFAULT_EAS_PROJECT_ID = 'e27d5c34-a3da-49d3-a95b-5c70fbd65297';

function getEasExtra(existingEasConfig) {
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? DEFAULT_EAS_PROJECT_ID;

  return {
    ...(existingEasConfig ?? {}),
    projectId,
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
    name: 'Rotini',
    slug: 'rotini',
    version,
    orientation: 'portrait',
    icon: './assets/images/ios-light.png',
    scheme: 'rotini',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    runtimeVersion: {
      policy: 'fingerprint',
    },
    ios: {
      supportsTablet: true,
      usesAppleSignIn: true,
      bundleIdentifier: appIdentifier,
      associatedDomains: ['applinks:rotini.timtsu.com'],
      "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      },
      icon: {
        light: './assets/images/ios-light.png',
        dark: './assets/images/ios-dark.png',
        tinted: './assets/images/ios-tinted.png',
      },
    },
    android: {
      package: appIdentifier,
      adaptiveIcon: {
        foregroundImage: './assets/images/android-foreground.png',
        backgroundImage: './assets/images/android-background.png',
        monochromeImage: './assets/images/android-monochrome.png',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            { scheme: 'https', host: 'rotini.timtsu.com', pathPrefix: '/invite' },
            { scheme: 'https', host: 'rotini.timtsu.com', pathPrefix: '/auth-callback' },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-apple-authentication',
      'expo-secure-store',
      [
        'expo-image-picker',
        {
          photosPermission: 'Rotini uses your photo library so you can choose a profile picture.',
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/images/android-monochrome.png',
          color: '#0a7ea4',
          sounds: [],
          iosDisplayInForeground: true,
        },
      ],
      [
        'expo-calendar',
        {
          calendarPermission: 'Rotini needs access to your calendar to show your on-call shifts.',
          remindersPermission: false,
        },
      ],
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon-light.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: {
            backgroundColor: '#000000',
            image: './assets/images/splash-icon-dark.png',
          },
        },
      ],
      ['@sentry/react-native/expo', getSentryPluginConfig()],
      '@react-native-community/datetimepicker',
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    updates: {
      url: 'https://u.expo.dev/e27d5c34-a3da-49d3-a95b-5c70fbd65297',
    },
    extra: {
      ...(config.extra ?? {}),
      ...(easExtra ? { eas: easExtra } : {}),
      ...(supabaseExtra ? { supabase: supabaseExtra } : {}),
      sentry: {
        release: sentryRelease,
        environment: sentryEnvironment,
        commit: easCommitHash,
      },
    },
  };
};
