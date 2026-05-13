import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

type SentryExpoExtra = {
  readonly sentry?: {
    readonly release?: string;
    readonly dist?: string;
    readonly environment?: string;
    readonly commit?: string;
  };
};

const sentryExtra = (Constants.expoConfig?.extra as SentryExpoExtra | undefined)?.sentry;
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const sentryDist = process.env.EXPO_PUBLIC_SENTRY_DIST;
const tracesSampleRate = Number(process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.2');
let initialized = false;

/**
 * Initializes Sentry once with EAS build metadata attached to every event.
 */
export function initSentry() {
  if (initialized) {
    return;
  }

  initialized = true;

  Sentry.init({
    dsn: sentryDsn,
    enabled: Boolean(sentryDsn) && sentryExtra?.environment !== 'development',
    debug: process.env.EXPO_PUBLIC_SENTRY_DEBUG === 'true',
    environment: sentryExtra?.environment ?? (__DEV__ ? 'development' : 'production'),
    release: sentryExtra?.release,
    dist: sentryDist,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.2,
    sendDefaultPii: false,
  });

  if (sentryExtra?.commit) {
    Sentry.setTag('eas.commit', sentryExtra.commit);
  }

  if (sentryDist) {
    Sentry.setTag('eas.build_id', sentryDist);
  }
}
