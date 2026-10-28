import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';

import { SessionProvider, useSession } from '@/context/auth';
import { TemaProvider, useTema } from '@/context/tema';

export default function RootLayout() {
  return (
    <TemaProvider>
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </TemaProvider>
  );
}

function RootNavigator() {
  const { user, isLoading } = useSession();
  const { colores, esOscuro } = useTema();

  // Colores de la navegación (fondo entre pantallas, encabezados) según el tema.
  const base = esOscuro ? DarkTheme : DefaultTheme;
  const temaNavegacion = {
    ...base,
    colors: {
      ...base.colors,
      primary: colores.primario,
      background: colores.fondo,
      card: colores.fondo,
      text: colores.texto,
      border: colores.borde,
    },
  };

  return (
    <ThemeProvider value={temaNavegacion}>
      <StatusBar style={esOscuro ? 'light' : 'dark'} />
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colores.fondo }}>
          <ActivityIndicator size="large" color={colores.primario} />
        </View>
      ) : (
        // Las rutas protegidas redirigen solas según haya sesión o no.
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={!!user}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          <Stack.Protected guard={!user}>
            <Stack.Screen name="login" />
          </Stack.Protected>
        </Stack>
      )}
    </ThemeProvider>
  );
}
