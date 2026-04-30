import { Text, View } from 'react-native';

export default function RotasScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white dark:bg-black">
      <Text className="text-2xl font-bold text-black dark:text-white">Rotas</Text>
      <Text className="text-gray-500 mt-2">Your rotas list will appear here.</Text>
    </View>
  );
}
