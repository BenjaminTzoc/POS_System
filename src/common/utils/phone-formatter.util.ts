/**
 * Formatea un número de teléfono para el estándar de Guatemala (+502 XXXX-XXXX)
 * @param phone El número de teléfono en bruto (ej: 12345678, 50212345678, +50212345678)
 * @returns El número formateado o el original si no es procesable
 */
export function formatGuatemalaPhone(phone?: string): string | undefined {
  if (!phone) return undefined;

  // 1. Limpiar todos los caracteres que no sean números
  let cleaned = phone.replace(/\D/g, '');

  // 2. Si empieza por 502 y tiene 11 dígitos, quitar el 502
  if (cleaned.length === 11 && cleaned.startsWith('502')) {
    cleaned = cleaned.substring(3);
  }

  // 3. Verificar si tenemos exactamente 8 dígitos (formato estándar GT)
  if (cleaned.length === 8) {
    const part1 = cleaned.substring(0, 4);
    const part2 = cleaned.substring(4);
    return `+502 ${part1}-${part2}`;
  }

  // 4. Si el formato no coincide con lo esperado, devolver el original limpio o el original
  // pero intentando mantener el + si lo tenía
  return phone.startsWith('+') ? `+${cleaned}` : cleaned;
}
