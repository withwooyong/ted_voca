import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Platform, Text } from 'react-native';

import { colors } from '@/constants/theme';

const TAB_EMOJI: Record<string, string> = {
  index: '🏠',
  learn: '📚',
  review: '🔄',
  profile: '👤',
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        headerShown: true,
        headerStyle: { backgroundColor: colors.surfaceAlt },
        tabBarStyle: { backgroundColor: colors.surfaceAlt, borderTopColor: colors.border },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color }) => (
            <TabIcon route="index" sfSymbol="house.fill" color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: '학습',
          tabBarIcon: ({ color }) => (
            <TabIcon route="learn" sfSymbol="book.fill" color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: '복습',
          tabBarIcon: ({ color }) => (
            <TabIcon route="review" sfSymbol="arrow.clockwise" color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '프로필',
          tabBarIcon: ({ color }) => (
            <TabIcon route="profile" sfSymbol="person.fill" color={String(color)} />
          ),
        }}
      />
    </Tabs>
  );
}

function TabIcon({
  route,
  sfSymbol,
  color,
}: {
  route: string;
  sfSymbol: string;
  color: string;
}) {
  if (Platform.OS === 'ios') {
    return <SymbolView name={sfSymbol as never} tintColor={color as string} size={22} />;
  }
  return <Text style={{ fontSize: 18 }}>{TAB_EMOJI[route] ?? '•'}</Text>;
}
