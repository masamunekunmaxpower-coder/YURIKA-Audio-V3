function cfg = hires_frequency_resolution_design(fs)
% YURIKA Audio 3.6.4 numerical frequency/resolution design.
% Source-of-truth design language: MATLAB.
% Runtime target: generated/ported C++ -> WebAssembly.
% This function contains no neural inference; it defines bounded numerical
% shaping used after the learned residual has been estimated.

arguments
    fs (1,1) double {mustBeFinite,mustBePositive}
end

% Causal high-band synthesis poles. At 96 kHz the first pole is placed
% near 18.72 kHz by the 0.195*fs guard; higher rates cap at 19 kHz.
fc1 = min(19000.0, 0.195 * fs);
fc2 = min(22500.0, 0.235 * fs);
cfg.hpA1 = single(exp(-2*pi*fc1/fs));
cfg.hpA2 = single(exp(-2*pi*fc2/fs));

% Dart object-index scores [1=micro, 2=local, 3=context] are continuous.
% This coupling matrix converts simultaneous object evidence into bounded
% neural hierarchy participation. It intentionally preserves mixed states.
cfg.objectGainMatrix = single([ ...
     0.18, -0.02,  0.00; ...
    -0.02,  0.14,  0.02; ...
     0.00,  0.02,  0.10]);

% Numerical resolution synthesis uses first/second causal differences of
% the learned residual. Values are deliberately small to avoid metallic HF.
cfg.resolutionBase = single([0.24, 0.055]);
cfg.maxInjection = single(0.025);
cfg.gateFloor = single(0.0015);
cfg.gateSpan = single(0.035);
end
