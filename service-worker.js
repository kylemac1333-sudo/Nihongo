"use strict";
const CACHE_NAME = "japanese-sensei-v3";
const FILES = ["./","./index.html","./style.css","./app.js","./manifest.json","./service-worker.js"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => Promise.all(FILES.map(f => cache.add(f).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const req=event.request;
  if(req.method!=="GET"||new URL(req.url).origin!==self.location.origin)return;
  event.respondWith(fetch(req).then(res=>{if(res&&res.ok){const copy=res.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy)).catch(()=>{});}return res;}).catch(()=>caches.match(req).then(hit=>hit||(req.mode==="navigate"?caches.match("./index.html"):undefined))));
});
