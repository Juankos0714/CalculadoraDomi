// api/zonas.js — CRUD de zonas tarifarias.
import { manejadorTabla } from './_lib.js';

export default function handler(req, res) {
  return manejadorTabla(req, res, 'zonas');
}
