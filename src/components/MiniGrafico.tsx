import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

interface Props {
  valores: number[];
  alto?: number;
  color?: string;
}

const MARGEN = 4; // para que el punto final y el trazo no se corten en los bordes

/**
 * Línea con relleno degradado (sparkline). Si la serie cruza el cero, marca
 * la línea base punteada para ver cuándo el balance pasó a negativo.
 */
export function MiniGrafico({ valores, alto = 56, color = '#fff' }: Props) {
  const [ancho, setAncho] = useState(0);

  if (valores.length < 2) return <View style={{ height: alto }} />;

  const min = Math.min(...valores, 0);
  const max = Math.max(...valores, 0);
  const rango = max - min || 1;
  const x = (i: number) => MARGEN + (i / (valores.length - 1)) * (ancho - MARGEN * 2);
  const y = (v: number) => MARGEN + (1 - (v - min) / rango) * (alto - MARGEN * 2);

  const puntos = valores.map((v, i) => [x(i), y(v)] as const);
  const linea = curvaSuave(puntos);
  const area = `${linea} L ${x(valores.length - 1)} ${alto} L ${x(0)} ${alto} Z`;
  const [ultimoX, ultimoY] = puntos[puntos.length - 1];
  const cruzaCero = min < 0 && max > 0;

  return (
    <View style={{ height: alto }} onLayout={(e) => setAncho(e.nativeEvent.layout.width)}>
      {ancho > 0 && (
        <Svg width={ancho} height={alto}>
          <Defs>
            <LinearGradient id="relleno" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.35} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {cruzaCero && (
            <Line
              x1={MARGEN}
              x2={ancho - MARGEN}
              y1={y(0)}
              y2={y(0)}
              stroke={color}
              strokeOpacity={0.45}
              strokeDasharray="4 4"
            />
          )}
          <Path d={area} fill="url(#relleno)" />
          <Path d={linea} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={ultimoX} cy={ultimoY} r={6} fill={color} fillOpacity={0.3} />
          <Circle cx={ultimoX} cy={ultimoY} r={3.5} fill={color} />
        </Svg>
      )}
    </View>
  );
}

/** Une los puntos con curvas suaves (Catmull-Rom convertido a Bézier). */
function curvaSuave(puntos: readonly (readonly [number, number])[]) {
  let d = `M ${puntos[0][0]} ${puntos[0][1]}`;
  for (let i = 0; i < puntos.length - 1; i++) {
    const p0 = puntos[i - 1] ?? puntos[i];
    const p1 = puntos[i];
    const p2 = puntos[i + 1];
    const p3 = puntos[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}
