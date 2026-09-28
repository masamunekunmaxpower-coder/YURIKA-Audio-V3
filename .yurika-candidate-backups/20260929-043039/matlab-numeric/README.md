# MATLAB numerical design

`hires_frequency_resolution_design.m` is the authoritative numerical design for the frequency/resolution synthesis stage. Production deployment path is MATLAB Coder -> C/C++ -> WebAssembly. The current package includes a manually mirrored C++ implementation because MATLAB/MATLAB Coder is not installed in the build environment; the mirror is contract-tested against the documented equations.
