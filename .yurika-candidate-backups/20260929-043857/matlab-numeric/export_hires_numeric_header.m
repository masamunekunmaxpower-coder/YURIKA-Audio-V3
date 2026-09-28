function export_hires_numeric_header(fs, outPath)
% Export the numerical design as a C/C++ header used by the Wasm core.
% Requires MATLAB. This is a build-time helper, not extension runtime code.
if nargin < 1, fs = 96000; end
if nargin < 2, outPath = '../cpp-ai/generated_numeric_coeffs.h'; end
cfg = hires_frequency_resolution_design(fs);
fid = fopen(outPath, 'w');
cleanup = onCleanup(@() fclose(fid));
fprintf(fid, '#pragma once\n');
fprintf(fid, '// Generated from MATLAB hires_frequency_resolution_design.m at fs=%.0f\n', fs);
fprintf(fid, '#define YURIKA_NUMERIC_MATLAB_GENERATED 1\n');
fprintf(fid, 'static const float YURIKA_HP_A1 = %.9gf;\n', cfg.hpA1);
fprintf(fid, 'static const float YURIKA_HP_A2 = %.9gf;\n', cfg.hpA2);
fprintf(fid, 'static const float YURIKA_OBJECT_GAIN_MATRIX[9] = {');
for i=1:9, if i>1, fprintf(fid, ','); end, fprintf(fid, '%.9gf', cfg.objectGainMatrix(i)); end
fprintf(fid, '};\n');
fprintf(fid, 'static const float YURIKA_RESOLUTION_BASE[2] = {%.9gf,%.9gf};\n', cfg.resolutionBase(1), cfg.resolutionBase(2));
fprintf(fid, 'static const float YURIKA_MAX_INJECTION = %.9gf;\n', cfg.maxInjection);
fprintf(fid, 'static const float YURIKA_GATE_FLOOR = %.9gf;\n', cfg.gateFloor);
fprintf(fid, 'static const float YURIKA_GATE_SPAN = %.9gf;\n', cfg.gateSpan);
end
