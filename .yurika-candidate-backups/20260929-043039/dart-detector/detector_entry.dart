import 'dart:js_interop';
import 'detector.dart';

final _detector = YurikaHierarchicalDetector();

@JS()
external set yurikaDartDetectorProcess(JSFunction value);
@JS()
external set yurikaDartDetectorReset(JSFunction value);

JSArray<JSNumber> _process(JSNumber rms, JSNumber peak, JSNumber diffRms, JSNumber zcr, JSNumber sideRatio, JSNumber sampleRate, JSNumber frames) {
  final p=_detector.process(
    rms:rms.toDartDouble,peak:peak.toDartDouble,diffRms:diffRms.toDartDouble,
    zeroCrossRate:zcr.toDartDouble,sideRatio:sideRatio.toDartDouble,
    sampleRate:sampleRate.toDartDouble,frames:frames.toDartInt,
  );
  final out=<JSNumber>[
    p.l1.toJS,p.l2.toJS,p.l3.toJS,p.w1.toJS,p.w2.toJS,p.w3.toJS,
    p.confidence.toJS,p.dominantMargin.toJS,p.dominantIndex.toJS,p.sequence.toJS
  ];
  for(final o in p.softObjects){
    final type=o['type'] as String;
    final typeId=type=='tonal'?0:(type=='transient'?1:(type=='texture'?2:3));
    final h=o['hierarchy'] as Map<String,Object>;
    out.addAll(<JSNumber>[
      typeId.toJS,(o['energy'] as double).toJS,(o['confidence'] as double).toJS,
      (h['l1'] as double).toJS,(h['l2'] as double).toJS,(h['l3'] as double).toJS
    ]);
  }
  return out.toJS;
}
void _reset()=>_detector.reset();
void main(){yurikaDartDetectorProcess=_process.toJS;yurikaDartDetectorReset=_reset.toJS;}
