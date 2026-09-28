// YURIKA Soft Sound Object detector v2.1.0
// Pure arithmetic, non-AI detector. No learned weights.
// Rate-aware temporal pyramid + soft hierarchy classification.
// Browser target: dart compile js --csp -O2.

import 'dart:math' as math;

class DetectorPacket {
  final double l1,l2,l3,w1,w2,w3,confidence,dominantMargin;
  final int dominantIndex,sequence;
  final List<Map<String,Object>> softObjects;
  const DetectorPacket(this.l1,this.l2,this.l3,this.w1,this.w2,this.w3,this.confidence,this.dominantMargin,this.dominantIndex,this.sequence,this.softObjects);
  Map<String,Object> toMap()=> {
    'l1':l1,'l2':l2,'l3':l3,
    'objects':[{'index':1,'score':l1,'weight':w1,'role':'micro'},{'index':2,'score':l2,'weight':w2,'role':'local'},{'index':3,'score':l3,'weight':w3,'role':'context'}],
    'hierarchyWeights':{'l1':w1,'l2':w2,'l3':w3},
    'dominantIndex':dominantIndex,'dominantMargin':dominantMargin,
    'confidence':confidence,'sequence':sequence,'softObjects':softObjects,
  };
}

class YurikaHierarchicalDetector {
  final List<double> _fast=[0,0,0,0],_local=[0,0,0,0],_context=[0,0,0,0];
  final List<double> _weights=[1/3,1/3,1/3];
  int _dominant=2,_lastCandidate=2,_candidateStreak=0,_sequence=0;

  static double _c(double x)=>x<0?0:(x>1?1:x);
  static double _alpha(double dt,double tau)=>1-math.exp(-dt/tau);
  void reset(){
    for(int i=0;i<4;i++){_fast[i]=0;_local[i]=0;_context[i]=0;}
    _weights[0]=_weights[1]=_weights[2]=1/3;
    _dominant=2;_lastCandidate=2;_candidateStreak=0;_sequence=0;
  }

