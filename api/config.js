// ruta: api/config.js
// Función serverless de Vercel — expone credenciales públicas de Supabase al navegador.
// Solo las variables con prefijo NEXT_PUBLIC_ o VITE_ se pasan a build-time normalmente;
// para un sitio estático puro sin framework, exponemos mediante una serverless function
// que lee las variables de entorno de Vercel y las devuelve como JSON.
// Esto evita hardcodear credenciales en el HTML.

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return res.status(500).json({
      error: 'Faltan variables de entorno SUPABASE_URL y/o SUPABASE_ANON_KEY en Vercel.',
    });
  }

  return res.status(200).json({ url, key });
}