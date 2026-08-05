// api/_lib.js — utilidades compartidas de las funciones serverless de StarGo.
// ⚠ Este archivo empieza con guion bajo: Vercel NO lo despliega como endpoint.
//
// La clave que se usa aquí (SUPABASE_SERVICE_ROLE_KEY) es SECRETA y vive
// únicamente en las variables de entorno de Vercel. Nunca llega al navegador:
// el frontend solo habla con estas funciones /api.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let clienteCache = null;

export function responderOk(res, data) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({ data });
}

export function responderError(res, status, mensaje) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(status).json({ error: mensaje });
}

// Devuelve true si ya respondió (preflight OPTIONS).
export function manejarCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function obtenerCliente() {
  if (!URL || !SERVICE_KEY) {
    throw new Error('Faltan variables de entorno SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en Vercel.');
  }
  if (!clienteCache) {
    clienteCache = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
  }
  return clienteCache;
}

export function tokenDeReq(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

export function refreshTokenDeReq(req) {
  return req.headers['x-refresh-token'] || '';
}

export async function usuarioDeToken(token) {
  if (!token) return null;
  try {
    const { data, error } = await obtenerCliente().auth.getUser(token);
    return error || !data.user ? null : data.user;
  } catch (e) {
    return null;
  }
}

export async function esAdmin(cliente, userId) {
  if (!userId) return false;
  try {
    const { data, error } = await cliente
      .from('admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    return !error && !!data;
  } catch (e) {
    return false;
  }
}

// Valida el token del navegador y devuelve el usuario si es administrador.
// Si no, responde el error correspondiente y devuelve null.
export async function exigirAdmin(req, res) {
  const user = await usuarioDeToken(tokenDeReq(req));
  if (!user) {
    responderError(res, 401, 'Sesión no válida o expirada. Vuelve a iniciar sesión.');
    return null;
  }
  if (!(await esAdmin(obtenerCliente(), user.id))) {
    responderError(res, 403, 'Este usuario no tiene permisos de administrador.');
    return null;
  }
  return user;
}

export function filtrosDeReq(req) {
  const lista = req.query.filtro;
  if (!lista) return [];
  const arr = Array.isArray(lista) ? lista : [lista];
  return arr.map((f) => {
    const i = f.indexOf('=');
    if (i === -1) return null;
    return [f.slice(0, i), f.slice(i + 1)];
  }).filter(Boolean);
}

// Manejo genérico de una tabla: lectura pública, escritura solo admin.
export async function manejadorTabla(req, res, tabla) {
  if (manejarCors(req, res)) return;

  let cliente;
  try {
    cliente = obtenerCliente();
  } catch (e) {
    return responderError(res, 500, e.message);
  }

  // ── Lectura pública ──
  if (req.method === 'GET') {
    try {
      const select = req.query.select || '*';
      let q = cliente.from(tabla).select(select);
      if (req.query.orden) q = q.order(req.query.orden);
      const { data, error } = await q;
      if (error) return responderError(res, 500, error.message);
      return responderOk(res, data);
    } catch (e) {
      return responderError(res, 500, 'Error al leer: ' + (e.message || e));
    }
  }

  // ── Escritura: solo administradores ──
  const user = await exigirAdmin(req, res);
  if (!user) return;

  const filtros = filtrosDeReq(req);
  try {
    if (req.method === 'POST') {
      const { op, filas, onConflict } = req.body || {};
      const lista = Array.isArray(filas) ? filas : filas ? [filas] : [];
      if (!lista.length) return responderError(res, 400, 'Faltan filas por guardar.');

      // barrios no tiene índice único en `nombre`; la deduplicación se hace aquí
      if (op === 'upsert' && onConflict === 'nombre' && tabla === 'barrios') {
        const nombres = lista.map((f) => f.nombre).filter(Boolean);
        const { data: existentes } = await cliente
          .from(tabla)
          .select('nombre')
          .in('nombre', nombres);
        const set = new Set((existentes || []).map((x) => String(x.nombre).toLowerCase()));
        const nuevos = lista.filter((f) => !set.has(String(f.nombre).toLowerCase()));
        if (nuevos.length) {
          const { error: errI } = await cliente.from(tabla).insert(nuevos);
          if (errI) return responderError(res, 500, errI.message);
        }
        return responderOk(res, { insertados: nuevos.length });
      }

      if (op === 'upsert') {
        const { error: errU } = await cliente.from(tabla).upsert(
          lista,
          onConflict ? { onConflict } : undefined
        );
        if (errU) return responderError(res, 500, errU.message);
        return responderOk(res, { insertados: lista.length });
      }

      const { error: errI } = await cliente.from(tabla).insert(lista);
      if (errI) return responderError(res, 500, errI.message);
      return responderOk(res, { insertados: lista.length });
    }

    if (req.method === 'PUT') {
      const { datos } = req.body || {};
      if (!datos || Object.keys(datos).length === 0) {
        return responderError(res, 400, 'Faltan datos por actualizar.');
      }
      if (!filtros.length) return responderError(res, 400, 'Falta el filtro para actualizar.');
      let q = cliente.from(tabla).update(datos);
      for (const [c, v] of filtros) q = q.eq(c, v);
      const { error: errU } = await q;
      if (errU) return responderError(res, 500, errU.message);
      return responderOk(res, { actualizados: 1 });
    }

    if (req.method === 'DELETE') {
      if (!filtros.length) return responderError(res, 400, 'Falta el filtro para eliminar.');
      let q = cliente.from(tabla).delete();
      for (const [c, v] of filtros) q = q.eq(c, v);
      const { error: errD } = await q;
      if (errD) return responderError(res, 500, errD.message);
      return responderOk(res, { eliminados: 1 });
    }
  } catch (e) {
    return responderError(res, 500, 'Error interno: ' + (e.message || e));
  }

  return responderError(res, 405, 'Método no permitido.');
}
