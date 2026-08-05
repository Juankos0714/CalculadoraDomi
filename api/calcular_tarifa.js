// api/calcular_tarifa.js — Ejecuta la función SQL calcular_tarifa() en Supabase.
// Público: lo usa la calculadora (no expone ninguna clave al navegador).
import { manejarCors, obtenerCliente, responderError, responderOk } from './_lib.js';

export default async function handler(req, res) {
  if (manejarCors(req, res)) return;
  if (req.method !== 'POST') return responderError(res, 405, 'Método no permitido.');

  const { p_barrio_origen, p_barrio_destino } = req.body || {};
  if (!p_barrio_origen || !p_barrio_destino) {
    return responderError(res, 400, 'Faltan el barrio de origen y el de destino.');
  }

  try {
    const cliente = obtenerCliente();
    const { data, error } = await cliente.rpc('calcular_tarifa', {
      p_barrio_origen,
      p_barrio_destino
    });
    if (error) return responderError(res, 500, error.message);
    return responderOk(res, data);
  } catch (e) {
    return responderError(res, 500, 'Error al calcular la tarifa: ' + (e.message || e));
  }
}