  DetectorPacket process({
    required double rms,required double peak,required double diffRms,
    required double zeroCrossRate,required double sideRatio,
    double sampleRate=96000,int frames=512
  }){
    final r=rms.isFinite?math.max(0.0,rms):0.0,p=peak.isFinite?math.max(0.0,peak):0.0,d=diffRms.isFinite?math.max(0.0,diffRms):0.0;
    final z=zeroCrossRate.isFinite?_c(zeroCrossRate):0.0,s=sideRatio.isFinite?_c(sideRatio):0.0;
    final activity=_c((r-.0004)/.018),crest=r>1e-7?p/r:0.0;
    final transient=_c((crest-1.25)/3.75),edge=_c((d/math.max(1e-6,r))*.65),crossing=_c(z*2.4),level=_c(r*9.0);
    final sr=sampleRate.isFinite?math.max(8000.0,sampleRate):96000.0;
    final dt=math.max(1e-5,math.min(.25,frames/sr));
    final aFast=_alpha(dt,.045),aLocal=_alpha(dt,.22),aContext=_alpha(dt,1.8);
    final ins=[level,edge,transient,crossing];
    for(int i=0;i<4;i++){
      _fast[i]+=(ins[i]-_fast[i])*aFast;
      _local[i]+=(ins[i]-_local[i])*aLocal;
      _context[i]+=(ins[i]-_context[i])*aContext;
    }
    final novelty=_c(.34*(level-_local[0]).abs()*3.0+.28*(edge-_local[1]).abs()*2.2+.22*(transient-_local[2]).abs()*2.0+.16*(crossing-_local[3]).abs()*2.0);
    final localChange=_c(.45*(_local[0]-_context[0]).abs()*3.2+.30*(_local[1]-_context[1]).abs()*2.4+.15*(_local[2]-_context[2]).abs()*2.0+.10*(_local[3]-_context[3]).abs()*2.0);
    final localAgree=_c(1-(.45*(edge-_local[1]).abs()+.30*(transient-_local[2]).abs()+.25*(crossing-_local[3]).abs())*1.8);
    final contextStability=_c(1-(.45*(_local[0]-_context[0]).abs()+.30*(_local[1]-_context[1]).abs()+.15*(_local[2]-_context[2]).abs()+.10*(_local[3]-_context[3]).abs())*1.6);

    final l1=activity*_c(.34*edge+.24*transient+.14*crossing+.28*novelty);
    final l2=activity*_c(.30*_local[1]+.18*_local[3]+.27*localAgree+.25*localChange);
    final l3=activity*_c(.34*_context[0]+.18*(1-_context[2])+.16*(1-_context[3])+.32*contextStability)*(1-.18*s);

    final score=[1.5*l1,l2,.38*l3];
    final mx=score.reduce(math.max);
    final q=score.map((v)=>math.exp(math.max(-8.0,math.min(0.0,(v-mx)*5.0)))).toList();
    final qs=q[0]+q[1]+q[2];
    final target=[q[0]/qs,q[1]/qs,q[2]/qs];
    final aw=_alpha(dt,.045);
    double ws=0;
    for(int i=0;i<3;i++){_weights[i]+=(target[i]-_weights[i])*aw;_weights[i]=math.max(1e-6,_weights[i]);ws+=_weights[i];}
    for(int i=0;i<3;i++)_weights[i]/=ws;

    int candidate=0;
    if(_weights[1]>_weights[candidate])candidate=1;
    if(_weights[2]>_weights[candidate])candidate=2;
    final sorted=[..._weights]..sort();
    final margin=sorted[2]-sorted[1];
    final candidateIndex=candidate+1;
    if(candidateIndex!=_dominant && margin>=.025){
      if(candidateIndex==_lastCandidate){_candidateStreak++;}else{_lastCandidate=candidateIndex;_candidateStreak=1;}
      if(_candidateStreak>=5){_dominant=candidateIndex;_candidateStreak=0;}
    }else{_lastCandidate=candidateIndex;_candidateStreak=0;}
    final separation=_c(margin/.22),confidence=_c(activity*(.65+.35*separation));

    final tonal=_c(activity*(.46*(1-crossing)+.22*(1-transient)+.18*localAgree+.14*_weights[1]));
    final trans=_c(activity*(.50*transient+.34*edge+.16*_weights[0]));
    final texture=_c(activity*(.40*crossing+.28*edge+.18*novelty+.14*_weights[0]));
    final ambience=_c(activity*(.34*_weights[2]+.22*(1-transient)+.18*(1-crossing)+.14*s+.12*contextStability));
    Map<String,Object> obj(int id,String type,double evidence,double a,double b,double c)=> {
      'objectId':id,'type':type,'energy':_c(level*(.35+.65*evidence)),'confidence':_c(confidence*(.4+.6*evidence)),
      'hierarchy':{'l1':_c(a),'l2':_c(b),'l3':_c(c)}
    };
    final soft=[
      obj(1,'tonal',tonal,.20*_weights[0]+.25*tonal,.55*_weights[1]+.35*tonal,.45*_weights[2]+.30*tonal),
      obj(2,'transient',trans,.72*_weights[0]+.28*trans,.58*_weights[1]+.26*trans,.32*_weights[2]+.12*trans),
      obj(3,'texture',texture,.58*_weights[0]+.34*texture,.50*_weights[1]+.34*texture,.38*_weights[2]+.22*texture),
      obj(4,'ambience',ambience,.20*_weights[0]+.14*ambience,.42*_weights[1]+.24*ambience,.70*_weights[2]+.30*ambience),
    ];
    _sequence++;
    return DetectorPacket(l1,l2,l3,_weights[0],_weights[1],_weights[2],confidence,margin,_dominant,_sequence,soft);
  }
}
