# YURIKA Audio 3.6.3 multi-language architecture

## Roles
- MATLAB: authoritative numerical design source for frequency/resolution shaping. Deployment path is MATLAB Coder -> C/C++ -> Wasm. Build host does not contain MATLAB Coder, so the packaged C++ core is a manually mirrored implementation of the documented equations.
- C++: hierarchical neural inference, causal residual shaping, high-pass generation, input/output sanitization, probe metric extraction. Compiled to WebAssembly.
- Dart: non-AI detector. It outputs typed objects with stable indices 1=micro, 2=local, 3=context, continuous scores and confidence.
- JavaScript: Chrome glue/control only. It loads the Wasm module, copies audio blocks and exchanges detector/control messages.

## MATLAB reference constants @ 96 kHz
- hpA1 = 0.293692747
- hpA2 = 0.229323512

## Dart object-index contract
```json
{"objects":[{"index":1,"score":0.0},{"index":2,"score":0.0},{"index":3,"score":0.0}],"dominantIndex":1,"confidence":0.0}
```
The AI uses all three scores simultaneously. `dominantIndex` is diagnostic only.
