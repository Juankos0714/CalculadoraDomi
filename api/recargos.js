// api/recargos.js — CRUD de recargos.
import { manejadorTabla } from './_lib.js';

export default function handler(req, res) {
  return manejadorTabla(req, res, 'recargos');
}
