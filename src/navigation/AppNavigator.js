import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import ActivityDetailScreen from '../screens/ActivityDetailScreen';
import ActivityFormScreen from '../screens/ActivityFormScreen';
import AuthScreen from '../screens/AuthScreen';
import MainScreen from '../screens/MainScreen';
import WardFormScreen from '../screens/WardFormScreen';
import useAuth from '../hooks/useAuth';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#ffffff',
        }}
      >
        <ActivityIndicator size="large" color="#1e40af" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {user ? (
          <>
            <Stack.Screen
              name="Main"
              component={MainScreen}
              options={{ title: '네울봄 케어', headerBackVisible: false }}
            />
            <Stack.Screen
              name="WardForm"
              component={WardFormScreen}
              options={{ title: '피보호자 등록' }}
            />
            <Stack.Screen
              name="ActivityForm"
              component={ActivityFormScreen}
              options={{ title: '활동일지 작성' }}
            />
            <Stack.Screen
              name="ActivityDetail"
              component={ActivityDetailScreen}
              options={{ title: '활동일지 상세' }}
            />
          </>
        ) : (
          <Stack.Screen
            name="Auth"
            component={AuthScreen}
            options={{ headerShown: false }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

