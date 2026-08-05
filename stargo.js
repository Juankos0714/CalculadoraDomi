// stargo.js — Cliente de la API de StarGo.
// Todas las peticiones pasan por las funciones serverless de Vercel (/api).
// El navegador NUNCA ve la URL ni las claves de Supabase.
(function () {
  'use strict';

  var TOKEN_KEY = 'stargo_token';
  var REFRESH_KEY = 'stargo_refresh_token';

  function peticion(metodo, ruta, cuerpo, token, refreshToken) {
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (refreshToken) headers['X-Refresh-Token'] = refreshToken;

    return fetch('/api/' + ruta, {
      method: metodo,
      headers: headers,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
    })
      .then(function (resp) {
        return resp.json().catch(function () { return null; }).then(function (json) {
          if (!resp.ok) {
            var err = new Error((json && json.error) || ('Error del servidor (HTTP ' + resp.status + ')'));
            err.status = resp.status;
            return { data: null, error: err };
          }
          return { data: json && json.data !== undefined ? json.data : json, error: null };
        });
      })
      .catch(function (e) {
        return { data: null, error: new Error('No se pudo conectar con el servidor: ' + (e.message || e)) };
      });
  }

  function Consulta(api, tabla) {
    this.api = api;
    this.tabla = tabla;
    this._columnas = '*';
    this._filtros = [];
    this._orden = null;
    this._metodo = 'GET';
    this._cuerpo = null;
  }

  Consulta.prototype.select = function (columnas) {
    this._columnas = columnas || '*';
    return this;
  };

  Consulta.prototype.eq = function (col, val) {
    this._filtros.push([col, val]);
    return this;
  };

  Consulta.prototype.order = function (col) {
    this._orden = col;
    return this;
  };

  Consulta.prototype.insert = function (filas) {
    this._metodo = 'POST';
    this._cuerpo = { op: 'insert', filas: Array.isArray(filas) ? filas : [filas] };
    return this;
  };

  Consulta.prototype.upsert = function (filas, opts) {
    this._metodo = 'POST';
    this._cuerpo = {
      op: 'upsert',
      filas: Array.isArray(filas) ? filas : [filas],
      onConflict: opts && opts.onConflict
    };
    return this;
  };

  Consulta.prototype.update = function (datos) {
    this._metodo = 'PUT';
    this._cuerpo = { op: 'update', datos: datos };
    return this;
  };

  Consulta.prototype.delete = function () {
    this._metodo = 'DELETE';
    this._cuerpo = null;
    return this;
  };

  Consulta.prototype.ejecutar = function () {
    var qs = new URLSearchParams();
    qs.set('select', this._columnas);
    for (var i = 0; i < this._filtros.length; i++) {
      qs.append('filtro', this._filtros[i][0] + '=' + String(this._filtros[i][1]));
    }
    if (this._orden) qs.set('orden', this._orden);
    return peticion(this._metodo, this.tabla + '?' + qs.toString(), this._cuerpo, this.api._token);
  };

  Consulta.prototype.then = function (ok, fail) {
    return this.ejecutar().then(ok, fail);
  };

  var api = {
    _token: '',
    _refreshToken: '',

    cargarToken: function () {
      try {
        this._token = localStorage.getItem(TOKEN_KEY) || '';
        this._refreshToken = localStorage.getItem(REFRESH_KEY) || '';
      } catch (e) {
        this._token = '';
        this._refreshToken = '';
      }
    },

    guardarToken: function (t, rt) {
      this._token = t || '';
      this._refreshToken = rt || '';
      try {
        if (t) localStorage.setItem(TOKEN_KEY, t);
        else localStorage.removeItem(TOKEN_KEY);
        if (rt) localStorage.setItem(REFRESH_KEY, rt);
        else localStorage.removeItem(REFRESH_KEY);
      } catch (e) { /* sin almacenamiento disponible */ }
    },

    login: function (email, password) {
      var self = this;
      return peticion('POST', 'login', { email: email, password: password }, '').then(function (r) {
        if (!r.error && r.data && r.data.token) {
          self.guardarToken(r.data.token, r.data.refresh_token);
        }
        return r;
      });
    },

    sesion: function () {
      var self = this;
      return peticion('GET', 'sesion', undefined, this._token, this._refreshToken).then(function (r) {
        // Si el servidor devolvió tokens nuevos (renovación), actualizarlos
        if (!r.error && r.data) {
          if (r.data.token) self._token = r.data.token;
          if (r.data.refresh_token) self._refreshToken = r.data.refresh_token;
          try {
            if (r.data.token) localStorage.setItem(TOKEN_KEY, r.data.token);
            if (r.data.refresh_token) localStorage.setItem(REFRESH_KEY, r.data.refresh_token);
          } catch (e) { /* sin almacenamiento disponible */ }
        }
        return r;
      });
    },

    salir: function () {
      this.guardarToken('', '');
    },

    rpc: function (nombre, params) {
      return peticion('POST', nombre, params || {}, this._token);
    },

    from: function (tabla) {
      return new Consulta(this, tabla);
    }
  };

  api.cargarToken();
  window.api = api;
})();
