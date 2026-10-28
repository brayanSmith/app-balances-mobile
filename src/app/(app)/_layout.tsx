import { Stack } from 'expo-router';

import { CategoriasProvider } from '@/context/categorias';
import { RecordatoriosProvider } from '@/context/recordatorios';
import { SincronizacionProvider } from '@/context/sincronizacion';
import { useTema } from '@/context/tema';

export default function AppLayout() {
  const { colores } = useTema();

  return (
    <SincronizacionProvider>
      <CategoriasProvider>
        <RecordatoriosProvider>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colores.fondo },
              headerShadowVisible: false,
              headerTintColor: colores.texto,
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: colores.fondo },
            }}
          >
            {/* El inicio tiene su propio encabezado (saludo y accesos). */}
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="historial" options={{ title: 'Historial' }} />
            <Stack.Screen name="categorias" options={{ title: 'Categorías' }} />
            <Stack.Screen name="importar" options={{ title: 'Importar CSV' }} />
          </Stack>
        </RecordatoriosProvider>
      </CategoriasProvider>
    </SincronizacionProvider>
  );
}
