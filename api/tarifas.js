// api/tarifas.js — CRUD de la matriz de tarifas.
import { manejadorTabla } from './_lib.js';

export default function handler(req, res) {
  return manejadorTabla(req, res, 'tarifas');
}
