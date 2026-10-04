// Prelude del worker di traduzione: il binario wasm arriva con il primo messaggio.
var __wasmReady, __wasmPromise = new Promise((r) => { __wasmReady = r; });
var __runtimeReady, __runtimePromise = new Promise((r) => { __runtimeReady = r; });
var GEMM_FALLBACK = {
  int8_prepare_a: "int8PrepareAFallback", int8_prepare_b: "int8PrepareBFallback",
  int8_prepare_b_from_transposed: "int8PrepareBFromTransposedFallback",
  int8_prepare_b_from_quantized_transposed: "int8PrepareBFromQuantizedTransposedFallback",
  int8_prepare_bias: "int8PrepareBiasFallback", int8_multiply_and_add_bias: "int8MultiplyAndAddBiasFallback",
  int8_select_columns_of_b: "int8SelectColumnsOfBFallback",
};
var Module = {
  instantiateWasm: function (info, accept) {
    var gemm = {};
    Object.keys(GEMM_FALLBACK).forEach(function (k) { gemm[k] = function () { return Module["asm"][GEMM_FALLBACK[k]].apply(null, arguments); }; });
    __wasmPromise.then(function (bin) {
      var imports = Object.assign({}, info, { wasm_gemm: gemm });
      return WebAssembly.instantiate(bin, imports);
    }).then(function (r) { accept(r.instance); }, function (e) { postMessage({ type: "error", msg: String(e) }); });
    return {};
  },
  onRuntimeInitialized: function () { __runtimeReady(); },
  print: function () {}, printErr: function () {},
};
