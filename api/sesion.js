// api/sesion.js — Restaura la sesión del administrador al recargar la página.
// Si el access token expiró (~1 h), lo renueva con el refresh_token que el
// navegador guardó al iniciar sesión, y devuelve los tokens nuevos para que
// el frontend los actualice sin obligar al usuario a volver a escribir su clave.
import {
  manejarCors, obtenerCliente, responderError, responderOk,
  tokenDeReq, refreshTokenDeReq, usuarioDeToken, esAdmin
} from './_lib.js';

export default async function handler(req, res) {
  if (manejarCors(req, res)) return;
  if (req.method !== 'GET') return responderError(res, 405, 'Método no permitido.');

  const cliente = obtenerCliente();
  const refreshToken = refreshTokenDeReq(req);

  let user = await usuarioDeToken(tokenDeReq(req));

  // Access token expirado pero hay refresh token → renovar
  let tokenNuevo = null;
  let refreshNuevo = null;
  if (!user && refreshToken) {
    try {
      const { data, error } = await cliente.auth.refreshSession({ refresh_token: refreshToken });
      if (!error && data.session) {
        user = data.user || null;
        tokenNuevo = data.session.access_token;
        refreshNuevo = data.session.refresh_token;
      }
    } catch (e) {
      user = null;
    }
  }

  if (!user) return responderError(res, 401, 'Sesión no válida o expirada.');

  const adm = await esAdmin(cliente, user.id);
  if (!adm) return responderError(res, 403, 'Este usuario no tiene permisos de administrador.');

  return responderOk(res, {
    email: user.email,
    esAdmin: true,
    token: tokenNuevo,
    refresh_token: refreshNuevo
  });
}
