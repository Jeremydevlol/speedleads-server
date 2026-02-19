#!/usr/bin/env node
'use strict';

/**
 * Scraping de búsqueda (usuarios o hashtags) con instagram-private-api-master.
 *
 * Búsqueda de USUARIOS:
 *   node scripts/search-scrape.js "término"
 *   node scripts/search-scrape.js users "fitness"
 *
 * Búsqueda de HASHTAGS:
 *   node scripts/search-scrape.js hashtags "fitness"
 *
 * Variables de entorno: IG_USERNAME, IG_PASSWORD (opcional: IG_PROXY)
 */

var path = require('path');
var fs = require('fs');

var Client = require('../index').V1;
var device = new Client.Device(process.env.IG_USERNAME || 'default');
var cookiesDir = path.join(__dirname, '..', 'cookies');
var cookiePath = path.join(cookiesDir, 'search-session.json');

if (!process.env.IG_USERNAME || !process.env.IG_PASSWORD) {
  console.error('Usa: IG_USERNAME=tu_usuario IG_PASSWORD=tu_password node scripts/search-scrape.js "busqueda"');
  console.error('Ejemplo: IG_USERNAME=mi_cuenta IG_PASSWORD=*** node scripts/search-scrape.js "fitness"');
  process.exit(1);
}

var mode = 'users';
var query = process.argv[2];
if (query === 'users' || query === 'hashtags') {
  mode = query;
  query = process.argv[3];
}
if (!query || !query.trim()) {
  console.error('Indica el término de búsqueda.');
  console.error('  Usuarios:  node scripts/search-scrape.js "fitness"');
  console.error('  Hashtags:  node scripts/search-scrape.js hashtags "fitness"');
  process.exit(1);
}
query = query.trim();

if (!fs.existsSync(cookiesDir)) {
  fs.mkdirSync(cookiesDir, { recursive: true });
}
if (!fs.existsSync(cookiePath)) {
  fs.writeFileSync(cookiePath, '{}', 'utf8');
}

var storage = new Client.CookieFileStorage(cookiePath);
var session = new Client.Session(device, storage);

function runSearch(s) {
  if (mode === 'hashtags') {
    console.error('Sesión OK. Buscando hashtags para:', query);
    return new Client.Feed.HashtagSearch(s, query).get().then(function (hashtags) {
      return hashtags.map(function (h) {
        return { id: h.id, name: h.params.name, mediaCount: h.params.mediaCount };
      });
    }).then(function (results) {
      return { type: 'hashtags', query: query, count: results.length, results: results };
    });
  }
  console.error('Sesión OK. Buscando usuarios para:', query);
  return Client.Account.search(s, query).then(function (accounts) {
    var results = accounts.map(function (acc) {
      return {
        id: acc.id,
        username: acc.params.username,
        fullName: acc.params.fullName,
        isPrivate: acc.params.isPrivate,
        followersCount: acc.params.followersCount,
        followingsCount: acc.params.followingsCount,
        profilePicUrl: acc.params.picture,
        biography: acc.params.biography ? acc.params.biography.substring(0, 150) : null,
        isBusiness: acc.params.isBusiness,
        category: acc.params.category || null
      };
    });
    return { type: 'users', query: query, count: results.length, users: results };
  });
}

Client.Session.create(device, storage, process.env.IG_USERNAME, process.env.IG_PASSWORD, process.env.IG_PROXY || null)
  .then(runSearch)
  .then(function (out) {
    console.log(JSON.stringify(out, null, 2));
  })
  .catch(function (err) {
    console.error('Error:', err.message);
    if (err.name === 'AuthenticationError') {
      console.error('Credenciales incorrectas o cuenta con verificación (checkpoint).');
    }
    process.exit(1);
  });
