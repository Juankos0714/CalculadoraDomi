// api/login.js — Inicio de sesión del administrador.
// Valida correo/contraseña contra Supabase Auth (desde el servidor) y
// verifica que el usuario esté en la tabla `admins`. Devuelve un token de
// sesión que el navegador reutiliza en las demás peticiones.
import { manejarCors, obtenerCliente, responderError, responderOk, esAdmin } from './_lib.js';

export default async function handler(req, res) {
  if (manejarCors(req, res)) return;
  if (req.method !== 'POST') return responderError(res, 405, 'Método no permitido.');

  const { email, password } = req.body || {};
  if (!email || !password) {
    return responderError(res, 400, 'El correo y la contraseña son obligatorios.');
  }

  try {
    const cliente = obtenerCliente();
    const { data, error } = await cliente.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return responderError(res, 401, 'Correo o contraseña incorrectos.');
    }
    if (!(await esAdmin(cliente, data.user.id))) {
      return responderError(res, 403, 'Este usuario no tiene permisos de administrador.');
    }
    return responderOk(res, {
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      email: data.user.email,
      esAdmin: true
    });
  } catch (e) {
    return responderError(res, 500, 'No se pudo iniciar sesión: ' + (e.message || e));
  }
}
