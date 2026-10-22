"use strict";
/* Service worker for the Permissions & PWA lab only.
   Scope is this directory (/hashbench/lab/) — it never controls the
   benchmark pages. Strategy: network-first for the lab shell, falling back
   to the cached copy offline. It exists so the lab is installable as a PWA
   and works offline; it does not intercept anything outside its scope. */
var CACHE = "perm-lab-v1";
var SHELL = ["./", "./index.html", "./manifest.webmanifest"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") { return; }
  e.respondWith(
    fetch(e.request).then(function (resp) {
      var copy = resp.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return resp;
    }).catch(function () { return caches.match(e.request); })
  );
});
