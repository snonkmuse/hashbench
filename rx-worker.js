"use strict";
/* RandomX benchmark worker: loads the single-threaded Emscripten RandomX build
   (light mode, interpreted VM, software AES — flags = 0 throughout). */
importScripts("randomx_st.js");

var BENCH_KEY = "hashbench direct comparison key";
var EXAMPLE_KEY = "RandomX example key";
var EXAMPLE_INPUT = "RandomX example input";
var EXAMPLE_HASH = "8a48e5f9db45ab79d9080574c4d81954fe6ac63842214aff73c244b26330b7c9";

var Module = null, F = null, cache = 0, vm = 0, inPtr = 0, outPtr = 0;
var INPUT_LEN = 43;

function hexOf(ptr, len) {
  var s = "";
  for (var i = 0; i < len; i++) { s += ("0" + Module.HEAPU8[ptr + i].toString(16)).slice(-2); }
  return s;
}
function writeStr(str) {
  var ptr = Module._malloc(str.length + 1);
  for (var i = 0; i < str.length; i++) { Module.HEAPU8[ptr + i] = str.charCodeAt(i); }
  Module.HEAPU8[ptr + str.length] = 0;
  return { ptr: ptr, len: str.length };
}

async function init() {
  Module = await createRandomX();
  var c = function (n, r, a) { return Module.cwrap(n, r, a); };
  F = {
    allocCache: c("randomx_alloc_cache", "number", ["number"]),
    initCache: c("randomx_init_cache", null, ["number", "number", "number"]),
    releaseCache: c("randomx_release_cache", null, ["number"]),
    createVm: c("randomx_create_vm", "number", ["number", "number", "number"]),
    destroyVm: c("randomx_destroy_vm", null, ["number"]),
    calcHash: c("randomx_calculate_hash", null, ["number", "number", "number", "number"])
  };

  /* Self-test on its own cache: canonical RandomX test vector. */
  var t0 = performance.now();
  var testCache = F.allocCache(0);
  var k = writeStr(EXAMPLE_KEY), inp = writeStr(EXAMPLE_INPUT);
  F.initCache(testCache, k.ptr, k.len);
  var testVm = F.createVm(0, testCache, 0);
  var testOut = Module._malloc(32);
  F.calcHash(testVm, inp.ptr, inp.len, testOut);
  var got = hexOf(testOut, 32);
  F.destroyVm(testVm);
  F.releaseCache(testCache);
  self.postMessage({ type: "selftest", pass: got === EXAMPLE_HASH, hex: got, ms: performance.now() - t0 });

  /* Benchmark cache + VM (light mode: dataset pointer = 0). */
  t0 = performance.now();
  cache = F.allocCache(0);
  var bk = writeStr(BENCH_KEY);
  F.initCache(cache, bk.ptr, bk.len);
  var initMs = performance.now() - t0;
  vm = F.createVm(0, cache, 0);
  if (!vm) { self.postMessage({ type: "error", message: "randomx_create_vm returned null" }); return; }
  inPtr = Module._malloc(INPUT_LEN);
  outPtr = Module._malloc(32);
  for (var i = 0; i < INPUT_LEN; i++) { Module.HEAPU8[inPtr + i] = (i * 31 + 7) & 0xff; }
  self.postMessage({ type: "ready", cacheInitMs: initMs });
}

function bench(seconds) {
  var i;
  for (i = 0; i < 3; i++) { F.calcHash(vm, inPtr, INPUT_LEN, outPtr); }  /* warmup, untimed */
  var count = 0;
  var start = performance.now();
  var end = start + seconds * 1000;
  var now = start;
  while ((now = performance.now()) < end) {
    Module.HEAPU8[inPtr + INPUT_LEN - 1] = count & 0xff;
    Module.HEAPU8[inPtr + INPUT_LEN - 2] = (count >>> 8) & 0xff;
    F.calcHash(vm, inPtr, INPUT_LEN, outPtr);
    count++;
    self.postMessage({ type: "progress", count: count, elapsedMs: performance.now() - start });
  }
  self.postMessage({ type: "done", count: count, elapsedMs: performance.now() - start, lastHash: hexOf(outPtr, 32) });
}

self.onmessage = function (ev) {
  var d = ev.data;
  if (d.type === "init") {
    init().catch(function (e) { self.postMessage({ type: "error", message: String(e && e.message || e) }); });
  } else if (d.type === "start") {
    bench(d.seconds || 120);
  }
};
