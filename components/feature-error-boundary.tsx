import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches render errors in tab content so the user can retry without restarting the app.
 */
export class FeatureErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[FeatureErrorBoundary]', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View
          testID="feature-error-boundary"
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 24,
            backgroundColor: '#F2F2F7',
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8, textAlign: 'center' }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 15, color: '#636366', marginBottom: 20, textAlign: 'center' }}>
            Try again. If this keeps happening, restart the app.
          </Text>
          <TouchableOpacity
            onPress={this.reset}
            style={{
              backgroundColor: '#0a7ea4',
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 10,
            }}
            accessibilityRole="button"
            accessibilityLabel="Try again after error"
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
