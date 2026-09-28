#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CXX="${CXX:-clang++}"
"$CXX" --target=wasm32 -O3 -nostdlib -fno-exceptions -fno-rtti \
  -Wl,--no-entry -Wl,--export-memory -Wl,--initial-memory=131072 -Wl,--max-memory=131072 \
  -Wl,--export=yurika_input -Wl,--export=yurika_output -Wl,--export=yurika_reset \
  -Wl,--export=yurika_set_amount -Wl,--export=yurika_set_detector -Wl,--export=yurika_set_hierarchy_weights \
  -Wl,--export=yurika_hierarchy_weight -Wl,--export=yurika_hierarchy_confidence -Wl,--export=yurika_clear_objects \
  -Wl,--export=yurika_set_object -Wl,--export=yurika_commit_objects -Wl,--export=yurika_strategy \
  -Wl,--export=yurika_strategy_confidence -Wl,--export=yurika_bwe_drive -Wl,--export=yurika_sr_drive -Wl,--export=yurika_native_hf_ratio \
  -Wl,--export=yurika_set_branch_mask -Wl,--export=yurika_branch_mask \
  -Wl,--export=yurika_object_count -Wl,--export=yurika_process \
  -Wl,--export=yurika_probe_rms -Wl,--export=yurika_probe_peak -Wl,--export=yurika_probe_diff_rms \
  -Wl,--export=yurika_probe_zcr -Wl,--export=yurika_probe_side_ratio -Wl,--export=yurika_nonfinite_count \
  -Wl,--export=yurika_model_params -Wl,--export=yurika_controller_params \
  "$ROOT/cpp-ai/hires_hybrid_core.cpp" -o "$ROOT/hires-hybrid-core.wasm"
printf '{"ok":true,"out":"hires-hybrid-core.wasm"}\n'
