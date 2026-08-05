// api/barrios.js — CRUD de barrios.
import { manejadorTabla } from './_lib.js';

export default function handler(req, res) {
  return manejadorTabla(req, res, 'barrios');
}
